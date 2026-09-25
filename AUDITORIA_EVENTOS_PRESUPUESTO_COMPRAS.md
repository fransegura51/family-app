# Auditoría — Módulo Eventos: Presupuesto, Pagos y fianzas, Menú y compra, Compras, Proveedores

Fecha: 2026-09-26
Alcance: SOLO LECTURA. No se ha modificado ningún archivo de código, no se ha aplicado ninguna migración, no se ha ejecutado ninguna escritura en la base de datos real (Supabase, proyecto `objhgjgrinbhyzscjlbw`). Todas las conclusiones están respaldadas por lectura directa de código y por consultas `SELECT` reales contra el esquema en producción.

Archivos principales auditados: `src/ui/EventosScreen.tsx` (4454 líneas — todo el módulo Eventos vive en un único archivo de UI), `src/domain/events.ts` (1727 líneas), `src/data/events.ts` (1703 líneas), `src/domain/types.ts`, `src/data/shopping.ts`, `src/ui/ShoppingScreen.tsx`, `src/domain/finance.ts` y ficheros `finance*.ts`, `src/data/forecast.ts`/`src/domain/forecast.ts`, `src/data/documents.ts`, y las migraciones `supabase/migrations/0106_events_module_schema.sql` y `0108_event_deadline_reminders.sql`.

---

## 1. Arquitectura actual

El módulo "Eventos" (bodas, comuniones, cumpleaños, bautizos, celebraciones, personalizado) está montado como **un único motor configurable**, no como mini-apps separadas por tipo de evento — regla de diseño explícita ya documentada en el propio código (`src/domain/events.ts:1-6`: *"un evento es una variante configurada del mismo motor, no seis mini-apps independientes"*).

Tres capas, sin más intermediarios:

- **UI — `src/ui/EventosScreen.tsx` (4454 líneas).** Un solo archivo con más de 35 componentes de función internos (no exportados salvo `EventosScreen`), cada uno responsable de una sección: `EventosScreen` (listado), `CreateEventModal`, `EventDetail` (contenedor principal, con su propio dashboard agregado vía `reloadDashboardStats`, línea 732), `ManageEventModal`, `TaskCard`/`TaskEditModal`, `EventShoppingSection` (línea 1752), `GuestsSection`, `BudgetSection` (línea 2540), `MenuSection` (línea 2674), `ProvidersSection` (línea 2755), `PaymentsSection` (línea 2864), `TablesSection`, `DecorationSection`, `ActivitiesSection`, `DetailsSection`, `GiftsSection`, `DayPlanSection`, `PepaConclusions` (línea 4104), `OrganizamePepaModal` (línea 4158), `SaveTemplateModal`, `EndSummaryModal` (línea 4375).
- **Datos — `src/data/events.ts` (1703 líneas).** Funciones CRUD delgadas, una familia de `list*/add*/update*/delete*` por tabla, todas llamando directamente a `supabase.from(...)`. Sin capa de repositorio ni ORM. Incluye también las funciones de "traspaso" entre módulos (`transferMenuToShopping` línea 1009, `transferDecorationItemToShopping` línea 1259, `transferActivityMaterialsToShopping` línea 1318), la gestión de la etiqueta compartida con Economía (`findOrCreateEventTag`, línea 166), y la sincronización con Calendario (`syncEventToCalendar`, `linkPaymentReminder` línea 716, `syncRsvpDeadlineReminder`).
- **Dominio — `src/domain/events.ts` (1727 líneas).** Funciones puras, sin llamadas a Supabase: gran parte del archivo (líneas ~1-750) son las plantillas de invitación (arte/imágenes, no lógica de negocio); el resto (desde ~línea 1050) son los cálculos reales: `computeEventStatusSummary`, `computeEventHealth`, `computeEventConclusions`, `countPaymentAlerts`, `pickNextMilestone`, `rankUpcomingTasks`, además de las plantillas estáticas de propuesta ("Organízamelo Pepa": `BUDGET_PLAN_TEMPLATES`, `MENU_PLAN_TEMPLATES`, `generateEventPlan`, líneas 274-357) — reglas fijas por tipo de evento, sin ninguna llamada a IA externa.
- **Tipos — `src/domain/types.ts`** (líneas 600-757 para lo relevante a esta auditoría): `FamilyEvent`, `EventBudgetItem`, `EventMenuItem`, `EventProvider`, `EventPayment`/`EventPaymentStatus`.

**Estado**: no hay store global (Redux/Zustand/Context) para los datos de Eventos. Cada componente hace su propio `useEffect` + `list*()` al montarse. Esto significa que **el mismo dato se pide varias veces de forma independiente** en la misma pantalla: `EventDetail.reloadDashboardStats()` (línea 732), `BudgetSection.reload()` (línea 2546), `PepaConclusions` (línea 4107) y `EndSummaryModal` (línea 4383) hacen, cada uno, su propia consulta a `listEventBudgetItems`/`listExpenses`/`listBudgetCategories` con la misma fórmula de cálculo repetida literalmente — ver sección 16 (deuda técnica).

**Conexión con Supabase**: directa, sin capa intermedia — cada función de `src/data/events.ts` llama a `supabase.from('tabla')...`. RLS activa en las 4 tablas clave de esta auditoría, una sola política `ALL` por tabla ("family crud"), confirmado con SQL real (`pg_policies`): `event_budget_items`, `event_payments`, `event_providers`, `event_menu_items` tienen cada una una única policy de alcance familiar, sin reglas especiales por rol.

**Punto de conexión con otros módulos de la app** (clave para todo lo que sigue): el único puente hacia **Economía** es la tabla `tags` compartida (`events.tag_id` ↔ `expenses.tag_id`); el único puente hacia **Compras** es `shopping_items.event_id` (nullable); el puente hacia **Calendario** es `calendar_event_id`/`reminder_calendar_event_id`/`rsvp_deadline_calendar_event_id`. No hay ningún otro acoplamiento estructural entre Eventos y el resto de la app.

---

## 2. Tablas

Confirmado con `list_tables` y `information_schema.columns` reales (proyecto `objhgjgrinbhyzscjlbw`), no asumido:

