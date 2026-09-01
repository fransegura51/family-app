# Family App — PROJECT.md

Documento vivo de arquitectura. Se actualiza según evoluciona el proyecto.
Reglas de producto y seguridad completas en la skill `family-app`
(`anthropic-skills:family-app`) — este documento cubre el **cómo técnico**.

## Estado

Fase 0 completada. Fase 1 en curso, verificado en real (registro → alta de
familia → miembros → calendario) contra el proyecto Supabase `family-app`
(org `Aalerfer seguimiento`, `fransegurahortelano@gmail.com`,
ref `objhgjgrinbhyzscjlbw`), 0 avisos de seguridad.

Hecho:
- Auth (registro/login) + bootstrap de familia vía RPC `create_family`
  (SECURITY DEFINER, valida que el usuario no tenga familia ya).
- Familia: alta, edición y borrado de miembros (solo admin; el propio
  admin no se puede editar/borrar desde aquí).
- Calendario: listado, filtro por miembro, alta/edición/borrado de evento
  con miembros asociados, todo el día y repetición simple
  (diaria/semanal/mensual). Bug corregido: el formulario de edición usaba
  la hora en UTC en vez de local (desajuste según huso horario).

- Recordatorios: selector al crear/editar evento (10 min / 30 min / 1h /
  1 día antes). Disparo real vía Web Notifications API
  (`src/services/notifications.ts` + `src/ui/ReminderWatcher.tsx`, revisa
  cada 30s) — gratis, sin backend adicional. Límite conocido: solo
  funciona con la app abierta (pestaña activa o en segundo plano), no con
  la app totalmente cerrada.

- Notificaciones con la app cerrada: Web Push real, gratis, sin backend
  propio más allá de lo que ya da Supabase.
  - Claves VAPID y secreto compartido guardados en Supabase Vault (nunca
    en el repo ni en env vars de Edge Functions, que no son gestionables
    desde estas herramientas).
  - Tablas `push_subscriptions` (RLS: cada usuario solo ve/gestiona la
    suya) y `reminder_deliveries` (sin políticas — solo tocable por
    funciones SECURITY DEFINER, evita reenvíos duplicados).
  - Funciones `get_app_secret`, `claim_due_reminders` (reclama de forma
    atómica los recordatorios ya vencidos) y `delete_push_subscription`,
    todas restringidas a `service_role` únicamente.
  - Edge Function `send-due-reminders` (`supabase/functions/`): valida el
    secreto, llama a `claim_due_reminders`, envía cada push con
    `web-push` (VAPID) y borra suscripciones caducadas (404/410).
  - `pg_cron` la llama cada minuto vía `pg_net` — 100% gratis en el plan
    Free de Supabase.
  - Service worker propio (`src/sw.ts`, `vite-plugin-pwa` en modo
    `injectManifest`) con handlers `push` y `notificationclick`.
  - Cliente: `subscribeToPush` + `savePushSubscription`, activado desde
    el mismo botón "Activar recordatorios" de Inicio.
  - Bug real encontrado y corregido durante las pruebas: los parámetros
    de salida de `claim_due_reminders` (definidos vía `RETURNS TABLE`) se
    convierten en variables plpgsql visibles en toda la función: al
    llamarse igual que columnas reales (`subscription_id`, `endpoint`,
    `p256dh`, `auth`) provocaban "ambiguous column reference" (42702) en
    tiempo de ejecución, aunque el código pasaba review estático.
    Solución: prefijar todos los OUT params con `out_`. Verificado en
    real con una suscripción de prueba: el recordatorio se reclamó
    correctamente (`claim_due_reminders` funcionó) y el intento de envío
    falló solo por usar una clave criptográfica de prueba inválida (fallo
    esperado, no del código).
  - Límite real: para que un dispositivo reciba avisos con la app
    cerrada, alguien tiene que pulsar "Activar recordatorios" desde ese
    dispositivo/navegador al menos una vez (concede permiso + genera la
    suscripción push). No hay forma de evitarlo — es como funciona Web
    Push en cualquier sitio.

Fase 1 completa, incluyendo recordatorios con la app cerrada.

## Fase 2 — tareas, rutinas, misiones, puntos y recompensas (Skill 05)

