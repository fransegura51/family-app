// Tipos de dominio — reflejan el esquema de supabase/migrations, sin
// depender de ningún framework de UI.

import type { EventReminder } from '@/domain/reminders'

// "guest" = invitado externo a la familia (Skill de invitados): tiene
// su propia cuenta pero solo ve las secciones marcadas en
// allowedSections, pensado para preparar la app de cara a compartirla
// con otras personas/familias en el futuro. "child" es el mismo
// mecanismo aplicado a un hijo con su propia cuenta — a diferencia de
// "guest", Economía (/dinero) se le queda visible en el menú aunque no
// esté en su allowedSections, porque ahí vive también Educación
// financiera (ver NavShell).
export type MemberType = 'admin' | 'adult' | 'child' | 'baby' | 'guest'
export type FamilyRole = 'admin' | 'adult' | 'guest' | 'child'

export interface Family {
  id: string
  name: string
  createdAt: string
}

export interface Profile {
  id: string
  familyId: string
  role: FamilyRole
  displayName: string
  // null = acceso a todas las secciones (admin/adult de siempre); un
  // invitado tiene aquí la lista de rutas de NAV_TABS (sin la barra
  // inicial, p. ej. "galeria") a las que puede entrar.
  allowedSections: string[] | null
}

// Sexo del miembro — solo se usa para las curvas de crecimiento de la OMS
// (las de niños y niñas son distintas). Opcional.
export type MemberSex = 'female' | 'male'

export interface FamilyMember {
  id: string
  familyId: string
  name: string
  avatar: string
  color: string
  memberType: MemberType
  birthDate: string | null
  sex: MemberSex | null
  weightGoalKg: number | null
  birthdayFavorite: boolean
  permissions: Record<string, unknown>
  linkedProfileId: string | null
  photoPath: string | null
  allowedSections: string[] | null
  // Piso compartido: petición real — "lo anterior a la llegada de
  // Jenny... debería repartirse a partes iguales entre los que ya
  // estuvieron y lo posterior se reparte con uno más". Fecha en que
  // este miembro se creó — el reparto de "Saldo entre personas" solo
  // cuenta a alguien para un gasto si ya existía en esa fecha (ver
  // SharedBalanceCard en FinanceScreen.tsx).
  joinedAt: string
}

export interface Reward {
  id: string
  familyId: string
  title: string
  pointsCost: number
}

export interface RewardRedemption {
  id: string
  rewardId: string
  memberId: string
  pointsSpent: number
  redeemedAt: string
}

export type ShoppingItemStatus = 'pendiente' | 'comprado' | 'omitido' | 'trasladado'
export type ShoppingItemPriority = 'alta' | 'normal' | 'baja'
export type TripStatus = 'planificada' | 'completada'
export type InventoryCategory =
  | 'frigorifico'
  | 'congelador'
  | 'despensa'
  | 'limpieza'
  | 'higiene'
  | 'bebe'
  | 'otros'

export interface ShoppingTrip {
  id: string
  familyId: string
  scheduledDate: string | null
  store: string | null
  budget: number | null
  actualAmount: number | null
  status: TripStatus
  memberId: string | null
  calendarEventId: string | null
}

export interface ShoppingItem {
  id: string
  familyId: string
  tripId: string | null
  // La columna ya existía (addShoppingItem la escribe al traspasar
  // desde Eventos) pero nunca se leía de vuelta — petición real:
  // dashboard de Eventos, tarjeta "Compras" con los pendientes de ESE
  // evento en concreto.
  eventId: string | null
  name: string
  quantity: string | null
  unit: string | null
  priority: ShoppingItemPriority
  status: ShoppingItemStatus
  store: string | null
  sortOrder: number
  price: number | null
}

// Tiendas conocidas de la familia (Mercadona, Aldi...) para que Pepa las
// reconozca por voz con fiabilidad — editable por la familia, no una
// lista fija en el código (petición real: "que puedas añadir los
// supermercados que quieras o quitar los que quieras... si vendo la
// aplicación y otra persona tiene Carbo Bravo, que pueda cambiarlo").
export interface ShoppingStoreEntry {
  id: string
  familyId: string
  name: string
  createdAt: string
  // Vínculo opcional a una cadena global conocida (store_chains.key) — null = tienda personalizada.
  chainKey: string | null
}

export interface InventoryItem {
  id: string
  familyId: string
  name: string
  category: InventoryCategory
  quantity: string | null
}

export type MealType = 'desayuno' | 'comida' | 'merienda' | 'cena' | 'snack'

export interface RecipeIngredient {
  id: string
  name: string
  quantity: string | null
  unit: string | null
}

export interface Recipe {
  id: string
  familyId: string
  title: string
  notes: string | null
  imagePath: string | null
  tags: string[]
  ingredients: RecipeIngredient[]
}

export interface MenuEntry {
  id: string
  familyId: string
  entryDate: string
  mealType: MealType
  recipeId: string | null
  freeText: string | null
}

export interface BodyMeasurement {
  id: string
  familyId: string
  memberId: string
  measuredDate: string
  weightKg: number | null
  waistCm: number | null
  abdomenCm: number | null
  armCm: number | null
  legCm: number | null
  heightCm: number | null
  headCm: number | null
}

