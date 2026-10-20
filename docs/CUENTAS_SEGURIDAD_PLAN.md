# Cuentas, acceso, seguridad y correos oficiales (PEPA-CUENTAS)

Rama de trabajo: `feature/cuentas-seguridad` (sin subir a GitHub, sin desplegar). Nada de esto está en producción.
Cada dato está marcado como **[Código]** (leído en el código), **[Docs]** (documentación pública), **[Foros]** (mensajes de usuarios, no oficial) o **[No verificado]**.

## 1. Qué hay hecho en la rama y qué no

| Pieza | Estado |
|---|---|
| Plantillas de correo (5) + logotipo ligero + vista previa | Hechas, **sin activar** (`supabase/email-templates/`, generadas por `scripts/build-email-templates.mjs`) |
| Códigos de 6 cifras: confirmar correo al registrarse, contraseña olvidada | Hecho en la app. Funciona con las plantillas actuales (enlace) y con las nuevas (código) |
| Correo en las fichas de Familia + «Cambiar correo» en la ficha propia y en Seguridad | Hecho |
| Cambiar contraseña (con la actual o con código al correo) + pantalla de nueva contraseña con el logo de PEPA | Hecho |
| PIN: cambiar y desactivar pidiendo el PIN; «He olvidado mi PIN» (contraseña o código al correo); relock al volver de segundo plano | Hecho en la app. **Necesita la migración 0292** |
| Botón «Reiniciar PIN» de Familia | **Quitado de la app.** La función de la base de datos sigue hasta aplicar 0293 |
| Pantalla Seguridad en tres apartados (Mi cuenta, Bloqueo personal, Sesiones) | Hecha |
| Migración `0292_account_security.sql` (solo funciones nuevas) | Escrita y probada como texto. **Sin aplicar.** Prueba en vivo preparada: `supabase/pending-migrations/0292_live_test.sql` |
| Endurecimiento `0293` (retirar reinicio por administradora, «quitar PIN» sin comprobar, `set_own_pin` sin sobrescribir) | Escrito en `supabase/pending-migrations/`. **No debe aplicarse hasta validar la recuperación del PIN** |
| SMTP de OVH / Supabase / DNS | **Nada tocado.** Ver §3 |
| Cambio de correo de cuentas de menores por su tutor | **Sin implementar a propósito** (§6) |
| Biometría con el dominio oficial | **Sin migrar a propósito** (§7) |

## 1 bis. REQUISITO CRÍTICO: PEPA sigue cerrada, solo se entra con invitación (20/10/2026)

**Nada de esto se ha modificado.** Cómo funciona hoy **[Código]** y qué comprueba cada prueba:

| Qué | Cómo |
|---|---|
| Crear el *login* (correo + contraseña) | Está abierto a nivel de Supabase Auth (`auth.signUp`): cualquiera puede crear un login, pero **un login sin familia no tiene perfil y no puede usar nada** (la app lo lleva a la pantalla de alta, que pide el código) |
| Crear una familia nueva | Solo `create_family(...)` en el servidor: exige el código maestro (Vault) **o** una invitación de **un solo uso**, vigente (caduca a los 30 días) y sin usar. Si no, «Código de acceso incorrecto» |
| Quién genera esas invitaciones | Solo las **administradoras de PEPA** (`profiles.is_app_owner`; hoy dos cuentas) con `generate_family_invite` |
| Unirse a una familia existente | Solo `join_family_with_code(...)`: código de **un solo uso** (24 h) de una ficha concreta sin cuenta |
| Quién genera esos códigos | La **administradora de ESA familia** (`profiles.role = 'admin'` de su familia) con `generate_member_invite_code`; nunca de otra familia |
| Insertar a mano en `profiles` | Imposible desde la app: a `anon` y `authenticated` se les retiró el permiso (migración 0276) |

**Administradoras de PEPA ≠ administradoras de familia** y lo nuevo no las mezcla: ninguna función nueva usa `is_app_owner`; la administradora de familia solo ve los correos de **su** familia; el panel de uso de PEPA sigue siendo solo para `is_app_owner`.

**Los flujos nuevos no abren ninguna vía de alta:**
- El único `signUp` de toda la app sigue siendo el de siempre (pantalla de entrada). No hay `createUser`, `inviteUserByEmail`, `generateLink`, acceso anónimo, ni inicio con Google/Apple.
- Los códigos de acceso por correo se piden con `signInWithOtp(... shouldCreateUser: false)`: **no pueden crear cuentas**. Recuperar contraseña (`resetPasswordForEmail`), cambiar correo (`updateUser`) y recuperar PIN solo actúan sobre cuentas que ya existen.
- **El código de 6 cifras del correo y el código de invitación son procesos independientes:** el primero confirma un login; solo el segundo (pantalla de alta, después de entrar) da familia. Ninguna pantalla nueva pide, acepta ni sustituye uno por el otro.
- Las plantillas de correo no llevan enlaces de alta.