| Tabla | Columnas clave | Notas |
|---|---|---|
| `events` | `id, family_id, type, subtype, title, date_status, event_date, event_time, venue_label, venue_type, venue_latitude/longitude, ceremony_location_*, celebration_location_*, theme, details jsonb, enabled_modules text[], status, tag_id, calendar_event_id, rsvp_deadline, rsvp_deadline_calendar_event_id, open_rsvp_token, created_by, created_at, updated_at` | Raíz del módulo. `tag_id` es el único puente hacia Economía. `details` (jsonb) **no contiene ningún campo de presupuesto total** — confirmado por grep, no se usa para dinero. |
| `event_budget_items` | `id, event_id, family_id, category text, planned_amount numeric, sort_order, created_at` | Solo lo **planeado**. No tiene columna de gasto real ni de "comprometido". |
| `event_payments` | `id, event_id, family_id, provider_id (nullable), concept text, total_amount numeric, deposit_paid numeric, due_date, status text ('pendiente'/'parcial'/'pagado'), notes, reminder_calendar_event_id, created_at` | Cada fila lleva junto el coste total y lo ya pagado — no hay tabla de abonos/histórico de pagos parciales. |
| `event_providers` | `id, event_id, family_id, name, type text libre, contact_note, notes, created_at` | **Sin ninguna columna de coste/precio.** |
| `event_menu_items` | `id, event_id, family_id, name, category (nullable), quantity_note text libre (nullable), transferred boolean, sort_order, created_at` | `quantity_note` es texto libre, no cantidad numérica + unidad. `transferred` es el flag de "traspasado a Compras". |
| `custom_menu_items` | `family_id, label, icon, sort_order` | Catálogo genérico de ítems de menú de la familia, sin relación con un evento concreto. |
| `menu_entries` | `family_id, entry_date, meal_type, recipe_id (nullable), free_text, created_at` | Planificador de menú **semanal general** de la app. Sin `event_id`. No usado por Eventos (confirmado, 0 referencias cruzadas). |
| `recipe_ingredients` | `recipe_id, name, quantity text, unit text` | Ingredientes de una receta genérica. Sin `event_id`, no usado por Eventos. |
| `shopping_items` | `id, family_id, trip_id (nullable), name, quantity, unit, priority, status, price (nullable), event_id (nullable), store, sort_order` | Tabla **única** de compras, compartida entre Compras general y Compras de evento vía `event_id`. |
| `shopping_stores`, `shopping_trips` | `shopping_trips`: `family_id, scheduled_date, store, budget, actual_amount, status, member_id, calendar_event_id` | `shopping_trips` **no tiene `event_id`**, solo `calendar_event_id` (del Calendario general) — las compras de evento nunca pasan por un `shopping_trip`. |
| `expenses` | `id, family_id, expense_date, amount, category, store, kind, notes, is_income, budget_group, tag_id, source, is_fixed_override, owner_member_id, shared, shared_from_expense_id, product_classification` | **Sin `event_id` ni `provider_id`.** Tabla de Economía general. |
| `budgets`, `budget_categories` | Presupuesto mensual/periódico general de Economía | Sin relación con eventos. |
| `forecast_payments`, `forecast_payment_installments` | Previsión de pagos generales, con `calendar_event_id` (Calendario), `category_id`→`budget_categories`, `bank_account_id` | Sin relación con `events`/eventos de fiesta — solo con Calendario general. |
| `event_guests`, `event_guest_members`, `event_tables`, `event_tasks`, `event_decoration_items`, `event_favor_items`, `event_activities`, `event_special_details`, `event_gifts_received`, `event_day_plan_items`, `event_invitations`, `event_templates` | — | Otros submódulos de Eventos, fuera del foco de esta auditoría pero relevantes para el mapa de arquitectura (sección 1 y 10). |

Datos reales actuales (conteos, solo para contexto, vía SQL real): 6 `events`, 24 `event_budget_items`, 4 `event_payments`, 6 `event_providers`, 17 `event_menu_items`, 0 `shopping_items` con `event_id` no nulo en este momento — el uso real de "traspaso a Compras" en datos de producción es todavía bajo.

---

## 3. Relaciones

Confirmado con `information_schema` (foreign keys reales):

- `event_budget_items.event_id → events.id`
- `event_payments.event_id → events.id`; `event_payments.provider_id → event_providers.id` (nullable — **existe en el esquema pero no se usa desde la UI**, ver sección 8); `event_payments.reminder_calendar_event_id → calendar_events.id`
- `event_providers.event_id → events.id`
- `event_menu_items.event_id → events.id`
- `shopping_items.event_id → events.id` (nullable); `shopping_items.trip_id → shopping_trips.id` (nullable)
- `events.tag_id → tags.id`; `expenses.tag_id → tags.id` — **no hay FK directa `expenses → events`**, la relación es indirecta a través de `tags`, compartida entre ambos módulos.
- `events.calendar_event_id`, `events.rsvp_deadline_calendar_event_id → calendar_events.id`
- No existe ninguna FK entre `event_menu_items` y `shopping_items`: el vínculo entre una línea de menú y el producto de Compras que genera es **solo el nombre copiado por valor** en el momento del traspaso, más el `event_id` compartido — nunca una relación fila-a-fila (ver sección 6).
- `forecast_payments`/`forecast_payment_installments` no tienen ninguna FK hacia `events`, `event_payments` ni `event_providers` — su único vínculo con "eventos" es `calendar_event_id`, que apunta al Calendario general, un concepto distinto.

---

## 4. Presupuesto — auditoría a fondo

**Distinción real en el código (confirmada, con archivo y línea):**

- **PRESUPUESTADO** = `SUM(event_budget_items.planned_amount)` para ese `event_id`. Única fuente; no existe ningún campo `total_budget` en `events.details` ni en ninguna otra tabla (confirmado por grep en todo `src/`, sin resultados). Se recalcula en el cliente, con la misma fórmula `.reduce((sum, i) => sum + i.plannedAmount, 0)`, repetida literalmente en al menos 5 sitios: `BudgetSection` (`EventosScreen.tsx:2570`), dashboard del evento (`EventosScreen.tsx:783`), `PepaConclusions` (`EventosScreen.tsx:4116`), `EndSummaryModal` (`EventosScreen.tsx:4396`), `loadAllEventAlerts` (`src/data/events.ts:133`).
- **"COMPROMETIDO"**: este concepto **no existe en el código ni en la UI** (confirmado por grep, sin resultados). Lo más cercano es `event_payments.total_amount` (el coste total pactado con un proveedor), pero el código nunca lo llama "comprometido" ni lo suma al presupuesto — ver más abajo.
- **GASTADO** = `SUM(expenses.amount)` filtrado por `expenses.tag_id === events.tag_id`, excluyendo ingresos (`!isIncome`) y traspasos internos entre cuentas propias (`!isInternalTransferCategory`, definida en `src/domain/finance.ts`, compartida con toda la pantalla de Economía). Fórmula exacta, repetida literalmente en 6 sitios: `BudgetSection` (`EventosScreen.tsx:2557-2565`), dashboard (`EventosScreen.tsx:741-749`, con un comentario de auditoría previo ya dejado en el propio código: *"FASE 6D.3 — auditoría: este ... es el LADO DEL GASTO de un evento"*, líneas 738-740), `PepaConclusions` (`EventosScreen.tsx:4117-4121`), `EndSummaryModal` (`EventosScreen.tsx:4397-4403`), `loadAllEventAlerts` (`src/data/events.ts:134-137`). **"Gastado" NO incluye nunca `event_payments.total_amount`/`deposit_paid` ni `shopping_items.price`** — confirmado por ausencia total de esas columnas en los 6 cálculos citados.
- **PAGADO / PENDIENTE**: viven enteramente dentro de `event_payments`, como `remaining = totalAmount - depositPaid`, un concepto **completamente distinto y nunca combinado** con "Gastado". Misma fórmula en 4 sitios: `PaymentsSection` (`EventosScreen.tsx:2897`), `computeEventConclusions` (`src/domain/events.ts:1101`), `pickNextMilestone` (`src/domain/events.ts:1180`), `countPaymentAlerts` (`src/domain/events.ts:1282`).

