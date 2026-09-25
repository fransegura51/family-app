# Auditoría estática de seguridad / RLS — family-app

Fecha: 2026-09-26. Alcance: solo lectura (código del repo + metadatos reales de Supabase vía MCP: `list_tables`, `get_advisors`, `execute_sql` en modo SELECT, `list_edge_functions`, `get_edge_function`). Proyecto Supabase: `objhgjgrinbhyzscjlbw`. Cero migraciones aplicadas, cero policies tocadas, cero edge functions desplegadas durante esta auditoría.

Metodología: lectura de `pg_policies`, `pg_tables.rowsecurity`, `pg_proc` (funciones `SECURITY DEFINER`, incluido su código fuente), `information_schema.triggers`, `information_schema.role_table_grants`, `pg_roles.rolbypassrls`, políticas de `storage.objects`, y el código fuente completo de las 35 Edge Functions desplegadas (31 versionadas en `supabase/functions/` + 4 desplegadas pero no versionadas — ver hallazgo bajo). Todo contrastado contra el esquema real, no contra suposiciones.

---

## 1. Resumen ejecutivo

La app usa Postgres + RLS de Supabase como capa principal de aislamiento entre familias, con un patrón consistente y en general bien aplicado: casi todas las tablas de datos familiares tienen políticas `family_id = private.current_family_id()` en las cuatro operaciones, los buckets de Storage comprueban el primer segmento de la ruta (`${familyId}/...`) contra la familia del usuario, las funciones `SECURITY DEFINER` (32 en total) validan ownership explícitamente antes de actuar, y el frontend no contiene ningún secreto de servidor (confirmado por dos pasadas independientes: lectura directa y un agente de auditoría dedicado).

**Sin embargo, se ha encontrado UN hallazgo CRÍTICO real y reproducible de acceso cruzado entre familias**: el callback de OAuth de Google Calendar (`google-calendar-oauth-callback`) acepta un parámetro `state` sin firmar ni verificar, lo que permite a un atacante enlazar sus propias credenciales OAuth de Google al `family_id`/`member_id` de una familia ajena — y el cron horario de sincronización (`sync-calendar-to-google-cron`) reenvía automáticamente el calendario privado de esa familia (eventos, horarios, ubicaciones, notas) al Google Calendar del atacante. El mismo patrón de diseño (state sin firmar) aparece también en el flujo de banca (`enable-banking-auth-callback`), con impacto algo menor (inyección de una cuenta bancaria falsa en la familia víctima, sin fuga automática de datos), clasificado como ALTO.

Aparte de estos dos, no se ha encontrado ningún otro camino de lectura/escritura cruzada entre familias vía PostgREST directo, Storage, ni el resto de las 33 Edge Functions — todas derivan `family_id` del JWT/perfil del propio usuario, de un token de alta entropía (128–192 bits), o de un secreto de cron en Vault, nunca de un id que el cliente pueda elegir libremente.

Total de hallazgos: **1 CRÍTICO, 2 ALTOS, 3 MEDIOS, 5 BAJOS**, además de una lista larga de comprobaciones INFORMATIVAS (diseño correcto verificado). Ver el desglose completo en las secciones 2–5.

---

## 2. Hallazgos críticos

### C-1. `google-calendar-oauth-callback` — `state` OAuth sin firmar permite secuestrar el calendario de Google de otra familia, con fuga automática horaria

- **Dónde**: `supabase/functions/google-calendar-oauth-callback/index.ts` líneas ~39-47 (decodificación del `state`) y ~95-104 (`upsert` en `google_calendar_credentials`). Origen del `state`: `supabase/functions/google-calendar-oauth-start/index.ts` línea 63: `const state = btoa(JSON.stringify({ familyId: profile.family_id, memberId: member.id, profileId: userData.user.id }))`.
- **Función `verify_jwt`**: `false` (confirmado vía API de Supabase) — es un redirect público sin sesión, por diseño (Google redirige el navegador, no puede mandar `Authorization`). El código lo documenta así en un comentario.
- **El problema real**: el `state` que llega de vuelta es JSON en base64 **sin firma HMAC, sin nonce de un solo uso verificado en servidor, sin comprobar que el `code` corresponda a la sesión que generó ese `state`**. El callback solo comprueba que `familyId`/`memberId`/`profileId` estén presentes (`if (!familyId || !memberId || !profileId) throw`), nunca que pertenezcan entre sí ni que el llamante tenga derecho sobre ellos. Después usa `service_role` (que bypassa RLS) para hacer:
  ```
  admin.from("google_calendar_credentials").upsert({
    member_id: memberId, family_id: familyId,
    refresh_token: refreshToken, google_calendar_id: googleCalendarId, ...
  })
  ```
