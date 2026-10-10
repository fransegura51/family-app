package es.pepafamilyapp.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.List;

/**
 * Puerta de entrada de la app. Si la última vez se cerró sola, enseña el motivo (traza del error o razón que da Android) en vez de abrir
 * PEPA a ciegas, con un botón para copiarlo y otro para abrir PEPA de todos modos. Si todo fue bien, abre PEPA (MainActivity) al instante.
 * Sirve para diagnosticar un cierre en un móvil concreto sin tener que conectarlo a un ordenador.
 */
public class LauncherActivity extends Activity {

    private static final String KEY_EXIT_SEEN = "exit_seen_ts";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SharedPreferences prefs = getSharedPreferences(PepaApplication.PREFS, MODE_PRIVATE);

        // Gancho de prueba (solo lo usa la prueba de humo del APK): fuerza un informe de ejemplo.
        if (getIntent() != null && getIntent().getBooleanExtra("pepa_demo_crash", false)) {
            prefs.edit().putString(PepaApplication.KEY_LAST, "INFORME DE EJEMPLO (prueba)\njava.lang.RuntimeException: ejemplo").commit();
        }

        String crash = prefs.getString(PepaApplication.KEY_LAST, null);
        String exit = badExitSinceLastTime(prefs);

        if (crash == null && exit == null) {
            openApp();
            return;
        }
        showReport(prefs, crash, exit);
    }

    private void openApp() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }

    /** Razón con la que Android dice que cerró la app la última vez, si fue un cierre malo (fallo, bloqueo, memoria...). */
    private String badExitSinceLastTime(SharedPreferences prefs) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return null;
        }
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            List<ApplicationExitInfo> exits = am.getHistoricalProcessExitReasons(getPackageName(), 0, 5);
            long seen = prefs.getLong(KEY_EXIT_SEEN, 0);
            StringBuilder out = new StringBuilder();
            long newest = seen;
            for (ApplicationExitInfo info : exits) {
                if (info.getTimestamp() <= seen) {
                    continue;
                }
                int reason = info.getReason();
                boolean bad = reason == ApplicationExitInfo.REASON_CRASH
                    || reason == ApplicationExitInfo.REASON_CRASH_NATIVE
                    || reason == ApplicationExitInfo.REASON_ANR
                    || reason == ApplicationExitInfo.REASON_INITIALIZATION_FAILURE
                    || reason == ApplicationExitInfo.REASON_SIGNALED
                    || reason == ApplicationExitInfo.REASON_LOW_MEMORY
                    || reason == ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE
                    || reason == ApplicationExitInfo.REASON_DEPENDENCY_DIED;
                if (bad) {
                    out.append("Android dice: ").append(reasonName(reason)).append(" (código ").append(reason).append(")\n")
                        .append("Estado: ").append(info.getStatus()).append("\n")
                        .append("Detalle: ").append(info.getDescription()).append("\n")
                        .append("Hora: ").append(new java.util.Date(info.getTimestamp())).append("\n\n");
                }
                newest = Math.max(newest, info.getTimestamp());
            }
            prefs.edit().putLong(KEY_EXIT_SEEN, newest).commit();
            return out.length() == 0 ? null : out.toString();
        } catch (Throwable t) {
            return null;
        }
    }

    private static String reasonName(int reason) {
        switch (reason) {
            case 2: return "cerrada por una señal del sistema (SIGNALED)";
            case 3: return "poca memoria (LOW_MEMORY)";
            case 4: return "fallo de la app (CRASH)";
            case 5: return "fallo nativo (CRASH_NATIVE)";
            case 6: return "app bloqueada (ANR)";
            case 7: return "fallo al iniciar (INITIALIZATION_FAILURE)";
            case 9: return "uso excesivo de recursos (EXCESSIVE_RESOURCE_USAGE)";
            case 12: return "un servicio del que dependía se cayó (DEPENDENCY_DIED)";
            default: return "otro motivo";
        }
    }

    private void showReport(final SharedPreferences prefs, String crash, String exit) {
        final StringBuilder text = new StringBuilder();
        text.append("PEPA se cerró la última vez. Este es el motivo:\n\n");
        if (exit != null) {
            text.append(exit);
        }
        if (crash != null) {
            text.append("Error anotado por la app:\n").append(crash);
        }
        text.append("\n\nModelo: ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL)
            .append(" · Android ").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append(")");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 48, 32, 32);

        TextView title = new TextView(this);
        title.setText("Informe del fallo");
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);

        ScrollView scroll = new ScrollView(this);
        TextView body = new TextView(this);
        body.setText(text.toString());
        body.setTextSize(11);
        body.setTypeface(Typeface.MONOSPACE);
        body.setTextIsSelectable(true);
        scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);

        Button copy = new Button(this);
        copy.setText("Copiar informe");
        copy.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(ClipData.newPlainText("Informe del fallo de PEPA", text.toString()));
                    Toast.makeText(LauncherActivity.this, "Copiado", Toast.LENGTH_SHORT).show();
                }
            }
        );
        buttons.addView(copy);

        Button open = new Button(this);
        open.setText("Abrir PEPA");
        open.setOnClickListener(
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    prefs.edit().remove(PepaApplication.KEY_LAST).commit();
                    openApp();
                }
            }
        );
        buttons.addView(open);

        root.addView(buttons);
        setContentView(root);
    }
}
