# Cuentas, acceso, seguridad y correos oficiales (PEPA-CUENTAS)

Rama de trabajo: `feature/cuentas-seguridad` (sin subir a GitHub, sin desplegar). Nada de esto está en producción.

> **Actualización 24/10/2026:** las migraciones 0299 a 0303 están APLICADAS en producción desde el 21/10/2026 (verificado). Donde este documento diga «sin aplicar» o «sin desplegar» sobre ellas es histórico. Ver `docs/ESTADO_MIGRACIONES_0299_0303.md`.
Cada dato está marcado como **[Código]** (leído en el código), **[Docs]** (documentación pública), **[Foros]** (mensajes de usuarios, no oficial) o **[No verificado]**.

## 1. Qué hay hecho en la rama y qué no

**Leyenda:** ✅ implementado y probado en local · 📐 diseñado, no implementado · ⏳ pendiente de configuración externa · 🔒 pendiente de tu autorización para producción.

| Pieza | Estado |
|---|---|
| Auditoría de roles y permisos en producción (solo lectura) | ✅ `docs/AUDITORIA_ROLES_Y_PERMISOS_2026-10-21.md`: el fallo existe en el código, **0 cuentas afectadas** |
| Corrección del rol y las secciones de la ficha al unirse con código | ✅ en la rama (`0301`) · 🔒 aplicar |
| **Primero la invitación, después la cuenta** (pantalla de entrada + comprobación en el servidor + gancho de Supabase Auth) | ✅ pantallas y SQL probados en local · 🔒 aplicar `0302` y **activar el gancho** (⏳ comprobar en pruebas qué datos manda Supabase) |
| Reserva del código por correo, bloqueo de uso simultáneo, sin cuentas huérfanas | ✅ (`0301`/`0302`) · 🔒 aplicar · la limpieza de logins huérfanos no se programa sola |
| «Dar acceso a PEPA» a la vista, invitación al crear una ficha, sin duplicar, caducidad, copiar/compartir/WhatsApp | ✅ (`0301` + pantallas) · 🔒 aplicar y desplegar |
| Madre/padre vinculado puede invitar a su hijo menor (comprobado en el servidor) | ✅ (`0300`+`0301`) · 🔒 |
| Vínculo parental «Es mi hijo/a» (Fase A): declaración, identificación reciente, sin límite de tutores, historial, cese a los 18 | ✅ (`0300` + pantallas) · 🔒 aplicar |
| Retirar el propio vínculo y vínculos disputados | 📐 función creada **sin permiso de ejecución**; procedimiento propuesto para tu revisión |
| Gestionar el correo de los menores (Fase B) | 📐 solo diseño técnico (`docs/CUENTAS_PADRES_HIJOS_E_INVITACIONES.md` §6) |
| Plantillas de invitación (familia nueva / miembro de una familia) | ✅ plantilla y vista previa · ⏳ no se envía nada hasta tener el correo oficial |
| Plantillas de correo de acceso (5) + logotipo ligero | ✅ · ⏳ sin activar |
| Cerrar sesión solo en este dispositivo (en Configuración → Mi cuenta, donde estaba) | ✅ probado con la librería real de Supabase · 🔒 desplegar |
| Códigos de 6 cifras: confirmar correo y contraseña olvidada | ✅ funciona con las plantillas actuales (enlace) y con las nuevas (código) |
| Correo en las fichas de Familia + «Cambiar correo» en la ficha propia y en Seguridad | ✅ (`0299`) · 🔒 |
| Cambiar contraseña + pantalla de nueva contraseña con el logo de PEPA | ✅ |
| PIN: cambiar/desactivar pidiendo el PIN, «He olvidado mi PIN», se pide tras 1 minuto en segundo plano solo con PIN activado | ✅ (`0299`) · 🔒 |
| Botón «Reiniciar PIN» de Familia | ✅ quitado de la app · la función de la base de datos sigue hasta aplicar `0303` |
| Endurecimiento `0303` (retirar reinicio por administradora, «quitar PIN» sin comprobar) | ✅ escrito en `supabase/pending-migrations/` · 🔒 **no aplicar hasta validar la recuperación del PIN en vivo** |
| SMTP de OVH, buzón `no-reply@`, DNS, SMTP en Supabase | ⏳ **nada tocado** (§3) |
| Biometría con el dominio oficial | 📐 sin migrar a propósito (§7) |