- **Cómo reproducirlo**: un atacante (con su propia cuenta de Google, sin necesidad de cuenta en la app) completa el consentimiento real de Google con SU cuenta hasta obtener un `code` de autorización válido para el `redirect_uri` fijo `.../functions/v1/google-calendar-oauth-callback`. En vez de dejar que el navegador complete el flujo normal, sustituye el parámetro `state` de la URL de vuelta por uno fabricado a mano: `btoa(JSON.stringify({familyId: "<uuid de la familia víctima>", memberId: "<uuid de un family_members de esa familia>", profileId: "<cualquiera>"}))`, y llama al callback directamente (es un GET público, sin JWT). El callback exige y valida el `code` contra Google (real), pero el `family_id`/`member_id` a los que asocia el `refresh_token` resultante los decide el atacante.
- **Impacto**: la tabla `google_calendar_credentials` queda con una fila `family_id = <víctima>` cuyo `refresh_token`/`google_calendar_id` apuntan al Google Calendar del ATACANTE. `sync-calendar-to-google-cron` (pg_cron, cada hora, `service_role`, sin filtrar per-family porque su trabajo es recorrer TODAS las filas de `google_calendar_credentials`) toma esa fila, lee `calendar_events` de la familia víctima (`family_id = familyId` de la fila envenenada) y los empuja al calendario de Google del atacante — título, descripción, "Para: <nombre del miembro>", horarios, recurrencia. Es una fuga automática y persistente (se repite cada hora hasta que alguien la detecte) de la agenda privada de una familia hacia un tercero. En sentido inverso, `sync-calendar-from-google-cron` importaría el calendario personal del atacante DENTRO del calendario de la familia víctima (inyección de contenido).
- **Nota sobre la dificultad real**: el atacante necesita conocer un `family_id` y un `member_id` (family_members.id) válidos de la familia víctima — son UUID v4, no triviales de adivinar por fuerza bruta al vuelo, pero el propio enunciado de esta auditoría los incluye explícitamente como amenaza en alcance ("si conoce, adivina, intercepta o ve en una URL/respuesta el UUID exacto de un recurso de otra familia"), y estos IDs circulan por la app (aparecen en la URL de `google-calendar-oauth-start`→Google, en respuestas de la API, en enlaces compartidos, etc.), así que no es un secreto de alta entropía — es un identificador interno normal. El diseño en sí (state sin firmar) es el fallo, independientemente de cuánto cueste obtener el UUID.
- **Confirmado de forma independiente** dos veces en esta auditoría: por lectura directa del código/BD y por un agente dedicado a las Edge Functions, con el mismo diagnóstico.
- **Severidad**: **CRÍTICO** — acceso cruzado real y automatizado a datos privados de otra familia (agenda: horarios, ubicaciones de recogida de niños, citas médicas, etc.), explotable con una cuenta de Google normal y sin necesidad de cuenta en la app.

---

## 3. Hallazgos altos

### A-1. `enable-banking-auth-callback` — mismo patrón de `state` sin firmar, permite inyectar una cuenta bancaria ajena en otra familia

- **Dónde**: `supabase/functions/enable-banking-auth-callback/index.ts` líneas ~125-134 (decodificación del `state`) y ~170-194 (`insert` en `bank_connections`/`bank_accounts`). Origen: `supabase/functions/enable-banking-auth-start/index.ts` línea 99: `const state = btoa(JSON.stringify({ familyId: profile.family_id, profileId: userData.user.id }))`.
- **Mecanismo**: idéntico al hallazgo C-1 — `verify_jwt=false`, `state` en base64 sin firmar, sin correlación servidor entre el `code` de Enable Banking y el `state` (el callback solo reenvía `{code}` a `POST /sessions` de Enable Banking; el `state` nunca se valida contra Enable Banking ni contra nada guardado en la propia base de datos).
- **Ataque**: un atacante con su propia cuenta bancaria real completa el consentimiento real con Enable Banking, obtiene un `code`, y llama al callback con un `state` fabricado con el `familyId` de la víctima. El código hace `insert` en `bank_connections` (`family_id: familyId` del atacante-controlado) y en `bank_accounts` para cada cuenta devuelta por el banco del ATACANTE — plantando una conexión bancaria y sus cuentas (con IBAN, saldo, etc. **del propio atacante**, no de la víctima) dentro de la familia ajena. Si además conoce/adivina el `profileId` de un miembro real de esa familia (la búsqueda de `family_members` por `linked_profile_id` en la línea ~147 es global, sin filtrar por `familyId`), la cuenta inyectada queda atribuida (`owner_member_id`) a ese miembro concreto.
- **Impacto**: a diferencia de C-1, esto NO filtra datos de la víctima hacia el atacante (el banco es del atacante) — es una inyección de datos falsos en la familia ajena (confusión financiera, vector de ingeniería social del tipo "me aparece una cuenta bancaria que no reconozco", posible pie para un ataque de phishing posterior dirigido a esa familia). También crea eventos de calendario reales ("Renovar conexión con <banco>...") en la familia víctima (`createRenewalReminders`, con `service_role`, sin comprobar tampoco que el `family_id` sea legítimo).
- **Severidad**: **ALTO** — escritura cruzada entre familias confirmada y reproducible, sin necesidad de credenciales de la víctima; el impacto es de integridad/confusión, no de confidencialidad, por eso queda un escalón por debajo de C-1.

