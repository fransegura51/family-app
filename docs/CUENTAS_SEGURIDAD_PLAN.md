# Cuentas, acceso, seguridad y correos oficiales (PEPA-CUENTAS)

Rama de trabajo: `feature/cuentas-seguridad` (sin subir a GitHub, sin desplegar). Nada de esto está en producción.
Cada dato está marcado como **[Código]** (leído en el código), **[Docs]** (documentación pública), **[Foros]** (mensajes de usuarios, no oficial) o **[No verificado]**.

## 1. Qué hay hecho en la rama y qué no

**Leyenda:** ✅ implementado y probado en local · 📐 diseñado, no implementado · ⏳ pendiente de configuración externa · 🔒 pendiente de tu autorización para producción.

| Pieza | Estado |
|---|---|
| Auditoría de roles y permisos en producción (solo lectura) | ✅ `docs/AUDITORIA_ROLES_Y_PERMISOS_2026-10-21.md`: el fallo existe en el código, **0 cuentas afectadas** |
| Corrección del rol y las secciones de la ficha al unirse con código | ✅ en la rama (`0294`) · 🔒 aplicar |
| **Primero la invitación, después la cuenta** (pantalla de entrada + comprobación en el servidor + gancho de Supabase Auth) | ✅ pantallas y SQL probados en local · 🔒 aplicar `0295` y **activar el gancho** (⏳ comprobar en pruebas qué datos manda Supabase) |
| Reserva del código por correo, bloqueo de uso simultáneo, sin cuentas huérfanas | ✅ (`0294`/`0295`) · 🔒 aplicar · la limpieza de logins huérfanos no se programa sola |
| «Dar acceso a PEPA» a la vista, invitación al crear una ficha, sin duplicar, caducidad, copiar/compartir/WhatsApp | ✅ (`0294` + pantallas) · 🔒 aplicar y desplegar |
| Madre/padre vinculado puede invitar a su hijo menor (comprobado en el servidor) | ✅ (`0293`+`0294`) · 🔒 |
| Vínculo parental «Es mi hijo/a» (Fase A): declaración, identificación reciente, sin límite de tutores, historial, cese a los 18 | ✅ (`0293` + pantallas) · 🔒 aplicar |
| Retirar el propio vínculo y vínculos disputados | 📐 función creada **sin permiso de ejecución**; procedimiento propuesto para tu revisión |
| Gestionar el correo de los menores (Fase B) | 📐 solo diseño técnico (`docs/CUENTAS_PADRES_HIJOS_E_INVITACIONES.md` §6) |
| Plantillas de invitación (familia nueva / miembro de una familia) | ✅ plantilla y vista previa · ⏳ no se envía nada hasta tener el correo oficial |
| Plantillas de correo de acceso (5) + logotipo ligero | ✅ · ⏳ sin activar |
| Cerrar sesión solo en este dispositivo (en Configuración → Mi cuenta, donde estaba) | ✅ probado con la librería real de Supabase · 🔒 desplegar |
| Códigos de 6 cifras: confirmar correo y contraseña olvidada | ✅ funciona con las plantillas actuales (enlace) y con las nuevas (código) |
| Correo en las fichas de Familia + «Cambiar correo» en la ficha propia y en Seguridad | ✅ (`0292`) · 🔒 |
| Cambiar contraseña + pantalla de nueva contraseña con el logo de PEPA | ✅ |
| PIN: cambiar/desactivar pidiendo el PIN, «He olvidado mi PIN», se pide tras 1 minuto en segundo plano solo con PIN activado | ✅ (`0292`) · 🔒 |
| Botón «Reiniciar PIN» de Familia | ✅ quitado de la app · la función de la base de datos sigue hasta aplicar `0296` |
| Endurecimiento `0296` (retirar reinicio por administradora, «quitar PIN» sin comprobar) | ✅ escrito en `supabase/pending-migrations/` · 🔒 **no aplicar hasta validar la recuperación del PIN en vivo** |
| SMTP de OVH, buzón `no-reply@`, DNS, SMTP en Supabase | ⏳ **nada tocado** (§3) |
| Biometría con el dominio oficial | 📐 sin migrar a propósito (§7) |