export interface BodyPhoto {
  id: string
  familyId: string
  memberId: string
  photoDate: string
  storagePath: string
  caption: string | null
  createdAt: string
}

export type ExpenseKind = 'real' | 'estimado' | 'previsto'
export type BudgetPeriod = 'mensual' | 'semanal'
export type WalletTransactionType = 'ingreso' | 'ahorro' | 'gasto' | 'impuesto'

// Skill de Pepa, punto 22: de dónde sale el movimiento — "banco" y
// "ticket_banco" están preparados para cuando se conecte el banco
// (todavía no hay datos reales de esa fuente).
export type ExpenseSource = 'manual' | 'ticket' | 'banco' | 'ticket_banco'

export interface Expense {
  id: string
  familyId: string
  expenseDate: string
  amount: number
  // NULL = categoría financiera todavía desconocida («Pendiente de clasificar»). Sigue siendo un gasto REAL: cuenta en los totales,
  // pero no pertenece a ninguna categoría (ni «Otros»). Fase 6C.2A: la base ya lo admite; aún nada lo produce.
  category: string | null
  store: string | null
  kind: ExpenseKind
  notes: string | null
  // Un ingreso (nómina, paga extra...) reutiliza la misma tabla de
  // gastos con esta marca — petición real: "gráficos de estadísticas
  // total ingresos".
  isIncome: boolean
  // A qué presupuesto pertenece (solo importa de verdad para los
  // ingresos) — petición real: "los ingresos tienen que ser
  // diferentes [entre Alimentación y Generales]... no quiero que se
  // sumen".
  budgetGroup: BudgetGroup
  // Etiqueta libre del usuario (Eric, Vacaciones...) — Skill de Pepa:
  // independiente de la categoría, una por movimiento.
  tagId: string | null
  source: ExpenseSource
  // Petición real: "quiero que yo pueda seleccionar cada gasto, si es
  // fijo o es variable" — null = se calcula de la categoría como
  // siempre (resolveCategoryClassification); true/false = este
  // movimiento en concreto manda por encima de su categoría.
  isFixedOverride: boolean | null
  // Piso compartido: de quién es / quién pagó este gasto. null = cuenta
  // o bolsillo Común, visible para todos siempre (misma convención que
  // bank_accounts.ownerMemberId).
  ownerMemberId: string | null
  // Si este gasto entra en el bote común (modo Cuentas Separadas) —
  // siempre true cuando ownerMemberId es null.
  shared: boolean
  // Si esta fila es una copia compartida, el gasto privado original del
  // que se copió — solo informativo (evita copias duplicadas), nunca
  // sincroniza cambios entre las dos filas.
  sharedFromExpenseId: string | null
  // Clase de producto (Ropa y calzado, Verdura...) puesta a mano
  // directamente sobre el gasto — para un cobro de banco sin ticket
  // detrás (sin filas en product_prices), donde no hay ningún producto
  // al que atribuírsela. Ver family_food_types / setProductFoodType,
  // mismo criterio pero a nivel de gasto entero en vez de producto.
  productClassification: string | null
}

// "alimentacion" | "generales" — separa las dos pestañas de
// presupuesto (Presupuesto Alimentación / Presupuesto Generales) sin
// que dejen de sumarse juntas en las estadísticas ("que todos los
// presupuestos estén conectados").
export type BudgetGroup = string

export interface Budget {
  id: string
  familyId: string
  periodType: BudgetPeriod
  periodStart: string
  category: string | null
  amount: number
  budgetGroup: BudgetGroup
  // Piso compartido: null = presupuesto Común, visible para todos.
  ownerMemberId: string | null
}

// Categoría de presupuesto con icono — petición real: "que se puedan
// crear categorías, algo como lo de la foto" (Salario 👔, Comestibles
// 🛒, Entretenimiento 🍿, Vivienda 🏠...).
// Skill de Pepa, punto 10: dos niveles — una categoría con parentId es
// subcategoría de la que apunta parentId.
export interface BudgetCategory {
  id: string
  familyId: string
  name: string
  icon: string
  budgetGroup: BudgetGroup
  sortOrder: number
  parentId: string | null
  // Skill de Pepa, puntos 15/16 — automática de fábrica según
  // estándares contables habituales, por categoría (no por
  // movimiento), editable después por la familia. Null cuando no
  // aplica o no se puede saber sin inventar (Ingresos, Ahorro,
  // Movimientos internos, Otros).
  necessity: 'debo' | 'necesito' | 'quiero' | null
  isFixed: boolean | null
  // Clave estable del catálogo PEPA (null = categoría personal de la familia, sin equivalente en el catálogo). Identidad ESTABLE de
  // una categoría más allá de su nombre visible — ver domain/refunds.ts (isRefundCategory) para el primer uso real.
  catalogKey: string | null
}

// Etiquetas creadas por el usuario (Skill de Pepa, punto 11) —
// independientes de categoría/subcategoría, sin lista cerrada.
export interface Tag {
  id: string
  familyId: string
  name: string
  color: string
  sortOrder: number
}