**¿Se mezclan los conceptos?** No, en ningún punto encontrado. La separación es deliberada y está documentada en el propio código: el comentario de origen del diseño (visible en el texto de ayuda al usuario, `EventosScreen.tsx:2584-2586`) dice literalmente: *"Se suma solo lo etiquetado '{event.title}' en Economía — pon esa etiqueta a los gastos del evento para que cuenten aquí, sin duplicar nada."* Es una decisión de diseño consciente para **evitar** duplicar, al precio de dejar `event_payments` y `shopping_items.price` completamente fuera del cálculo de "Gastado" (ver riesgo en sección 13).

**Cuándo se recalcula**: 100% en el cliente, al montar/renderizar cada componente — no hay ningún trigger ni función SQL sobre estas tablas (confirmado por grep de `CREATE TRIGGER|CREATE FUNCTION` en las migraciones `0106_events_module_schema.sql` y `0108_event_deadline_reminders.sql`, únicas que tocan estas tablas). No hay caché ni columna materializada: si el usuario tiene abiertos el dashboard, `BudgetSection` y `PepaConclusions` a la vez, cada uno repite sus propias consultas.

**Cadena ORIGEN → ALMACENAMIENTO → CÁLCULO → PRESENTACIÓN:**

- **Presupuestado**: `AddBudgetItemModal` (`EventosScreen.tsx:2616-2668`) → `addEventBudgetItem()` (`src/data/events.ts:937-938`, insert en `event_budget_items.planned_amount`) → `listEventBudgetItems()` → `.reduce(...)` en 5 sitios → mostrado como "Planeado: X €" (`BudgetSection`, línea 2576) y como parte de "X € de Y €" (dashboard, línea 886 — el patrón literal "0,00 € de 5750,00 €" que se pedía localizar).
- **Gastado**: movimiento en Economía, etiquetado manualmente por el usuario con la etiqueta del evento (`findOrCreateEventTag`, `src/data/events.ts:166-180,197`) → tabla `expenses` (gestionada por `FinanceScreen`, nunca escrita desde Eventos) → `listExpenses()`+`listBudgetCategories()` leídas (no escritas) por Eventos → filtro+reduce (6 sitios) → mostrado como "Gastado en Economía: X €" y como numerador de "X € de Y €".
- **Pagado/Pendiente** (cadena independiente): `AddPaymentModal` (`EventosScreen.tsx:2947-3013`) → `addEventPayment()` (`src/data/events.ts:1106-1124`, insert en `event_payments.total_amount`/`deposit_paid`, con `status` autocalculado en el propio insert: `depositPaid<=0→'pendiente'`, `depositPaid>=totalAmount→'pagado'`, si no `'parcial'`, línea 1111) → `listEventPayments()` → `remaining = totalAmount - depositPaid` por pago → mostrado como "{total} € · pagado {depositPaid} € · pendiente {remaining} €" (línea 2906). **Esta cadena nunca confluye con la del "gastado".**

DECISIÓN PENDIENTE DE PACO: si se quiere que "Pagos y fianzas" cuente en el "Gastado" del Presupuesto (hoy no cuenta en absoluto), hace falta decidir el criterio: ¿contar `total_amount` (comprometido) al confirmarlo, o solo `deposit_paid` (desembolsado real)? Es una decisión de producto, no solo de código — ver Fase futura 1.

---

## 5. Pagos y fianzas

**Modelo real**: `EventPaymentStatus = 'pendiente' | 'parcial' | 'pagado'` (`src/domain/types.ts:742`). No existe ningún campo ni tipo que distinga "fianza" de "señal"/"anticipo"/pago normal — es puramente texto libre en `concept` (el formulario solo sugiere el placeholder *"Fianza del local..."*, `EventosScreen.tsx:2993`, pero es un ejemplo, no una categoría).

**Caso crítico pedido (proveedor cuesta 1.000 €, señal de 200 € ya pagada, ¿se suma 1.000+200=1.200 € en algún sitio?): NO, con certeza.** Se revisó exhaustivamente todo uso de `.totalAmount`/`.depositPaid` en `EventosScreen.tsx` y `domain/events.ts`. En TODOS los casos encontrados la operación es una **resta** (`totalAmount - depositPaid` = pendiente), nunca una suma:
- `EventosScreen.tsx:2897` (`PaymentsSection`, tarjeta individual de pago)
- `src/domain/events.ts:1101` (`computeEventConclusions`)
- `src/domain/events.ts:1180` (`pickNextMilestone`)
- `src/domain/events.ts:1282` (`countPaymentAlerts`)

No existe ningún `.reduce()` que sume `totalAmount` de varios pagos, ni que sume `depositPaid` de varios pagos, para producir un "gasto total" agregado del evento. Y — hallazgo más importante todavía — **`event_payments` no se usa nunca para calcular `budgetSpent`** (ver sección 4): el riesgo específico pedido no solo no existe, sino que **"Pagos y fianzas" está completamente desconectado del Presupuesto del evento**, en cualquier dirección. El botón "Marcar como pagado del todo" (`EventosScreen.tsx:2913`) solo hace `updateEventPayment(p.id, { depositPaid: p.totalAmount, status: 'pagado' })` — no crea ninguna fila en `expenses`.

**Riesgo real distinto** (de proceso, no de cálculo): si el usuario, al pagar a un proveedor, registra el gasto TANTO en `event_payments` COMO manualmente en `expenses` con la etiqueta del evento, esa cifra sí se duplicaría visualmente entre las tarjetas "Pagos y fianzas" y "Presupuesto" de la misma pantalla — pero por acción humana, sin ningún aviso o prevención en el código (no hay texto de ayuda en `PaymentsSection` equivalente al de `BudgetSection`).

**Consistencia del "pendiente"**: idéntica fórmula en las 4 ubicaciones citadas arriba — no hay ninguna variante. No existe un "resumen agregado por proveedor" (porque `providerId` no se usa desde la UI, ver sección 8), así que ese caso de consistencia no aplica todavía por no existir esa vista.

**Devolución de fianza**: **no existe** ese concepto, ni en código ni en base de datos (confirmado por grep de "devoluci.n.*fianza"/"refund"/"deposit_return" en todo `src/` — solo aparece un concepto homónimo y no relacionado: detección de devoluciones bancarias en Economía, `domain/refunds.ts`).

**Recordatorios de vencimiento**: sí existen y están conectados. `linkPaymentReminder` (`src/data/events.ts:716-737`) crea un `calendar_events` (título `Vence "{concept}" ({eventTitle})`, `all_day: true`), inserta recordatorios por defecto y enlaza de vuelta con `event_payments.reminder_calendar_event_id` (línea 735). Se dispara **solo manualmente** con el botón "🔔 Recordarme" (`EventosScreen.tsx:2918-2922`, visible solo si `dueDate && remaining>0 && !reminderCalendarEventId`) — no hay creación automática al añadir el pago, y **no se resincroniza si el `dueDate` cambia después de creado el recordatorio** (a diferencia del plazo de RSVP, que sí tiene `syncRsvpDeadlineReminder`).

---

## 6. Menú y compra

**"Sin traspasar" = `event_menu_items.transferred === false`**, confirmado literalmente en el código: `EventosScreen.tsx:889-890` (`const pending = menuItems.filter(i => !i.transferred).length`; texto `"${pending} sin traspasar"`), `EventosScreen.tsx:2700,2731`.

