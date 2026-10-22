# Texto para empezar la conversación «Apple nativa»

Si no te aparece el botón de abrir la conversación, abre una conversación nueva en esta misma carpeta del proyecto (`family-app`), ponle de título **Apple nativa** y pega el texto de abajo como primer mensaje.

---

Retomo la app nativa de iPhone de PEPA. Lee antes `docs/APP_IOS.md`, `docs/APP_IOS_PASOS_AHORA.md`, `docs/APP_STORE_FICHA.md` y `docs/APP_NATIVA.md` (la de Android, de referencia).

Reglas: nunca me pidas ni aceptes contraseñas, códigos ni archivos `.p8` en el chat (los archivos van a una carpeta del ordenador y se suben a GitHub con `scripts/ios-secretos.ps1`, que ejecuto yo o Paco); no crees cuentas ni aceptes contratos de Apple por nosotros; no publiques nada en la App Store ni en Google Play todavía (publicación en 3-4 meses); no toques producción (Supabase) sin mi autorización; el repositorio es público, nada secreto en el código; explícamelo todo «para tontos», paso a paso.

Estado (15/10/2026): la cuenta de Apple Developer de Paco (Francisco José Segura Hortelano) ya está pagada y Apple ha enviado el correo de bienvenida. Ya hay proyecto `ios/` (Capacitor 8 + CocoaPods), permisos en español, icono, «Borrar mi cuenta», política y términos, un flujo de GitHub que compila sin firmar (`ios-build.yml`) y un borrador sin probar de firma y subida a TestFlight (`ios-testflight.yml`). En GitHub todavía NO existen los secretos de iPhone: APPLE_TEAM_ID, ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_B64 y GOOGLE_SERVICE_INFO_PLIST_B64. Bundle ID previsto: `es.pepafamilyapp.app`; proyecto Firebase `pepa-d9315`.

Falta, en este orden: (1) confirmar que la cuenta ya no está «Pendiente» y aceptar contratos (Paco); (2) crear el identificador de la app con Push Notifications; (3) crear la ficha en App Store Connect; (4) llave de la API de App Store Connect (rol Admin); (5) llave de avisos APNs subida a Firebase; (6) app iPhone en Firebase y `GoogleService-Info.plist`; (7) ejecutar `scripts/ios-secretos.ps1`; (8) lanzar «iOS TestFlight» en GitHub Actions y corregir lo que falle; (9) instalar por TestFlight en un iPhone y probar avisos, voz, enlace de vuelta de Google/banco y sobre todo la ubicación con la app cerrada.

Empieza preguntándome si Paco ya ha entrado en developer.apple.com/account y qué estado ve, y guíame con los pasos 1 y 2, uno a uno, esperando mi confirmación.
