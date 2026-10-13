package com.equimaps.capacitor_background_geolocation;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import com.getcapacitor.Logger;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationAvailability;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

// PEPA-PATCH (scripts/patch-background-geolocation.mjs): copia modificada del servicio original de @capacitor-community/background-geolocation 1.2.26.
//
// Cambio: el servicio original se PARA cuando la app se cierra (al deslizarla en apps recientes la actividad se destruye, se corta el enlace y el
// servicio se apaga), y con él se acaba la ubicación: JavaScript ya no existe para recibirla. Aquí, si la app guardó una «configuración de envío
// nativo» (dirección del servidor + llave propia de este móvil, ver setNativeUpload en BackgroundGeolocation.java), al cerrarse la app el servicio:
//   1. sigue vivo y en primer plano (misma notificación fija), y
//   2. manda cada posición él solo al servidor (función report_device_location, migración 0253) con esa llave.
// Si el sistema mata el proceso, START_STICKY lo vuelve a levantar y retoma el envío. Al volver a abrir la app, el envío nativo se apaga y vuelve a
// mandar JavaScript como siempre (sin duplicados). Si el servidor contesta que la persona ya no comparte o la llave está anulada, el servicio se para.
public class BackgroundGeolocationService extends Service {
    static final String ACTION_BROADCAST = (
            BackgroundGeolocationService.class.getPackage().getName() + ".broadcast"
    );
    static final String PREFS = "pepa_bg_geo";
    static final String KEY_URL = "url";
    static final String KEY_APIKEY = "apikey";
    static final String KEY_TOKEN = "token";
    static final String KEY_TITLE = "title";
    static final String KEY_MESSAGE = "message";
    static final String KEY_DISTANCE = "distance";
    private static final String NATIVE_WATCHER_ID = "pepa-native";
    // Mínimo entre dos envíos nativos (el servidor aplica además su propio freno de 8 s).
    private static final long MIN_UPLOAD_GAP_MS = 10_000L;
    // Posiciones muy imprecisas (en interiores, sin GPS) se descartan: un salto falso podría disparar un aviso de «se ha ido de casa».
    private static final float MAX_ACCURACY_M = 100f;

    private final IBinder binder = new LocalBinder();

    // Must be unique for this application.
    private static final int NOTIFICATION_ID = 28351;

    private class Watcher {
        public String id;
        public FusedLocationProviderClient client;
        public LocationRequest locationRequest;
        public LocationCallback locationCallback;
        public Notification backgroundNotification;
    }
    private HashSet<Watcher> watchers = new HashSet<Watcher>();

    private final ExecutorService uploader = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private long lastUploadAt = 0L;

    @Override
    public IBinder onBind(Intent intent) {
        appIsBack();
        return binder;
    }

    // Al volver a abrir la app (mismo proceso aún vivo): JavaScript retoma el envío, el nativo se retira.
    @Override
    public void onRebind(Intent intent) {
        appIsBack();
        super.onRebind(intent);
    }

    // La app se ha cerrado (la actividad se ha destruido). Antes: parar todo. Ahora: si hay envío nativo configurado, seguir mandando por nuestra
    // cuenta; si no, igual que antes.
    @Override
    public boolean onUnbind(Intent intent) {
        for (Watcher watcher : watchers) {
            watcher.client.removeLocationUpdates(watcher.locationCallback);
        }
        watchers = new HashSet<Watcher>();
        if (hasNativeUpload()) {
            startNativeWatcher();
            return true; // para que se llame a onRebind cuando se vuelva a abrir la app
        }
        stopSelf();
        return false;
    }

    // Reinicio del sistema tras matar el proceso (intent nulo): se retoma el envío nativo si estaba configurado; si no, no hay nada que hacer.
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            if (hasNativeUpload()) {
                startNativeWatcher();
            } else {
                stopSelf();
            }
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        uploader.shutdownNow();
        super.onDestroy();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean hasNativeUpload() {
        SharedPreferences p = prefs();
        String url = p.getString(KEY_URL, null);
        String key = p.getString(KEY_APIKEY, null);
        String token = p.getString(KEY_TOKEN, null);
        return url != null && !url.isEmpty() && key != null && !key.isEmpty() && token != null && !token.isEmpty();
    }

    private void appIsBack() {
        removeWatcherById(NATIVE_WATCHER_ID);
    }

    private void removeWatcherById(String id) {
        for (Watcher watcher : new HashSet<Watcher>(watchers)) {
            if (watcher.id.equals(id)) {
                watcher.client.removeLocationUpdates(watcher.locationCallback);
                watchers.remove(watcher);
            }
        }
    }

    Notification getNotification() {
        for (Watcher watcher : watchers) {
            if (watcher.backgroundNotification != null) {
                return watcher.backgroundNotification;
            }
        }
        return null;
    }