### A-2. `families.amazon_webhook_token` visible a cualquier miembro de la familia, no solo al admin (gap de privilegio, no cruza familias)

- **Dónde**: policy `families: select own` (`SELECT`, rol `public`, `qual: id = current_family_id()`) — sin ninguna restricción de rol/admin. Comparar con `families: admin update`, que sí exige `current_role_in_family() = 'admin'`. Código cliente: `src/data/family.ts` (`getAmazonWebhookToken`/`regenerateAmazonWebhookToken`), cuyo comentario dice explícitamente "solo el admin puede verlo/regenerarlo... vía la política ya existente 'families: admin update'" — afirmación que es cierta para el UPDATE (regenerar) pero **falsa para el SELECT (verlo)**: cualquier perfil de la familia (incluido un rol `guest` o `child` con `allowed_sections` restringido) puede hacer un `SELECT * FROM families` vía PostgREST y leer `amazon_webhook_token` (el mismo secreto que autentica también `mercadona-ticket-webhook` e `import-event-email-webhook`, ver comentario de `mercadona-ticket-webhook/index.ts`).
- **Impacto**: no es un cruce entre familias (el atacante ya tendría que ser miembro de esa familia), pero rompe el principio de mínimo privilegio que el propio código dice implementar, y expone un secreto compartido por 3 automatizaciones a cualquier perfil, incluidos los de menor confianza (niños/invitados).
- **Severidad**: **ALTO** por el radio de impacto del secreto (3 webhooks financieros comparten el mismo token, y filtrarlo permite insertar gastos/tickets falsos), aunque limitado al ámbito de la propia familia.

---

## 4. Hallazgos medios

### M-1. Códigos de invitación para unirse a una familia (`join_family_with_code`) usan solo 32 bits de entropía, muy por debajo del patrón usado en el resto de la app

- **Dónde**: `generate_member_invite_code(p_member_id uuid)` — `v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))`: 8 caracteres hexadecimales = 32 bits, válido 24h (`invite_code_expires_at = now() + interval '24 hours'`). Mismo patrón en `generate_family_invite` (creación de familia nueva, menor impacto).
- **Comparar con**: los tokens de RSVP (`generate_event_guest_rsvp_token`/`generate_event_open_rsvp_token`) y de exportación de calendario (`get_or_create_calendar_export_token`) usan `encode(gen_random_bytes(24), 'hex')` = 192 bits — el patrón "correcto" ya existe en el propio proyecto, solo no se aplicó aquí.
- **Impacto**: `join_family_with_code(p_code, p_display_name)` es un RPC público (rol `authenticated`) sin límite de intentos visible en el propio código (ni contador de fallos, ni lockout, a diferencia de `verify_own_pin`, que sí lo tiene). Un atacante con una cuenta de Supabase Auth (requiere confirmar email, lo que sube el coste pero no lo hace inviable con servicios de email desechables) podría, en teoría, probar códigos de 8 hex en un margen de 24h contra la familia objetivo si conoce que hay una invitación activa. 32 bits (~4.300 millones de combinaciones) no es trivial de fuerza-bruta pero es 2^160 veces más débil que el resto de tokens del proyecto — una inconsistencia real de diseño, no solo teórica.
- **Severidad**: **MEDIO** — explotable en teoría, coste práctico no despreciable (hay que generar cuentas y sin RPC de fuerza bruta obvio expuesto sin fricción), pero es una debilidad de diseño clara y consistente con el objetivo de la auditoría (acceso a una familia ajena conociendo/adivinando un identificador).

### M-2. GRANTs SQL amplios (`INSERT/SELECT/UPDATE/DELETE/TRUNCATE`) a `anon`/`authenticated` en tablas sin políticas RLS, incluidas tablas muy sensibles

