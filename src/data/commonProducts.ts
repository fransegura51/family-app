// Productos comunes del comparador (migración 0324). Todo es de LA FAMILIA (RLS). Sin la migración las listas salen vacías y el comparador funciona como antes.
import { fetchAllRows } from '@/data/paginate'
import { supabase } from '@/data/supabaseClient'
import { normalizeCommonName, type CommonMember, type CommonProduct } from '@/domain/commonProducts'

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
  /** false = la base todavía no tiene las tablas (migración 0324 sin aplicar): no se puede guardar nada. */
  available: boolean
}

export async function listCommonProductsData(): Promise<CommonProductsData> {
  try {
    const [commons, members, skips] = await Promise.all([
      fetchAllRows<{ id: string; name: string; normalized_name: string }>((from, to) => supabase.from('common_products').select('id, name, normalized_name').order('name').range(from, to)),
      fetchAllRows<{ product_id: string; common_id: string; source: string }>((from, to) => supabase.from('common_product_members').select('product_id, common_id, source').order('product_id').range(from, to)),
      fetchAllRows<{ product_id: string }>((from, to) => supabase.from('common_product_skips').select('product_id').order('product_id').range(from, to)),
    ])
    return {
      commons: commons.map((c) => ({ id: c.id, name: c.name, normalizedName: c.normalized_name })),
      members: members.map((m) => ({ productId: m.product_id, commonId: m.common_id, source: (m.source as CommonMember['source']) ?? 'manual' })),
      skipped: skips.map((s) => s.product_id),
      available: true,
    }
  } catch {
    return { commons: [], members: [], skipped: [], available: false }
  }
}

/** Crea un producto común (o devuelve el que ya existe con ese nombre). */
export async function createCommonProduct(name: string): Promise<CommonProduct> {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) throw new Error('Escribe un nombre para el producto común')
  const familyId = await currentFamilyId()
  const normalizedName = normalizeCommonName(clean)
  const existing = await supabase.from('common_products').select('id, name, normalized_name').eq('normalized_name', normalizedName).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return { id: existing.data.id, name: existing.data.name, normalizedName: existing.data.normalized_name }
  const { data, error } = await supabase.from('common_products').insert({ family_id: familyId, name: clean, normalized_name: normalizedName }).select('id, name, normalized_name').single()
  if (error) throw error
  return { id: data.id, name: data.name, normalizedName: data.normalized_name }
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

export async function skipPairing(productId: string): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('common_product_skips').upsert({ product_id: productId, family_id: familyId }, { onConflict: 'product_id' })
  if (error) throw error
}

export async function unskipPairing(productId: string): Promise<void> {
  const { error } = await supabase.from('common_product_skips').delete().eq('product_id', productId)
  if (error) throw error
}

// ─── EAN (auxiliar) ───

/** Códigos de barras ya guardados por artículo. Sin la migración, vacío. */
export async function listProductEansSafe(): Promise<Map<string, string>> {
  try {
    const rows = await fetchAllRows<{ id: string; ean: string | null }>((from, to) => supabase.from('products').select('id, ean').not('ean', 'is', null).order('id').range(from, to))
    return new Map(rows.filter((r) => r.ean).map((r) => [r.id, r.ean as string]))
  } catch {
    return new Map()
  }
}

export async function setProductEan(productId: string, ean: string | null): Promise<void> {
  const { error } = await supabase.from('products').update({ ean }).eq('id', productId)
  if (error) throw error
}
