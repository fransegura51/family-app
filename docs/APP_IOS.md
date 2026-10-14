# App nativa de PEPA para iPhone

Misma idea que la de Android (`docs/APP_NATIVA.md`): una **cáscara Capacitor** que abre la PEPA publicada (`capacitor.config.ts` → `server.url`). Todo lo de la web llega
sin reinstalar; solo hace falta una versión nueva cuando cambia algo NATIVO (permisos, ubicación en segundo plano, icono…).

## Estado (14/10/2026)
- Proyecto de Xcode generado (`ios/`, con **CocoaPods**: el plugin de ubicación en segundo plano todavía no es compatible con Swift Package Manager).
- `Info.plist` con los textos de permisos en español (ubicación siempre y mientras se usa, micrófono, reconocimiento de voz, cámara, fotos), modos en segundo plano
  (`location`, `remote-notification`), el enlace de vuelta `es.pepafamilyapp.app://` (Google Calendar y banco) y `ITSAppUsesNonExemptEncryption = false`.
- Icono (la cara de Pepa, sin transparencia) y pantalla de inicio de PEPA.
- `.github/workflows/ios-build.yml` (a mano): comprueba que la app **compila** en un Mac de GitHub (gratis en repos públicos), sin firmar y sin cuenta de Apple.
- **Borrar la cuenta desde la app** (Apple 5.1.1(v)): hecho (migración 0256, función `delete-account`, Familia → Borrar mi cuenta).
- Política de privacidad y términos con los datos del responsable (Francisco José Segura Hortelano) y al día.

## Preparado de antemano (14/10/2026, sin la cuenta de Apple; SIN PROBAR en un iPhone real)
- **Avisos**: el servidor ya manda también a Apple (bloque `apns` en `buildFcmPayload`: prioridad 10, sonido, caducidad y sustitución de avisos repetidos). En el
  iPhone, `AppDelegate.swift` cambia el identificador de Apple por el token de Firebase (`pod 'FirebaseMessaging'`) y el plugin de Capacitor lo recibe, así que se guarda
  como `fcm:<token>` igual que en Android. Firebase solo arranca si la compilación lleva `GoogleService-Info.plist` (sin él la app va igual, sin avisos).
  `App.entitlements` lleva el permiso `aps-environment`.
- **Ubicación**: en iPhone no se pide la llave del servicio de Android (`isIosApp()` en `nativeUpload.ts`); la ubicación llega por el camino de siempre mientras iOS mantiene
  viva la app en segundo plano (permiso «Siempre»).
- **Envío a TestFlight**: `.github/workflows/ios-testflight.yml` (a mano, firma automática en la nube de Apple con la llave de la API; sin Mac propio). Está escrito pero NO probado.

## Falta (necesita la cuenta de Apple Developer, titular: Paco; pago hecho el 14/10/2026, a la espera de que Apple la active)
Lo que hay que hacer en las webs de Apple y Firebase, en este orden (todo lo hace Paco con su Apple ID; los archivos secretos NUNCA al chat ni al código):
1. Cuenta activa (desaparece el «(Pending)» en developer.apple.com/account).
2. **Identificador de la app**: developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → «+» → App IDs → App → Bundle ID **explícito** `es.pepafamilyapp.app`,
   marcando la capacidad **Push Notifications**.
3. **Ficha en App Store Connect**: Apps → «+» → Nueva app, iOS, nombre, idioma, ese Bundle ID, SKU libre (`pepa-ios`). Los textos están en `docs/APP_STORE_FICHA.md`.
4. **Llave de la API de App Store Connect**: App Store Connect → Usuarios y acceso → Integraciones → App Store Connect API → «+», rol **Admin**. Apunta el *Key ID* y el *Issuer ID*
   y descarga el `.p8` (solo se deja UNA vez). Secretos de GitHub: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_B64` (el .p8 en base64), `APPLE_TEAM_ID` (Membership details).
5. **Llave de avisos (APNs)**: Certificates, Identifiers & Profiles → Keys → «+» → *Apple Push Notifications service (APNs)* → descargar el `.p8` (UNA vez). En Firebase
   (proyecto `pepa-d9315`) → Configuración del proyecto → Cloud Messaging → app de Apple → subir esa llave con su Key ID y el Team ID.
6. **App de iPhone en Firebase**: añadir una app iOS con el Bundle ID `es.pepafamilyapp.app`, descargar `GoogleService-Info.plist` y guardarlo como secreto `GOOGLE_SERVICE_INFO_PLIST_B64`.
7. Lanzar **iOS TestFlight** (Actions). Si falla, se corrige el borrador (puede pasar: no se ha podido probar).
8. En TestFlight: instalar en un iPhone, probar avisos, voz, enlace de vuelta de Google/banco y **ubicación en segundo plano y con la app cerrada** (lo más incierto: iOS puede no relanzar
   una app cerrada a la fuerza; si hace falta, cambios significativos de ubicación / regiones con los lugares guardados).
9. Pasar la revisión de Apple (riesgo principal: regla 4.2, «es solo una web»; PEPA añade avisos, ubicación y voz). Cuenta de prueba para el revisor: «Familia prueba».

## Riesgos conocidos
- Apple puede rechazar por «web envuelta» (4.2). Mitigación: las funciones nativas (avisos, ubicación, voz) y describirlas bien en las notas de revisión.
- Si se cobra dentro de la app, Apple se queda 15-30 %.
- En la UE, los vendedores («traders») muestran dirección y teléfono públicos en la ficha.
