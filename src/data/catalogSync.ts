import { supabase } from '@/data/supabaseClient'

// CAT-2 — el catálogo general de PEPA llega SOLO a la familia. Las clasificaciones de cada familia (clases de producto y categorías de Economía) son
// copias enlazadas al catálogo por catalog_key; la función sync_my_family_catalog (migración 0338) deja a la familia con todo lo aprobado: enlaza lo
// que equivale, consolida duplicados equivalentes sin perder datos y añade lo que falte. Es idempotente y no toca importes, productos ni tickets.
//
// Antes, las pantallas de Compras y Presupuesto SEMBRABAN una lista fija cuando la familia no tenía nada: el cliente no puede fijar catalog_key, así
// que esas filas nacían sin enlace (así se desenlazaron las 20 clases de «Familia prueba»). Ya no se siembra desde la app: se pide la sincronización.

export interface CatalogSyncResult {
  /** true si la sincronización cambió algo (hay que volver a leer las clasificaciones). */
  changed: boolean
}

const RECHECK_AFTER_MS = 10 * 60 * 1000
let lastRun = 0
let inflight: Promise<CatalogSyncResult> | null = null

/** Valores del resultado que significan «se ha hecho algo». */
const CHANGE_KEYS = ['linked_classes', 'merged_classes', 'renamed_classes', 'added_classes', 'linked_categories', 'added_categories'] as const

export function catalogSyncChanged(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false
  const rec = data as Record<string, unknown>
  return CHANGE_KEYS.some((k) => typeof rec[k] === 'number' && (rec[k] as number) > 0)
}

/**
 * Pide la sincronización del catálogo de la familia. Se lanza como mucho una vez cada 10 minutos (varias pantallas la piden a la vez) y NUNCA rompe la
 * pantalla que la pide: si falla, la familia sigue con lo que ya tenía y se reintentará en la siguiente carga.
 */
export function ensureCatalogSynced(force = false): Promise<CatalogSyncResult> {
  if (inflight) return inflight
  if (!force && Date.now() - lastRun < RECHECK_AFTER_MS) return Promise.resolve({ changed: false })
  inflight = (async (): Promise<CatalogSyncResult> => {
    try {
      const { data, error } = await supabase.rpc('sync_my_family_catalog')
      if (error) return { changed: false }
      lastRun = Date.now()
      return { changed: catalogSyncChanged(data) }
    } catch {
      return { changed: false }
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/**
 * «Recuperar las que quité»: la familia quitó categorías o clases generales y la sincronización no se las vuelve a poner; esto olvida lo quitado y
 * devuelve todo el catálogo general (sin tocar nada de lo que ya tiene). Devuelve cuántas categorías y clases se añadieron.
 */
export async function restoreMyFamilyCatalog(): Promise<{ addedCategories: number; addedClasses: number }> {
  const { data, error } = await supabase.rpc('restore_my_family_catalog')
  if (error) throw error
  lastRun = Date.now()
  const rec = (data ?? {}) as Record<string, unknown>
  return { addedCategories: Number(rec.added_categories) || 0, addedClasses: Number(rec.added_classes) || 0 }
}

/** Solo para pruebas. */
export function resetCatalogSyncForTests(): void {
  lastRun = 0
  inflight = null
}
