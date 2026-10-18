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
    static final String ACTION_START_NATIVE = "es.pepafamilyapp.app.START_NATIVE_LOCATION";
    private static final String SERVICE_CLASS = "com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService";
    private static final long MIN_UPLOAD_GAP_MS = 10_000L;
    private static final float MAX_ACCURACY_M = 100f;
    // «off» o «revoked» seguidos antes de darse por vencido: un solo aviso suelto no debe apagar el envío para siempre.
    private static final int MAX_BAD_ANSWERS = 3;
    // Filtro de saltos de GPS (ver acceptAfterJumpCheck).
    private static final float JUMP_DISTANCE_M = 150f;
    private static final float JUMP_CONFIRM_RADIUS_M = 100f;
    private static final long JUMP_CONFIRM_WINDOW_MS = 60_000L;
    private static final long JUMP_CHECK_WINDOW_MS = 10 * 60_000L;
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
        // Un salto de GPS aislado (un punto lejano que vuelve enseguida) no debe disparar «se ha ido de…»: se retiene hasta que la lectura siguiente lo confirme.
        if (!acceptAfterJumpCheck(context, prefs, location, now)) {
            return;
        }
        prefs.edit().putLong("last_upload_at", now).apply();
        // Si el servicio en primer plano no está vivo en este proceso (Android mató el proceso y lo ha vuelto a lanzar solo para este aviso), se intenta relanzar:
        // en segundo plano Android espacia mucho las posiciones, con el servicio en primer plano no.
        tryStartForegroundService(context, false);

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

    /**
     * Filtro de saltos de GPS (17/10/2026: «Paco se ha ido de Casa» falso — un único punto a 349 m, 4 min después del anterior a 17 m, y 44 min después
     * otro a 4 m; Paco no había salido). Una lectura a más de JUMP_DISTANCE_M del último punto enviado (si ese punto es de hace menos de
     * JUMP_CHECK_WINDOW_MS) se RETIENE; solo se envía si la lectura siguiente la confirma (a menos de JUMP_CONFIRM_RADIUS_M de ella y en menos de
     * JUMP_CONFIRM_WINDOW_MS). Si la siguiente vuelve a la zona de antes, la retenida se descarta. Moviéndose de verdad llegan lecturas seguidas, así
     * que el retraso es de una lectura; sin movimiento no llega ninguna y el punto suelto no se envía nunca. Con el último envío muy antiguo no se filtra.
     */
    private static boolean acceptAfterJumpCheck(Context context, SharedPreferences prefs, Location loc, long now) {
        double lat = loc.getLatitude();
        double lng = loc.getLongitude();
        long sentAt = prefs.getLong("sent_at", 0L);
        boolean hasRecent = sentAt > 0L && now - sentAt >= 0L && now - sentAt <= JUMP_CHECK_WINDOW_MS;
        if (!hasRecent) {
            markSent(prefs, lat, lng, now);
            return true;
        }
        double lastLat = Double.longBitsToDouble(prefs.getLong("sent_lat", 0L));
        double lastLng = Double.longBitsToDouble(prefs.getLong("sent_lng", 0L));
        float fromLast = distanceMeters(lastLat, lastLng, lat, lng);
        if (fromLast <= JUMP_DISTANCE_M) {
            markSent(prefs, lat, lng, now);
            return true;
        }
        long heldAt = prefs.getLong("jump_at", 0L);
        if (heldAt > 0L && now - heldAt >= 0L && now - heldAt <= JUMP_CONFIRM_WINDOW_MS) {
            double heldLat = Double.longBitsToDouble(prefs.getLong("jump_lat", 0L));
            double heldLng = Double.longBitsToDouble(prefs.getLong("jump_lng", 0L));
            if (distanceMeters(heldLat, heldLng, lat, lng) <= JUMP_CONFIRM_RADIUS_M) {
                diag(context, "receptor: lectura lejana (" + Math.round(fromLast) + " m) confirmada, se envía");
                markSent(prefs, lat, lng, now);
                return true;
            }
        }
        prefs.edit()
            .putLong("jump_at", now)
            .putLong("jump_lat", Double.doubleToRawLongBits(lat))
            .putLong("jump_lng", Double.doubleToRawLongBits(lng))
            .apply();
        diag(context, "receptor: lectura lejana (" + Math.round(fromLast) + " m del último punto) retenida hasta confirmarla");
        return false;
    }

    private static void markSent(SharedPreferences prefs, double lat, double lng, long now) {
        prefs.edit()
            .putLong("sent_at", now)
            .putLong("sent_lat", Double.doubleToRawLongBits(lat))
            .putLong("sent_lng", Double.doubleToRawLongBits(lng))
            .remove("jump_at")
            .remove("jump_lat")
            .remove("jump_lng")
            .apply();
    }

    private static float distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        float[] out = new float[1];
        Location.distanceBetween(lat1, lng1, lat2, lng2, out);
        return out[0];
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

    /**
     * Intenta relanzar el servicio en primer plano (el que pone la notificación fija) si no está vivo en ESTE proceso. Android 12+ puede negarse a arrancarlo
     * desde segundo plano: no pasa nada grave (el aviso al receptor sigue funcionando) y el motivo queda en el registro.
     * `force`: sin esperar el minuto de margen entre intentos (arranque del móvil).
     */
    static void tryStartForegroundService(Context context, boolean force) {
        try {
            SharedPreferences d = context.getSharedPreferences(DIAG_PREFS, Context.MODE_PRIVATE);
            if (d.getInt("fgs_pid", 0) == android.os.Process.myPid()) {
                return; // el servicio ya está en primer plano en este mismo proceso
            }
            long now = System.currentTimeMillis();
            if (!force && now - d.getLong("fgs_try_at", 0L) < 60_000L) {
                return;
            }
            d.edit().putLong("fgs_try_at", now).apply();
            Intent service = new Intent(ACTION_START_NATIVE).setClassName(context.getPackageName(), SERVICE_CLASS);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(service);
            } else {
                context.startService(service);
            }
            diag(context, "receptor: se relanza el servicio en primer plano");
        } catch (Exception e) {
            diag(context, "receptor: Android no deja relanzar el servicio en primer plano (" + e.getClass().getSimpleName() + ")");
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
