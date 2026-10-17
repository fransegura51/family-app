// Menú semanal de la Cocina → Compras. Reutiliza el mismo código de «Preparar compra del menú» (menuShoppingPlan.ts): misma suma, escalado y redondeo de compra.
// Solo cuentan los platos con RECETA enlazada y con ingredientes: un plato escrito a mano («Pizza del sábado») no se inventa ni se descompone. Nada se guarda aquí.
import { buildMenuShoppingPlan, type ShoppingPlanLine } from '@/domain/menuShoppingPlan'
import type { EventMenuItem, FamilyMember, MenuEntry, Recipe } from '@/domain/types'

export type KitchenShoppingScope = { scope: 'week' } | { scope: 'day'; date: string } | { scope: 'entry'; entryId: string }

// Personas con las que se calcula por defecto: quienes comen en casa de la familia (sin bebés ni invitadas), mínimo 1. Sin fichas, 4.
export function defaultDiners(members: Pick<FamilyMember, 'memberType'>[] | null | undefined): number {
  if (!members || members.length === 0) return 4
  const eating = members.filter((m) => m.memberType === 'admin' || m.memberType === 'adult' || m.memberType === 'child').length
  return Math.min(Math.max(eating, 1), 12)
}

// Entradas del menú que entran en el ámbito elegido y que tienen una receta con ingredientes.
export function shoppableEntries(entries: MenuEntry[], recipes: Recipe[], scope: KitchenShoppingScope): MenuEntry[] {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  return entries.filter((e) => {
    if (!e.recipeId) return false
    const r = byId.get(e.recipeId)
    if (!r || r.ingredients.length === 0) return false
    if (scope.scope === 'day') return e.entryDate === scope.date
    if (scope.scope === 'entry') return e.id === scope.entryId
    return true
  })
}

export function hasShoppableRecipe(entries: MenuEntry[], recipes: Recipe[], scope: KitchenShoppingScope): boolean {
  return shoppableEntries(entries, recipes, scope).length > 0
}

export function kitchenMenuShopping(entries: MenuEntry[], recipes: Recipe[], scope: KitchenShoppingScope, diners: number): ShoppingPlanLine[] {
  const picked = shoppableEntries(entries, recipes, scope)
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const items: EventMenuItem[] = picked.map((e, n) => ({
    id: e.id,
    eventId: '',
    familyId: e.familyId,
    name: byId.get(e.recipeId as string)?.title ?? '',
    category: null,
    quantityNote: null,
    transferred: false,
    sortOrder: n,
    createdAt: '',
    recipeId: e.recipeId,
    notes: null,
    source: 'importado',
    documentId: null,
    preparedBy: 'familia',
    kind: 'dish',
  }))
  // «familia»: todo se cocina en casa (así entran los ingredientes de todos los platos con receta).
  return buildMenuShoppingPlan(items, recipes, diners, 'familia')
}
