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

## Limitaciones conocidas (a 2026-10-10, sin probar en movimiento)
- La ubicación en segundo plano solo está comprobada con el móvil quieto; falta la prueba en movimiento y la de batería de Xiaomi.
- Google Calendar y el banco abren el navegador y **vuelven al navegador**, no a la app (pendiente: deep links).
- Si un móvil tiene a la vez la PEPA web instalada (con Web Push) y la app nativa (FCM), recibe **dos** avisos: quitar la web de ese móvil.
- Play Protect / Mi Protect avisan al instalar el APK fuera de tienda (esperable).
- iPhone: no existe todavía (hace falta cuenta de Apple + Mac en la nube; `npx cap add ios` se haría en un runner macOS).