- **Dónde**: confirmado con `information_schema.role_table_grants` — TODAS las tablas de `public` (no solo las sensibles) tienen privilegios SQL completos otorgados a `anon` y `authenticated`, incluido `TRUNCATE`. Esto incluye `google_calendar_credentials` (refresh tokens OAuth), `profile_webauthn_credentials`/`profile_webauthn_challenges`, `profile_locks` (hash de PIN) — las 23 tablas que el advisor de Supabase marca como "RLS enabled, no policies".
- **Por qué hoy es seguro**: confirmado que `anon`/`authenticated` tienen `rolbypassrls = false` (solo `service_role`/`postgres`/`supabase_admin` tienen `true`), y una tabla con RLS habilitado y CERO políticas deniega TODO acceso a un rol sin `BYPASSRLS`, sin importar los GRANTs de nivel SQL. Es además el patrón por defecto estándar de Supabase (confirmado comparando con `expenses`, que tiene los mismos GRANTs amplios y sí depende de RLS activamente) — no es una configuración incorrecta específica de este proyecto.
- **El riesgo real**: es un fallo de defensa en profundidad, no un fallo activo hoy. Si alguna migración futura ejecutase por error `ALTER TABLE google_calendar_credentials DISABLE ROW LEVEL SECURITY` (un error de una sola línea, ya sucedido en otros proyectos Supabase históricamente), esas tablas quedarían inmediatamente legibles/escribibles/TRUNCATABLE por cualquier usuario anónimo de internet — sin ningún otro control intermedio. Nada en el proyecto detectaría ese cambio salvo el advisor de seguridad (`get_advisors`), que no se ejecuta automáticamente en cada deploy.
- **Severidad**: **MEDIO** — sin explotación posible hoy, pero el blast radius de un único error de configuración futuro (tokens OAuth de Google, PIN hashes) es alto y el coste de mitigarlo es bajo (revocar privilegios innecesarios una vez).

### M-3. `family_members` (incluye `invite_code` activo) legible por cualquier miembro de la familia, no solo por el admin

- **Dónde**: policy `family_members: select own family` — familia-wide, sin restricción de rol. Cualquier perfil (incluido `child`/`guest`) puede leer `invite_code`/`invite_code_expires_at` de OTROS miembros de su propia familia mientras estén pendientes de vincular.
- **Impacto**: dentro del ámbito de la propia familia (no cruza familias), pero un perfil de bajo privilegio podría ver y compartir por su cuenta el código de invitación pendiente de otro miembro (p. ej. dárselo a un desconocido para que entre a la familia con el rol de ese miembro no vinculado). Menor severidad que M-1 porque aquí no hace falta adivinar nada, ya está expuesto — pero solo dentro de la familia.
- **Severidad**: **MEDIO** (riesgo intra-familiar, no inter-familiar; se incluye porque toca directamente el modelo de invitaciones que sí protege el límite entre familias).

---

## 5. Hallazgos bajos

### B-1. Endpoint público de RSVP con enlace abierto (`event-rsvp?open=TOKEN`, POST) sin límite de tasa

`supabase/functions/event-rsvp/index.ts` — la creación de una fila `event_guests` vía el token de "enlace abierto" no tiene rate-limiting ni CAPTCHA. Alguien con el token (pensado para compartirse ampliamente, p. ej. en una invitación de boda) podría automatizar cientos de "confirmaciones" falsas (`adults`/`children` hasta 50 cada una, sin tope de peticiones). El radio de impacto está acotado a un único evento de una única familia (no cruza familias); es una molestia/spam, no una fuga de datos — los campos devueltos ya están correctamente restringidos a información pública (nunca presupuesto, regalos, notas internas).

### B-2. Extensión `pg_net` instalada en el esquema `public`

Advisor de Supabase (`extension_in_public`, WARN): `pg_net` vive en `public` en vez de un esquema dedicado. Es una recomendación de higiene estándar de Postgres/Supabase (superficie de nombres compartida), sin vector de explotación concreto identificado en este proyecto.

### B-3. `voice-webhook` desplegada pero deliberadamente inerte, sigue aumentando la superficie de ataque

Función activa en Supabase (`verify_jwt=false`) cuya tabla de autenticación (`voice_webhook_tokens`) fue creada y eliminada en migraciones antiguas (0042/0043) — toda petición falla siempre con 401 porque nunca hay un token que valide. No representa riesgo hoy, pero sigue siendo una función pública desplegada y sin uso, aumentando la superficie sin necesidad.

### B-4. 4 Edge Functions desplegadas en Supabase no están versionadas en el repositorio

`voice-webhook`, `hevy-proxy`, `diag-google-events`, `purge-old-receipt-photos` existen en el proyecto Supabase real pero no en `supabase/functions/` del repo (verificado listando el directorio local frente a `list_edge_functions`). No es en sí una vulnerabilidad, pero significa que el código desplegado en producción puede divergir de lo que cualquier revisión de código (incluida esta auditoría, que sí las leyó vía `get_edge_function`) ve en el repo. `diag-google-events` está deshabilitada a propósito (`return new Response("disabled", {status:410})`); `hevy-proxy` exige JWT y deriva family_id del propio usuario — ambas sin hallazgos. Riesgo de higiene/trazabilidad, no de seguridad activa.