### Migraciones (en este orden; ninguna está aplicada)
| Nº | Qué | Dependencia |
|---|---|---|
| 0299 | PIN con comprobación, recuperación con identificación reciente, correos de las fichas | — |
| 0300 | Vínculo parental («Es mi hijo/a») | 0299 |
| 0301 | Dar acceso a PEPA, rol/secciones de la ficha, bloqueo y reserva, blindaje de columnas | 0299, 0300 |
| 0302 | Primero la invitación: `check_invitation`, gancho de alta, limpieza de huérfanos | 0301 |
| 0303 (pendiente) | Retirar reinicio por administradora y «quitar PIN» sin comprobar | recuperación del PIN probada en vivo |

## 1 bis. REQUISITO CRÍTICO: PEPA sigue cerrada, solo se entra con invitación (20/10/2026)

**La regla no cambia; el cambio autorizado es el orden: primero la invitación, después la cuenta.** Hoy en producción **[comprobado en solo lectura]**: crear el *login* (correo y contraseña) está abierto en Supabase Auth, y la invitación se pide **después**, al crear la familia o unirse. Un login sin familia no sirve de nada (no tiene perfil), y hoy **no existe ninguno** (9 logins, 9 perfiles). Lo nuevo cierra esa puerta también al principio.

| Qué | Cómo queda |
|---|---|
| Crear el *login* | **Solo con una invitación válida**: la pantalla pide la invitación primero (`check_invitation`, que no la gasta) y el **gancho «Before User Created» de Supabase Auth** vuelve a comprobarla en el servidor y **rechaza cualquier alta directa** (un `signUp` llamado a mano) sin invitación válida. Recuperar contraseña, cambiar correo y entrar **no** pasan por ese gancho (solo se ejecuta al crear un usuario) |
| Crear una familia nueva | `create_family`: código maestro **o** invitación de un solo uso, caducable, solo generada por administradoras de PEPA. Vuelve a comprobarla al terminar y la gasta (bloqueo de fila: dos personas no pueden usarla a la vez). Quien crea la familia debe ser mayor de edad |
| Unirse a una familia | `join_family_with_code`: código de una ficha sin cuenta, un solo uso, 24 h, bloqueado al leerlo; rol y secciones **de la ficha**; la fecha de la ficha manda sobre la escrita |
| Vigencia (decisión definitiva 21/10/2026) | **Según el tipo:** invitación de **PEPA para crear una familia nueva = 7 días (168 h)** (antes 30 días; las ya generadas no cambian); invitación **de una familia para incorporar a un miembro = 24 horas**. **El código y la invitación comparten exactamente la misma fecha de caducidad** (no hay otro plazo). Si caduca, se genera otra desde la ficha o desde la administración |
| Reserva | Al validar el alta, el gancho **reserva la invitación para ese correo hasta que caduque la propia invitación** (no la gasta): otra persona no puede usar el mismo código y no quedan cuentas a medias. La gasta `create_family` / `join_family_with_code` al terminar. **Recuperación:** si el correo reservado nunca se confirmó (error al escribirlo), la persona vuelve a empezar con el correo correcto y la reserva pasa a él; si ya estaba confirmado, la invitación es de esa persona hasta que caduque o se genere otra. El registro puede continuarse mientras la invitación siga vigente |
| Cuentas huérfanas | Si alguien crea el login y no termina, `private.purge_orphan_logins` borra los logins sin familia con más de **8 días** (cuando ya ha caducado cualquier invitación; la más larga dura 7) (**no se programa sola**; hace falta tu autorización para programarla) |
| Lo que se revela | `check_invitation` solo dice si vale, de qué tipo es, cuándo caduca y si pedir la fecha; **nunca datos de ninguna familia**. Con límite de 30 comprobaciones por hora y por IP |