**El "menú del evento" es una isla, sin relación con recetas ni con el nº de invitados** — confirmado por grep sin resultados de `menu_entries`/`recipe_ingredients`/`adults_count` cerca de `event_menu_items` o `transferMenuToShopping` en `src/data/events.ts` y `EventosScreen.tsx`. `event_menu_items` son líneas de texto libre (`name`), sin relación estructural a `recipes`.

**No hay cálculo de cantidades por raciones/invitados, confirmado con certeza — y el campo que en teoría podría servir para eso ni siquiera se usa**: `quantityNote`/`category` existen en el esquema y en el tipo TS (`src/domain/types.ts:719-729`), y `addEventMenuItem` acepta ambos como parámetros opcionales (`src/data/events.ts:987`), pero **ningún punto de la UI los rellena nunca** — los dos únicos call-sites (`EventosScreen.tsx:2692`, formulario manual; `EventosScreen.tsx:4186`, "Organízamelo Pepa") solo pasan `name`. Tampoco existe `updateEventMenuItem` en `src/data/events.ts` (solo `list`/`add`/`delete`, líneas 977-1023): **no hay forma de editar una línea de menú ya creada**, solo borrar y volver a crear. Y el propio traspaso tira la cantidad al vacío con literales fijos: `src/data/events.ts:1013` — `addShoppingItem({ name: item.name, quantity: '', unit: '', priority: 'normal', tripId: null, eventId })` — `quantity_note` ni se lee ni se copia.

**Casos pedidos, con evidencia:**

- **(a) Traspasar dos veces**: el botón único traspasa TODOS los pendientes a la vez (`EventosScreen.tsx:2742-2746`) y se deshabilita mientras `transferring===true`; `transferMenuToShopping` (`src/data/events.ts:1009-1023`) relee la BD y filtra `!transferred` en cada llamada, así que repetir la llamada no duplica los mismos ítems ya marcados. **Pero sí hay un camino real de duplicado**: como no se puede editar una línea, la única forma de "corregir" un ítem es borrar y volver a crearlo — eso genera una fila nueva con `transferred:false` que, al traspasarse, crea un **segundo** `shopping_item` con el mismo nombre. Tampoco hay restricción de unicidad en `event_menu_items.name`: nada impide teclear "Tarta" dos veces desde el principio y traspasar ambas como líneas separadas.
- **(b) Cambia el nº de invitados tras traspasar**: sin efecto — no existe ninguna relación código entre `event_guests` y `event_menu_items`/el traspaso.
- **(c) Se edita una receta o plato tras traspasar**: no aplica "receta" (no hay vínculo a `recipes`); y "editar el plato" no es posible (no existe `updateEventMenuItem`). El `shopping_item` ya creado quedó desconectado desde el insert (copia por valor del nombre, sin FK).
- **(d) Se cambia `quantity_note` manualmente tras traspasar**: sin UI/API de edición, solo sería posible por SQL directo, y aun así no tendría ningún efecto observable — nada vuelve a leer `quantity_note` después del insert inicial.
- **(e) Se elimina un plato ya traspasado**: `deleteEventMenuItem` (`src/data/events.ts:1000-1003`) solo borra la fila de `event_menu_items`. No hay FK `shopping_items → event_menu_items` (solo `shopping_items.event_id → events.id`, `ON DELETE SET NULL`, migración `0075_guest_access_calendar_compras.sql:399-400`) — **confirmado: el `shopping_item` queda huérfano en Compras para siempre**, sin ningún aviso al borrar el plato del menú.
- **(f) Repetir el traspaso completo**: no-op inofensivo — `pending.length` vuelve a 0 y el botón deja de mostrarse.
- **(g) Dos platos con el mismo ingrediente**: no se agrupan ni se suman — no existe concepto de "ingrediente", solo nombres de línea libres; dos entradas con el mismo `name` generan dos `shopping_items` independientes (`src/data/events.ts:1012-1014`, bucle sin comprobación de nombres repetidos).
- **(h) El producto ya existe en Compras**: `addShoppingItem` (`src/data/shopping.ts:77-103`) es un `insert` puro, sin `select` previo por nombre — **siempre duplica, nunca fusiona**.

**Conclusión**: sí pueden aparecer duplicados (vía borrar+recrear, vía nombres repetidos manuales, o vía traspaso contra un producto ya existente en Compras), y no hay ningún cálculo real de cantidad necesaria — el sistema es, en la práctica actual, una lista de nombres de platos que se copian tal cual a Compras sin cantidad ni unidad.

---

## 7. Compras

**Sistema único y unificado, no dos sistemas paralelos** — confirmado con evidencia de código: la compra general de la app y la compra de un evento usan la **misma tabla `shopping_items`**, distinguida solo por `event_id` (nullable). Lo confirma la propia función de inserción, `addShoppingItem()` (`src/data/shopping.ts:77-103`), usada tanto por el traspaso de menú (`src/data/events.ts:1009-1014`) como por el de decoración (`src/data/events.ts:1259`) y actividades (`src/data/events.ts:1318`) — mismo mecanismo para las tres, con un comentario explícito en el código: *"event_id puesto para que el evento pueda ver luego qué falta comprar filtrando shopping_items sin tener que duplicar nada"* (`src/data/events.ts:1007-1008`).

**Reconstrucción del flujo, con estado real por tramo:**

| Tramo | Estado | Evidencia |
|---|---|---|
| MENÚ (`event_menu_items`) | EXISTE | `src/data/events.ts:960-1024` |
| INGREDIENTE/NECESIDAD | **NO EXISTE** como concepto real | No hay ingredientes ni cantidades calculadas — ver sección 6 |
| MENÚ → LISTA (`shopping_items.event_id`) | EXISTE | `transferMenuToShopping`, `src/data/events.ts:1009-1024`; botón `EventosScreen.tsx:2742-2746` |
| LISTA → PRODUCTO visible dentro del evento | PARCIAL | `EventShoppingSection` (`EventosScreen.tsx:1752-1791`) es **solo lectura**: nombre + "Pendiente"/"✓", nunca precio ni total; la gestión real redirige a `/compras` (línea 1786) |
| PRODUCTO → COMPRA (marcar comprado, opcionalmente con precio) | EXISTE, pero **desconectado del evento** | `updateShoppingItemStatus()` (`src/data/shopping.ts:141-149`) se llama desde `ShoppingScreen.tsx`, que **no filtra ni distingue por `event_id` en ningún punto** (confirmado, 0 referencias a `event`/`eventId` en todo el archivo) — comprado igual que cualquier producto de la casa, sin marca visual de a qué evento pertenece |
| COMPRA → TICKET (precio) | PARCIAL | El precio se guarda en `shopping_items.price` al marcar comprado, pero **nunca se lee de vuelta en el contexto del evento** — `EventShoppingSection` no lo muestra |
| TICKET → GASTO (`expenses`) | **NO EXISTE / MANUAL** | Ninguna llamada a `addExpense`/insert en `expenses` desde `src/data/shopping.ts` ni `src/data/events.ts` (confirmado por grep). Marcar un `shopping_item` como comprado no genera nada en Economía |
| GASTO → PRESUPUESTO DEL EVENTO | EXISTE, solo vía etiqueta manual | Mismo mecanismo de la sección 4/9: hay que darlo de alta a mano en Economía y etiquetarlo con la etiqueta del evento |