### Migraciones (en este orden; ninguna está aplicada)
| Nº | Qué | Dependencia |
|---|---|---|
| 0292 | PIN con comprobación, recuperación con identificación reciente, correos de las fichas | — |
| 0293 | Vínculo parental («Es mi hijo/a») | 0292 |
| 0294 | Dar acceso a PEPA, rol/secciones de la ficha, bloqueo y reserva, blindaje de columnas | 0292, 0293 |
| 0295 | Primero la invitación: `check_invitation`, gancho de alta, limpieza de huérfanos | 0294 |
| 0296 (pendiente) | Retirar reinicio por administradora y «quitar PIN» sin comprobar | recuperación del PIN probada en vivo |

## 1 bis. REQUISITO CRÍTICO: PEPA sigue cerrada, solo se entra con invitación (20/10/2026)

**La regla no cambia; el cambio autorizado es el orden: primero la invitación, después la cuenta.** Hoy en producción **[comprobado en solo lectura]**: crear el *login* (correo y contraseña) está abierto en Supabase Auth, y la invitación se pide **después**, al crear la familia o unirse. Un login sin familia no sirve de nada (no tiene perfil), y hoy **no existe ninguno** (9 logins, 9 perfiles). Lo nuevo cierra esa puerta también al principio.

| Qué | Cómo queda |
|---|---|
| Crear el *login* | **Solo con una invitación válida**: la pantalla pide la invitación primero (`check_invitation`, que no la gasta) y el **gancho «Before User Created» de Supabase Auth** vuelve a comprobarla en el servidor y **rechaza cualquier alta directa** (un `signUp` llamado a mano) sin invitación válida. Recuperar contraseña, cambiar correo y entrar **no** pasan por ese gancho (solo se ejecuta al crear un usuario) |
| Crear una familia nueva | `create_family`: código maestro **o** invitación de un solo uso, caducable, solo generada por administradoras de PEPA. Vuelve a comprobarla al terminar y la gasta (bloqueo de fila: dos personas no pueden usarla a la vez). Quien crea la familia debe ser mayor de edad |
| Unirse a una familia | `join_family_with_code`: código de una ficha sin cuenta, un solo uso, 24 h, bloqueado al leerlo; rol y secciones **de la ficha**; la fecha de la ficha manda sobre la escrita |
| Reserva | Al validar el alta, el gancho **reserva la invitación para ese correo durante 2 horas** (no la gasta): otra persona no puede usar el mismo código y no quedan cuentas a medias. La gasta `create_family` / `join_family_with_code` al terminar |
| Cuentas huérfanas | Si alguien crea el login y no termina, `private.purge_orphan_logins` borra los logins sin familia con más de 48 horas (**no se programa sola**; hace falta tu autorización para programarla) |
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
- ✅ Los dos scripts de «prueba en vivo» (`0292_live_test.sql`, `invitation_gate_live_test.sql`) **se ejecutaron contra el PostgreSQL local** y terminan en `PRUEBA_…_OK`: así sabemos que los propios scripts funcionan.
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
| 7 | Aplicar las migraciones `0292` → `0295` (cada una con su rollback) | Con tu autorización | 0 | Ver §5 |
| 8 | Desplegar la web de la rama | Con tu autorización | 0 | Tras (7) |
| 9 | **Activar el gancho «Before User Created»** en Supabase (Authentication → Hooks) y, a la vez, SMTP propio y plantillas | Con tu autorización | 0 | Ver §5 |
| 10 | Programar la limpieza de logins huérfanos | Con tu autorización | 0 | Opcional, tras (9) |
| 11 | Aplicar `0296` (retirar reinicio por administradora) | Con tu autorización, **solo tras probar la recuperación del PIN en vivo** | 0 | Cierre |
| 12 | Decisiones: revocación de vínculos (§4 del estudio), rotar o retirar el código maestro | Tú | 0 | Antes del cierre |