**Dos tipos de invitación, que no se mezclan:** *familia nueva* (la genera solo una administradora de PEPA, `family_invites`) y *familiar* (vincula una cuenta a una ficha; la genera la administradora de esa familia o una madre/padre vinculado, solo para su hijo menor). El **código de 6 cifras del correo** es otra cosa: confirma un correo, no da familia y no sustituye a ninguno de los dos.

**Administradoras de PEPA ≠ administradoras de familia ≠ madres/padres vinculados ≠ personas adultas**: ninguna función de cuentas usa `is_app_owner`; la administradora de familia ve los correos de **su** familia y no puede retirar el vínculo de otra persona; el padre vinculado solo invita a su hijo menor.

**El código maestro del Vault sigue aceptándose** (compatibilidad). Es una puerta permanente: **decisión tuya** si se rota o se retira cuando esto esté desplegado.

### Altas directas en Supabase Auth: cómo se impiden (investigado)
- **Mecanismo:** el gancho «Before User Created» **[Docs]** existe en los planes Free y Pro, puede ser una función de Postgres (límite de 2 s), recibe el correo, el proveedor y los datos del usuario, y rechaza con un error 4xx. Se activa en el panel (Authentication → Hooks); **no lo activa ninguna migración**.
- **No bloquea** recuperar contraseña, cambiar correo ni a los usuarios existentes: solo se ejecuta cuando se va a **crear** un usuario.
- **Lo que no he podido verificar [No verificado]:** si los datos que manda `signUp` (`options.data.invite_code`) llegan al gancho como `user.user_metadata` o `user.raw_user_meta_data` (la documentación no lo aclara). La función acepta los dos y, si no llega ninguno, **rechaza el alta (falla cerrado)**. Por eso la activación se hace con una comprobación inmediata y es **reversible en segundos** (desactivar el gancho). Lo ideal es probarlo antes en un entorno de pruebas.
- Una limitación honesta: los intentos que el gancho rechaza no se pueden contar por IP desde dentro (la transacción se deshace); ahí actúan los límites propios de Supabase (30 altas cada 5 minutos por IP). El contador por IP de 30 por hora sí actúa en `check_invitation`.

### Pruebas de la puerta
- ✅ **51 pruebas con datos en un PostgreSQL local** (`supabase/local-sql-tests`, migraciones reales): sin invitación no hay perfil ni familia; con una válida sí y solo una vez; reservas; el gancho rechaza alta anónima, con proveedor externo, sin código, inventado, caducado o usada, y acepta la válida reservándola; el niño queda como `child`; el padre vinculado solo invita a su hijo menor; ningún adulto puede ser «el hijo» de un vínculo.
- ✅ **40 pruebas sobre el texto del SQL y de la app** (`src/data/invitationGate.test.ts`): solo un `signUp` en toda la app y solo en la pantalla de entrada, tras `checkInvitation`; `signInWithOtp` siempre con `shouldCreateUser: false`; nadie más crea familia o une; plantillas sin enlaces de alta; ninguna función nueva usa `is_app_owner`. Se comprobó que **salta de verdad** añadiendo un `signUp` extra.
- ✅ Los dos scripts de «prueba en vivo» (`0299_live_test.sql`, `invitation_gate_live_test.sql`) **se ejecutaron contra el PostgreSQL local** y terminan en `PRUEBA_…_OK`: así sabemos que los propios scripts funcionan.
- 🔒 **Contra producción (con datos de mentira que se revierten solos): sin ejecutar** — necesita tu autorización de escritura. Regla: se ejecuta **antes** de aplicar nada y **otra vez después** de cada paso; si no termina en `PRUEBA_PUERTA_OK`, se detiene o se revierte.
- 🔒 **Prueba manual en vivo** con una dirección tuya de usar y tirar, tras activar el gancho: intentar crear un login **sin** invitación (con la pantalla y llamando a Supabase directamente) y comprobar que se rechaza; después con una invitación válida y comprobar que funciona.

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