### B-5. Código de invitación de creación de familia (`generate_family_invite`) con la misma entropía baja que M-1

`v_code := upper(substr(md5(...),1,8))` — 32 bits. Impacto menor que M-1 porque solo permite CREAR una familia nueva en la app (no entrar en una existente), y el propio `create_family` exige además el código maestro en Vault o esta invitación — pero es la misma debilidad de diseño, documentada aquí para que la corrección de M-1 cubra también este caso.

---

## 6. Estado RLS por área

| Área | Tablas representativas | RLS habilitado | Policies correctas |
|---|---|---|---|
| Calendario | `calendar_events`, `calendar_event_members`, `calendar_event_reminders`, `calendar_event_completions`, `calendar_export_tokens` | Sí (todas) | **SÍ** — `family_id = current_family_id()`, además `visibility='shared' OR created_by=auth.uid()` para eventos "solo yo" |
| Eventos (PEPA Events) | `events`, `event_guests`, `event_providers`, `event_payments`, `event_invitations`, `event_tables`, `event_budget_items`, `event_gifts_received`, etc. | Sí (todas) | **SÍ** — `family_id = current_family_id() AND has_section_access('eventos')`; `event_guests` valida además que `table_id` pertenezca al mismo evento/familia |
| Economía | `expenses`, `budgets`, `budget_categories`, `receipts`, `bank_accounts`, `bank_connections`, `bank_transactions`, `forecast_payments` | Sí (todas) | **SÍ** — `family_id = current_family_id()`; `expenses` añade además lógica de cuentas separadas/compartidas (`current_accounts_mode()`, `owner_member_id`) para el modo "cuentas separadas" dentro de la misma familia |
| Compras/Inventario | `shopping_items`, `shopping_trips`, `inventory_items`, `products`, `product_prices` | Sí (todas) | **SÍ** |
| Galería/Documentos | `gallery_photos`, `member_documents`, `document_categories` | Sí (todas) | **SÍ** — `gallery_photos` exige además `has_section_access('galeria')`; `member_documents` valida que `member_id` pertenezca a la familia actual |
| Familia/Perfiles | `families`, `family_members`, `profiles`, `family_invites` | Sí (todas) | **DUDOSO** — ver A-2 (SELECT de `families` no restringido a admin) y M-3 (`family_members` legible por cualquier rol) |
| Ubicación | `location_places`, `location_sharing_consent`, `member_locations`, `member_location_history`, `member_place_visits` | Sí (todas) | **SÍ** — admin-toggle y self-toggle correctamente separados y respaldados server-side (confirmado, ver §9) |
| App-lock / WebAuthn | `profile_locks`, `profile_webauthn_credentials`, `profile_webauthn_challenges` | Sí (todas) | **SÍ, por diseño sin policies** — cero acceso directo (anon/authenticated sin BYPASSRLS), todo pasa por funciones `SECURITY DEFINER` que validan `auth.uid()` — ver M-2 para la nota de defensa en profundidad |
| Integraciones Google | `google_calendar_credentials`, `google_calendar_imported_events`, `calendar_event_google_sync` | Sí (todas) | **SÍ a nivel de tabla** (sin policies, solo `service_role`) — pero ver **C-1**: el problema no está en RLS, está en qué `family_id` puede escribir ahí el Edge Function |
| Integraciones bancarias | `bank_connections`, `bank_accounts`, `bank_connection_reminders` | Sí (todas) | **SÍ a nivel de tabla** — ver **A-1**, mismo matiz que Google |
| Catálogos compartidos (no privados) | `catalog_categories`, `catalog_food_types`, `catalog_release`, `store_chains`, `store_chain_aliases` | Sí | **SÍ** (deliberadamente sin scoping por familia — son catálogos globales de referencia, solo lectura para `authenticated`) |
| Aprendizaje compartido de productos | `shared_product_learning`, `shared_learning_batches` | Sí, sin policies | **SÍ** (por diseño — acceso solo vía funciones `SECURITY DEFINER` como `resolve_shared_product_class(es)`, dato no sensible: nombres de producto normalizados, no transacciones) |
| Logs/telemetría internos | `ai_usage_daily`, `pepa_usage_daily`, `pepa_web_visits`, `client_errors`, `activity_log` | Sí | **SÍ** (`client_errors`/`activity_log` scoped por user/family; el resto sin policies, solo `service_role`) |
| Pepa Web (marketing, no es la app familiar) | `pepa_web_news`, `pepa_web_promotions`, `pepa_web_leads`, `pepa_web_images`, etc. | Sí | **SÍ** — gestionado por `is_app_owner`, lectura pública de contenido publicado (correcto para un sitio de marketing) |

---

## 7. Storage