Completa. `TasksScreen`: tareas únicas/recurrentes/rutinas/misiones,
asignables a un miembro o a toda la familia; marcar hecho/deshacer por
día (`task_completions`, único por tarea+miembro+fecha); puntos, racha de
días consecutivos (`calculateStreak` en `src/domain/tasks.ts`, sin
dependencias de framework); recompensas canjeables por puntos
(`rewards` + `reward_redemptions`). Verificado en real: tarea creada,
completada (puntos y racha se actualizan), recompensa creada y canjeada
(el saldo baja correctamente).

Nota de diseño: no hay cuentas de Auth por niño en este modelo (dispositivo
compartido) — para marcar una tarea hay que seleccionar primero de qué
miembro se trata en los chips superiores, igual que en Calendario/Familia.

## Fase 3 — compras, compras programadas, modo compra, inventario (Skills 06/07/08/12)

Completa. `ShoppingScreen` con 3 secciones:
- **Lista**: productos con cantidad/unidad/prioridad/estado (pendiente,
  comprado, omitido, trasladado). No se reinicia sola. "Modo compra"
  simplifica la interfaz a un toque para marcar comprado y muestra
  progreso X/Y (verificado: 1/1 al marcar "Leche").
- **Programadas**: compras con fecha/tienda/presupuesto; al completarlas
  se introduce el importe real, distinguiendo previsto de real (Skill 08
  + 19). Verificado con una compra de prueba (presupuesto 80€, gastado
  76,40€).
- **Inventario**: por categorías (frigorífico, congelador, despensa,
  limpieza, higiene, bebé, otros), cantidad editable inline. Verificado
  añadiendo "Yogures" a Frigorífico.

Fuera de alcance por ahora (Fase 4): normalización de producto, OCR de
tickets e historial de precios (Skills 09-11) — el nombre del producto es
todavía texto libre. El OCR de tickets requiere una IA con visión
(Claude/GPT-4V/Google Vision), que **no es gratuita** — hay que decidir
proveedor y presupuesto antes de construirlo (ver Skill 22, capa de IA
intercambiable).

Después: Fase 4 (tickets, productos, historial de precios) — pendiente de
decisión sobre el proveedor de IA de pago.

## Fase 5 — alimentación, menús y recetas (Skills 14/15/16)

Completa. `AlimentacionScreen` (accesible desde la tarjeta "Alimentación"
de Inicio — no está en la barra inferior a propósito, Skill 02 solo pide
Inicio/Calendario/Tareas/Compras/Familia ahí) con 3 secciones:
- **Menú**: semana visible día a día, cada comida (desayuno/comida/
  merienda/cena) se asigna a una receta o a texto libre.
- **Recetas**: título + ingredientes (uno por línea) + notas. Botón
  "Generar lista de la compra" que añade los ingredientes a Compras →
  Lista (flujo Menú → ingredientes → lista de la Skill 15). Verificado
  end-to-end: receta "Tortilla de patatas" → sus 3 ingredientes aparecen
  como pendientes en la lista de la compra.
- **Registro**: por miembro y día, qué comió cada uno. Para admin/adulto
  se puede añadir calorías y marcar exacto/estimado; para niño/bebé el
  formulario oculta por completo el detalle nutricional (Skill 16) —
  verificado comparando Jennifer (con kcal) vs Eric (solo descripción).

## Fase 6 — finanzas y educación financiera (Skills 17/18/19/20)

Completa. `FinanceScreen` (desde la tarjeta "Dinero" de Inicio) con 3
secciones:
- **Gastos**: fecha/importe/categoría/establecimiento, tipo REAL/
  ESTIMADO/PREVISTO (Skill 17). Total del mes y desglose por categoría
  (Skill 18) calculados solo sobre gasto real.
- **Presupuestos**: mensual o semanal, general o por categoría; barra de
  progreso con gastado/restante/% — `budgetSpent()` en
  `src/domain/finance.ts` filtra explícitamente `kind === 'real'`, nunca
  cuenta estimado/previsto como gasto ya hecho (Skill 19). Verificado:
  presupuesto de 300€ en Alimentación mostró 45,30€ gastados (15%) tras
  registrar ese gasto real.
- **Educación financiera**: dinero virtual por niño/bebé, independiente
  del sistema de puntos de tareas (Skill 05) — aquí se practica
  ingresos/gastos/ahorro real, no recompensas por comportamiento.
  Objetivos visuales con barra de progreso. Verificado con el ejemplo
  literal de la Skill 20: objetivo "Bicicleta" a 35€, ingreso de 15€ →
  saldo 15,00€, objetivo al 43%.