**Estado (21/10/2026):** el buzón `info@pepafamilyapp.es` (Zimbra Starter) y el alias `no-reply@pepafamilyapp.es` están creados en OVH y el correo de prueba de Zimbra a Gmail llegó bien. Lo que **no** está documentado por OVH es **enviar por SMTP desde el alias autenticándose con `info@`**. Para comprobarlo hay una prueba local que no toca Supabase, DNS ni producción: `scripts/prueba-smtp-ovh.mjs` (doble clic en `scripts/Probar-correo-OVH.cmd`; guía en `scripts/README-prueba-smtp-ovh.md`; pruebas con servidor falso en `src/data/smtpTestScript.test.ts`). La contraseña se pide oculta y no se guarda. **Resultado de la prueba (21/10/2026): OVH ACEPTA el alias.** En Gmail el correo llegó con «De: PEPA · Tu familia organizada <no-reply@pepafamilyapp.es>», **SPF: PASS, DMARC: PASS**, entregado en 1 s. **Sin firma DKIM** por el SMTP externo (el correo del webmail de Zimbra, desde otra IP, sí lleva DKIM: PASS con el dominio): el SMTP de OVH no firma lo que sale por ahí, aunque DKIM esté activo en Zimbra. **Supabase configurado en producción (21/10/2026, con autorización expresa):** SMTP propio activado con host `smtp.mail.ovh.net`, puerto 465, usuario `info@pepafamilyapp.es`, remitente `no-reply@pepafamilyapp.es`, nombre «PEPA · Tu familia organizada» (límite 30 correos/hora; la contraseña la escribió ella en el panel, nunca en el chat). Probado con un usuario de prueba y «Send password recovery»: llegó a la bandeja de inmediato (plantilla antigua, con enlace). **Plantillas de transición pegadas en producción (21/10/2026, con autorización expresa, desde el Chrome del ordenador nuevo):** «Confirm sign up», «Reset password» y «Change email address» ahora van en español, con logotipo y botón con enlace (`supabase/email-templates/transition/`), asuntos «Confirma tu correo electrónico en PEPA», «Recupera tu contraseña de PEPA» y «Confirma tu nuevo correo electrónico en PEPA». Verificado recargando cada una desde el servidor. **No se tocaron** «Magic link or OTP», «Reauthentication», «Invite user», OTP expiration/length ni usuarios. Los textos originales de Supabase están en `supabase/email-templates/backup-originales-2026-10-21/`. Las plantillas de solo código se pegan junto con el despliegue de la web nueva de Cuentas. **Pendiente:** (1) ticket a OVH para que firmen con DKIM el envío por SMTP (texto preparado) y decidir OVH o Resend antes de abrir PEPA a más familias; (2) plantillas de 6 cifras (necesitan el logotipo, ya publicado en `https://pepafamilyapp.es/email/pepa-logo-email.jpg`), Email OTP expiration 3600 s y length 6; (3) migraciones 0299–0302 y gancho, con su autorización. Para volver atrás basta con desactivar «Enable custom SMTP» en Supabase.

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

## 4. Dependencias externas y autorizaciones: lo que necesita tu intervención

| # | Acción | Quién | Coste | Cuándo |
|---|---|---|---|---|
| 1 | Decirme qué servicio de correo tienes en OVH (MX Plan / Email Pro / Exchange) y cuántas cuentas incluye | Tú, en el panel de OVH | 0 | Antes de nada |
| 2 | Crear el buzón `no-reply@pepafamilyapp.es` con contraseña, y la redirección a `info@pepafamilyapp.es` | Tú, en OVH | 0 si tu plan lo incluye | Tras (1) |
| 3 | Comprobar que DKIM está activo para el dominio (panel de OVH) | Tú | 0 | Tras (1) |
| 4 | Permiso para probar el envío con un script **fuera de Supabase** y leer el resultado en bandejas de pruebas | Tú | 0 | Tras (2) y (3) |
| 5 | Publicar el logotipo ligero en la web (`pepa-web/public/email/pepa-logo-email.jpg`, ya creado, **sin subir**) | Tú autorizas el despliegue de la web | 0 | Antes de activar plantillas |
| 6 | **Autorizar escritura en la base de datos para ejecutar las pruebas en vivo** (se revierten solas) | Tú | 0 | Antes de aplicar nada |
| 7 | Aplicar las migraciones `0299` → `0302` (cada una con su rollback) | Con tu autorización | 0 | Ver §5 |
| 8 | Desplegar la web de la rama | Con tu autorización | 0 | Tras (7) |
| 9 | **Activar el gancho «Before User Created»** en Supabase (Authentication → Hooks) y, a la vez, SMTP propio y plantillas | Con tu autorización | 0 | Ver §5 |
| 10 | Programar la limpieza de logins huérfanos | Con tu autorización | 0 | Opcional, tras (9) |
| 11 | Aplicar `0303` (retirar reinicio por administradora) | Con tu autorización, **solo tras probar la recuperación del PIN en vivo** | 0 | Cierre |
| 12 | Decisiones: revocación de vínculos (§4 del estudio), rotar o retirar el código maestro | Tú | 0 | Antes del cierre |