Buckets confirmados (`storage.buckets`): `body-photos`, `calendar-attachments`, `documents`, `event-photos`, `gallery`, `member-photos`, `product-photos`, `receipts`, `recipe-photos` (todos `public=false`) y `pepa-web-media` (`public=true`, sitio de marketing, no datos familiares).

Patrón de policies en `storage.objects` (verificado para los 9 buckets privados): las tres operaciones relevantes (`SELECT`/`INSERT`/`DELETE`) comprueban `bucket_id = '<bucket>' AND (storage.foldername(name))[1] = private.current_family_id()::text` — es decir, el primer segmento de la ruta (`${familyId}/...`, patrón confirmado en el código de subida de `mercadona-ticket-webhook`, `amazon-order-webhook`, etc.) debe coincidir exactamente con la familia del usuario autenticado. `calendar-attachments` y `gallery` añaden además `has_section_access('calendario'|'galeria')`. No hay ninguna política que permita listar o descargar el archivo de otra familia conociendo su `storage_path` — el `family_id` del path se vuelve a comprobar en cada policy, no solo al subir.

`pepa-web-media` (bucket público) solo permite lectura pública de contenido de marketing (vídeos de Paco, imágenes de promociones) gestionado por `is_app_owner`; no contiene datos de ninguna familia, riesgo nulo para el objetivo de esta auditoría.

**Riesgo de acceso cruzado en Storage: no encontrado.** El diseño de "primer segmento de ruta = family_id, comprobado en la policy" es sólido y se aplica uniformemente.

---

## 8. Separación entre familias — conclusión explícita

**¿Está garantizada hoy?** Para el 100% de las tablas accesibles vía PostgREST/RLS directo y para el 100% de los buckets de Storage: **SÍ**, con evidencia (secciones 6 y 7). Para 33 de las 35 Edge Functions: **SÍ**, cada una deriva `family_id` del JWT del propio usuario, de un token/secreto de alta entropía, o de un secreto de cron en Vault — nunca de un parámetro que el cliente pueda fijar libremente para leer/escribir el recurso de otra familia.

**Para 2 de las 35 Edge Functions: NO, hay una vía confirmada de escritura (y en el caso de Google, lectura indirecta automatizada) cruzada entre familias** — los callbacks OAuth de Google Calendar (C-1, CRÍTICO) y de Enable Banking (A-1, ALTO), por el mismo fallo de diseño: un parámetro `state` que decide a qué familia se asocia el resultado del flujo OAuth, sin firma ni verificación de que quien complete el flujo tenga derecho sobre esa familia.

En resumen: el modelo de aislamiento por familia es sólido en su capa principal (RLS + Storage + RPCs `SECURITY DEFINER`), pero tiene una grieta real y concreta en los dos flujos OAuth de terceros (Google, banco), que son precisamente los únicos sitios donde la identidad de la familia viaja en un parámetro de URL en vez de resolverse server-side a partir de una sesión.

---

## 9. Endpoints / Edge Functions

`verify_jwt` según la API de Supabase (35 funciones desplegadas; 4 no están versionadas en el repo, ver B-4).

| Función | verify_jwt | Cómo autentica de verdad | Riesgo cruce de familias |
|---|---|---|---|
| **google-calendar-oauth-callback** | false | `state` en la URL, JSON base64 **sin firmar** | **CRÍTICO (C-1)** |
| **enable-banking-auth-callback** | false | `state` en la URL, JSON base64 **sin firmar** | **ALTO (A-1)** |
| google-calendar-oauth-start | true | JWT propio → `family_id`/`member_id` del propio perfil | Ninguno |
| enable-banking-auth-start | true | JWT propio → `family_id` del propio perfil | Ninguno |
| amazon-order-webhook | false | `families.amazon_webhook_token` (UUID v4, 122 bits) en el body | Ninguno directo (requiere el token; ver A-2 sobre su visibilidad) |
| mercadona-ticket-webhook | false | mismo token que Amazon | Ninguno directo; límite de tamaño (14MB) y deduplicación por hash correctos |
| import-event-email-webhook | false | mismo token que Amazon | Ninguno directo |
| event-rsvp | false | `event_guests.rsvp_token` / `events.open_rsvp_token` (`gen_random_bytes(24)`, 192 bits) | Ninguno — solo devuelve campos públicos explícitos; ver B-1 (spam, no fuga) |
| export-calendar-ics | false | `calendar_export_tokens.token` (192 bits) | Ninguno — excluye `visibility='private'` |
| send-due-reminders | false | header `x-cron-secret` vs `get_app_secret('cron_shared_secret')` | Ninguno — recorre todas las familias a propósito (es su función), no acepta ids del cliente |
| purge-old-receipt-photos | false | mismo `x-cron-secret` | Ninguno |
| sync-external-calendars-cron | false | mismo `x-cron-secret` | Ninguno |
| sync-calendar-to-google-cron | false | mismo `x-cron-secret` | Es el vector de IMPACTO de C-1 (no la causa) |
| sync-calendar-from-google-cron | false | mismo `x-cron-secret` | Es el vector de IMPACTO de C-1 (no la causa) |
| enable-banking-sync-transactions | false | `x-cron-secret` (todas las familias) O JWT de usuario (`family_id` del propio perfil) | Ninguno |
| voice-webhook | false | tabla de tokens borrada, siempre 401 | Ninguno (función muerta, ver B-3) |
| profile-webauthn | false a nivel de plataforma, pero exige JWT manualmente en código | `userClient.auth.getUser()` + todo filtrado por `profile_id = user.id` | Ninguno |
| enable-banking-disconnect | true | JWT + confirmación de ownership vía `userClient` (RLS) antes de usar `service_role` | Ninguno |
| sync-external-calendar | true | JWT, todo vía `userClient` (RLS), sin `service_role` | Ninguno |
| enable-banking-list-aspsps, hevy-proxy, fatsecret-food, fetch-image-url, cookpad-search, import-recipe-url | true | JWT, `family_id` derivado del propio perfil; `fetch-image-url`/`import-recipe-url` con protección SSRF explícita | Ninguno |
| analyze-fridge-photo, analyze-receipt-photo, analyze-document-expiry, recipe-generate, finance-analysis, finance-intent, finance-budget-intent, pepa-intent, split-grocery-list | true | Gateway común (`_shared`) que exige JWT y deriva `family_id` vía RPC `ai_gate(auth.uid())` — nunca de un parámetro del body | Ninguno |
| diag-google-events | false | deshabilitada a propósito (410) | Ninguno |

