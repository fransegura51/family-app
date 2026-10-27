// Productos comunes del comparador (migración 0331). Todo es de LA FAMILIA (RLS). Sin la migración las listas salen vacías y el comparador funciona como antes.
import { fetchAllRows } from '@/data/paginate'
import { supabase } from '@/data/supabaseClient'
import { listFamilyDecisions } from '@/data/productEquivalences'
import { listAllProductPrices, listProducts } from '@/data/products'
import { planAutoGrouping, type AutoPlan } from '@/domain/autoGrouping'
import { normalizeCommonName, suggestCommons, type CommonMember, type CommonProduct } from '@/domain/commonProducts'
import { toCmpPrice, toCmpProduct } from '@/domain/priceComparisonAdapters'

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return data.family_id
}

export interface CommonProductsData {
  commons: CommonProduct[]
  members: CommonMember[]
  skipped: string[]
  /** Artículos que la familia sacó de una propuesta de PEPA: no se vuelven a proponer. */
  rejected: string[]
  /** false = la base todavía no tiene las tablas (migración 0331 sin aplicar): no se puede guardar nada. */
  available: boolean
}

export async function listCommonProductsData(): Promise<CommonProductsData> {
  try {
    const [commons, members, skips, rejects] = await Promise.all([
      fetchAllRows<{ id: string; name: string; normalized_name: string; status: string | null }>((from, to) => supabase.from('common_products').select('id, name, normalized_name, status').order('name').range(from, to)),
      fetchAllRows<{ product_id: string; common_id: string; source: string }>((from, to) => supabase.from('common_product_members').select('product_id, common_id, source').order('product_id').range(from, to)),
      fetchAllRows<{ product_id: string }>((from, to) => supabase.from('common_product_skips').select('product_id').order('product_id').range(from, to)),
      fetchAllRows<{ product_id: string }>((from, to) => supabase.from('common_product_auto_rejects').select('product_id').order('product_id').range(from, to)),
    ])
    return {
      commons: commons.map((c) => ({ id: c.id, name: c.name, normalizedName: c.normalized_name, status: c.status === 'pending' ? ('pending' as const) : ('confirmed' as const) })),
      members: members.map((m) => ({ productId: m.product_id, commonId: m.common_id, source: (m.source as CommonMember['source']) ?? 'manual' })),
      skipped: skips.map((s) => s.product_id),
      rejected: rejects.map((r) => r.product_id),
      available: true,
    }
  } catch {
    return { commons: [], members: [], skipped: [], rejected: [], available: false }
  }
}

/** Crea un producto común (o devuelve el que ya existe con ese nombre). Los de PEPA nacen 'pending' hasta que la familia los revisa. */
export async function createCommonProduct(name: string, status: 'confirmed' | 'pending' = 'confirmed'): Promise<CommonProduct> {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) throw new Error('Escribe un nombre para el producto común')
  const familyId = await currentFamilyId()
  const normalizedName = normalizeCommonName(clean)
  const existing = await supabase.from('common_products').select('id, name, normalized_name, status').eq('normalized_name', normalizedName).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return { id: existing.data.id, name: existing.data.name, normalizedName: existing.data.normalized_name, status: existing.data.status === 'pending' ? 'pending' : 'confirmed' }
  const { data, error } = await supabase.from('common_products').insert({ family_id: familyId, name: clean, normalized_name: normalizedName, status }).select('id, name, normalized_name, status').single()
  if (error) throw error
  return { id: data.id, name: data.name, normalizedName: data.normalized_name, status: data.status === 'pending' ? 'pending' : 'confirmed' }
}

/** La familia revisa y acepta un grupo propuesto por PEPA: pasa a ser un producto común confirmado y sus artículos cuentan como agrupados por ella. */
export async function confirmCommon(id: string): Promise<void> {
  const { error } = await supabase.from('common_products').update({ status: 'confirmed' }).eq('id', id)
  if (error) throw error
  const { error: e2 } = await supabase.from('common_product_members').update({ source: 'sugerido' }).eq('common_id', id).eq('source', 'pepa')
  if (e2) throw e2
}

/** Anota que PEPA no debe volver a proponer estos artículos (se separaron o descartaron a propósito). Idempotente. */
export async function rejectAutoGrouping(productIds: readonly string[]): Promise<void> {
  if (productIds.length === 0) return
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('common_product_auto_rejects').upsert(productIds.map((product_id) => ({ product_id, family_id: familyId })), { onConflict: 'product_id', ignoreDuplicates: true })
  if (error) throw error
}

/** Descarta un grupo propuesto por PEPA: se borra el agrupamiento (artículos, precios y formatos no se tocan) y PEPA no lo vuelve a proponer. */
export async function discardPendingCommon(id: string, productIds: readonly string[]): Promise<void> {
  await rejectAutoGrouping(productIds)
  await deleteCommonProduct(id)
}

export async function renameCommonProduct(id: string, name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) throw new Error('Escribe un nombre para el producto común')
  const { error } = await supabase.from('common_products').update({ name: clean, normalized_name: normalizeCommonName(clean) }).eq('id', id)
  if (error) throw error
}

