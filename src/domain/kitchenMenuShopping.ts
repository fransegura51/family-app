// Menú semanal de la Cocina → Compras. Reutiliza el mismo código de «Preparar compra del menú» (menuShoppingPlan.ts): misma suma, escalado y redondeo de compra.
// Dos clases de entrada, que la revisión distingue con claridad:
//  · con RECETA enlazada (y con ingredientes): sus ingredientes reales, escalados a las personas elegidas;
//  · escrita A MANO («Fruta de temporada»): se añade como UN producto con ese texto. No se inventan ingredientes ni se deduce una receta; el nombre, la cantidad y la unidad se
//    revisan antes de confirmar (la cantidad empieza vacía: nunca se impone una).
// Nada se guarda aquí.
import { buildMenuShoppingPlan, type ShoppingPlanLine } from '@/domain/menuShoppingPlan'
import type { EventMenuItem, FamilyMember, MenuEntry, Recipe } from '@/domain/types'

export type KitchenShoppingScope = { scope: 'week' } | { scope: 'day'; date: string } | { scope: 'entry'; entryId: string }

// Personas con las que se calcula por defecto: quienes comen en casa de la familia (sin bebés ni invitadas), mínimo 1. Sin fichas, 4.
export function defaultDiners(members: Pick<FamilyMember, 'memberType'>[] | null | undefined): number {
  if (!members || members.length === 0) return 4
  const eating = members.filter((m) => m.memberType === 'admin' || m.memberType === 'adult' || m.memberType === 'child').length
  return Math.min(Math.max(eating, 1), 12)
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

// Texto de una entrada escrita a mano (null si tiene receta o está vacía).
export function manualText(e: Pick<MenuEntry, 'recipeId' | 'freeText'>): string | null {
  if (e.recipeId) return null
  const t = (e.freeText ?? '').replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

// Entradas del menú que entran en el ámbito elegido: las que tienen una receta con ingredientes y las escritas a mano (con texto).
export function shoppableEntries(entries: MenuEntry[], recipes: Recipe[], scope: KitchenShoppingScope): MenuEntry[] {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  return entries.filter((e) => {
    if (e.recipeId) {
      const r = byId.get(e.recipeId)
      if (!r || r.ingredients.length === 0) return false
    } else if (manualText(e) === null) {
      return false
    }
    if (scope.scope === 'day') return e.entryDate === scope.date
    if (scope.scope === 'entry') return e.id === scope.entryId
    return true
  })
}

export function hasShoppableEntry(entries: MenuEntry[], recipes: Recipe[], scope: KitchenShoppingScope): boolean {
  return shoppableEntries(entries, recipes, scope).length > 0
}

// Prefijo de la clave de las líneas escritas a mano (la hoja de revisión las reconoce por `direct`).
export const MANUAL_KEY_PREFIX = 'text:'

export function kitchenMenuShopping(entries: MenuEntry[], recipes: Recipe[], scope: KitchenShoppingScope, diners: number): ShoppingPlanLine[] {
  const picked = shoppableEntries(entries, recipes, scope)
  const withRecipe = picked.filter((e) => e.recipeId)
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const items: EventMenuItem[] = withRecipe.map((e, n) => ({
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
  const fromRecipes = buildMenuShoppingPlan(items, recipes, diners, 'familia')

  // Escritas a mano: un producto por texto (el mismo texto varias veces es UN producto, para no duplicar). Sin cantidad ni unidad hasta que la persona las ponga.
  const manual = new Map<string, ShoppingPlanLine>()
  for (const e of picked) {
    const text = manualText(e)
    if (text === null) continue
    const key = MANUAL_KEY_PREFIX + norm(text)
    const existing = manual.get(key)
    if (existing) {
      existing.sources.push({ dishName: text, ingredientText: text })
      continue
    }
    manual.set(key, { key, name: text, quantity: null, unit: '', sources: [{ dishName: text, ingredientText: text }], notes: [], direct: true, hint: null })
  }
  return [...fromRecipes.filter((l) => !l.direct), ...manual.values()]
}
