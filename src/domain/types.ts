// Tipos de dominio — reflejan el esquema de supabase/migrations, sin
// depender de ningún framework de UI.

import type { EventReminder } from '@/domain/reminders'

// "guest" = invitado externo a la familia (Skill de invitados): tiene
// su propia cuenta pero solo ve las secciones marcadas en
// allowedSections, pensado para preparar la app de cara a compartirla
// con otras personas/familias en el futuro.
export type MemberType = 'admin' | 'adult' | 'child' | 'baby' | 'guest'
export type FamilyRole = 'admin' | 'adult' | 'guest'

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

export interface FamilyMember {
  id: string
  familyId: string
  name: string
  avatar: string
  color: string
  memberType: MemberType
  birthDate: string | null
  birthdayFavorite: boolean
  permissions: Record<string, unknown>
  linkedProfileId: string | null
  photoPath: string | null
  allowedSections: string[] | null
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

export interface FoodLog {
  id: string
  familyId: string
  memberId: string
  logDate: string
  mealType: MealType
  description: string
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  isEstimated: boolean
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
  category: string
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
  // Skill de Pepa, puntos 15/16 — null si nadie lo ha clasificado
  // todavía (no se inventa una clasificación).
  necessity: 'debo' | 'necesito' | 'quiero' | null
  isFixed: boolean | null
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
  latitude: number
  longitude: number
  radiusM: number
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
}

export interface ProductPrice {
  id: string
  productId: string
  price: number
  store: string | null
  quantity: string | null
  unit: string | null
  recordedDate: string
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
  category: string
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
}

