package es.pepafamilyapp.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/**
 * Recibe las posiciones de la ubicación nativa con la app CERRADA y las manda al servidor (report_device_location, migración 0253).
 *
 * Las posiciones llegan por un PendingIntent que Google Play Services mantiene registrado aunque Android mate el proceso de PEPA: cuando hay una
 * posición nueva, el sistema vuelve a lanzar este receptor por su cuenta. Es la red de seguridad del servicio en primer plano (que Android puede
 * matar o no dejar reiniciar en segundo plano desde la versión 12). La configuración (dirección, clave y llave del móvil) la guarda el complemento de
 * ubicación (setNativeUpload) en las mismas preferencias «pepa_bg_geo» que lee el servicio.
 */
public class NativeLocationReceiver extends BroadcastReceiver {

    static final String ACTION = "es.pepafamilyapp.app.NATIVE_LOCATION";
    static final String PREFS = "pepa_bg_geo";
    static final String DIAG_PREFS = "pepa_bg_geo_diag";
    private static final String SERVICE_CLASS = "com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService";
    private static final long MIN_UPLOAD_GAP_MS = 10_000L;
    private static final float MAX_ACCURACY_M = 100f;
    // «off» o «revoked» seguidos antes de darse por vencido: un solo aviso suelto no debe apagar el envío para siempre.
    private static final int MAX_BAD_ANSWERS = 3;
    private static final int MAX_DIAG_LINES = 60;

    @Override
    public void onReceive(final Context context, Intent intent) {
        if (intent == null || !LocationResult.hasResult(intent)) {
            return;
        }
        LocationResult result = LocationResult.extractResult(intent);
        final Location location = result == null ? null : result.getLastLocation();
        if (location == null) {
            return;
        }
        final SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        final String url = prefs.getString("url", null);
        final String apikey = prefs.getString("apikey", null);
        final String token = prefs.getString("token", null);
        if (url == null || apikey == null || token == null || url.isEmpty() || apikey.isEmpty() || token.isEmpty()) {
            // Sin configuración no hay a quién mandarla: se deja de pedir posiciones.
            diag(context, "receptor: sin configuración, se retira el aviso de ubicación");
            stopAll(context);
            return;
        }
        long now = System.currentTimeMillis();
        if (now - prefs.getLong("last_upload_at", 0L) < MIN_UPLOAD_GAP_MS) {
            return;
        }
        if (location.hasAccuracy() && location.getAccuracy() > MAX_ACCURACY_M) {
            return;
        }
        prefs.edit().putLong("last_upload_at", now).apply();

        final PendingResult pending = goAsync();
        final double latitude = location.getLatitude();
        final double longitude = location.getLongitude();
        final long time = location.getTime();
        new Thread(
            new Runnable() {
                @Override
                public void run() {
                    try {
                        upload(context, prefs, url, apikey, token, latitude, longitude, time);
                    } catch (Throwable t) {
                        diag(context, "receptor: fallo inesperado " + t.getClass().getSimpleName() + ": " + t.getMessage());
                    } finally {
                        pending.finish();
                    }
                }
            }
        ).start();
    }

    private void upload(Context context, SharedPreferences prefs, String url, String apikey, String token, double latitude, double longitude, long time) {
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        String answer = null;
        String failure = null;
        // Dos intentos: sin red un momento (túnel, cambio de wifi a datos) no debe perder justo la posición de salir de casa.
        for (int attempt = 1; attempt <= 2 && answer == null; attempt++) {
            try {
                JSONObject body = new JSONObject();
                body.put("p_token", token);
                body.put("p_latitude", latitude);
                body.put("p_longitude", longitude);
                body.put("p_recorded_at", iso.format(new Date(time > 0 ? time : System.currentTimeMillis())));
                answer = post(url + "/rest/v1/rpc/report_device_location", apikey, body.toString());
            } catch (Exception e) {
                failure = e.getClass().getSimpleName() + ": " + e.getMessage();
                if (attempt == 1) {
                    try {
                        Thread.sleep(1500);
                    } catch (InterruptedException ignored) {
                        return;
                    }
                }
            }
        }
        if (answer == null) {
            diag(context, "receptor: envío fallido (" + failure + ")");
            return;
        }
        if (answer.contains("\"off\"") || answer.contains("\"revoked\"")) {
            int bad = prefs.getInt("bad_answers", 0) + 1;
            prefs.edit().putInt("bad_answers", bad).apply();
            diag(context, "receptor: el servidor contesta " + answer.trim() + " (" + bad + "/" + MAX_BAD_ANSWERS + ")");
            if (bad >= MAX_BAD_ANSWERS) {
                prefs.edit().clear().apply();
                stopAll(context);
            }
            return;
        }
        prefs.edit().putInt("bad_answers", 0).apply();
        context.getSharedPreferences(DIAG_PREFS, Context.MODE_PRIVATE).edit().putLong("last_ok_at", System.currentTimeMillis()).apply();
    }

    private String post(String urlString, String apikey, String json) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        try {
            connection.setRequestMethod("POST");
            // Un receptor dispone de unos 10 s en total: tiempos cortos para que quepan los dos intentos.
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(4000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", apikey);
            if (apikey.startsWith("eyJ")) {
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
            if (code >= 500) {
                throw new Exception("HTTP " + code);
            }
            return buffer.toString("UTF-8");
        } finally {
            connection.disconnect();
        }
    }

    /** Deja de pedir posiciones y para el servicio en primer plano. */
    private void stopAll(Context context) {
        try {
            LocationServices.getFusedLocationProviderClient(context).removeLocationUpdates(pendingIntent(context));
        } catch (Exception ignored) {
        }
        try {
            context.stopService(new Intent().setClassName(context.getPackageName(), SERVICE_CLASS));
        } catch (Exception ignored) {
        }
    }

    static android.app.PendingIntent pendingIntent(Context context) {
        Intent intent = new Intent(ACTION).setClassName(context.getPackageName(), NativeLocationReceiver.class.getName());
        int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        // Play Services rellena la posición dentro del propio intent: tiene que ser mutable (Android 12+).
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            flags |= android.app.PendingIntent.FLAG_MUTABLE;
        }
        return android.app.PendingIntent.getBroadcast(context, 0, intent, flags);
    }

    /** Anota una línea en el registro del móvil (últimas 60): la app lo sube al servidor la próxima vez que se abre (ver getNativeDiagnostics). */
    static void diag(Context context, String line) {
        try {
            SharedPreferences p = context.getSharedPreferences(DIAG_PREFS, Context.MODE_PRIVATE);
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
}
