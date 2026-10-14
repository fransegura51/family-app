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

## Falta (necesita la cuenta de Apple Developer, titular: Paco)
1. Cuenta de Apple Developer (99 €/año, «Individual»), activa.
2. En App Store Connect: crear la app (`es.pepafamilyapp.app`), nombre, categoría, edad, capturas, descripción, URL de privacidad (`/privacidad.html`).
3. **Firma**: certificado de distribución + perfil de aprovisionamiento. Se crean en la web de Apple; las llaves van a secretos de GitHub (el repositorio es público: NADA secreto en el código).
   Plan: clave de la API de App Store Connect (`.p8`) + `fastlane` en el Mac de GitHub, para firmar y subir a **TestFlight** sin tocar un Mac propio.
4. **Avisos**: clave APNs (`.p8`, se crea en la web de Apple) → subirla a Firebase (proyecto `pepa-d9315`) y añadir `GoogleService-Info.plist`. El servidor ya manda por FCM; para iOS
   faltan los datos de APNs en el aviso (`apns` en `buildFcmPayload`) y registrar el token del móvil igual que en Android (`fcm:<token>`).
5. **Ubicación con la app cerrada en iPhone**: el servicio de Android que sigue vivo tras cerrar la app no existe en iOS. iOS relanza apps por «cambios significativos de ubicación» /
   regiones (los lugares guardados), con el permiso «Siempre»; si el usuario fuerza el cierre, iOS puede no relanzarla. Hay que probarlo en un iPhone real y decidir.
6. Probar con TestFlight (hasta 10 000 personas externas, builds de 90 días) y pasar la revisión de Apple (riesgo principal: regla 4.2, «es solo una web»; PEPA añade avisos, ubicación y voz).
7. Cuenta de prueba para el revisor: «Familia prueba».

## Riesgos conocidos
- Apple puede rechazar por «web envuelta» (4.2). Mitigación: las funciones nativas (avisos, ubicación, voz) y describirlas bien en las notas de revisión.
- Si se cobra dentro de la app, Apple se queda 15-30 %.
- En la UE, los vendedores («traders») muestran dirección y teléfono públicos en la ficha.