Coste de Supabase: las llamadas nuevas son **una** al abrir Familia solo para administradoras (los correos), **una** para adultas y administradoras si hay fichas de menores (los vínculos), y una consulta al activar o quitar el PIN. `check_invitation` se llama una vez por invitación. No hay nada recurrente.

## 5. Orden de despliegue y reversión

**Regla:** ninguna persona se queda sin acceso; no se activa el gancho hasta que las pantallas nuevas estén desplegadas; la prueba de la puerta se repite tras cada paso.

0. **Prueba de la puerta contra producción** (`invitation_gate_live_test.sql`): fija cómo está hoy. Debe acabar en `PRUEBA_PUERTA_OK`.
1. **Prueba de OVH fuera de Supabase** (§3). Reversión: nada.
2. **Aplicar `0299` y `0300`** (solo añaden). Repetir pruebas en vivo (`0299_live_test.sql` y la de la puerta). Rollbacks: `0300_…_down.sql`, `0299_…_down.sql`.
3. **Aplicar `0301`** (corrige el rol/secciones, blinda columnas, reserva): **cambia `create_family` y `join_family_with_code`** (misma firma y mensajes). Repetir la prueba de la puerta. Rollback: `0301_…_down.sql` (devuelve las funciones de producción exactas).
4. **Aplicar `0302`** (comprobación pública y función del gancho; **no activa nada**). Repetir la prueba de la puerta (incluye la comprobación del gancho). Rollback: `0302_…_down.sql`.
5. **Desplegar la web de la rama.** Funciona con la base ya preparada; la entrada pide la invitación primero. *(Si se desplegara antes de aplicar 0302, «Tengo una invitación» fallaría: por eso este orden.)* Reversión: volver al despliegue anterior.
6. **Activar el gancho** (y, con el correo ya probado, SMTP propio y plantillas). Comprobar **en el momento**: alta sin invitación → rechazada; alta con invitación válida → funciona. **Reversión inmediata: desactivar el gancho.**
7. **Pruebas reales** (§8) con la cuenta de Jennifer y cuentas de prueba (sin usar credenciales reales de nadie).
8. **Cierre:** programar la limpieza de huérfanos (opcional); decidir el código maestro; aplicar `0303` solo tras probar la recuperación del PIN.

## 5 ter. Estado del despliegue (21/10/2026, con autorización expresa de Jennifer)
**Hecho en producción y verificado:**
- Migraciones **0299, 0300, 0301, 0302** aplicadas (cada una con su rollback); prueba de la puerta (`invitation_gate_live_test.sql`) en vivo antes de empezar y tras 0301 y tras 0302: `PRUEBA_PUERTA_OK`; `0299_live_test.sql`: `PRUEBA_0299_OK`. La primera ejecución falló solo por el registro de actividad (`activity_log`) de la base real, que la prueba local no tenía: se corrigió la prueba (los cambios directos los hace la administradora de PEPA de la prueba) sin tocar nada real.
- **Web de Cuentas publicada** (master = rama + corrección de una prueba para Node 20, que es el que usa la comprobación de GitHub). Comprobado en la web real: ojo en contraseñas, «Tengo una invitación» y rechazo de un código inventado.
- **Supabase Auth → Email:** «Email OTP length» estaba en **8** y se cambió a **6** (la web espera 6 cifras); caducidad 3600 s; contraseña mínima 6; «Secure email change» activado (el cambio de correo pide confirmar en el correo antiguo y en el nuevo).
- **Plantillas de solo código** (5): Confirm sign up, Reset password, Change email address, Magic link or OTP (PIN) y Reauthentication, con asunto en español. Originales de Supabase en `supabase/email-templates/backup-originales-2026-10-21/`.
- **Gancho «Before User Created» ACTIVADO** (`public.hook_before_user_created`). Comprobado con la API real: alta SIN invitación → 400 «INVITATION_REQUIRED»; alta con invitación inventada → 400 «INVITATION_INVALID» (esto demuestra además que el gancho **recibe el código** que manda la web en `options.data`, el dato que faltaba confirmar).