Coste de Supabase: las llamadas nuevas son **una** al abrir Familia solo para administradoras (los correos), **una** para adultas y administradoras si hay fichas de menores (los vínculos), y una consulta al activar o quitar el PIN. `check_invitation` se llama una vez por invitación. No hay nada recurrente.

## 5. Orden de despliegue y reversión

**Regla:** ninguna persona se queda sin acceso; no se activa el gancho hasta que las pantallas nuevas estén desplegadas; la prueba de la puerta se repite tras cada paso.

0. **Prueba de la puerta contra producción** (`invitation_gate_live_test.sql`): fija cómo está hoy. Debe acabar en `PRUEBA_PUERTA_OK`.
1. **Prueba de OVH fuera de Supabase** (§3). Reversión: nada.
2. **Aplicar `0292` y `0293`** (solo añaden). Repetir pruebas en vivo (`0292_live_test.sql` y la de la puerta). Rollbacks: `0293_…_down.sql`, `0292_…_down.sql`.
3. **Aplicar `0294`** (corrige el rol/secciones, blinda columnas, reserva): **cambia `create_family` y `join_family_with_code`** (misma firma y mensajes). Repetir la prueba de la puerta. Rollback: `0294_…_down.sql` (devuelve las funciones de producción exactas).
4. **Aplicar `0295`** (comprobación pública y función del gancho; **no activa nada**). Repetir la prueba de la puerta (incluye la comprobación del gancho). Rollback: `0295_…_down.sql`.
5. **Desplegar la web de la rama.** Funciona con la base ya preparada; la entrada pide la invitación primero. *(Si se desplegara antes de aplicar 0295, «Tengo una invitación» fallaría: por eso este orden.)* Reversión: volver al despliegue anterior.
6. **Activar el gancho** (y, con el correo ya probado, SMTP propio y plantillas). Comprobar **en el momento**: alta sin invitación → rechazada; alta con invitación válida → funciona. **Reversión inmediata: desactivar el gancho.**
7. **Pruebas reales** (§8) con la cuenta de Jennifer y cuentas de prueba (sin usar credenciales reales de nadie).
8. **Cierre:** programar la limpieza de huérfanos (opcional); decidir el código maestro; aplicar `0296` solo tras probar la recuperación del PIN.

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
| 1 | Registro con invitación (pantalla → gancho → correo → alta) | 🔒 necesita aplicar `0295`, activar el gancho y SMTP |
| 2 | Alta **sin** invitación llamando a Supabase directamente (debe rechazarse) | 🔒 tras activar el gancho; **prueba obligatoria antes de dar nada por cerrado** |
| 3 | Qué datos manda Supabase al gancho (`user_metadata` o `raw_user_meta_data`) | ⏳ se comprueba en pruebas o al activarlo (reversible) |
| 4 | Confirmación de correo con código; cambio de correo (uno o dos códigos según el ajuste «seguro»); recuperación y cambio de contraseña | ⏳ necesitan el correo oficial |
| 5 | PIN: activar, cambiar, recuperar; comprobar que el token trae la marca `amr` con hora al entrar con contraseña y con código | 🔒 **clave antes del cierre `0296`** |
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
3. **Revocación de vínculos:** ¿apruebas el mecanismo propuesto (retirar el propio vínculo; revisión por una administradora de PEPA para los disputados)? Hasta entonces nadie puede retirar un vínculo.
4. OVH: qué servicio tienes y si se prueba antes de decidir entre OVH y Resend (§3).
5. Qué hacer con la opción antigua «Generar código de acceso» del menú ⋯ cuando compruebes que «Dar acceso a PEPA» va bien.
