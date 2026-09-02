// Tipos de dominio — reflejan el esquema de supabase/migrations, sin
// depender de ningún framework de UI.

import type { EventReminder } from '@/domain/reminders'

export type MemberType = 'admin' | 'adult' | 'child' | 'baby'
export type FamilyRole = 'admin' | 'adult'

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
}

export interface FamilyMember {
  id: string
  familyId: string
  name: string
  avatar: string
  color: string
  memberType: MemberType
  birthDate: string | null
  permissions: Record<string, unknown>
  linkedProfileId: string | null
  photoPath: string | null
}

export type TaskType = 'unica' | 'recurrente' | 'rutina' | 'mision'

export interface Task {
  id: string
  familyId: string
  memberId: string | null // null = tarea familiar, cualquiera la completa
  title: string
  taskType: TaskType
  recurrenceRule: string | null
  startDate: string
  timeOfDay: string | null
  points: number
  active: boolean
}

export interface TaskCompletion {
  id: string
  taskId: string
  memberId: string
  completedDate: string
  pointsAwarded: number
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

export interface Expense {
  id: string
  familyId: string
  expenseDate: string
  amount: number
  category: string
  store: string | null
  kind: ExpenseKind
  notes: string | null
}

export interface Budget {
  id: string
  familyId: string
  periodType: BudgetPeriod
  periodStart: string
  category: string | null
  amount: number
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
  storagePath: string
  store: string | null
  receiptDate: string
  totalAmount: number | null
  expenseId: string | null
  notes: string | null
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
}
