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
import android.os.IBinder;

import com.getcapacitor.Logger;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationAvailability;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

// PEPA-PATCH (scripts/patch-background-geolocation.mjs): copia modificada del servicio original de @capacitor-community/background-geolocation 1.2.26.
//
// Cambio: el servicio original se PARA cuando la app se cierra (al deslizarla en apps recientes la actividad se destruye, se corta el enlace y el
// servicio se apaga), y con él se acaba la ubicación: JavaScript ya no existe para recibirla. Aquí, si la app guardó una «configuración de envío
// nativo» (dirección del servidor + llave propia de este móvil, ver setNativeUpload en BackgroundGeolocation.java), al cerrarse la app el servicio:
//   1. sigue vivo y en primer plano (misma notificación fija), y
//   2. manda cada posición él solo al servidor (función report_device_location, migración 0253) con esa llave.
// Las posiciones del envío nativo NO se piden con una función de este servicio sino con un PendingIntent a es.pepafamilyapp.app.NativeLocationReceiver:
// Google Play Services lo mantiene registrado aunque Android mate el proceso (o no deje reiniciar este servicio en segundo plano, Android 12+) y vuelve
// a lanzar el receptor él solo con cada posición nueva; el receptor las manda al servidor con reintentos. Este servicio solo pone la notificación fija y
// registra ese aviso. Al volver a abrir la app, el envío nativo se apaga y vuelve a mandar JavaScript como siempre (sin duplicados). Si el servidor
// contesta varias veces seguidas que la persona ya no comparte o la llave está anulada, el receptor lo para todo.
// Todo lo importante (arranques, reinicios, permisos, errores) queda anotado en «pepa_bg_geo_diag» y la app lo sube al servidor al abrirse.
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
    static final String DIAG_PREFS = "pepa_bg_geo_diag";
    private static final String NATIVE_WATCHER_ID = "pepa-native";
    private static final String RECEIVER_CLASS = "es.pepafamilyapp.app.NativeLocationReceiver";
    private static final String ACTION_START_NATIVE = "es.pepafamilyapp.app.START_NATIVE_LOCATION";
    private static final String RECEIVER_ACTION = "es.pepafamilyapp.app.NATIVE_LOCATION";
    private static final int MAX_DIAG_LINES = 60;

    private final IBinder binder = new LocalBinder();

    // Must be unique for this application.
    private static final int NOTIFICATION_ID = 28351;

    private class Watcher {
        public String id;
        public FusedLocationProviderClient client;
        public LocationRequest locationRequest;
        public LocationCallback locationCallback;
        public Notification backgroundNotification;
        // Envío nativo: las posiciones llegan por este aviso al receptor (sin LocationCallback).
        public PendingIntent pendingIntent;
    }
    private HashSet<Watcher> watchers = new HashSet<Watcher>();

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
            removeUpdates(watcher);
        }
        watchers = new HashSet<Watcher>();
        diag("app cerrada: " + (hasNativeUpload() ? "el servicio sigue con el envío nativo" : "sin configuración de envío nativo, el servicio se para"));
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
        // El receptor de posiciones (o el de arranque del móvil) nos relanza en primer plano tras haber muerto el proceso.
        if (intent != null && ACTION_START_NATIVE.equals(intent.getAction())) {
            diag("el receptor relanza el servicio en primer plano (" + (hasNativeUpload() ? "con" : "sin") + " configuración de envío)");
            if (hasNativeUpload()) {
                startNativeWatcher();
            } else {
                // startForegroundService obliga a pasar a primer plano antes de parar.
                try {
                    startForeground(NOTIFICATION_ID, buildNativeNotification());
                } catch (Exception ignored) {
                }
                stopSelf();
            }
            return START_STICKY;
        }
        if (intent == null) {
            diag("Android reinicia el servicio tras matar el proceso (" + (hasNativeUpload() ? "con" : "sin") + " configuración de envío)");
            if (hasNativeUpload()) {
                startNativeWatcher();
            } else {
                stopSelf();
            }
        }
        return START_STICKY;
    }

    // Quitan la app de «recientes» (deslizar): el servicio y el aviso al receptor siguen, solo queda anotado.
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        diag("app deslizada de recientes");
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        getSharedPreferences(DIAG_PREFS, Context.MODE_PRIVATE).edit().remove("fgs_pid").apply();
        diag("servicio detenido (onDestroy)");
        super.onDestroy();
    }

    // Anota una línea en el registro del móvil (últimas 60). La app lo sube al servidor al abrirse (ver getNativeDiagnostics en BackgroundGeolocation).
    void diag(String line) {
        try {
            SharedPreferences p = getSharedPreferences(DIAG_PREFS, Context.MODE_PRIVATE);
            String stamp = new SimpleDateFormat("dd/MM HH:mm:ss", Locale.US).format(new Date());
            String all = p.getString("log", "") + stamp + " " + line + "\n";
            String[] lines = all.split("\n");
            if (lines.length > MAX_DIAG_LINES) {
                StringBuilder trimmed = new StringBuilder();
                for (int i = lines.length - MAX_DIAG_LINES; i < lines.length; i++) {
                    trimmed.append(lines[i]).append('\n');
                }
                all = trimmed.toString();
            }
            p.edit().putString("log", all).commit();
        } catch (Throwable ignored) {
        }
    }

    // Quita las peticiones de posición de un vigilante, sea de los de JavaScript (con LocationCallback) o el nativo (con PendingIntent).
    private void removeUpdates(Watcher watcher) {
        try {
            if (watcher.pendingIntent != null) {
                watcher.client.removeLocationUpdates(watcher.pendingIntent);
            } else {
                watcher.client.removeLocationUpdates(watcher.locationCallback);
            }
        } catch (Exception e) {
            diag("error al quitar un vigilante: " + e.getClass().getSimpleName());
        }
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
        removeNativeRegistration();
        diag("app abierta: JavaScript retoma el envío");
    }

    private void removeWatcherById(String id) {
        for (Watcher watcher : new HashSet<Watcher>(watchers)) {
            if (watcher.id.equals(id)) {
                removeUpdates(watcher);
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

    // El aviso al receptor es SIEMPRE el mismo (mismo intent): así se puede quitar aunque este servicio sea una instancia nueva, tras haber muerto el proceso.
    private PendingIntent nativePendingIntent() {
        Intent receiverIntent = new Intent(RECEIVER_ACTION).setClassName(getPackageName(), RECEIVER_CLASS);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        // Play Services rellena la posición dentro del propio intent: tiene que ser mutable (Android 12+).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getBroadcast(this, 0, receiverIntent, flags);
    }

    // LATIDO (24/10/2026, «las ubicaciones van con unos minutos de retraso»): con el filtro de 25 m, un móvil parado en casa o en el trabajo no manda NADA, y el mapa enseña una
    // posición de hace 15-50 min; una llegada se confirma en el servidor con una segunda lectura y, sin ella, tardaba hasta 22 min en avisar. Este segundo aviso, de bajo consumo
    // y SIN filtro de distancia, entrega una posición cada pocos minutos aunque no se mueva. Es otro PendingIntent (otro código de petición): con el mismo, Play Services
    // sustituiría el aviso principal. Lo recibe el mismo receptor, que aplica los mismos filtros (precisión, saltos de GPS, pausa mínima entre envíos).
    private static final long HEARTBEAT_INTERVAL_MS = 5 * 60_000L;
    private static final long HEARTBEAT_FASTEST_MS = 3 * 60_000L;

    private PendingIntent nativeHeartbeatPendingIntent() {
        Intent receiverIntent = new Intent(RECEIVER_ACTION).setClassName(getPackageName(), RECEIVER_CLASS);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getBroadcast(this, 1, receiverIntent, flags);
    }

    // Quita el aviso al receptor registrado en Play Services, lo haya registrado esta instancia del servicio o una anterior (proceso muerto y vuelto a abrir).
    private void removeNativeRegistration() {
        try {
            LocationServices.getFusedLocationProviderClient(this).removeLocationUpdates(nativeHeartbeatPendingIntent());
        } catch (Exception e) {
            diag("error al quitar el latido: " + e.getClass().getSimpleName());
        }
        try {
            LocationServices.getFusedLocationProviderClient(this).removeLocationUpdates(nativePendingIntent());
        } catch (Exception e) {
            diag("error al quitar el aviso al receptor: " + e.getClass().getSimpleName());
        }
    }

    // Registra el latido (ver nativeHeartbeatPendingIntent). Si falla no pasa nada grave: queda el aviso principal por movimiento, como antes.
    private void registerHeartbeat(FusedLocationProviderClient client) {
        try {
            LocationRequest heartbeat = new LocationRequest();
            heartbeat.setInterval(HEARTBEAT_INTERVAL_MS);
            heartbeat.setFastestInterval(HEARTBEAT_FASTEST_MS);
            heartbeat.setPriority(LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY);
            client.requestLocationUpdates(heartbeat, nativeHeartbeatPendingIntent());
            diag("latido registrado (una posición cada pocos minutos aunque esté parado)");
        } catch (Exception e) {
            diag("no se pudo registrar el latido: " + e.getClass().getSimpleName());
        }
    }

    // Vigila la ubicación SIN JavaScript: Play Services entrega cada posición al receptor por un PendingIntent (sobrevive a que Android mate el proceso).
    private void startNativeWatcher() {
        removeWatcherById(NATIVE_WATCHER_ID);
        float distanceFilter = prefs().getFloat(KEY_DISTANCE, 25f);
        FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(this);
        LocationRequest locationRequest = new LocationRequest();
        locationRequest.setMaxWaitTime(1000);
        locationRequest.setInterval(1000);
        locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
        locationRequest.setSmallestDisplacement(distanceFilter);

        PendingIntent pendingIntent = nativePendingIntent();

        Watcher watcher = new Watcher();
        watcher.id = NATIVE_WATCHER_ID;
        watcher.client = client;
        watcher.locationRequest = locationRequest;
        watcher.pendingIntent = pendingIntent;
        watcher.backgroundNotification = buildNativeNotification();
        watchers.add(watcher);

        try {
            client.requestLocationUpdates(locationRequest, pendingIntent);
            diag("envío nativo registrado (aviso al receptor)");
            registerHeartbeat(client);
        } catch (SecurityException e) {
            Logger.error("Sin permiso de ubicación para el envío nativo", e);
            diag("SIN PERMISO de ubicación para el envío nativo");
        } catch (Exception e) {
            diag("no se pudo registrar el envío nativo: " + e.getClass().getSimpleName() + " " + e.getMessage());
        }
        try {
            startForeground(NOTIFICATION_ID, watcher.backgroundNotification);
            getSharedPreferences(DIAG_PREFS, Context.MODE_PRIVATE).edit().putInt("fgs_pid", android.os.Process.myPid()).apply();
        } catch (Exception exception) {
            Logger.error("Failed to foreground service", exception);
            // Android 12+ no deja poner en primer plano un servicio reiniciado desde segundo plano: no es grave, el aviso al receptor sigue.
            diag("no se pudo pasar a primer plano: " + exception.getClass().getSimpleName() + " " + exception.getMessage());
        }
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
                    removeUpdates(watcher);
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
                if (watcher.pendingIntent != null) {
                    watcher.client.removeLocationUpdates(watcher.pendingIntent);
                    watcher.client.requestLocationUpdates(watcher.locationRequest, watcher.pendingIntent);
                    continue;
                }
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
            removeNativeRegistration();
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