    private Notification buildNativeNotification() {
        SharedPreferences p = prefs();
        String channelId = BackgroundGeolocationService.class.getPackage().getName();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && manager.getNotificationChannel(channelId) == null) {
                NotificationChannel channel = new NotificationChannel(channelId, "Background Tracking", NotificationManager.IMPORTANCE_DEFAULT);
                channel.enableLights(false);
                channel.enableVibration(false);
                channel.setSound(null, null);
                manager.createNotificationChannel(channel);
            }
        }
        Notification.Builder builder = new Notification.Builder(this)
                .setContentTitle(p.getString(KEY_TITLE, "PEPA usa tu ubicación"))
                .setContentText(p.getString(KEY_MESSAGE, "Para avisar a tu familia cuando llegas a un sitio o te vas."))
                .setOngoing(true)
                .setPriority(Notification.PRIORITY_HIGH)
                .setWhen(System.currentTimeMillis());
        int icon = getApplicationInfo().icon;
        if (icon != 0) {
            builder.setSmallIcon(icon);
        }
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            builder.setContentIntent(PendingIntent.getActivity(this, 0, launchIntent, PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setChannelId(channelId);
        }
        return builder.build();
    }

    // Vigila la ubicación SIN JavaScript: cada posición se manda directamente al servidor.
    private void startNativeWatcher() {
        removeWatcherById(NATIVE_WATCHER_ID);
        float distanceFilter = prefs().getFloat(KEY_DISTANCE, 25f);
        FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(this);
        LocationRequest locationRequest = new LocationRequest();
        locationRequest.setMaxWaitTime(1000);
        locationRequest.setInterval(1000);
        locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
        locationRequest.setSmallestDisplacement(distanceFilter);

        LocationCallback callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                uploadLocation(locationResult.getLastLocation());
            }
        };

        Watcher watcher = new Watcher();
        watcher.id = NATIVE_WATCHER_ID;
        watcher.client = client;
        watcher.locationRequest = locationRequest;
        watcher.locationCallback = callback;
        watcher.backgroundNotification = buildNativeNotification();
        watchers.add(watcher);

        try {
            client.requestLocationUpdates(locationRequest, callback, Looper.getMainLooper());
        } catch (SecurityException e) {
            Logger.error("Sin permiso de ubicación para el envío nativo", e);
        }
        try {
            startForeground(NOTIFICATION_ID, watcher.backgroundNotification);
        } catch (Exception exception) {
            Logger.error("Failed to foreground service", exception);
        }
    }

    private void uploadLocation(final Location location) {
        if (location == null) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastUploadAt < MIN_UPLOAD_GAP_MS) {
            return;
        }
        if (location.hasAccuracy() && location.getAccuracy() > MAX_ACCURACY_M) {
            return;
        }
        lastUploadAt = now;
        SharedPreferences p = prefs();
        final String url = p.getString(KEY_URL, null);
        final String apikey = p.getString(KEY_APIKEY, null);
        final String token = p.getString(KEY_TOKEN, null);
        if (url == null || apikey == null || token == null) {
            return;
        }
        final double latitude = location.getLatitude();
        final double longitude = location.getLongitude();
        final long time = location.getTime();
        try {
            uploader.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
                        JSONObject body = new JSONObject();
                        body.put("p_token", token);
                        body.put("p_latitude", latitude);
                        body.put("p_longitude", longitude);
                        body.put("p_recorded_at", iso.format(new Date(time > 0 ? time : System.currentTimeMillis())));
                        String answer = post(url + "/rest/v1/rpc/report_device_location", apikey, body.toString());
                        // «off» = esa persona ya no comparte; «revoked» = llave anulada: no tiene sentido seguir.
                        if (answer.contains("\"off\"") || answer.contains("\"revoked\"")) {
                            mainHandler.post(new Runnable() {
                                @Override
                                public void run() {
                                    stopNativeTracking();
                                }
                            });
                        }
                    } catch (Exception e) {
                        // Sin red o servidor caído: se pierde esta posición, llegará la siguiente.
                        Logger.debug("Envío nativo de ubicación fallido: " + e.getMessage());
                    }
                }
            });
        } catch (Exception ignored) {
            // El servicio se está apagando.
        }
    }

    private String post(String urlString, String apikey, String json) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", apikey);
            if (apikey.startsWith("eyJ")) {
                // Las claves antiguas son un JWT y también van en Authorization; las nuevas (sb_publishable_…) solo en apikey.
                connection.setRequestProperty("Authorization", "Bearer " + apikey);
            }
            byte[] bytes = json.getBytes("UTF-8");
            connection.setFixedLengthStreamingMode(bytes.length);
            OutputStream out = connection.getOutputStream();
            out.write(bytes);
            out.close();
            int code = connection.getResponseCode();
            InputStream in = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            if (in != null) {
                byte[] chunk = new byte[1024];
                int n;
                while ((n = in.read(chunk)) > 0) {
                    buffer.write(chunk, 0, n);
                }
                in.close();
            }
            return buffer.toString("UTF-8");
        } finally {
            connection.disconnect();
        }
    }

    // El servidor ha dicho que hay que dejar de compartir: se borra la configuración y se apaga todo.
    private void stopNativeTracking() {
        prefs().edit().clear().apply();
        removeWatcherById(NATIVE_WATCHER_ID);
        stopForeground(true);
        stopSelf();
    }

    // Handles requests from the activity.
    public class LocalBinder extends Binder {
        void addWatcher(
                final String id,
                Notification backgroundNotification,
                float distanceFilter
        ) {
            FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(
                    BackgroundGeolocationService.this
            );
            LocationRequest locationRequest = new LocationRequest();
            locationRequest.setMaxWaitTime(1000);
            locationRequest.setInterval(1000);
            locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
            locationRequest.setSmallestDisplacement(distanceFilter);

            LocationCallback callback = new LocationCallback(){
                @Override
                public void onLocationResult(LocationResult locationResult) {
                    Location location = locationResult.getLastLocation();
                    Intent intent = new Intent(ACTION_BROADCAST);
                    intent.putExtra("location", location);
                    intent.putExtra("id", id);
                    LocalBroadcastManager.getInstance(
                            getApplicationContext()
                    ).sendBroadcast(intent);
                }
                @Override
                public void onLocationAvailability(LocationAvailability availability) {
                    if (!availability.isLocationAvailable()) {
                        Logger.debug("Location not available");
                    }
                }
            };

            Watcher watcher = new Watcher();
            watcher.id = id;
            watcher.client = client;
            watcher.locationRequest = locationRequest;
            watcher.locationCallback = callback;
            watcher.backgroundNotification = backgroundNotification;
            watchers.add(watcher);

            // According to Android Studio, this method can throw a Security Exception if
            // permissions are not yet granted. Rather than check the permissions, which is fiddly,
            // we simply ignore the exception.
            try {
                watcher.client.requestLocationUpdates(
                        watcher.locationRequest,
                        watcher.locationCallback,
                        null
                );
            } catch (SecurityException ignore) {}

            // Promote the service to the foreground if necessary.
            // Ideally we would only call 'startForeground' if the service is not already
            // foregrounded. Unfortunately, 'getForegroundServiceType' was only introduced
            // in API level 29 and seems to behave weirdly, as reported in #120. However,
            // it appears that 'startForeground' is idempotent, so we just call it repeatedly
            // each time a background watcher is added.
            if (backgroundNotification != null) {
                try {
                    // This method has been known to fail due to weird
                    // permission bugs, so we prevent any exceptions from
                    // crashing the app. See issue #86.
                    startForeground(NOTIFICATION_ID, backgroundNotification);
                } catch (Exception exception) {
                    Logger.error("Failed to foreground service", exception);
                }
            }

            // PEPA-PATCH: el servicio, además de enlazado, queda «iniciado»: así sobrevive a que la app se cierre (si no, Android lo apaga al soltarse
            // el último enlace aunque esté en primer plano). Se llama con la app delante; si el sistema no lo deja, todo sigue como antes.
            try {
                startService(new Intent(BackgroundGeolocationService.this, BackgroundGeolocationService.class));
            } catch (Exception exception) {
                Logger.error("No se pudo marcar el servicio como iniciado", exception);
            }
        }

        void removeWatcher(String id) {
            for (Watcher watcher : watchers) {
                if (watcher.id.equals(id)) {
                    watcher.client.removeLocationUpdates(watcher.locationCallback);
                    watchers.remove(watcher);
                    if (getNotification() == null) {
                        stopForeground(true);
                    }
                    return;
                }
            }
        }

        void onPermissionsGranted() {
            // If permissions were granted while the app was in the background, for example in
            // the Settings app, the watchers need restarting.
            for (Watcher watcher : watchers) {
                watcher.client.removeLocationUpdates(watcher.locationCallback);
                watcher.client.requestLocationUpdates(
                        watcher.locationRequest,
                        watcher.locationCallback,
                        null
                );
            }
        }

        // PEPA-PATCH: se borró la configuración de envío nativo (se dejó de compartir o se cerró sesión): se retira el vigilante nativo y, si no queda
        // ninguno con notificación, se quita la notificación fija.
        void nativeUploadCleared() {
            removeWatcherById(NATIVE_WATCHER_ID);
            if (getNotification() == null) {
                stopForeground(true);
            }
        }

        // PEPA-PATCH: la actividad se destruye. Con envío nativo configurado, onUnbind ya se encarga de seguir; sin él, se para como antes.
        void stopService() {
            if (!hasNativeUpload()) {
                BackgroundGeolocationService.this.stopSelf();
            }
        }
    }
}