**Pruebas:**
- **Hecho:** `src/data/invitationGateUnchanged.test.ts` (18 pruebas) falla si alguna migración redefine o cambia la puerta, si algo inserta perfiles por otra vía, si aparece otro `signUp` o `signInWithOtp` sin `shouldCreateUser: false`, si una pantalla nueva llama a crear familia/unirse, o si 0292 toca invitaciones o `is_app_owner`. Se comprobó que **salta de verdad** añadiendo a propósito un `signUp` extra: falló, y se quitó.
- **Preparado, sin ejecutar (necesita tu autorización de escritura en la base de datos):** `supabase/pending-migrations/invitation_gate_live_test.sql`. Con datos de mentira dentro de una transacción que se revierte, demuestra: login sin invitación → no crea familia (sin código, `WRONGCODE`, caducado, usado); con invitación válida sí y solo una vez; no se puede unir con código inventado/caducado; no se puede insertar perfiles a mano; solo las de PEPA generan invitaciones de familia nueva; las funciones de 0292 no crean perfiles. Debe terminar con `PRUEBA_PUERTA_OK`.
- **Regla de despliegue:** esa prueba en vivo se ejecuta **antes** de desplegar cualquier cambio de autenticación y **otra vez después**. Si no termina en `PRUEBA_PUERTA_OK`, no se despliega (o se revierte).
- Prueba manual complementaria con una dirección tuya de usar y tirar: crear un login nuevo sin invitación, confirmar el correo con el código y comprobar que la app se queda en «Crear una familia / Unirme con un código» sin dejar pasar.

**Dos cosas que ya eran así y conviene que sepas (no se han cambiado):**
1. Como crear el login está abierto, **cualquiera puede hacer que Supabase mande un correo de confirmación a cualquier dirección** (con el SMTP actual y con el nuevo). Con SMTP propio, eso gasta cuota de envío y puede dañar la reputación del dominio si alguien abusa. Supabase limita los envíos (60 s por cuenta, tope por hora ajustable). Si algún día molesta, la solución es **pedir la invitación ANTES de crear el login** (validarla en un gancho de Supabase o en una función de servidor); es un cambio de comportamiento y **no forma parte de esta implementación**.
2. Si en Supabase estuviera desactivado «Allow new users to sign up», nadie podría ni crear un login (hoy se podría); **[No verificado]** (no puedo ver ese ajuste). No se activa ni desactiva nada.

El registro público se estudiará solo cuando se decida poner PEPA a la venta.

## 2. Códigos de seis cifras con Supabase Auth [Docs, código]

Supabase ya incluye el código: basta con poner `{{ .Token }}` en la plantilla (en vez de `{{ .ConfirmationURL }}`) y verificarlo con `verifyOtp`. **No hay ningún sistema de códigos propio.**

| Flujo | Se pide con | Se verifica con | Pantalla |
|---|---|---|---|
| Confirmar correo al registrarse | `signUp` / `resend({type:'signup'})` | `verifyOtp({email, token, type:'signup'})` | Entrar → «Crear cuenta» → código |
| Contraseña olvidada | `resetPasswordForEmail` | `verifyOtp({…, type:'recovery'})` y luego `updateUser({password})` | Entrar → «¿Olvidaste tu contraseña?», o Seguridad → «No recuerdo mi contraseña actual» |
| Cambio de correo | `updateUser({email})` | `verifyOtp({email: <dirección que recibió el código>, token, type:'email_change'})` | Seguridad → Mi cuenta; ficha propia de Familia |
| Identificarse para recuperar el PIN | `signInWithOtp({shouldCreateUser:false})` | `verifyOtp({…, type:'email'})` | Pantalla de bloqueo / Seguridad |