Nota de alcance: sin cuentas de Auth por niño (dispositivo compartido,
igual que en Tareas), la separación de "finanzas privadas de adultos"
frente a datos del niño es la que da la propia navegación por pestañas,
no un control de acceso a nivel de base de datos — sería necesario si en
el futuro cada niño tuviera su propio login.

## Fase 8 — geolocalización y automatizaciones (Skills 23/24/28)

Completa, con confirmación explícita del usuario antes de construirla por
tratarse de datos de ubicación de menores. `LocationScreen` (desde
"Ubicación y avisos" en Inicio) con 2 secciones:
- **Ubicación**: consentimiento por miembro, desactivado por defecto,
  solo el admin puede activarlo/desactivarlo (Skill 28). Diseño de
  mínima retención deliberado: `member_locations` usa `member_id` como
  PRIMARY KEY, así que cada actualización sustituye la anterior — nunca
  hay un historial de posiciones en la base de datos, ni siquiera para el
  admin. Desactivar el consentimiento borra también la última posición
  guardada. Lugares frecuentes con radio configurable; distancia
  calculada con la fórmula de Haversine (`src/domain/geo.ts`, sin mapas
  de pago). Verificado insertando una ubicación de prueba a 7 m de un
  lugar de prueba: se mostró correctamente "7 m · cerca".
- **Reglas**: motor de automatizaciones (`AutomationWatcher`, revisa cada
  30s, mismo patrón que `ReminderWatcher`) para "al llegar a un lugar",
  "al salir de un lugar" y "todos los días a una hora" — cubre los
  ejemplos de la Skill 24 (mochila escolar, llegada al súper). Activar/
  pausar y "silenciar 1h" por regla. El motor evalúa contra los datos ya
  sincronizados (`member_locations`/`location_places`), no contra el GPS
  del dispositivo que evalúa — cualquier móvil con la app abierta puede
  procesar las reglas de toda la familia. Verificado creando la regla de
  ejemplo literal de la Skill 23 ("al acercarse al súper, mostrar lista")
  y confirmando un ciclo sin errores contra datos reales.

Datos de prueba (posición simulada, consentimiento de prueba) limpiados
tras verificar; el lugar "Supermercado" y la regla de ejemplo se dejaron
como configuración real de la familia.

## Actividad (Skill 25)

Completa. Trigger genérico `log_activity()` en las entidades más
críticas (miembros, eventos, tareas, productos de la lista, gastos,
reglas de automatización) — más fiable que instrumentar cada función de
`src/data` una a una, imposible de olvidar en un sitio. `ActivityScreen`
(enlazado desde Familia) muestra "Jennifer creó un evento", etc.
Verificado creando y borrando un evento de prueba.

## Pentest real (Skill 32)

Hecho con una segunda familia de prueba real (cuenta `attacker.test@gmail.com`,
creada y borrada por completo al terminar), atacando la API de Supabase
directamente con `fetch` (sin pasar por la UI) usando el token de esa
familia:

- Lectura cruzada de `family_members`, `calendar_events`, `expenses`,
  `families` de la familia de Jennifer, incluso pidiendo el ID exacto →
  **DENEGADO** (array vacío) en los 5 casos.
- Insertar un producto en la lista de la compra de otra familia →
  **DENEGADO** (403, violación de RLS).
- Modificar el nombre de la familia, borrar o modificar un miembro de
  otra familia → **DENEGADO** (0 filas afectadas).
- Invocar `get_app_secret`, `claim_due_reminders`, `delete_push_subscription`
  (funciones restringidas a `service_role`) como usuario autenticado y
  como anónimo → **DENEGADO** (403/401 en los 4 casos).