// Accesos libres del menú ☰ (petición real: menú tipo Wallet con
// "todas las subcarpetas", editable) — de momento solo nombre + icono,
// sin pantalla real detrás todavía.
export interface CustomMenuItem {
  id: string
  familyId: string
  label: string
  icon: string
  sortOrder: number
}

export interface KidWalletTransaction {
  id: string
  familyId: string
  memberId: string
  type: WalletTransactionType
  amount: number
  description: string
  createdAt: string
}

export interface KidGoal {
  id: string
  familyId: string
  memberId: string
  title: string
  targetAmount: number
}

export type AutomationTriggerType = 'llegada' | 'salida' | 'hora_diaria'

export interface LocationPlace {
  id: string
  familyId: string
  name: string
  // Etiqueta libre puesta por la familia ("Trabajo", "Casa madre"...) — null = sin categoría.
  category: string | null
  latitude: number
  longitude: number
  radiusM: number
  // Avisar (notificación) cuando alguien llegue o se vaya de aquí, estilo Google Maps — por dentro
  // gestiona dos automation_rules ocultas (ver data/location.ts, setPlaceNotifyArrivals).
  notifyArrivals: boolean
}

export interface LocationConsent {
  memberId: string
  familyId: string
  enabled: boolean
}

export interface MemberLocation {
  memberId: string
  familyId: string
  latitude: number
  longitude: number
  recordedAt: string
}

// Rastro de las últimas 24h (ver member_location_history) — cada punto
// registrado, no solo el último, para poder dibujar la ruta en el mapa.
export interface MemberLocationPoint {
  id: string
  memberId: string
  familyId: string
  latitude: number
  longitude: number
  recordedAt: string
}

// Historial de SITIOS visitados (no el rastro GPS en crudo, que se
// purga a las 24h por privacidad — ver MemberLocationPoint) — una fila
// por parada real, con el nombre del sitio ya reconocido (lugar
// guardado por la familia, o buscado automáticamente en el mapa).
// Petición real: "un desplegable con los sitios en los que ha estado
// cada día... el historial por día, semana o mes".
export interface LocationPlaceVisit {
  id: string
  familyId: string
  memberId: string
  placeName: string
  latitude: number
  longitude: number
  arrivedAt: string
  leftAt: string | null
}

export interface AutomationRule {
  id: string
  familyId: string
  name: string
  triggerType: AutomationTriggerType
  memberId: string | null
  placeId: string | null
  timeOfDay: string | null
  message: string
  active: boolean
  mutedUntil: string | null
}

export interface Product {
  id: string
  familyId: string
  normalizedName: string
  displayName: string
  category: string | null
  brand: string | null
  nonFood: boolean
  // NOT NULL = `category` es una decisión explícita de la familia (manual); NULL = la clase se resuelve dinámicamente
  // (aprendizaje compartido → clase histórica → reglas). Ver domain/productClass.ts.
  classConfirmedAt: string | null
  // Conjunto (alimentación / no alimentos) de la clase guardada en `category`, SOLO si esa clase existe entre las de la familia;
  // null/undefined = sin clase conocida (entonces `nonFood` es solo la marca heredada). La TIENDA nunca entra aquí. La deriva
  // listProducts (data/products.ts); ver buildProductKindSets (domain/products.ts).
  classKind?: 'alimentacion' | 'no_alimentos' | null
  // Inciso Compras — Parte B: foto OPCIONAL para reconocer el producto en la tienda (bucket privado
  // product-photos, signed URL) — null = sin foto, el caso normal para la mayoría de productos.
  photoPath: string | null
}

export interface ProductPrice {
  id: string
  productId: string
  price: number
  store: string | null
  quantity: string | null
  unit: string | null
  recordedDate: string
  receiptId: string | null
}

export interface Receipt {
  id: string
  familyId: string
  storagePath: string | null
  store: string | null
  receiptDate: string
  totalAmount: number | null
  expenseId: string | null
  notes: string | null
  // NULL = categoría financiera todavía desconocida («Pendiente de clasificar»); un ticket sin categoría sigue siendo válido
  // (archivo, tienda, fecha, total y líneas no dependen de ella). Fase 6C.2A.
  category: string | null
  purchasedByMemberId: string | null
}

export interface Contact {
  id: string
  familyId: string
  name: string
  category: string | null
  phone: string | null
  email: string | null
  notes: string | null
  birthDate: string | null
  birthdayFavorite: boolean
}

export interface GalleryPhoto {
  id: string
  familyId: string
  storagePath: string
  caption: string | null
  createdAt: string
}

export interface MemberDocument {
  id: string
  familyId: string
  memberId: string | null
  storagePath: string
  title: string
  category: string | null
  // Petición real: fecha de vencimiento opcional (DNI, seguro, ITV...)
  // — si se rellena, se crea un evento en el calendario con varios
  // recordatorios de renovación (calendarEventId lo enlaza).
  expiryDate: string | null
  calendarEventId: string | null
}