`shopping_trips` no tiene `event_id` (solo `calendar_event_id`, del calendario general) y las funciones de traspaso pasan siempre `tripId: null` — las compras de un evento de fiesta nunca pasan por un "viaje de compra" planificado, van sueltas.

**Riesgo real**: no es de doble contabilización automática (nunca se suma ninguna vez), sino de **desconexión**: el precio de una compra de evento es papel mojado a efectos de presupuesto salvo que el usuario repita el apunte a mano en Economía con la etiqueta correcta — y no hay ningún aviso en la app (`computeEventConclusions`/`PepaConclusions` no contemplan `shopping_items.price` en absoluto).

---

## 8. Proveedores

`event_providers` **no tiene ninguna columna de coste** (solo `name`, `type` texto libre — sin enum, confirmado por el input `<input type="text" placeholder="Catering, fotógrafo...">`, `EventosScreen.tsx:2843-2845` —, `contact_note`, `notes`).

**Cómo se asigna un coste a un proveedor, según el diseño de datos**: `event_payments.provider_id` existe para eso — `addEventPayment()` (`src/data/events.ts:1106-1124`) acepta `providerId` y lo escribe en `provider_id`.

**HALLAZGO CRÍTICO — ese vínculo está sin usar en la UI actual, confirmado con certeza**: `providerId` **no aparece en ningún sitio de `EventosScreen.tsx`** (grep sin resultados). El formulario real de alta de pago, `AddPaymentModal` (`EventosScreen.tsx:2947-3016`), solo pide `concept`, `totalAmount`, `depositPaid`, `dueDate` — **no hay ningún selector de proveedor**. En la práctica actual, todo pago se crea con `provider_id = null`; es imposible desde la UI de hoy decir "este pago de 800€ es el coste acordado con el catering X". `ProvidersSection` (línea 2755-2799) y `PaymentsSection` (línea 2864-2945) son dos listas visualmente independientes dentro del mismo evento, sin ningún cruce funcional.

**Reconstrucción PROVEEDOR → COSTE → SEÑAL → PENDIENTE → PRESUPUESTO → ECONOMÍA:**

| Tramo | Estado |
|---|---|
| Alta de proveedor | EXISTE (`AddProviderModal`, `EventosScreen.tsx:2801-2858`) |
| Proveedor → coste acordado (`event_payments.provider_id`) | **NO EXISTE en la práctica** — soportado en datos/esquema, sin UI |
| Coste → señal/pago parcial (`deposit_paid`) | EXISTE, `status` autocalculado correctamente en `addEventPayment` (`src/data/events.ts:1111`) |
| Pendiente → recordatorio de vencimiento | EXISTE (ver sección 5) |
| Pagos (`event_payments.total_amount`) → Presupuesto del evento | **NO EXISTE / DESCONECTADO** — confirmado en sección 4, nunca se suma a "Planeado" ni a "Gastado" |
| Coste proveedor → gasto en Economía | Manual, mismo mecanismo de etiqueta que en Compras/Presupuesto |

**Riesgo de doble contabilización a nivel proveedor**: no se puede confirmar porque **ni siquiera se cuenta una vez de forma automática** — `event_payments.total_amount` no entra en ningún cálculo de presupuesto. El riesgo real es de **infracontabilización por desconexión**, no de duplicación automática (mismo patrón que en pagos y compras).

**Documentos/facturas/tickets asociados al proveedor**: **no existen**. `event_providers` no tiene columna de documentos ni relación con ninguna tabla de adjuntos (confirmado por el `SELECT` real de la fila, solo `id, event_id, family_id, name, type, contact_note, notes, created_at`). La única tabla de "documentos" de la app es `member_documents` (con `document_categories`), ligada a `member_id` para documentación personal (DNI/pasaporte/carnet con caducidad) — sin relación alguna con `events`/`event_providers`/`event_payments`, confirmado también por SQL real (solo existen `member_documents` y `document_categories` entre las tablas `%document%`).

---

## 9. Economía

Confirmado: **la única conexión real entre Eventos y Economía es el sistema de etiquetas (`tags`)**, no una FK directa. `expenses` no tiene `event_id` ni `provider_id` (confirmado por esquema). Cada evento tiene su propia etiqueta (`events.tag_id`, creada/reutilizada por `findOrCreateEventTag`, `src/data/events.ts:166-180,197`), la misma tabla `tags` que usa `FinanceScreen` para etiquetar gastos manuales.

**Dirección del flujo**: de Economía hacia Eventos (agregación de solo lectura por `tag_id`), **nunca al revés de forma automática**. Un gasto siempre se da de alta en `FinanceScreen`/`addExpense` (`src/data/finance.ts`) o vía el webhook de tickets (`src/data/receipts.ts:191-205`) — nunca desde `src/data/events.ts` ni `EventosScreen.tsx` (confirmado por grep de `insertExpense|from('expenses').insert|addExpense` en todo `src/`: únicos resultados en `FinanceScreen.tsx` y `receipts.ts`). No hay ningún selector "vincular a evento" dentro de `FinanceScreen` (confirmado por ausencia total de referencias a `event_id`/`eventId`/`event_payments`/`event_providers` en `src/domain/finance*.ts`).

`event_budget_items` (presupuesto por evento) y `budgets` (presupuesto mensual general de Economía) son **totalmente independientes**: no hay ningún insert/update cruzado entre ambas tablas. `forecast_payments`/`forecast_payment_installments` tampoco tienen relación con Eventos — su único "event" es `calendar_event_id`, hacia el Calendario general.

**Riesgo de doble contabilización**: real pero de proceso, no estructural. Como el evento no tiene su propio registro de "gasto real" (solo agrega lo ya etiquetado en `expenses`), no hay duplicación estructural en la agregación por etiqueta en sí. El riesgo señalado en secciones 5, 7 y 8 es el mismo: si el usuario registra un pago/compra en `event_payments`/`shopping_items` y **además** lo anota a mano en Economía con la etiqueta del evento, esa cifra se contará una vez en "Gastado" — correcto — pero sin que el dashboard del evento avise de que "Pagos y fianzas" (200 €) y "Gastado en Economía" pudieran estar refiriéndose al mismo desembolso. Es un riesgo de UX/proceso, mitigado solo parcialmente con un texto de ayuda dentro de `BudgetSection` (línea 2584-2586), ausente en `PaymentsSection` y en `EventShoppingSection`.

**Hallazgo adicional (verificado directamente, no parte del encargo original de este apartado pero relevante para doble contabilización — ver también sección 13)**: `findOrCreateEventTag` (`src/data/events.ts:166-180`) **reutiliza una etiqueta existente si el nombre coincide exactamente** dentro de la familia+año (`tagYear` = año de `event_date`, o año actual si no hay fecha, línea 196). El propio código ya lo señala como riesgo conocido y no resuelto, en un comentario explícito (`src/data/events.ts:333-338`): *"dos eventos podrían compartirla [la etiqueta]"*. Esto es más grave de lo que parece porque `duplicateEvent()` (`src/data/events.ts:359-371`) copia el título tal cual y pone `eventDate: null` — si se duplica un evento dentro del mismo año de creación (caso normal), el duplicado **comparte automáticamente la misma etiqueta que el original**, y por tanto su cifra de "Gastado en Economía" queda mezclada con la del evento original desde el momento de la duplicación, sin que el usuario lo sepa. Esto sí es un riesgo confirmado de contabilización cruzada entre dos eventos (no dentro de un mismo evento) — ver sección 13.

