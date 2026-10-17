package es.pepafamilyapp.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;

/**
 * Retoma la ubicación nativa tras REINICIAR el móvil o ACTUALIZAR la app: en ambos casos Google Play Services olvida el aviso al receptor
 * (NativeLocationReceiver) y, sin esto, no llegaría ninguna posición hasta que se abriera PEPA. Solo actúa si hay una configuración de envío nativo
 * guardada (es decir, si la persona estaba compartiendo su ubicación con este móvil).
 */
public class NativeBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(NativeLocationReceiver.PREFS, Context.MODE_PRIVATE);
        String token = prefs.getString("token", null);
        if (token == null || token.isEmpty()) {
            return;
        }
        NativeLocationReceiver.diag(context, Intent.ACTION_BOOT_COMPLETED.equals(action) ? "móvil reiniciado: se retoma el envío nativo" : "app actualizada: se retoma el envío nativo");
        try {
            LocationRequest request = new LocationRequest();
            request.setMaxWaitTime(1000);
            request.setInterval(1000);
            request.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
            request.setSmallestDisplacement(prefs.getFloat("distance", 25f));
            LocationServices.getFusedLocationProviderClient(context).requestLocationUpdates(request, NativeLocationReceiver.pendingIntent(context));
        } catch (SecurityException e) {
            NativeLocationReceiver.diag(context, "arranque: SIN PERMISO de ubicación para retomar el envío nativo");
        } catch (Exception e) {
            NativeLocationReceiver.diag(context, "arranque: no se pudo registrar el envío nativo: " + e.getClass().getSimpleName());
        }
        // Con el servicio en primer plano Android no limita la frecuencia de las posiciones; si el sistema no deja arrancarlo desde aquí, queda anotado.
        NativeLocationReceiver.tryStartForegroundService(context, true);
    }
}