- Volver a llamar `create_family` con una cuenta que ya tiene familia →
  **DENEGADO** por la propia función ("El usuario ya pertenece a una
  familia").

**Encontró 1 vulnerabilidad real, corregida en el momento**: varias
políticas RLS comprobaban `family_id = current_family_id()` en la fila
que se escribe, pero no validaban que los `member_id`/`place_id`
referenciados perteneciesen a esa misma familia. Se probó con éxito
contra `location_sharing_consent` + `member_locations`: un admin de una
familia ajena podía activar consentimiento de ubicación y escribir una
posición falsa para un `family_member` real de otra familia (aunque sin
llegar a filtrarse a la víctima — sus lecturas seguían aisladas). Corregido
en `0012_harden_foreign_key_ownership.sql` con dos funciones auxiliares
(`private.member_in_current_family`, `private.place_in_current_family`)
aplicadas a las 9 tablas afectadas (`location_sharing_consent`, `tasks`,
`task_completions`, `calendar_event_members`, `food_logs`,
`kid_wallet_transactions`, `kid_goals`, `reward_redemptions`,
`automation_rules`). Reintentado el mismo ataque tras el fix →
**DENEGADO**. Verificado que las operaciones legítimas de la familia real
(completar una tarea de Eric) seguían funcionando igual después del
endurecimiento.

**Bug adicional encontrado al limpiar los datos de la prueba** (no es de
seguridad, es de integridad): borrar una familia hacía fallar la
aplicación por una FK de `activity_log` hacia `families` — el trigger de
auditoría intentaba registrar el borrado en cascada de sus miembros
referenciando una familia que ya no existía en ese instante. Corregido en
`0013_fix_activity_log_fk_on_family_delete.sql` quitando esa FK (un log
de auditoría no debe depender de que la entidad exista).

## Productos y memoria de compras (Skills 09/11, sin IA)

Completo. La parte de Fase 4 que no depende de OCR: `products` +
`product_prices`, con nombre normalizado (minúsculas + recortado) pero
conservando el texto original que escribió la familia (Skill 11). Al
marcar un producto como comprado en la Lista, se puede guardar su precio
(pestaña "Memoria" nueva en Compras) — eso alimenta:
- Historial por producto: nº de compras, último/media/mín/máx precio.
- Sugerencias para la próxima compra: cuando ya ha pasado el intervalo
  medio histórico desde la última compra, aparece con un botón "Añadir a
  la lista" — nunca se añade sola, siempre requiere confirmación (Skill 09).

Verificado end-to-end: precio de "Leche" guardado, historial correcto,
sugerencia calculada (cada 12 días) tras simular una segunda compra, y
"Añadir a la lista" creando el producto pendiente de verdad.

Sigue pendiente de Fase 4: OCR de tickets (Skill 10) — necesita una IA
con visión, de pago.

## Despliegue web (para instalar en el móvil)

Publicada como PWA real en GitHub Pages (gratis, HTTPS):
`https://fransegura51.github.io/family-app/`. Repo público
`github.com/fransegura51/family-app` (sin secretos: las claves en
`.env`/GitHub Secrets son del tipo "publicable", protegidas por RLS, no
sirven de nada sin pasar por las políticas de Supabase).

- `vite.config.ts`: `base: '/family-app/'` solo en build (dev sigue en
  `/`), para que las rutas de assets/manifest/service worker funcionen
  bajo la subruta de GitHub Pages.
- Iconos reales generados con Jimp (`scripts/generate-icons.mjs`, uso
  único) — antes el manifest apuntaba a iconos que nunca se habían creado.
  `apple-touch-icon.png` añadido para instalación en iOS.
- `.github/workflows/deploy.yml`: build + deploy automático a GitHub
  Pages en cada push a `master`, con las variables `VITE_*` como GitHub
  Secrets.
- Para instalarla en el móvil: abrir la URL en el navegador del teléfono
  y usar "Añadir a pantalla de inicio" (Android/Chrome) o "Compartir →
  Añadir a inicio" (iOS/Safari) — queda como una app con icono propio.

**Bug real encontrado y corregido al probar el despliegue**: tras iniciar
sesión, la pantalla se quedaba completamente en blanco, sin ningún error
en consola. Causa: `<BrowserRouter>` no tenía `basename`, así que bajo la
subruta `/family-app/` (GitHub Pages) ninguna ruta coincidía —
React Router v6 renderiza vacío ante una ruta sin match, sin lanzar
ningún error. En local funcionaba porque ahí se sirve desde `/`. Corregido
con `basename={import.meta.env.BASE_URL}` (Vite ya rellena esa variable
con `/family-app/` en build y `/` en dev, sin config aparte). De paso se
añadió un `ErrorBoundary` + captura de promesas sin gestionar
(`src/main.tsx`, `src/ui/ErrorBoundary.tsx`): si algo vuelve a fallar en
producción, ahora se ve el error en pantalla en vez de una página en
blanco sin pistas.

## Estado general

Todo lo que se podía hacer gratis está hecho: Fases 1, 2, 3, 5, 6 y 8
completas, más Actividad (Skill 25), Productos y memoria de compras
(Skills 09/11), y un pentest real que encontró y corrigió una
vulnerabilidad (Skill 32). Todo verificado contra el backend real, sin
ningún coste.

Lo único que queda y necesita que decidas un proveedor de IA de pago:
- **Fase 4 (resto)**: OCR de tickets (Skill 10).
- **Fase 7**: Family AI operativa (Skill 21) — interpretar texto,
  sugerir compras/recetas/menús, analizar hábitos, resumir. Incluye la
  capa de abstracción de proveedor (Skill 22) para no depender de uno
  solo.
- Correo (Skill 29) se dejó fuera por estar ligado al procesamiento de
  tickets — no aporta nada por sí solo sin OCR.

## Limitaciones conocidas del plan gratuito de Supabase

- El envío de emails de Auth (confirmación, recuperación de contraseña,
  futuras invitaciones a la familia) usa el SMTP compartido de Supabase en
  el plan gratuito, con una cuota muy baja (unos pocos emails/hora). No es
  un problema de configuración ni de permisos: es un límite del plan.
  "Confirm email" está desactivado ahora mismo para poder desarrollar sin
  chocar con ese límite. Antes de tener usuarios reales hace falta SMTP
  propio (Resend, Postmark, etc.) o el plan Pro de Supabase — y entonces
  reactivar la confirmación de email (Skill 33, checklist de release).

## Stack

- **Frontend**: React + TypeScript + Vite, PWA (`vite-plugin-pwa`) para
  instalación y soporte offline.
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage).
- **Offline-first**: cache local (IndexedDB vía la propia PWA) + cola de
  sincronización; los conflictos se resuelven de forma determinista
  (último-escritor-gana con `updated_at`, documentado por tabla si una
  entidad necesita otra estrategia).