---

## 10. Secrets / configuración

- **Frontend (`src/`)**: confirmado dos veces (lectura directa + agente dedicado) que no contiene ningún secreto de servidor. `src/data/supabaseClient.ts` usa únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Las tres únicas variables `import.meta.env.VITE_*` usadas en todo `src/` son `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_VAPID_PUBLIC_KEY` (esta última pública por diseño, para suscripciones push). `.env.example` solo declara esas tres. Ninguna clave de proveedor (Gemini, FatSecret, Enable Banking, Google OAuth client secret, VAPID privada) aparece en `src/` ni en `.env`/`.env.example`.
- **Server-side**: todos los secretos de proveedor viven en Supabase Vault, leídos exclusivamente vía la función `SECURITY DEFINER` `get_app_secret(p_name)` desde Edge Functions con `service_role` — patrón único y consistente en todo el proyecto (`get_app_secret('gemini_api_key')`, `get_app_secret('cron_shared_secret')`, `get_app_secret('enablebanking_private_key')`, `get_app_secret('google_oauth_client_secret')`, etc.).
- **`service_role`**: no aparece ni una vez en `src/` (confirmado por grep exhaustivo de ambos agentes/lecturas). Se usa correctamente solo dentro de Edge Functions (`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`), nunca en el bundle cliente.
- **GRANTs SQL amplios a `anon`/`authenticated`**: ver M-2 — patrón estándar de Supabase, seguro hoy (RLS + `rolbypassrls=false` confirmados), pero sin defensa en profundidad si RLS se desactivase por error en el futuro.
- **`pg_net` en el esquema `public`**: ver B-2, recomendación de higiene del propio advisor de Supabase.

---

## 11. Riesgo global

**ALTO.**

No es CRÍTICO a nivel de postura general porque el 94% de la superficie auditada (RLS de ~110 tablas, Storage, 32 funciones `SECURITY DEFINER`, 33 de 35 Edge Functions, frontend) está bien diseñada y verificada contra el esquema real, con un patrón consistente y evidencia clara de que el equipo ya conoce y aplica bien el criterio "todo pasa por `family_id = current_family_id()` o por una función que valida ownership". Pero no puede calificarse por debajo de ALTO mientras exista el hallazgo C-1 (CRÍTICO): un camino confirmado, reproducible sin necesidad de cuenta en la app ni credenciales de la víctima, que filtra automáticamente y de forma recurrente (cada hora) el calendario privado de una familia hacia un tercero. Ese único hallazgo, por sí solo, contradice el objetivo de seguridad principal de la auditoría para el caso concreto de la integración con Google Calendar.

Prioridad de corrección: **C-1 primero (inmediato)**, después A-1 (mismo patrón, banca), después A-2/M-3 (visibilidad de secretos/códigos dentro de la propia familia), después M-1/M-2 (entropía de invitaciones, defensa en profundidad de GRANTs).

---

## 12. Recomendaciones de corrección (solo documentadas — NO implementadas en esta auditoría)