export interface CalendarEvent {
  id: string
  familyId: string
  title: string
  description: string | null
  startAt: string
  endAt: string | null
  allDay: boolean
  color: string | null
  recurrenceRule: string | null
  exceptionDates: string[]
  reminders: EventReminder[]
  memberIds: string[]
  points: number
  // Adjuntos propios del evento (Skill de adjuntos) — todo opcional,
  // nunca se inventa para eventos ya creados.
  attachmentStoragePath: string | null
  attachmentKind: 'foto' | 'archivo' | null
  attachmentOriginalName: string | null
  locationLabel: string | null
  locationLatitude: number | null
  locationLongitude: number | null
  note: string | null
  // Petición real: "quiero que las notas se puedan poner con una
  // etiqueta de personal y que se vean solo en el calendario... que
  // los demás usuarios aunque sean de la familia no lo puedan ver" —
  // 'private' se filtra ya en el propio servidor (RLS), no aquí.
  visibility: 'shared' | 'private'
}

// Módulo Banco (Enable Banking) — una familia puede tener varias
// cuentas/conexiones (padre/madre, distintos bancos). "raw" guarda la
// respuesta cruda de Enable Banking para no perder nada mientras se
// verifica el mapeo exacto de campos.
export interface BankConnection {
  id: string
  familyId: string
  aspspName: string
  aspspCountry: string
  status: 'active' | 'expired' | 'revoked'
  validUntil: string | null
  createdAt: string
}

export interface BankAccount {
  id: string
  connectionId: string
  accountUid: string
  iban: string | null
  name: string | null
  currency: string | null
  balance: number | null
  balanceCurrency: string | null
  balanceUpdatedAt: string | null
  // Quién de la familia es el dueño de esta cuenta — el nombre que
  // trae el banco (`name`, arriba) es el del titular legal, que en
  // cuentas de menores suele ser el padre/madre representante, no
  // sirve para distinguir de un vistazo entre varias cuentas. null =
  // sin asignar (p. ej. una cuenta común de la casa).
  ownerMemberId: string | null
  // Piso compartido, modo Cuentas Separadas: false = el saldo de esta
  // cuenta no es tuyo ni Común, así que `balance` llega como null desde
  // la vista bank_accounts_with_visibility (candado en la tarjeta). En
  // modo Compartidas (o si eres el dueño, o la cuenta es Común) siempre
  // true.
  balanceVisible: boolean
}

export interface BankTransaction {
  id: string
  accountId: string
  entryReference: string | null
  transactionDate: string | null
  amount: number
  currency: string
  creditDebit: 'CRDT' | 'DBIT'
  description: string | null
  matchedExpenseId: string | null
}

// Buzón de sugerencias — cualquier familia deja las suyas; la familia
// dueña de la app las ve todas (ver migración 0078) para aplicarlas.
export interface Suggestion {
  id: string
  familyId: string
  profileId: string | null
  message: string
  status: 'pendiente' | 'aplicada' | 'descartada'
  adminNote: string | null
  createdAt: string
}

// Módulo Eventos (PEPA Events) — Skill completa en pepa-events-skill/,
// plan en curso. Un evento es una fila de `events`; los campos muy
// específicos de un tipo concreto (pareja, padrinos, testigos,
// sorpresa, años que se cumplen...) viven en `details` en vez de
// columnas sueltas, para no rediseñar el esquema cuando llegue un tipo
// de evento nuevo. Los campos compartidos entre varios tipos y que se
// consultan a menudo (estado de fecha, las dos ubicaciones de
// Comunión/Bautizo/Boda) sí son columnas reales.
export type EventType = 'cumpleanos' | 'comunion' | 'bautizo' | 'celebracion' | 'boda' | 'personalizado'
export type EventDateStatus = 'pendiente' | 'provisional' | 'confirmada'
export type EventStatus = 'planificacion' | 'archivado'

// Fase 1 del "inicio inteligente" (2026-09-30) — respuesta a "¿Dónde se celebra?" en el alta. Solo
// 'restaurante_local' activa la pregunta de servicios incluidos (paso 2); 'casa_propia'/'otro' no
// presuponen ningún servicio. Reutiliza venue_type, columna viva en el esquema desde 0106 pero que
// hasta ahora ningún formulario rellenaba.
export type EventVenueType = 'restaurante_local' | 'casa_propia' | 'otro'
// Vocabulario semántico pequeño y estable para "¿qué incluye ya el lugar/proveedor?" — deducido de los
// conceptos reales de BUDGET_PLAN_TEMPLATES/MENU_PLAN_TEMPLATES/DECORATION_PLAN_TEMPLATES/
// ACTIVITY_PLAN_TEMPLATES (ver generateEventPlan en src/domain/events.ts), nunca los textos visibles de
// esas listas directamente — los textos pueden cambiar y un mismo servicio puede afectar a varios módulos.
export type EventServiceId = 'food' | 'drinks' | 'cake' | 'decoration' | 'flowers' | 'music' | 'photography' | 'entertainment' | 'favors'

// Claves de los módulos del motor común — no todos los tipos de evento
// usan todos (ver referencia de cada tipo en la Skill). "invitaciones"
// cubre a la vez Invitaciones y RSVP.
export type EventModuleKey =
  | 'invitados'
  | 'invitaciones'
  | 'tareas'
  | 'presupuesto'
  | 'pagos'
  | 'menu_compra'
  | 'decoracion'
  | 'actividades'
  | 'mesas'
  | 'ceremonia'
  | 'proveedores'
  | 'detalles'
  | 'regalos'
  | 'plan_dia'

