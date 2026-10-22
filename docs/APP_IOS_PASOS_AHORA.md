# iPhone: qué hacer AHORA que Apple ya ha enviado el correo de bienvenida

Todo esto lo hace **Paco con su Apple ID** (o Jennifer a su lado, con él conectado). **Nunca** se pegan contraseñas, códigos ni archivos `.p8` en el chat ni en el código: los archivos van a la carpeta del ordenador y el script `scripts/ios-secretos.ps1` los sube a GitHub sin pasar por la conversación.

Tiempo total: unos 45 minutos, con pausas para esperar a Apple.

## Paso 1 — Comprobar que la cuenta está activa (2 min)
1. Entrar en https://developer.apple.com/account con el Apple ID de Paco.
2. Arriba ya no debe poner «(Pending)». Si pide aceptar un contrato nuevo («Review Agreement»), lo acepta **Paco** (es el titular).
3. Anotar el **Team ID** (Cuenta → «Membership details» → «Team ID», 10 letras y números).

## Paso 2 — Crear el identificador de la app (5 min)
1. developer.apple.com/account → **Certificates, Identifiers & Profiles** → **Identifiers** → botón **+**.
2. **App IDs** → Continue → **App** → Continue.
3. Description: `PEPA`. Bundle ID: elegir **Explicit** y escribir exactamente `es.pepafamilyapp.app`.
4. En «Capabilities» marcar **Push Notifications**. Continue → Register.

## Paso 3 — Crear la ficha de la app (10 min)
1. https://appstoreconnect.apple.com → **Apps** → **+** → **Nueva app**.
2. Plataformas: iOS. Nombre: `PEPA` (si está cogido, `PEPA Familia`). Idioma principal: Español (España). Bundle ID: el que acabas de crear (`es.pepafamilyapp.app`). SKU: `pepa-ios`. Acceso: completo.
3. Los textos de la ficha están preparados en `docs/APP_STORE_FICHA.md` (se pueden dejar para más tarde: para TestFlight no hacen falta).
4. El teléfono público lo pone Jennifer ahí, **nunca** en el repositorio.

## Paso 4 — Llave de la API de App Store Connect (5 min) → permite que GitHub firme y suba la app sin Mac
1. App Store Connect → **Usuarios y acceso** → **Integraciones** → **App Store Connect API** → **+** (Generar llave).
2. Nombre: `GitHub PEPA`. Acceso: **Admin**. Generar.
3. Apuntar el **Key ID** y el **Issuer ID** (arriba de la lista).
4. **Descargar el archivo `AuthKey_XXXX.p8`** (solo deja UNA vez). Guardarlo en una carpeta de este ordenador, p. ej. `Documentos\apple`.

## Paso 5 — Llave de avisos (APNs) para Firebase (5 min)
1. developer.apple.com → Certificates, Identifiers & Profiles → **Keys** → **+**. Nombre `PEPA avisos`, marcar **Apple Push Notifications service (APNs)** → Continue → Register → **Download** (otro `.p8`, solo UNA vez; guardarlo en la misma carpeta).
2. Anotar su **Key ID**.
3. https://console.firebase.google.com → proyecto `pepa-d9315` → ⚙ Configuración del proyecto → **Cloud Messaging** → «Configuración de la app de Apple» → **Subir clave de APNs**: elegir ese `.p8`, escribir el Key ID y el Team ID.

## Paso 6 — App de iPhone en Firebase (5 min)
1. Firebase → Configuración del proyecto → General → **Añadir app** → iOS.
2. ID del paquete: `es.pepafamilyapp.app`. Apodo: `PEPA iPhone`. Registrar.
3. **Descargar `GoogleService-Info.plist`** y guardarlo en la misma carpeta. Se pueden saltar los pasos que dicen «añadir el SDK» (ya está hecho).

## Paso 7 — Subir los secretos a GitHub (2 min) — con el script
En una terminal de este ordenador (en la carpeta del proyecto):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ios-secretos.ps1
```
Pide, uno a uno: Team ID, Key ID, Issuer ID, la ruta del `AuthKey_….p8` de la API (el del Paso 4, **no** el de avisos) y la ruta de `GoogleService-Info.plist`. Termina enseñando los nombres de los secretos guardados.

## Paso 8 — Lanzar TestFlight (Claude lo vigila, 15-25 min)
GitHub → Actions → **iOS TestFlight** → Run workflow. Si falla (es un borrador sin probar), se corrige y se repite. Cuando termine bien, la app aparece en App Store Connect → TestFlight (tarda unos minutos en «procesarse»).

## Paso 9 — Instalar en un iPhone
1. En el iPhone: instalar la app **TestFlight** desde la App Store.
2. App Store Connect → TestFlight → Probadores internos → añadir el correo del Apple ID de Jennifer (o de quien pruebe). Les llega una invitación.
3. Probar: abrir sesión, avisos, voz, enlace de vuelta de Google/banco y **la ubicación con la app cerrada** (lo más incierto en iPhone).

## Lo que no se hace todavía
No se publica en la App Store hasta que esté terminada (3-4 meses). Google Play se deja para más adelante.