---

## 10. Mapa completo del flujo

```
EVENTO (events, tag_id ──────────────────────────────────────┐
  │                                                            │ (única conexión a Economía:
  ├─ PRESUPUESTO (event_budget_items.planned_amount)           │  tags compartidas, sin FK directa)
  │     └─ "Planeado" = SUM(planned_amount)          [EXISTE]  │
  │     └─ "Gastado"  = SUM(expenses WHERE tag_id=event.tag_id)│
  │            [EXISTE, pero 100% manual/etiquetado] ──────────┘
  │            NUNCA incluye event_payments ni shopping_items.price
  │
  ├─ PROVEEDORES (event_providers: nombre/tipo/contacto, SIN coste)
  │     └─ provider_id en event_payments existe en el esquema
  │        pero NO se usa desde la UI            [DESCONECTADO]
  │
  ├─ PAGOS / FIANZAS (event_payments: total_amount, deposit_paid, status)
  │     └─ pendiente = total_amount - deposit_paid       [EXISTE, correcto]
  │     └─ recordatorio de vencimiento → calendar_events [EXISTE, manual]
  │     └─ devolución de fianza                          [NO EXISTE]
  │     └─ NUNCA se suma a Presupuesto (ni Planeado ni Gastado) [DESCONECTADO]
  │
  ├─ MENÚ (event_menu_items: name, quantity_note libre nunca usado, transferred)
  │     └─ SIN relación con recipes/recipe_ingredients/menu_entries [AISLADO]
  │     └─ SIN relación con nº de invitados (event_guests)          [AISLADO]
  │     └─ "sin traspasar" = transferred=false                      [EXISTE]
  │     └─ traspaso → shopping_items (quantity:'', unit:'' fijos)   [EXISTE, sin cantidades]
  │            sin deduplicación, sin FK de vuelta                   [RIESGO DUPLICADOS]
  │
  └─ COMPRAS (shopping_items.event_id, MISMA tabla que Compras general)
        └─ vista de solo lectura dentro del evento       [PARCIAL]
        └─ gestión real en /compras (ShoppingScreen)     [CIEGA al event_id]
        └─ price se guarda pero no se relee en el evento [PARCIAL]
        └─ marcar comprado → expenses                    [NO EXISTE]
        └─ expenses (con tag del evento) → Presupuesto   [EXISTE, solo manual]
```

---

## 11. Fuentes de verdad actuales

| Dato económico | Fuente de verdad HOY | Tabla/columna |
|---|---|---|
| Presupuesto total planeado del evento | `event_budget_items` | `SUM(planned_amount)` por `event_id` |
| Coste acordado con un proveedor | **No hay fuente estructurada** — solo texto libre en `event_payments.concept`/`notes`, sin vínculo real a `event_providers` (campo `provider_id` sin usar) | — |
| Importe pagado a un proveedor/fianza | `event_payments.deposit_paid` | Por fila de pago, no agregado por proveedor |
| Importe pendiente de un pago | Calculado, no almacenado: `total_amount - deposit_paid` | `event_payments` |
| Gasto real del evento ("Gastado") | `expenses` filtrado por `tag_id` | `expenses.amount` donde `tag_id = events.tag_id` |
| Ticket/compra de un producto del evento | `shopping_items.price` (si se rellena al marcar comprado) — **no conectado a "Gastado"** | `shopping_items.price` |
| Cantidad de producto necesaria | **No existe fuente fiable** — `quantity_note` nunca se rellena en la práctica, y el traspaso lo ignora aunque existiera | `event_menu_items.quantity_note` (vacío en la práctica) |

---

## 12. Duplicaciones

- El cálculo de "Gastado en Economía" (`expenses.filter(tagId...).reduce(...)`) está **literalmente duplicado 6 veces** en el código (`BudgetSection`, dashboard, `PepaConclusions`, `EndSummaryModal`, `loadAllEventAlerts`), en vez de vivir en una única función compartida — riesgo de que una futura corrección se aplique en un sitio y se olvide en otro (ver sección 16).
- El cálculo de "Planeado" (`.reduce(plannedAmount)`) está duplicado igual, 5 veces.
- `event_menu_items.category`/`quantity_note` son columnas vivas en el esquema pero **muertas en la práctica de la UI** (nunca se rellenan ni se muestran) — no es una duplicación de dato, pero sí de intención de diseño vs. implementación real.
- No hay duplicación de tablas (a diferencia de lo señalado en memoria del proyecto para `budget_categories` de Economía general, que no es parte de este módulo).

---

## 13. Riesgos de doble contabilización

1. **NO confirmado** el riesgo específico pedido (sumar `total_amount + deposit_paid` de un pago) — se revisó con certeza, todas las operaciones son restas (ver sección 5). **Confirmado en sentido contrario: no existe ningún riesgo porque `event_payments` no se suma nunca a nada agregado.**
2. **Confirmado — colisión de etiqueta entre dos eventos**: `findOrCreateEventTag` reutiliza la etiqueta por nombre exacto (`src/data/events.ts:166-180`), y `duplicateEvent()` (`src/data/events.ts:359-371`) crea una copia con el mismo título y sin fecha (→ mismo año de creación) — dos eventos así **comparten literalmente el mismo `tag_id`**, y por tanto su "Gastado en Economía" queda cruzado entre ambos sin aviso. Riesgo real de doble contabilización **entre eventos**, confirmado por el propio comentario del código (`src/data/events.ts:333-338`).
3. **Riesgo de proceso (no de código)**: un usuario que registre el mismo pago/compra tanto en `event_payments`/`shopping_items` como en `expenses` (con la etiqueta del evento) duplicaría esa cifra en "Gastado" sin que la app lo detecte ni avise — el único texto preventivo existente vive solo en `BudgetSection` (línea 2584-2586), ausente en `PaymentsSection`/`EventShoppingSection`.

---

## 14. Riesgos de duplicados

1. **Confirmado — traspaso Menú → Compras**: sin deduplicación por nombre (`addShoppingItem` es un insert puro, `src/data/shopping.ts:77-103`), y sin restricción de unicidad en `event_menu_items.name` — teclear el mismo plato dos veces, o borrar+recrear un plato ya traspasado, genera productos duplicados en Compras (ver sección 6, casos a/g/h).
2. **Confirmado — huérfanos al borrar un plato ya traspasado**: `deleteEventMenuItem` no toca `shopping_items`; no hay FK entre ambas tablas — el producto queda en Compras indefinidamente sin ningún rastro de su origen ya borrado (sección 6, caso e).
3. **Mismo patrón en Decoración y Actividades**: `transferDecorationItemToShopping` (`src/data/events.ts:1259`) y `transferActivityMaterialsToShopping` (línea 1318) usan la misma `addShoppingItem` sin deduplicación — no auditado a fondo en esta ronda (fuera del alcance de las 5 áreas), pero mismo patrón de riesgo, útil como referencia para la Fase futura 3.

---

