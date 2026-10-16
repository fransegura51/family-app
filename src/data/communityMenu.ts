// Comunidad PEPA — MENÚ SEMANAL OFICIAL: llamadas al servidor (migración 0278). Cada acción del cliente es UNA llamada:
//  - vista previa: community_menu_import_preview (solo lectura);
//  - importar: community_menu_import (atómica y con clave de idempotencia: repetirla no duplica nada).
// La lista de la compra NO pasa por aquí: se suma en el cliente (domain/communityMenu.ts) y se guarda con la función de siempre de Compras (data/shopping).
import { camelize } from '@/data/community'
import { supabase } from '@/data/supabaseClient'
import { toCommunityError } from '@/domain/communityErrors'
import {
  MENU_ERROR_MESSAGES,
  menuErrorCode,
  type ConflictMode,
  type DuplicateMode,
  type MenuImportPreview,
  type MenuImportResult,
  type MenuMealKey,
  type MenuScope,
} from '@/domain/communityMenu'

export interface MenuImportParams {
  postId: string
  scope: MenuScope
  day?: string | null
  meal?: MenuMealKey | null
  // 0 = plato principal; 1 = acompañamiento (solo con scope «recipe»).
  recipeIndex?: number | null
  // Lunes de la semana de destino («AAAA-MM-DD»). No hace falta para guardar una sola receta.
  targetStart?: string | null
  servings: number
  duplicateRecipes?: DuplicateMode
}

// Los errores propios de la importación (BAD_SCOPE, KEY_REUSED…) llevan su frase; el resto son los de Comunidad (acceso, solo lectura, no disponible…).
function menuError(error: unknown): Error {
  const code = menuErrorCode(error)
  if (code) {
    const e = new Error(MENU_ERROR_MESSAGES[code])
    e.name = 'CommunityMenuError'
    return e
  }
  return toCommunityError(error)
}

function args(p: MenuImportParams) {
  return {
    p_post: p.postId,
    p_scope: p.scope,
    p_day: p.day ?? null,
    p_meal: p.meal ?? null,
    p_recipe_index: p.recipeIndex ?? null,
    p_target_start: p.scope === 'recipe' ? null : (p.targetStart ?? null),
    p_servings: p.servings,
    p_duplicate_recipes: p.duplicateRecipes ?? 'reuse',
  }
}

export async function previewMenuImport(p: MenuImportParams): Promise<MenuImportPreview> {
  const { data, error } = await supabase.rpc('community_menu_import_preview', args(p))
  if (error) throw menuError(error)
  return camelize<MenuImportPreview>(data)
}

// `idempotencyKey`: un identificador por confirmación (crypto.randomUUID). Con la misma clave y los mismos datos el servidor devuelve el resultado ya
// guardado (replayed) sin crear nada otra vez; si la red falla a mitad se puede reintentar con la misma clave sin miedo.
export async function runMenuImport(p: MenuImportParams & { onConflict: ConflictMode }, idempotencyKey: string): Promise<MenuImportResult> {
  const { data, error } = await supabase.rpc('community_menu_import', { ...args(p), p_on_conflict: p.onConflict, p_idempotency_key: idempotencyKey })
  if (error) throw menuError(error)
  return camelize<MenuImportResult>(data)
}