Requisitos y límites **[Docs]**:
- Caducidad: la del ajuste «Email OTP expiration» (por defecto 3600 s). Las plantillas dicen «una hora»: **si se cambia ese ajuste, hay que cambiar `OTP_EXPIRY_TEXT` en el script y volver a generar.**
- Reenvío: Supabase exige 60 s por cuenta entre envíos; la app muestra la cuenta atrás.
- Intentos: las verificaciones tienen un tope por IP (30 cada 5 min); un código dura hasta que se gasta o caduca y solo vale una vez.
- **Enlace y código no se ponen juntos en un correo:** comparten la misma clave de un solo uso, y los antivirus de correo (Outlook/Hotmail) abren los enlaces antes que la persona y los gastan (problema documentado por Supabase). Por eso las plantillas llevan solo código.
- Cambio de correo seguro: con el ajuste «Secure email change» (por defecto activado **[Docs]**; el valor de este proyecto **[No verificado]**) llegan dos códigos, uno a cada dirección, y hacen falta los dos. La pantalla admite los dos casos.
- Los enlaces antiguos ya enviados siguen valiendo mientras no caduquen: la app sigue reconociendo `#type=recovery` y sigue pasando `redirectTo`.

## 3. Correo de OVH como SMTP de Supabase (viabilidad)

Lo que se sabe del dominio (consulta DNS de solo lectura): DNS y correo en OVH (`mx0…mx3.mail.ovh.net`), SPF `v=spf1 include:mx.ovh.com ~all`, DMARC `p=none` con informes a `info@pepafamilyapp.es`.

| Pregunta | Respuesta |
|---|---|
| ¿Qué servicio de OVH tienes? | **[No verificado]** (se ve en el panel de OVH: Web Cloud → Emails). Los MX apuntan al patrón de MX Plan / Email Pro |
| ¿Supabase puede usar SMTP de otro proveedor? | Sí, ajustes «Custom SMTP» (host, puerto, usuario, contraseña, remitente) **[Docs]**. Es el camino recomendado para producción: el servicio por defecto de Supabase es para pruebas y **solo envía a miembros del equipo de la organización** **[Docs]** |
| Servidor y puertos | MX Plan: `smtp.mail.ovh.net`, 465 (SSL/TLS) o 587 (STARTTLS) **[Docs OVH]**. Email Pro: `pro1.mail.ovh.net`, 587 **[Foros]** |
| Límites | No he encontrado cifra oficial. **[Foros]**: unos 200 correos por hora y cuenta y unos 300 por hora y IP, 100 destinatarios por mensaje. Para correos de acceso (1–2 por persona nueva) sobra al empezar; un día de muchos registros seguidos podría toparse |
| Restricciones para envíos automáticos | Los foros de OVH desaconsejan su SMTP compartido para aplicaciones que envían mucho y recomiendan un proveedor transaccional. Para decenas de correos al día es viable |
| ¿Hace falta crear `no-reply@pepafamilyapp.es`? | Sí, como **buzón con contraseña**: el SMTP exige autenticarse con una cuenta; un alias no se autentica. Cuántas cuentas incluye tu plan **[No verificado]** |
| Reply-To `info@` | Supabase solo pide «remitente» y «nombre», **no he encontrado un campo Reply-To [No verificado]**. Solución sencilla: que el buzón `no-reply@` **reenvíe todo a `info@`** (redirección en OVH): quien responda acaba en `info@`. Si se quisiera una cabecera Reply-To de verdad, haría falta el «Send Email Hook» de Supabase (más complejo) |
| SPF / DKIM / DMARC | SPF ya incluye OVH, así que **no habría que tocarlo** si se envía por OVH. DKIM: OVH lo activa desde el panel (del dominio) y, si el DNS está en OVH, se añade solo; **[No verificado]** si ya está activo. DMARC `p=none` ya existe: más adelante se puede endurecer cuando todo firme bien |
| Reputación y entregabilidad | IP compartida de OVH: depende de lo que envíe el resto de clientes. **No se puede saber sin probar** (Gmail, Outlook/Hotmail, iCloud, Yahoo) |

**Recomendación:** probar primero OVH (coste extra 0 si tu plan incluye otra cuenta), **sin tocar Supabase**: enviar correos de prueba al servidor de OVH con el buzón nuevo desde un script a direcciones de Gmail, Outlook, iCloud y Yahoo y a mail-tester.com. Si llegan a la bandeja de entrada y firman con DKIM, se configura en Supabase. Si algo falla (spam en Outlook/Hotmail, límites), el plan B es **Resend** (3.000 correos al mes gratis, 100 al día; 20 $/mes con 50.000 **[Docs]**) y, a gran escala, Amazon SES (0,10 $ por mil). No se contrata nada sin tu autorización.

## 4. Dependencias externas: lo que necesita tu intervención