**Actualización (21/10/2026 noche):** prueba REAL de alta con invitación válida hecha y OK (cuentas de prueba `+altaprueba` y `+pruebapepa` borradas; quedan los 9 usuarios reales). Recuperar contraseña con código: OK. Recuperar PIN con código en una cuenta de prueba: OK. **`0303` APLICADA** en producción (migración movida a `supabase/migrations`, rollback en `supabase/rollbacks`): `admin_reset_profile_pin`, `clear_own_pin` y `profile_has_pin` ya no las puede ejecutar nadie desde la app (comprobado con `has_function_privilege`: authenticated, anon y public = false); `set_own_pin` solo sirve para activar un PIN que no existe. Corrección posterior: la pantalla de bienvenida no tenía salida y una sesión de una cuenta borrada se quedaba atrapada; ahora tiene «Salir y entrar con otra cuenta» y cierra sola la sesión si la cuenta ya no existe (`src/data/session.ts`).
**Pendiente (lo anterior, histórico):** (1) probar un alta REAL con una invitación válida de extremo a extremo (generar una invitación desde la app, registrar una cuenta de prueba, confirmar con el código del correo y borrar la cuenta después); (2) probar con cuentas de prueba recuperar contraseña, PIN, «Dar acceso a PEPA» y «Es mi hijo/a» con dos tutores; (3) `0303` solo tras probar la recuperación del PIN en vivo; (4) código maestro del Vault: decisión de Jennifer; (5) ticket OVH CS16987700 (DKIM por SMTP). **Reversión del gancho:** Authentication → Auth Hooks → desactivar o borrar «Before User Created» (instantáneo).

## 5 bis. Contraseñas: ojo y «Repetir contraseña» [Código, 21/10/2026]
- Un único componente (`src/ui/PasswordField.tsx`) para TODAS las contraseñas escritas a mano: entrar, crear cuenta, elegir contraseña nueva (recuperación), cambiar contraseña, cambiar correo, confirmar identidad y recuperar el PIN. **Oculta por defecto**, ojo para verla u ocultarla (`aria-label` «Mostrar/Ocultar contraseña»), no borra lo escrito ni quita el foco, mantiene `autoComplete` (`current-password` / `new-password`) y se desactivan la mayúscula automática y el corrector.
- **Contraseña + Repetir contraseña** (cada una con su ojo) en crear cuenta, contraseña nueva de la recuperación y cambiar contraseña. Si no coinciden: «Las contraseñas no coinciden» (en vivo y al enviar); **no se envía nada** hasta que coincidan. Entrar pide una sola contraseña.
- **Sin excepciones (21/10/2026):** los **PIN** también llevan ojo (mismo componente con `numeric`: solo dígitos, teclado numérico, 6 como máximo; en la pantalla de bloqueo el PIN sigue centrado). Una prueba recorre todo `src` y falla si alguna pantalla pinta un `<input type="password">` por su cuenta. El ojo va **dentro del campo**, en el extremo derecho y **centrado en vertical con el texto**; el campo reserva ese hueco (52 px) para que el texto no quede debajo; y se ocultan los iconos propios del navegador (el «ojo» de Edge, la llave/tarjeta del autocompletado de Safari de ordenador) para que no tapen el ojo ni se vean dos. No se tocan las reglas de seguridad de Supabase (longitud mínima 6).
- **Verificado en un navegador de escritorio (Chromium, ancho de móvil 375 px) con el CSS real:** el ojo queda dentro del campo (tres campos medidos, incluido el del PIN), con el centro vertical idéntico al del campo, pulsarlo cambia solo ese campo, no borra el texto y el campo conserva el foco. **No verificado en Safari de iPhone ni en Android reales:** se prueba a mano al desplegar (ojo dentro del campo, teclado, autocompletado de contraseñas).