/** Borra el producto común (sus artículos, precios y formatos no se tocan: solo desaparece el agrupamiento). */
export async function deleteCommonProduct(id: string): Promise<void> {
  const { error } = await supabase.from('common_products').delete().eq('id', id)
  if (error) throw error
}

/** Un artículo pertenece a UN solo producto común: asignarlo a otro lo mueve. También lo saca de «no emparejar». */
export async function assignToCommon(productId: string, commonId: string, source: CommonMember['source']): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('common_product_members').upsert({ product_id: productId, common_id: commonId, family_id: familyId, source }, { onConflict: 'product_id' })
  if (error) throw error
  await supabase.from('common_product_skips').delete().eq('product_id', productId)
}

export async function unassignFromCommon(productId: string): Promise<void> {
  const { error } = await supabase.from('common_product_members').delete().eq('product_id', productId)
  if (error) throw error
}

/** Quita un artículo de un grupo propuesto por PEPA y evita que vuelva a proponerlo. */
export async function separateFromPepaGroup(productId: string): Promise<void> {
  await unassignFromCommon(productId)
  await rejectAutoGrouping([productId])
}

/** Lo que PEPA añade solo: nunca pisa un agrupamiento que ya exista (la familia manda). */
async function assignIfFree(productId: string, commonId: string): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('common_product_members').upsert({ product_id: productId, common_id: commonId, family_id: familyId, source: 'pepa' }, { onConflict: 'product_id', ignoreDuplicates: true })
  if (error) throw error
}

export interface AutoGroupingOutcome {
  /** Grupos nuevos que PEPA ha creado (pendientes de revisar). */
  created: number
  /** Artículos agrupados por PEPA en esta pasada. */
  grouped: number
  plan: AutoPlan
}

/**
 * Identifica en el historial productos que son el mismo y los agrupa como PROPUESTA pendiente de revisar. No toca compras, precios ni formatos ni ningún grupo confirmado.
 * Es idempotente (volver a ejecutarla no duplica ni resucita lo que la familia separó o descartó) y nunca lanza: sin conexión o sin migración devuelve null.
 */
export async function runAutoGrouping(): Promise<AutoGroupingOutcome | null> {
  try {
    const [products, prices, decisions, data] = await Promise.all([listProducts(), listAllProductPrices(), listFamilyDecisions(), listCommonProductsData()])
    if (!data.available) return null
    const plan = planAutoGrouping({
      products: products.map(toCmpProduct),
      prices: prices.map(toCmpPrice),
      commons: data.commons.map((c) => ({ ...c, status: c.status ?? 'confirmed' })),
      members: data.members,
      skippedIds: new Set(data.skipped),
      rejectedIds: new Set(data.rejected),
      ctx: { decisions },
    })
    let created = 0
    let grouped = 0
    for (const g of plan.groups) {
      let commonId = g.commonId
      if (!commonId) {
        const c = await createCommonProduct(g.name, 'pending')
        // Si otra pasada u otro dispositivo ya creó (o la familia confirmó) uno con ese nombre, no se le añade nada.
        if (c.status === 'confirmed') continue
        commonId = c.id
        created += 1
      }
      for (const id of g.productIds) {
        await assignIfFree(id, commonId)
        grouped += 1
      }
    }
    return { created, grouped, plan }
  } catch {
    return null
  }
}

export async function skipPairing(productId: string): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('common_product_skips').upsert({ product_id: productId, family_id: familyId }, { onConflict: 'product_id' })
  if (error) throw error
}

export async function unskipPairing(productId: string): Promise<void> {
  const { error } = await supabase.from('common_product_skips').delete().eq('product_id', productId)
  if (error) throw error
}

// ─── Asignación automática tras guardar una compra ───

/**
 * Un artículo que acaba de entrar al historial y es IDÉNTICO a otro ya agrupado se une solo a su producto común (origen «auto», se deshace desde Emparejar).
 * Todo lo demás se queda como sugerencia. Nunca lanza ni retrasa el guardado de la compra.
 */
export async function autoAssignToCommons(productIds: readonly string[]): Promise<number> {
  try {
    if (productIds.length === 0) return 0
    const n = await assignIdentical(productIds)
    // Lo demás que se reconozca como el mismo producto queda como propuesta de PEPA pendiente de revisar (nunca toca grupos confirmados).
    await runAutoGrouping()
    return n
  } catch {
    return 0
  }
}

async function assignIdentical(productIds: readonly string[]): Promise<number> {
  try {
    const [products, decisions, data] = await Promise.all([listProducts(), listFamilyDecisions(), listCommonProductsData()])
    if (!data.available || data.commons.length === 0) return 0
    const cmp = products.map(toCmpProduct)
    const ctx = { decisions, commonOf: new Map(data.members.map((m) => [m.productId, m.commonId])) }
    const members = [...data.members]
    let n = 0
    for (const id of new Set(productIds)) {
      if (members.some((m) => m.productId === id) || data.skipped.includes(id)) continue
      const article = cmp.find((p) => p.id === id)
      if (!article) continue
      const best = suggestCommons(article, data.commons, members, cmp, ctx)[0]
      if (!best?.automatic) continue
      await assignToCommon(id, best.common.id, 'auto')
      members.push({ productId: id, commonId: best.common.id, source: 'auto' })
      n += 1
    }
    return n
  } catch {
    return 0
  }
}