export interface FamilyEvent {
  id: string
  familyId: string
  type: EventType
  subtype: string | null
  title: string
  dateStatus: EventDateStatus
  eventDate: string | null
  eventTime: string | null
  venueLabel: string | null
  venueType: EventVenueType | null
  // Solo tiene sentido si venueType === 'restaurante_local' (paso 2 del alta) — null = pregunta no
  // respondida, comportamiento idéntico a un evento creado antes de esta fase.
  includedServices: EventServiceId[] | null
  // "Lugar" (venueLabel) es lo que se ve en la invitación — puede ser
  // algo informal como "en mi casa". Estas coordenadas son la
  // ubicación real elegida con el buscador (Nominatim), para el
  // enlace de mapa que reciben los invitados — independiente del
  // texto de Lugar, que se queda tal cual lo escribas.
  venueLatitude: number | null
  venueLongitude: number | null
  ceremonyLocationLabel: string | null
  ceremonyLocationLatitude: number | null
  ceremonyLocationLongitude: number | null
  ceremonyTime: string | null
  celebrationLocationLabel: string | null
  celebrationLocationLatitude: number | null
  celebrationLocationLongitude: number | null
  theme: string | null
  // Datos propios de un tipo concreto — ver EVENT_DETAILS_BY_TYPE en
  // src/domain/events.ts para la forma esperada de cada tipo.
  details: Record<string, unknown>
  enabledModules: EventModuleKey[]
  status: EventStatus
  tagId: string | null
  calendarEventId: string | null
  rsvpDeadline: string | null
  // Recordatorio push del plazo de RSVP (Fase 3) — reutiliza el
  // pipeline de calendar_events, igual que member_documents.expiryDate.
  rsvpDeadlineCalendarEventId: string | null
  openRsvpToken: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type EventGuestRsvpStatus = 'pendiente' | 'confirmado' | 'no_asiste' | 'no_seguro'
export type EventGuestInviteScope = 'ambas' | 'solo_ceremonia' | 'solo_celebracion'

export interface EventGuest {
  id: string
  eventId: string
  familyId: string
  displayName: string
  adultsCount: number
  childrenCount: number
  notes: string | null
  inviteScope: EventGuestInviteScope | null
  rsvpStatus: EventGuestRsvpStatus
  rsvpAdultsCount: number | null
  rsvpChildrenCount: number | null
  rsvpNote: string | null
  rsvpTokenActive: boolean
  rsvpRespondedAt: string | null
  tableId: string | null
  sortOrder: number
  createdAt: string
}

// Fase 14A — desglose OPCIONAL de personas dentro de una unidad
// invitada (event_guest). event_guests sigue siendo la unidad real
// para invitación/RSVP/token público/recuentos — esto es un segundo
// nivel, nunca un reemplazo. eventId/familyId van redundantes respecto
// a guestId a propósito (misma razón que en la migración 0164: la RLS
// "hardened" los necesita para comprobar pertenencia sin JOIN extra).
export type EventGuestMemberType = 'adulto' | 'nino'

export interface EventGuestMember {
  id: string
  guestId: string
  eventId: string
  familyId: string
  name: string
  personType: EventGuestMemberType
  tableId: string | null
  sortOrder: number
  createdAt: string
}

export interface EventTask {
  id: string
  eventId: string
  familyId: string
  title: string
  done: boolean
  dueDate: string | null
  source: 'auto' | 'manual'
  sortOrder: number
  createdAt: string
  // Fase 6 — quién de la familia la hace. Nullable ("sin asignar"),
  // nunca inferido — ver migración 0162_event_task_assignee.sql.
  assignedMemberId: string | null
  // Fase 9 — "Mostrar en Calendario": la propia presencia de este id
  // ES el estado del interruptor (null = apagado) — ver migración
  // 0163_event_task_calendar_link.sql. Enlace estable, nunca se
  // resuelve buscando por título.
  calendarEventId: string | null
  // Fase 1 del motor de decisiones — qué decisión del futuro
  // configurador generó esta tarea (null = creada a mano, o anterior a
  // esta fase). ON DELETE SET NULL: borrar la decisión nunca borra la
  // tarea — ver migración 0176_event_decisions_and_moments.sql.
  decisionId: string | null
}

export interface EventBudgetItem {
  id: string
  eventId: string
  familyId: string
  category: string
  // Bloque 11 (cola nocturna) — null = concepto propuesto sin importe todavía (p. ej. PEPA solo propone
  // CONCEPTOS, nunca precios inventados); nunca 0 como sustituto de "no lo sabemos" (mismo criterio que
  // ForecastPayment.amount/amountStatus).
  plannedAmount: number | null
  sortOrder: number
  createdAt: string
  // Fase 1 del motor de decisiones — ver EventTask.decisionId.
  decisionId: string | null
}

// Menú — petición de la Skill: "Menu comes BEFORE shopping". Una vez
// confirmado el traspaso, cada línea crea un shopping_items con este
// event_id (ver src/data/events.ts, transferMenuToShopping).
export interface EventMenuItem {
  id: string
  eventId: string
  familyId: string
  name: string
  category: string | null
  quantityNote: string | null
  transferred: boolean
  sortOrder: number
  createdAt: string
}

export interface EventProvider {
  id: string
  eventId: string
  familyId: string
  name: string
  type: string | null
  contactNote: string | null
  notes: string | null
  createdAt: string
  // Fase 1 del motor de decisiones — ver EventTask.decisionId.
  decisionId: string | null
}

export type EventPaymentStatus = 'pendiente' | 'parcial' | 'pagado'

export interface EventPayment {
  id: string
  eventId: string
  familyId: string
  providerId: string | null
  concept: string
  totalAmount: number
  depositPaid: number
  dueDate: string | null
  status: EventPaymentStatus
  notes: string | null
  reminderCalendarEventId: string | null
  createdAt: string
}

// Fase 3 — decoración/actividades: PEPA propone, la familia elige todo/
// algo/nada (petición de la Skill); "transferredToShopping" evita
// duplicar la línea si ya se pasó a Compras.
export type EventDecorationStatus = 'idea' | 'elegido' | 'comprado'

export interface EventDecorationItem {
  id: string
  eventId: string
  familyId: string
  name: string
  note: string | null
  status: EventDecorationStatus
  priceEstimate: number | null
  transferredToShopping: boolean
  // Fase 1 del motor de decisiones — ver EventTask.decisionId.
  decisionId: string | null
  sortOrder: number
  createdAt: string
}

export interface EventActivity {
  id: string
  eventId: string
  familyId: string
  title: string
  description: string | null
  ageRange: string | null
  durationMinutes: number | null
  materialsNote: string | null
  transferredToShopping: boolean
  sortOrder: number
  createdAt: string
}

export interface EventTableSeat {
  id: string
  eventId: string
  familyId: string
  name: string
  capacity: number | null
  sortOrder: number
  createdAt: string
}

export type EventFavorStatus = 'pendiente' | 'encargado' | 'listo'

// Detalles/recuerdos para los invitados (petición real: no solo boda/
// comunión — también aplica a cumpleaños con bolsas de chuches, etc.),
// por tipo de artículo — distinto de EventSpecialDetail (por persona).
export interface EventFavorItem {
  id: string
  eventId: string
  familyId: string
  itemType: string
  quantityNeeded: number | null
  budget: number | null
  supplier: string | null
  status: EventFavorStatus
  deliveryNote: string | null
  createdAt: string
}

export type EventSpecialDetailStatus = 'pendiente' | 'comprado' | 'preparado'

// Detalles para personas concretas (padrinos, testigos, abuelos...) —
// por destinatario, no por tipo de artículo. memberId (Fase 14D) es un
// enlace OPCIONAL a una persona real desglosada (event_guest_members);
// recipientName (texto libre) sigue siendo el dato que manda siempre,
// nunca se sustituye por el nombre de memberId.
export interface EventSpecialDetail {
  id: string
  eventId: string
  familyId: string
  recipientName: string
  relationship: string | null
  detail: string | null
  budget: number | null
  status: EventSpecialDetailStatus
  deliveryNote: string | null
  notes: string | null
  memberId: string | null
  createdAt: string
}

// Regalos recibidos — PRIVADO, nunca expuesto en la página pública de
// RSVP (petición explícita de la Skill). memberId (Fase 14D) es un
// enlace OPCIONAL a una persona real desglosada (event_guest_members);
// guestName (texto libre) sigue siendo el dato que manda siempre, para
// regalos de varias personas a la vez sin necesidad de N:M.
export interface EventGiftReceived {
  id: string
  eventId: string
  familyId: string
  guestName: string
  giftDescription: string | null
  cashAmount: number | null
  note: string | null
  memberId: string | null
  createdAt: string
}

export interface EventDayPlanItem {
  id: string
  eventId: string
  familyId: string
  itemTime: string | null
  title: string
  note: string | null
  sortOrder: number
  createdAt: string
  // Fase 1 del motor de decisiones — ver EventTask.decisionId.
  decisionId: string | null
}

// Fase 1 del modelo genérico de momentos — sustituirá en la UI a
// ceremonyLocationLabel/celebrationLocationLabel (fijos a 2 ubicaciones)
// cuando exista la Fase 2, pero convive con ellos sin tocarlos mientras
// tanto. Un `id` que empieza por "legacy:" es una fila SINTETIZADA en
// caliente por resolveEventMoments (nunca persistida) a partir de los
// campos heredados del evento — nunca se debe pasar a updateEventMoment/
// deleteEventMoment, de ahí `isLegacy`.
export interface EventMoment {
  id: string
  eventId: string
  familyId: string
  title: string
  momentDate: string | null
  momentTime: string | null
  locationLabel: string | null
  locationLatitude: number | null
  locationLongitude: number | null
  sortOrder: number
  createdAt: string
  isLegacy?: boolean
  // Cierre de Fase 2 (Google Maps) — dirección legible y Place ID de Google, por separado de
  // locationLabel (nombre que ve el invitado, puede ser personalizado: "Casa de los abuelos"). Nulos en
  // momentos antiguos (solo coordenadas) hasta que se vuelva a elegir la ubicación con el buscador.
  locationAddress: string | null
  locationPlaceId: string | null
}

// Invitado <-> momento, muchos a muchos (sustituirá a EventGuest.inviteScope,
// cerrado a exactamente 2 ubicaciones, cuando exista la Fase 2 de UI).
export interface EventGuestMoment {
  id: string
  guestId: string
  momentId: string
  eventId: string
  familyId: string
  createdAt: string
}

// Fase 1 del motor de decisiones — una fila por pregunta respondida del
// futuro configurador "Cómo queréis que sea vuestro evento". No la
// escribe todavía ningún formulario; solo existe la infraestructura
// (tabla + funciones de datos) para que la UI futura no tenga que
// rediseñar el modelo cuando se construya.
export interface EventDecision {
  id: string
  eventId: string
  familyId: string
  blockKey: string
  questionKey: string
  answer: Record<string, unknown>
  isCustomOption: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

// Fase 3 (La pareja) — relación muchos-a-muchos entre una decisión y un proveedor real (migración 0179):
// un mismo proveedor (p. ej. una floristería) puede relacionarse con varias decisiones sin duplicarse.
// event_providers.decision_id no cambia de significado — sigue siendo quién lo creó la primera vez.
export interface EventDecisionProvider {
  id: string
  decisionId: string
  providerId: string
  eventId: string
  familyId: string
  createdAt: string
}

// Diseño de la invitación en capas (Fase 3) — una fila por evento.
// canvasJson guarda las capas (fondo/decoración/foto/texto/emoji) con
// posición/rotación/escala; el invite_scope de cada invitado no cambia
// el diseño, solo qué líneas de ubicación se muestran al compartir.
export type InvitationLayerType = 'background' | 'shape' | 'photo' | 'text' | 'emoji' | 'event_data'

export type InvitationTextStyle = 'normal' | '3d' | 'sparkle' | 'rainbow_static' | 'rainbow_animated' | 'iridescent' | 'metallic'

export type InvitationTextAlign = 'left' | 'center' | 'right'

export interface InvitationLayer {
  id: string
  type: InvitationLayerType
  x: number
  y: number
  rotation: number
  scale: number
  zIndex: number
  // texto/emoji
  text?: string
  color?: string
  fontFamily?: string
  fontSize?: number
  // Petición real: "que al texto se le pueda dar formato 3D y que se
  // pueda poner en una curva" (relieve), "letras de brillos... como si
  // fuese purpurina", y "un color arcoíris... uno fijo y otro que vaya
  // cambiando... y otro estilo iridiscente" — son rellenos alternativos
  // del texto, no se combinan entre sí (si acaso con curve, que es la
  // forma, no el relleno). curve (-100..100, 0 recto) solo se usa en
  // capas de tipo "text" (una línea), no en "event_data" (varias
  // líneas, no tiene sentido curvarlo).
  textStyle?: InvitationTextStyle
  curve?: number
  // Fase 3 Bloque 2 — opcionales y compatibles: una capa GUARDADA ANTES de que existieran (undefined en los
  // tres) debe verse EXACTAMENTE igual que antes (ver resolveLayerFontWeight para bold/fontWeight; italic
  // ausente siempre fue "normal"; textAlign ausente siempre fue 'center', hardcodeado en el render de
  // antes). Solo capas nuevas o tocadas a mano por el usuario llevan un valor explícito aquí.
  textAlign?: InvitationTextAlign
  bold?: boolean
  italic?: boolean
  // forma decorativa genérica (sin personajes con copyright)
  shapeKey?: string
  // foto subida por el usuario (event-photos bucket)
  photoPath?: string
  photoUrl?: string
  // Fase 3 Bloque 3 — opcionales y compatibles, igual criterio que textAlign/bold/italic (Bloque 2): una
  // capa guardada antes de que existieran se ve exactamente igual que antes. `opacity` (0..1, control solo
  // para "forma" por ahora) ausente = 1 (opaco, como siempre). `photoMask` ausente = 'none' (foto cuadrada
  // normal, como siempre) — 'circle' la recorta en círculo sin tocar el archivo subido.
  opacity?: number
  photoMask?: 'none' | 'circle'
  // Bloque A (cola nocturna) — "Ajustar foto": mismo concepto de encuadre reversible que ya tiene el fondo
  // (backgroundOffsetX/Y/Scale, InvitationCanvas), pero por capa. Opcionales y compatibles, igual criterio
  // que el resto de este bloque: ausentes = 0/0/1, pinta EXACTAMENTE igual que una foto sin encuadrar nunca
  // (translate(0%,0%) scale(1) es un no-op) — ninguna invitación antigua cambia de aspecto. NUNCA se
  // recorta/recodifica el archivo original; es solo qué parte de la MISMA imagen se ve dentro del marco.
  photoOffsetX?: number
  photoOffsetY?: number
  photoScale?: number
  // Fase 3 Bloque 5B — de qué dato real del evento nació esta capa (generada por "Pepa, hazla por mí" o
  // insertada a mano desde "📋 Datos"), y qué texto tenía el evento en ese momento. Permite detectar más
  // tarde si el evento cambió (comparando `valueAtInsertion` con el dato actual) y si el usuario personalizó
  // el texto después (comparando `layer.text` con `valueAtInsertion`) sin ningún flag aparte que pueda
  // desincronizarse. Opcional y retrocompatible: ausente en toda invitación anterior a este bloque y en
  // cualquier texto libre escrito a mano — esas capas simplemente no participan en el seguimiento.
  //
  // Evolución del generador narrativo (2026-09-28) — una capa "event_field" sigue naciendo de UN único
  // hecho (p. ej. el título, o un dato suelto insertado a mano desde "📋 Datos"). Una capa "event_narrative"
  // nace del párrafo redactado por PEPA (BODY), que puede tejer VARIOS hechos reales en una sola frase
  // (fecha+hora+lugar+edad...) — por eso lleva una lista, no un único `field`, y además recuerda el texto
  // COMPLETO que tenía al insertarse (`bodyAtInsertion`): al no ser una sustitución palabra-por-palabra, no
  // basta con comparar un valor suelto para saber si el usuario reescribió el párrafo a mano (ver
  // isInvitationLayerManuallyEdited, domain/invitationAutoCompose.ts).
  source?:
    | {
        kind: 'event_field'
        field: Exclude<InvitationEventFieldKey, 'closing'>
        valueAtInsertion: string
      }
    | {
        kind: 'event_narrative'
        bodyAtInsertion: string
        fields: { field: Exclude<InvitationEventFieldKey, 'closing'>; valueAtInsertion: string }[]
      }
  // Geometria segura (2026-09-28) — que rol de zona ocupa esta capa (title/body/closing) y el ancho
  // EFECTIVO (ya con el margen interior de seguridad aplicado) que el compositor uso para calcularla.
  // Puente de compatibilidad: ausente en TODA capa guardada antes de este cambio (y en cualquier capa
  // suelta sin rol, p.ej. una foto o una forma) — el renderer (InvitationDesigner.tsx) debe caer siempre
  // a su calculo heredado cuando falta, para que ninguna invitacion ya guardada cambie de aspecto. Solo
  // las capas frescas que genera el compositor (ver buildContentLayers, invitationAutoCompose.ts) llevan
  // estos dos campos, y el renderer los usa en ese caso para que WYSIWYG y compositor midan exactamente
  // la misma zona (ver resolveEffectiveZone).
  zoneRole?: 'title' | 'body' | 'closing'
  zoneWidthFrac?: number
}

// Fase 3 Bloque 5B — claves de "hecho real del evento" que puede llevar una invitación: título, fecha,
// hora, lugar, edad/subtítulo, ceremonia, celebración, más "closing" (frase de cierre genérica, ver
// domain/invitationAutoCompose.ts — nunca un hecho real, nunca el origen de una capa con seguimiento).
// Definida aquí (no en invitationAutoCompose.ts) para que InvitationLayer.source pueda referenciarla sin
// depender del motor de composición.
export type InvitationEventFieldKey = 'title' | 'subtitle' | 'fecha' | 'hora' | 'lugar' | 'ceremonia' | 'hora_ceremonia' | 'celebracion' | 'closing'

export interface InvitationCanvas {
  backgroundGradient: string
  layers: InvitationLayer[]
  // Petición real: "que se pueda ajustar el tamaño del fondo con los
  // dedos" — solo para la foto de fondo (background_image_path), no
  // para el arte del tema. Fracción del contenedor (-0.5..0.5) y
  // multiplicador de zoom (>=1); sin ellas se comporta igual que antes
  // (centrada, sin zoom).
  backgroundOffsetX?: number
  backgroundOffsetY?: number
  backgroundScale?: number
  // Fase 3 Bloque 5B — "zona de escritura" que el usuario confirmó a mano para un fondo importado propio
  // (secciones 10-16): las 100 plantillas PEPA ya traen su textArea calibrado, pero una imagen importada
  // no, y DEFAULT_TEXT_AREA no sabe dónde hay una cara o decoración. Ausente/null = todavía no se ha
  // confirmado ninguna (o el fondo no es una foto propia) — "Hazla bonita"/"Hazla por mí" caen entonces al
  // mismo DEFAULT_TEXT_AREA de siempre, sin ningún cambio de comportamiento para invitaciones anteriores.
  customTextArea?: { x: number; y: number; width: number; height: number } | null
}

export interface EventInvitation {
  id: string
  eventId: string
  familyId: string
  templateKey: string | null
  canvas: InvitationCanvas
  backgroundImagePath: string | null
  createdAt: string
  updatedAt: string
}

// Plantillas personales reutilizables (Fase 4) — solo la configuración
// (tipo/subtipo/tema/módulos/details), nunca invitados/gastos/RSVP.
export interface EventTemplate {
  id: string
  familyId: string
  name: string
  type: EventType
  subtype: string | null
  theme: string | null
  details: Record<string, unknown>
  enabledModules: EventModuleKey[]
  createdAt: string
}