| # | Acción | Quién | Coste | Cuándo |
|---|---|---|---|---|
| 1 | Decirme qué servicio de correo tienes en OVH (MX Plan / Email Pro / Exchange) y cuántas cuentas incluye | Tú, en el panel de OVH | 0 | Antes de nada |
| 2 | Crear el buzón `no-reply@pepafamilyapp.es` con contraseña, y la redirección a `info@pepafamilyapp.es` | Tú, en OVH | 0 si tu plan lo incluye | Tras (1) |
| 3 | Comprobar que DKIM está activo para el dominio (panel de OVH) | Tú | 0 | Tras (1) |
| 4 | Darme permiso para probar el envío con un script (sin tocar Supabase) y para leer el resultado en las bandejas de pruebas | Tú | 0 | Tras (2) y (3) |
| 5 | Publicar el logotipo ligero en la web (`pepa-web/public/email/pepa-logo-email.jpg`, ya creado, **sin subir**) | Tú autorizas el despliegue de la web | 0 | Antes de activar las plantillas |
| 6 | En Supabase (Authentication): SMTP propio (host, puerto, usuario, contraseña, remitente), plantillas y asuntos, «Email OTP expiration» = 3600, «Email OTP length» = 6, límites de envío (Rate limits → emails por hora) | Tú o yo con tu permiso, **cuando lo autorices** | 0 | Tras la prueba (4) |
| 6 bis | **Autorizar escribir en la base de datos para ejecutar las pruebas en vivo** (`invitation_gate_live_test.sql` y `0292_live_test.sql`: datos de mentira que se revierten solos). La puerta por invitación se prueba **antes y después** de cualquier despliegue de autenticación | Tú | 0 | Antes de (7) y después de (8) |
| 7 | Aplicar la migración 0292 en producción | Con tu autorización | 0 | Antes de desplegar la web |
| 8 | Desplegar la web de la rama | Con tu autorización | 0 | Tras (7) |
| 9 | Aplicar `supabase/pending-migrations/0293…` | Con tu autorización, **solo tras validar la recuperación del PIN con una sesión real** | 0 | Cierre |

Coste de Supabase: las llamadas nuevas son **una** por apertura de Familia solo para quien es administradora (los correos de la familia). Para el resto no hay llamada nueva (su correo sale de la sesión). El bloqueo hace una consulta cuando se activa o se quita el PIN. No hay nada recurrente.

## 5. Orden de despliegue y reversión

0. **Prueba de la puerta por invitación (antes de cualquier cambio de autenticación)**: `invitation_gate_live_test.sql` debe terminar en `PRUEBA_PUERTA_OK` (fija cómo está hoy). Se repite **después** de cada paso 3 y 4. Si falla en cualquier momento: se detiene el despliegue y se revierte.
1. **Prueba de OVH fuera de Supabase** (ver §3). Reversión: nada que revertir.
2. **Aplicar 0292** (solo añade funciones). Ejecutar `0292_live_test.sql` (se revierte sola; debe acabar con `PRUEBA_0292_OK`). Reversión: `supabase/rollbacks/0292_account_security_down.sql`.
3. **Desplegar la web de la rama.** Funciona con las plantillas actuales (enlace) y con las nuevas (código), y la app antigua en un móvil que aún no se haya actualizado sigue funcionando con la base de datos nueva (0292 no quita nada). Reversión: volver al despliegue anterior.
4. **Activar SMTP propio y pegar las plantillas** (antes: copiar el texto actual de cada plantilla a un archivo, porque el panel no guarda historial). Reversión: pegar las plantillas antiguas y, si hiciera falta, volver al SMTP anterior. Mientras no haya SMTP propio los correos solo llegan a miembros del equipo.
5. **Pruebas reales** (§8) con la cuenta de Jennifer y una cuenta de prueba nueva.
6. **Cierre: aplicar 0293.** Hasta entonces el reinicio por administradora sigue existiendo en la base de datos aunque la app ya no lo ofrezca. Reversión: `0293_…_down.sql`.

Regla: **ninguna persona se queda sin acceso**: no se desactiva el reinicio por administradora hasta que la recuperación por la propia persona está probada en vivo; el enlace antiguo sigue funcionando mientras haya correos antiguos sin caducar; no se cambia ninguna sesión abierta.

## 6. Menores y tutores [Código]