- **IA**: capa de abstracción propia (`src/ai/`) — el dominio nunca llama
  directamente al SDK de un proveedor concreto.

## Estructura de carpetas

```
family-app/
├── PROJECT.md
├── supabase/
│   └── migrations/        # esquema versionado, aplicable con Supabase CLI
├── src/
│   ├── ui/                # componentes y pantallas (mobile-first)
│   ├── domain/            # tipos y lógica de negocio, sin dependencias de framework
│   ├── data/               # acceso a Supabase (queries, RLS-aware), sync offline
│   ├── ai/                # capa de IA intercambiable (interpretación, no ejecución directa)
│   ├── auth/               # sesión, roles, permisos
│   └── services/           # integraciones externas (correo, geolocalización, etc.)
```

Separación estricta: `ui/` no llama a Supabase directamente, pasa siempre
por `data/`. `ai/` solo interpreta y propone; la ejecución real de
acciones vive en `domain/` + `data/`, validada con los mismos permisos que
cualquier acción manual del usuario.

## Roles y permisos (Fase 1)

- `admin`: adulto administrador de la familia. Único que gestiona miembros,
  permisos y (más adelante) finanzas de otros adultos.
- `adult`: adulto sin privilegios de administración.
- `child` / `baby`: perfiles gestionados por adultos, sin cuenta de acceso
  propia inicialmente (login compartido por dispositivo/familia, modo niño
  en la interfaz). Nunca ven gastos, tickets, documentos ni ubicación
  privada de los adultos (Skill 28).

Un usuario de Supabase Auth (`auth.users`) se vincula a una familia y un
rol mediante `profiles`. Los `family_members` tipo `child`/`baby` son
perfiles dentro de la familia, no necesariamente cuentas de Auth.

## Esquema Fase 1 (ver `supabase/migrations/0001_init.sql`)

- `families` — una fila por familia (`family_id` es la clave de
  aislamiento de todo el sistema).
- `profiles` — vincula `auth.users.id` a una familia y un rol.
- `family_members` — miembros mostrables en UI (adultos y niños), con
  avatar/color/tipo/permisos.
- `calendar_events` + `calendar_event_members` — eventos familiares o
  individuales, con recurrencia y recordatorio.

Todas las tablas con datos de familia llevan `family_id` y RLS que
restringe cada operación a `family_id = current_family_id()` (función
`SECURITY DEFINER` que lee `profiles` del usuario autenticado). Nunca se
filtra por familia solo desde el frontend.

## Próximos pasos (Fase 1 → Fase 2)

1. Aplicar `0001_init.sql` en el proyecto Supabase cuando esté disponible.
2. Scaffold de la app (Vite + PWA) y pantalla de login/registro con
   Supabase Auth.
3. Alta de familia + miembros (UI de onboarding).
4. Pantalla "¿Qué tenemos hoy?" con navegación Inicio/Calendario/Tareas/
   Compras/Familia.
5. Calendario familiar + individual con filtros por miembro.