## 15. Funcionalidades desconectadas

1. **`event_payments.provider_id`**: existe en esquema y en la capa de datos (`addEventPayment` lo acepta), pero **ninguna pantalla lo usa** — funcionalidad a medio construir (sección 8).
2. **`event_payments` ↔ Presupuesto del evento**: pagos y fianzas registrados no aparecen nunca en "Planeado"/"Gastado" del evento (sección 4/5).
3. **`shopping_items.price` de un evento ↔ Presupuesto del evento**: el precio de una compra de evento no llega nunca al cálculo de "Gastado" (sección 7).
4. **`EventShoppingSection` es de solo lectura y sin precio**, mientras que `ShoppingScreen.tsx` (donde de verdad se gestiona el precio y el estado) es ciega a `event_id` — dos vistas de la misma tabla que no se hablan entre sí (sección 7).
5. **`event_menu_items.category`/`quantity_note`**: campos definidos en tipo y esquema, sin ningún punto de la UI que los rellene ni los muestre (sección 6).
6. **Devolución de fianza**: mencionada como caso a auditar, confirmado que no existe ni como campo ni como flujo (sección 5).

---

## 16. Deuda técnica relevante para estas 5 áreas

1. **Cálculo de "Gastado"/"Planeado" duplicado 6 y 5 veces respectivamente**, con la misma fórmula literal copiada en vez de extraída a una función compartida en `src/domain/events.ts` (que sí existe para otros cálculos como `computeEventStatusSummary`). Riesgo de divergencia si se corrige un caso y se olvida otro.
2. **Sin capa de estado compartido**: cada sección (`BudgetSection`, `PaymentsSection`, `MenuSection`, `ProvidersSection`, dashboard) hace su propio fetch independiente al montarse — múltiples round-trips redundantes a Supabase por la misma pantalla.
3. **Sin función `updateEventMenuItem`**: la única forma de editar una línea de menú es borrar y recrear, lo que además genera el riesgo de duplicado ya señalado (sección 6/14).
4. **`event_payments`/`shopping_items` sin ninguna prevención de doble apunte manual** en Economía — un solo texto de ayuda (`BudgetSection`) cubre parcialmente el problema, pero no se repite en las secciones donde también aplicaría.
5. **`findOrCreateEventTag` reutiliza etiquetas por nombre exacto sin comprobar si ya pertenece a otro evento activo** — riesgo de colisión ya señalado en el propio código pero no mitigado (sección 9/13).
6. **`EventProvider` sin campo de coste** obliga a que cualquier futura función de "coste acordado por proveedor" pase por rediseñar el flujo de `event_payments`, no solo añadir una columna.

---

## 17. Plan futuro por las cinco fases acordadas

Criterio general: **no se propone reescribir ningún módulo desde cero** — la arquitectura de tabla-por-concepto + traspasos explícitos ya es razonable y aprovechable; los problemas son de piezas que faltan (UI de vínculo, deduplicación, un cálculo compartido), no de diseño equivocado de fondo.

### FASE FUTURA 1 — PRESUPUESTO

- **Situación actual**: Planeado = `event_budget_items`; Gastado = `expenses` por etiqueta, sin incluir pagos/compras del evento (sección 4).
- **Problemas**: fórmula de "Gastado" duplicada 6 veces; "Pagos y fianzas" y "Compras" no alimentan el presupuesto; no existe concepto de "Comprometido".
- **Archivos afectados**: `src/ui/EventosScreen.tsx` (`BudgetSection` 2540-2614, dashboard 732-790, `PepaConclusions` 4104-4149, `EndSummaryModal` 4375-4454), `src/data/events.ts` (`loadAllEventAlerts` ~118-152), `src/domain/events.ts` (añadir un `computeEventBudgetSpent` compartido).
- **Tablas afectadas**: `event_budget_items`, `expenses` (lectura), potencialmente `event_payments`/`shopping_items` si se decide incluirlos.
- **Funciones afectadas**: extraer la fórmula repetida a una única función en `src/domain/events.ts`; decidir si se crea un `computeEventBudgetSpent(budgetItems, expenses, payments, shoppingItems)` que unifique las 3 fuentes o se mantiene el diseño actual "solo Economía cuenta".
- **Dependencias**: Fase 2 (Pagos) y Fase 4 (Compras) si se decide incluir esas fuentes en "Gastado".
- **¿Migración necesaria?**: NO para consolidar el cálculo existente (solo refactor de código). SÍ si se decide, por ejemplo, materializar un total en `events` o crear una vista SQL.
- **Riesgo**: medio — tocar el cálculo de "Gastado" afecta a 6 sitios de la UI a la vez; requiere tests de regresión antes de tocarlo.
- **Tests necesarios**: test unitario para la función de cálculo unificada, cubriendo exclusión de ingresos/traspasos internos; test de que los 6 puntos de consumo obtienen el mismo número.
- **Criterios de aceptación**: un único punto de cálculo de "Gastado"/"Planeado"; comportamiento observable idéntico al actual salvo que se decida explícitamente incluir pagos/compras (DECISIÓN PENDIENTE DE PACO: ¿debe "Gastado" incluir `event_payments.deposit_paid` y/o `shopping_items.price` de forma automática, o se mantiene el diseño actual "solo lo etiquetado en Economía cuenta"?).

### FASE FUTURA 2 — PAGOS Y FIANZAS

- **Situación actual**: `event_payments` funciona correctamente para su propio cálculo interno (pendiente = total − pagado), pero vive aislado del resto del evento; `provider_id` sin usar; sin concepto de fianza/devolución (sección 5, 8).
- **Problemas**: no se puede vincular un pago a un proveedor desde la UI; no hay "devolución de fianza"; el recordatorio de vencimiento no se resincroniza si cambia la fecha.
- **Archivos afectados**: `src/ui/EventosScreen.tsx` (`AddPaymentModal` 2947-3016, `PaymentsSection` 2864-2945, `ProvidersSection` 2755-2799), `src/data/events.ts` (`addEventPayment`/`updateEventPayment` 1106-1133, `linkPaymentReminder` 716-737).
- **Tablas afectadas**: `event_payments` (añadir selector de `provider_id` en la UI, sin cambio de esquema — la columna ya existe); si se quiere "devolución de fianza", posible nueva columna o tabla (`is_deposit boolean`, o `deposit_returned_amount`/`deposit_returned_at`).
- **Funciones afectadas**: `AddPaymentModal` (añadir `<select>` de proveedor), `AddProviderModal`/`ProvidersSection` (mostrar total pagado/pendiente por proveedor agregando `event_payments` por `provider_id`).
- **Dependencias**: Fase 5 (Proveedores) — el vínculo pago↔proveedor es compartido entre ambas fases.
- **¿Migración necesaria?**: NO para el selector de proveedor (columna ya existe). SÍ si se añade el concepto estructurado de fianza/devolución.
- **Riesgo**: bajo para el selector de proveedor (aditivo, no rompe nada existente); medio si se añade lógica de devolución de fianza (nuevo estado a mantener consistente con `status`).
- **Tests necesarios**: test de que un pago con `provider_id` se refleja en el resumen del proveedor; test de que pagos sin proveedor (histórico existente) siguen funcionando igual.
- **Criterios de aceptación**: se puede crear un pago y elegir su proveedor desde la UI; `ProvidersSection` muestra el total pagado/pendiente agregado por proveedor. DECISIÓN PENDIENTE DE PACO: si "fianza" merece un campo/estado propio distinto de un pago normal, o basta con seguir usando texto libre en `concept`.

