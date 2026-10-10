package es.pepafamilyapp.app;

import android.app.Application;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Date;

/**
 * Anota el motivo de cualquier cierre inesperado de la app (traza completa del error) para poder enseñarlo en pantalla la próxima vez que se
 * abra (ver LauncherActivity). Sin esto, un cierre al arrancar en un móvil concreto no deja rastro que se pueda leer sin conectarlo a un
 * ordenador. No envía nada a ningún sitio: se queda solo en el propio móvil.
 */
public class PepaApplication extends Application {

    static final String PREFS = "pepa_crash";
    static final String KEY_LAST = "last";

    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(
            (thread, throwable) -> {
                try {
                    StringWriter trace = new StringWriter();
                    throwable.printStackTrace(new PrintWriter(trace));
                    String report = new Date() + " · hilo «" + thread.getName() + "»\n\n" + trace;
                    // commit() (síncrono): el proceso se muere justo después y apply() podría no llegar a escribir.
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_LAST, report).commit();
                } catch (Throwable ignored) {
                    // No se puede hacer nada más: lo importante es no tapar el fallo original.
                }
                if (previous != null) {
                    previous.uncaughtException(thread, throwable);
                }
            }
        );
    }
}