- Los miembros sin cuenta (bebés, niños sin acceso) **no tienen correo ni se les pide**: son filas de `family_members` sin `linked_profile_id`.
- Un niño con cuenta propia es un perfil con `role = 'child'` (migración 0097) enlazado a su ficha. **No existe ninguna relación «tutor de» entre cuentas.** Lo único parecido es la declaración «soy madre/padre/tutor legal» al activar permisos de Comunidad para 15–17 años (`community_minor_permission_log`, migración 0277), que no sirve para esto.
- Por eso **no se ha implementado** que un padre o tutor cambie el correo de un hijo: hoy cualquier cambio sobre la cuenta de otra persona exigiría una función privilegiada (clave de servicio) sin ninguna relación comprobable que la proteja. Reglas ya aplicadas: cada adulto cambia solo su correo; la administradora **ve** los correos pero no puede cambiarlos; «Cambiar correo» solo sale en la ficha propia.
- Diseño propuesto para una fase posterior (necesita tu aprobación): tabla `account_guardians (child_profile_id, guardian_profile_id, declared_at)` con declaración explícita y registro; función de servidor que (1) comprueba la relación, (2) exige identificación reciente del tutor, (3) manda el código de confirmación **a la dirección nueva** y (4) solo aplica el cambio cuando esa dirección lo confirma; sin que el tutor vea ni toque la contraseña del menor.

## 7. Huella y Face ID: dependencia del dominio [Código]

- La función `profile-webauthn` fija `rpID = fransegura51.github.io` (y `localhost`). Una huella registrada pertenece a ese dominio: **si la web pasa a `pepafamilyapp.es`, las huellas existentes dejan de servir** (el PIN sigue funcionando; hay que volver a activarlas).
- Cómo adaptarlo cuando toque: aceptar también el origen `https://pepafamilyapp.es` con `rpID = pepafamilyapp.es` (los registros nuevos van con el dominio nuevo; los antiguos siguen ligados al viejo). En la app nativa (Capacitor carga la web publicada desde `server.url`), WebAuthn depende del soporte del WebView; hay que planificarlo aparte con pruebas en móvil real.
- **No se ha tocado.** Lo que sí hace esta rama: al quitar o recuperar el PIN se borran las huellas (la base de datos), así que no queda ninguna autorización biométrica huérfana.

## 8. Pruebas

Hecho en esta rama (ordenador, sin producción): comprobación de tipos, análisis de estilo y compilación sin avisos; 87 pruebas nuevas (piezas puras, pantallas, SQL, plantillas y la puerta por invitación) y la batería completa del proyecto (553 archivos, 10.541 pruebas, todas en verde); las plantillas se renderizaron en un navegador (móvil y escritorio).

**No hecho (necesita producción o dispositivos):**

| # | Prueba | Estado |
|---|---|---|
| 1 | Registro de usuario nuevo | Sin probar (necesita SMTP y plantillas) |
| 2 | Confirmación de correo con código | Sin probar |
| 3 | Cambio de correo (uno y dos códigos según el ajuste «seguro») | Sin probar |
| 4 | Recuperación de contraseña con código | Sin probar |
| 5 | Cambio de contraseña | Sin probar |
| 6 | PIN activado y desactivado | Sin probar con base de datos real |
| 7 | Cambio y recuperación del PIN (incluye comprobar que el token trae la marca `amr` con hora al entrar con contraseña y con código) | **Sin probar: es la comprobación clave antes del cierre 0293** |
| 8 | Huella y Face ID tras recuperar el PIN | Sin probar |
| 9 | Permisos de administradora, adulta y niña/o | SQL preparado (`0292_live_test.sql`); sin ejecutar |
| 10 | Usuarios sin cuenta propia | Revisado en el código |
| 11 | Varios dispositivos (cerrar solo aquí / en los demás) | Sin probar |
| 12 | Cierre de sesión (también la ubicación de la app nativa) | Sin probar |
| 13 | Aislamiento de datos entre familias | SQL preparado; sin ejecutar |
| 14 | iPhone, Android y escritorio (incluida la vuelta de segundo plano) | Sin probar |
| 15 | Entrega en Gmail, Outlook, iCloud y otros | Sin probar |

## 9. Decisiones pendientes de ti

1. Qué servicio de OVH tienes y si se prueba con él antes de decidir entre OVH y Resend (§3, §4).
2. Un minuto fuera de la app antes de volver a pedir el PIN: ¿te parece bien o lo prefieres más corto/largo? (constante `RELOCK_AFTER_BACKGROUND_MS`).
3. «Cerrar sesión» se ha movido de «Mi cuenta» a Seguridad → Sesiones para no tenerlo duplicado. ¿Lo prefieres también en «Mi cuenta»?
4. Diseño de tutores para menores con cuenta (§6): ¿se aprueba la tabla de tutores?