**C-1 y A-1 (mismo patrón, misma corrección)**: el parámetro `state` de un flujo OAuth de terceros nunca debe ser la única fuente de verdad de a qué `family_id`/`member_id` se asocia el resultado. Dos opciones estándar, cualquiera de las dos cierra el hallazgo:
1. **Firmar el `state`** en `-start` con HMAC-SHA256 usando un secreto de servidor (ya hay un patrón de secretos en Vault, p. ej. reutilizar `cron_shared_secret` o crear uno nuevo `oauth_state_secret`), incluyendo un timestamp de expiración corto (p. ej. 10 minutos); en `-callback`, verificar la firma antes de confiar en `familyId`/`memberId`/`profileId`, y rechazar si no coincide o ha expirado.
2. **Nonce de un solo uso en servidor** (más robusto): en `-start`, generar un nonce aleatorio (`gen_random_bytes`), guardarlo en una tabla temporal (`oauth_pending_state`) junto con `familyId`/`memberId`/`profileId`/`auth.uid()` y una expiración corta, y mandar solo el nonce como `state`. En `-callback`, buscar el nonce, comprobar que no ha caducado, BORRARLO (uso único, evita replay) y usar los datos guardados en servidor — nunca los que llegan en la URL.

Adicionalmente, en `enable-banking-auth-callback`, la búsqueda de `family_members` por `linked_profile_id` (línea ~147) debería exigir además que ese miembro pertenezca al `familyId` del `state` ya verificado (defensa en profundidad, aunque la corrección del `state` ya cierra el vector principal).

**A-2 (`families.amazon_webhook_token` visible a todos)**: separar la policy de `SELECT` en dos — una genérica sin la columna del token (o usar una vista/función `SECURITY DEFINER` tipo `get_family_amazon_webhook_token()` que exija `current_role_in_family() = 'admin'`, mismo patrón que `admin_reset_profile_pin`), y dejar el resto de columnas de `families` visibles a todos los miembros como hoy.

**M-1 (entropía de invitación de miembro)**: cambiar `generate_member_invite_code`/`generate_family_invite` de `substr(md5(...), 1, 8)` (32 bits) a `encode(gen_random_bytes(16), 'hex')` o similar (128+ bits), igualando el patrón ya usado en `generate_event_guest_rsvp_token`/`get_or_create_calendar_export_token`. Considerar además un contador de intentos fallidos por IP/usuario en `join_family_with_code`, mismo patrón que `verify_own_pin` (lockout tras 5 intentos).

**M-2 (GRANTs amplios)**: `REVOKE ALL ON TABLE google_calendar_credentials, profile_webauthn_credentials, profile_webauthn_challenges, profile_locks, bank_accounts, bank_connections, receipts, member_documents FROM anon;` (y considerar recortar también `authenticated` a los verbos que de verdad necesita, dado que RLS ya los cubre, TRUNCATE en particular no hace falta para ningún rol de cliente) — defensa en profundidad, cero impacto funcional porque RLS ya bloquea el acceso hoy.

**M-3 (`family_members` visible a todos)**: si se quiere restringir, separar el `SELECT` en "campos básicos visibles a todos" (nombre, tipo) vía una vista, y dejar `invite_code`/`invite_code_expires_at` solo visibles para `current_role_in_family() = 'admin'` en la policy.

**B-1 (spam de RSVP)**: añadir un límite de tasa simple (p. ej. por IP o por token, vía una tabla de contadores con ventana temporal) al POST de `event-rsvp` con `open` token.

**B-2 (`pg_net` en `public`)**: mover la extensión a un esquema dedicado (`extensions`) en una migración futura de mantenimiento, siguiendo la guía del advisor de Supabase.

**B-3 (`voice-webhook` muerta)**: eliminar la función de Supabase (`supabase functions delete voice-webhook`) ya que no tiene ningún camino de autenticación posible desde 0043.

**B-4 (funciones no versionadas)**: añadir `voice-webhook`, `hevy-proxy`, `diag-google-events`, `purge-old-receipt-photos` a `supabase/functions/` en el repo (o eliminarlas del proyecto Supabase si son obsoletas), para que el código desplegado y el auditado/revisado sean siempre el mismo.

**B-5**: la misma corrección de M-1 aplicada a `generate_family_invite` cierra también este caso.

---

### Nota sobre alcance no cubierto en profundidad

Por límite de tiempo de esta auditoría, no se ha revisado línea a línea el 100% de los ~140 archivos de migración SQL (se ha verificado el estado REAL de policies/funciones en la base de datos viva, que es la fuente de verdad, en vez de reconstruirlo migración a migración) ni el 100% del árbol `src/ui/` componente a componente (se delegó una pasada dedicada a un agente, con hallazgos incorporados en las secciones 3-4). Se recomienda repetir `get_advisors` (tipo `security`) tras cualquier cambio de esquema futuro, como ya indica su propia descripción de herramienta.