## 5 ter. Código maestro del Vault (`family_signup_code`) — informe, sin tocar
- **Qué es:** un secreto de 10 caracteres guardado en el Vault de Supabase (creado el 05/09/2026, nunca cambiado). Es la forma antigua de autorizar la creación de una familia, anterior a las invitaciones de un solo uso (0093).
- **Para qué se usa hoy:** solo para **crear una familia nueva**: `create_family` lo acepta como alternativa a una invitación de un solo uso; `check_invitation` y el gancho de alta (0302) también lo aceptan. **No sirve para entrar** a cuentas existentes ni da permisos sobre familias existentes: las administradoras de PEPA entran con su correo y contraseña, no con este código.
- **Quién puede usarlo:** **cualquier persona que lo conozca** y tenga un login (no está ligado a nadie, no caduca, **no se gasta** y **no deja rastro de quién lo usó**). Es la única puerta que hoy no está controlada por invitaciones de un solo uso, por eso conviene retirarlo antes de comercializar.
- **Cómo retirarlo o rotarlo sin bloquear a las administradoras de PEPA:** (1) desplegar 0301–0302 y comprobar de punta a punta que una administradora de PEPA genera una invitación de «familia nueva» (7 días) y que sirve para crear una familia de prueba; (2) comprobar que ningún proceso externo (guía de la web, mensajes a probadoras) escribe el código maestro; (3) **borrar el secreto** del Vault (recomendado) o **rotarlo** a un valor nuevo que solo conozcas tú. Las funciones ya funcionan sin el secreto (comparan con «nulo» y exigen invitación). Es instantáneo y reversible (se vuelve a crear el secreto). Ninguna cuenta existente se ve afectada.
- **Invitaciones de «familia nueva» hasta hoy:** 2 generadas (08/10 y 12/10/2026), las 2 usadas, 0 vigentes.
- **Decisión pendiente tuya.** No se ha modificado.

## 6. Menores y tutores [Código]

- Los miembros sin cuenta (bebés, niños sin acceso) **no tienen correo ni se les pide**: son filas de `family_members` sin `linked_profile_id`.
- **Fase A hecha en la rama:** el vínculo «Es mi hijo/a» (declaración + identificación reciente, sin límite de tutores, historial, cese a los 18) y «Dar acceso a PEPA» para la madre/padre vinculado solo sobre la ficha de su hijo menor. Detalle, revocación propuesta y diseño de la Fase B: **`docs/CUENTAS_PADRES_HIJOS_E_INVITACIONES.md`**.
- **Fase B aplazada:** que una madre/padre cambie el correo de acceso de su hijo **no está implementado**. Cada persona adulta cambia solo el suyo; la administradora **ve** los correos pero no puede cambiarlos; «Cambiar correo» solo sale en la ficha propia.

## 7. Huella y Face ID: dependencia del dominio [Código]

- La función `profile-webauthn` fija `rpID = fransegura51.github.io` (y `localhost`). Una huella registrada pertenece a ese dominio: **si la web pasa a `pepafamilyapp.es`, las huellas existentes dejan de servir** (el PIN sigue funcionando; hay que volver a activarlas).
- Cómo adaptarlo cuando toque: aceptar también el origen `https://pepafamilyapp.es` con `rpID = pepafamilyapp.es` (los registros nuevos van con el dominio nuevo; los antiguos siguen ligados al viejo). En la app nativa (Capacitor carga la web publicada desde `server.url`), WebAuthn depende del soporte del WebView; hay que planificarlo aparte con pruebas en móvil real.
- **No se ha tocado.** Lo que sí hace esta rama: al quitar o recuperar el PIN se borran las huellas (la base de datos), así que no queda ninguna autorización biométrica huérfana.

