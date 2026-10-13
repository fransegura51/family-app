# App nativa de PEPA (Android; iPhone pendiente)

La app nativa es una **cáscara Capacitor** que abre la PEPA publicada (`capacitor.config.ts` → `server.url`). Todo lo de la web llega a la app sin
reinstalar; solo hace falta un APK nuevo cuando cambia algo NATIVO (permisos, plugins, icono).

## Qué hace de más que la web
- **Ubicación con el móvil bloqueado**: plugin `@capacitor-community/background-geolocation` (servicio en primer plano + notificación fija).
  `watchPosition` (`src/services/geolocation.ts`) usa el plugin solo dentro de la app. Con «Mientras se usa la aplicación» basta (el servicio
  en primer plano cuenta como uso); no hace falta «Permitir siempre».
- **Envío nativo de la posición** (`src/data/liveLocationNative.ts`): Android frena las peticiones de la web pasados 5 min en segundo plano, así
  que el upsert en `member_locations` lo hace `CapacitorHttp`. El aviso de llegada/salida lo calcula la base (migración 0186).
- **Avisos nativos por Firebase (FCM)**: el móvil se registra como `fcm:<token>` en `push_subscriptions`; `send-due-reminders` y
  `send-family-push` entregan con `fcm.ts` (copia idéntica en las dos carpetas; un test las compara). Los móviles web siguen por Web Push.

## Fabricar el APK
GitHub → Actions → **Android APK** → Run workflow. Sale el artefacto `PEPA-android` (firmado). Se descarga con `gh run download <id> -n PEPA-android`.
Cada ejecución sube el `versionCode` (número de ejecución): se instala encima sin desinstalar, siempre que la FIRMA sea la misma.

## Secretos (el repositorio es público: NINGUNO va en el código)
| Dónde | Secreto | Para qué |
|---|---|---|
| GitHub (repo) | `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Firma del APK. **Copia de seguridad de la llave: `Documents\proyectos claude\copias-seguridad\pepa-android`.** Perderla obliga a desinstalar la app para instalar una nueva |
| GitHub (repo) | `GOOGLE_SERVICES_JSON_B64` | `google-services.json` de Firebase en base64 (`base64 -w0 google-services.json`) |
| Supabase Vault | `fcm_service_account` | JSON de la cuenta de servicio de Firebase (Configuración del proyecto → Cuentas de servicio → Generar clave privada) |

## Alta de Firebase (gratis, sin tarjeta)
1. console.firebase.google.com → Crear proyecto «PEPA» (sin Analytics).
2. Añadir app Android con el paquete **`es.pepafamilyapp.app`** → descargar `google-services.json`.
3. Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada (JSON secreto).
4. `base64 -w0 google-services.json | gh secret set GOOGLE_SERVICES_JSON_B64 -R fransegura51/family-app`.
5. Guardar el JSON de la cuenta de servicio en Supabase Vault con el nombre `fcm_service_account` (Dashboard → Vault, o `select vault.create_secret(...)`).
6. Lanzar de nuevo el workflow «Android APK» e instalar el APK nuevo. Al abrir la app con permiso de notificaciones, el móvil se registra solo.

## Ubicación con la app CERRADA (APK 18, 13/10/2026)
El plugin original de ubicación apaga su servicio al cerrar la app (deslizarla en apps recientes) y sin JavaScript nadie recibe la posición. Solución:
- `scripts/patch-background-geolocation.mjs` (se ejecuta en `postinstall` y en el workflow del APK) sustituye el servicio por
  `android-patches/background-geolocation/BackgroundGeolocationService.java` y añade `setNativeUpload` / `clearNativeUpload` al plugin. Comprueba
  versión (1.2.26) y huella del original: si el plugin se actualiza, FALLA en voz alta.
- Con la app cerrada el servicio sigue en primer plano (`START_STICKY`, se levanta solo si el sistema lo mata) y manda cada posición él solo a
  `public.report_device_location` (migración 0253) con una **llave propia del móvil**: 64 caracteres, solo su huella sha256 en la base, solo sirve para
  mandar la posición de ESA persona mientras tenga «Compartir ubicación» activo. Pedir otra llave anula la anterior (un móvil nativo por persona).
- JS (`src/services/nativeUpload.ts`): pide la llave una vez por arranque al empezar a compartir y la entrega al servicio; al dejar de compartir o
  cerrar sesión la anula. Al volver a abrir la app, el envío nativo se retira y manda JS (sin duplicados).
- El servidor contesta `ok` / `off` / `revoked` / `invalid`; con `off` o `revoked` el servicio se para y borra su configuración.
- Pendiente conocido: tras REINICIAR el móvil el servicio no arranca solo hasta abrir PEPA (falta un receptor BOOT_COMPLETED); sin
  `ACCESS_BACKGROUND_LOCATION` un reinicio del proceso por el sistema puede perder el acceso a la ubicación.

## Ajustes del móvil para que lleguen los avisos con la app cerrada (Xiaomi, comprobado)
Ajustes → Aplicaciones → botón «Autoinicio en segundo plano» → activar la app; batería «Sin restricciones»; cerrar con el botón de inicio.
Con la app deslizada los avisos de Firebase sí llegaron (13/10). La guía por marca está en Familia (`src/ui/BatteryGuideCard.tsx`).

## Avisos de llegada/salida
- Radio por defecto de los lugares: **50 m** (salta a ~82 m al salir: radio·1,25+20). Casa sigue en 100 m.
- Buzón con reintentos (`location_alert_outbox`, migración 0243), canal Android `pepa-avisos`. El modo prueba (`location_alert_test_mode` en Vault,
  hace que el aviso llegue también a quien se mueve) está BORRADO; para volver a probar: `select vault.create_secret('on', 'location_alert_test_mode')`.
- Aviso de prueba directo a una persona: `net.http_post` a `send-family-push` con `only_profile_id` y cabecera `x-cron-secret` (`public.get_app_secret('cron_shared_secret')`).

## Pepa: «¿dónde está Eric?»
`src/domain/memberWhere.ts` + `handleWhere` en `src/pepa/location.ts`: contesta por voz y abre el mapa centrado en esa persona (`services/mapFocus.ts`).
Solo miembros de la MISMA familia (RLS), respeta el consentimiento y las cuentas sin acceso a Ubicación.

## Limitaciones conocidas
- Tras reiniciar el móvil, la ubicación con la app cerrada no se retoma hasta abrir PEPA. Decisión (13/10/2026): NO se añade un receptor de arranque, porque
  un servicio de ubicación lanzado desde el arranque no tiene acceso a la ubicación sin el permiso «Permitir siempre» (ACCESS_BACKGROUND_LOCATION), que
  obligaría a una pantalla de ajustes más y a la declaración de ubicación en segundo plano de Google Play. Se reabre si hace falta.
- Si un móvil tiene a la vez la PEPA web instalada (con Web Push) y la app nativa (FCM), recibe **dos** avisos: quitar la web de ese móvil.
- Play Protect / Mi Protect avisan al instalar el APK fuera de tienda (esperable).
- iPhone: no existe todavía (hace falta cuenta de Apple + Mac en la nube; `npx cap add ios` se haría en un runner macOS). En iOS la ubicación en
  segundo plano funciona distinto (permiso «Siempre», cambios significativos).