### FASE FUTURA 3 — MENÚ Y COMPRA

- **Situación actual**: líneas de menú sin cantidad real, sin relación a invitados/recetas, traspaso sin deduplicación, sin edición (sección 6).
- **Problemas**: duplicados fáciles de crear (borrar+recrear, nombres repetidos, traspaso repetido contra Compras general), huérfanos al borrar un plato ya traspasado, cantidad/unidad siempre vacías al traspasar.
- **Archivos afectados**: `src/ui/EventosScreen.tsx` (`MenuSection` 2674-2749), `src/data/events.ts` (`addEventMenuItem` 987-997, `transferMenuToShopping` 1009-1023, falta `updateEventMenuItem`).
- **Tablas afectadas**: `event_menu_items` (usar de verdad `quantity_note`/`category`, o sustituir `quantity_note` por columnas numéricas `quantity`+`unit` si se quiere cálculo real), `shopping_items` (pasar `quantity_note` real al traspasar en vez de `''`).
- **Funciones afectadas**: añadir `updateEventMenuItem`; modificar `transferMenuToShopping` para (a) copiar la cantidad real, (b) comprobar si ya existe un `shopping_item` con ese nombre y `event_id` antes de insertar.
- **Dependencias**: Fase 4 (Compras) — cualquier cambio en el traspaso afecta directamente al flujo de compras.
- **¿Migración necesaria?**: SÍ si se decide pasar `quantity_note` (texto) a columnas numéricas estructuradas para permitir multiplicar por raciones/invitados; NO si se decide simplemente empezar a usar el campo de texto libre que ya existe y añadir deduplicación (cambio de código únicamente).
- **Riesgo**: bajo-medio — el traspaso ya es idempotente a nivel de "no repetir los mismos pendientes"; el riesgo está en decidir bien la deduplicación por nombre sin bloquear casos legítimos (dos "Tarta" distintas a propósito).
- **Tests necesarios**: test de traspaso con ítems duplicados por nombre; test de que borrar un plato avisa/limpia el `shopping_item` asociado (si se decide implementar ese enlace); test de edición de una línea de menú.
- **Criterios de aceptación**: se puede editar una línea de menú sin borrar/recrear; el traspaso avisa (o fusiona) si el nombre ya existe en Compras para ese evento. DECISIÓN PENDIENTE DE PACO: ¿merece la pena construir cálculo real de cantidad por raciones/invitados (cambio de modelo de datos), o basta con que el texto libre se traspase de verdad (cambio menor)?

### FASE FUTURA 4 — COMPRAS

- **Situación actual**: sistema técnicamente unificado (`shopping_items.event_id`) pero funcionalmente cojo — vista de evento de solo lectura sin precio, `ShoppingScreen.tsx` ciega al evento de origen, sin conexión a `expenses` (sección 7).
- **Problemas**: no se puede gestionar (marcar comprado, ver precio) una compra de evento sin salir a la pantalla general de Compras y perder el contexto; ningún aviso de qué evento originó un producto en la lista general.
- **Archivos afectados**: `src/ui/EventosScreen.tsx` (`EventShoppingSection` 1752-1791), `src/ui/ShoppingScreen.tsx` (añadir badge/filtro por `event_id`), `src/data/shopping.ts` (`updateShoppingItemStatus` 141-149 ya soporta precio, solo falta exponerlo en la vista de evento).
- **Tablas afectadas**: ninguna columna nueva necesaria — `shopping_items.event_id`/`price` ya existen y están sin explotar del todo.
- **Funciones afectadas**: `EventShoppingSection` (mostrar precio, permitir marcar comprado sin salir del evento); `ShoppingScreen.tsx` (mostrar de qué evento viene un producto, si tiene `event_id`).
- **Dependencias**: Fase 1 (Presupuesto) si se decide que el precio de compra alimente "Gastado" automáticamente.
- **¿Migración necesaria?**: NO — es trabajo de UI sobre columnas ya existentes.
- **Riesgo**: bajo — aditivo, no cambia el modelo de datos.
- **Tests necesarios**: test de que marcar comprado desde la vista de evento actualiza correctamente `shopping_items`; test de que el precio se refleja en la vista de evento.
- **Criterios de aceptación**: se puede ver y marcar el precio de una compra de evento sin salir de la pantalla del evento; en Compras general se distingue visualmente qué productos pertenecen a un evento. DECISIÓN PENDIENTE DE PACO: si al marcar una compra de evento como comprada con precio, debe proponerse (no forzarse) crear automáticamente el gasto correspondiente en Economía ya etiquetado — cambiaría el diseño actual "solo etiquetado manual cuenta".

### FASE FUTURA 5 — PROVEEDORES

- **Situación actual**: sin campo de coste, sin vínculo funcional a `event_payments` pese a que el esquema lo soporta, sin documentos/facturas asociadas (sección 8).
- **Problemas**: no se puede responder hoy "¿cuánto le debo a este proveedor en total?" desde la ficha del proveedor.
- **Archivos afectados**: `src/ui/EventosScreen.tsx` (`ProvidersSection` 2755-2799, `AddProviderModal` 2801-2858), `src/data/events.ts` (`addEventProvider`/`listEventProviders` 1029-1065).
- **Tablas afectadas**: `event_providers` (sin cambio necesario si el coste vive en `event_payments`); si se quiere un "coste acordado" propio del proveedor independiente de un pago concreto, hace falta una columna nueva (`agreed_cost numeric` o similar).
- **Funciones afectadas**: `ProvidersSection` (agregar `event_payments` por `provider_id` para mostrar total/pagado/pendiente por proveedor) — depende directamente de resolver primero el selector de proveedor en Fase 2.
- **Dependencias**: Fase 2 (Pagos) — es la misma pieza de trabajo vista desde el otro lado.
- **¿Migración necesaria?**: NO si el coste sigue viviendo en `event_payments.total_amount` (ligado por `provider_id`, ya soportado); SÍ si se decide añadir un campo de coste directamente en `event_providers`.
- **Riesgo**: bajo — mismo cambio aditivo que en Fase 2.
- **Tests necesarios**: test de agregación de pagos por proveedor; test de proveedor sin pagos asociados (caso vacío).
- **Criterios de aceptación**: la ficha de un proveedor muestra el total acordado/pagado/pendiente calculado a partir de sus `event_payments`. DECISIÓN PENDIENTE DE PACO: si además hace falta poder adjuntar documentos/facturas al proveedor (funcionalidad hoy inexistente en toda la app para este caso, ni siquiera reutilizando `member_documents`), o queda fuera de alcance.

---

### Nota final de método

Todos los hallazgos anteriores están respaldados por lectura directa de código (archivo y línea citados) y por el esquema real de Supabase obtenido con `list_tables`/`execute_sql` de solo lectura. Donde no se pudo confirmar algo con certeza, se ha dicho explícitamente en el texto en vez de suponerlo. No se ha tocado ningún archivo de código ni se ha aplicado ninguna migración durante esta auditoría.