## 8. Pruebas

**Hecho (en el ordenador, sin producción):**
- Comprobación de tipos, análisis de estilo y compilación sin avisos; batería completa del proyecto en verde.
- **51 pruebas con datos en un PostgreSQL local** (`supabase/local-sql-tests`, ejecuta las migraciones reales): PIN y correos, vínculo parental, invitaciones, rol y secciones de la ficha, reservas, crear familia, comprobación de invitación, gancho de alta, limpieza de huérfanos y que sin invitación no hay perfil.
- Pruebas de las pantallas y del texto del SQL: puerta por invitación (`src/data/invitationGate.test.ts`), piezas puras (`src/domain/invitations.test.ts`, `accountSecurity.test.ts`), pantallas de Familia (`src/ui/invitationsAndGuardiansUi.test.ts`), entrada con invitación pintada de verdad (`src/ui/loginInvitationFirstRender.test.tsx`), cerrar sesión local con la librería real de Supabase (`src/data/signOutLocalScope.test.ts`).
- Las plantillas se renderizaron en un navegador (móvil y escritorio).

**No hecho (necesita producción, correo oficial o dispositivos):**

| # | Prueba | Estado |
|---|---|---|
| 1 | Registro con invitación (pantalla → gancho → correo → alta) | 🔒 necesita aplicar `0302`, activar el gancho y SMTP |
| 2 | Alta **sin** invitación llamando a Supabase directamente (debe rechazarse) | 🔒 tras activar el gancho; **prueba obligatoria antes de dar nada por cerrado** |
| 3 | Qué datos manda Supabase al gancho (`user_metadata` o `raw_user_meta_data`) | ⏳ se comprueba en pruebas o al activarlo (reversible) |
| 4 | Confirmación de correo con código; cambio de correo (uno o dos códigos según el ajuste «seguro»); recuperación y cambio de contraseña | ⏳ necesitan el correo oficial |
| 5 | PIN: activar, cambiar, recuperar; comprobar que el token trae la marca `amr` con hora al entrar con contraseña y con código | 🔒 **clave antes del cierre `0303`** |
| 6 | Huella y Face ID tras recuperar el PIN | 🔒 |
| 7 | Vínculo «Es mi hijo/a» y «Dar acceso a PEPA» en la app real, con las fichas abiertas y cerradas | 🔒 |
| 8 | Aislamiento de datos entre familias con datos reales | 🔒 SQL en vivo preparado; local ya probado |
| 9 | Dos conexiones a la vez usando el mismo código (el bloqueo `for update`) | ⏳ en local hay una sola conexión; se comprueba al probar en producción con datos de mentira |
| 10 | Cerrar sesión solo en este dispositivo (iPhone, Android y escritorio) | 🔒 desplegar |
| 11 | Entrega de correos en Gmail, Outlook, iCloud y otros | ⏳ necesita el correo oficial |

## 9. Decisiones

**Aprobadas (20/10/2026):** PIN tras 1 minuto en segundo plano solo con PIN activado · «Cerrar sesión» en Configuración → Mi cuenta, **solo en el dispositivo actual** · auditar ahora y aprobar la corrección después · vínculo parental por fases (Fase A ya; correo de menores, después) · declaración + identificación reciente, sin confirmación de otra persona adulta · **sin límite de tutores** por menor · padres y tutores vinculados pueden invitar a sus hijos menores · **primero invitación, después cuenta**.

**Pendientes de ti:**
1. **Autorizar** la aplicación de las migraciones, las pruebas en vivo con escritura y la activación del gancho (§4 y §5).
2. **Código maestro** del Vault: ¿se rota o se retira cuando esto esté desplegado?
3. ~~Revocación de vínculos~~ **Decidido el 21/10/2026:** cada persona retira solo su propio vínculo (hecho y probado en local); los conflictos excepcionales los revisa una administradora de PEPA, sin trámites nuevos.
4. OVH: qué servicio tienes y si se prueba antes de decidir entre OVH y Resend (§3).
5. Qué hacer con la opción antigua «Generar código de acceso» del menú ⋯ cuando compruebes que «Dar acceso a PEPA» va bien.
