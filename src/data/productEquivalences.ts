import { supabase } from '@/data/supabaseClient'
import { productTextKey } from '@/domain/productText'
import type { DecisionRelation, FamilyDecision, SharedEquivalence } from '@/domain/priceComparison'

// Equivalencias de productos para el comparador de precios.
//  · Decisiones de la FAMILIA (product_equivalences): privadas, mandan en esa familia.
//  · Equivalencias COMPARTIDAS (resolve_shared_equivalences): solo nombres normalizados y un nivel (provisional / validada / bloqueada).
// Un fallo (tabla o función aún no desplegadas, red) nunca rompe Compras: el comparador sigue solo con el nombre de los productos.

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return data.family_id
}

export async function listFamilyDecisions(): Promise<FamilyDecision[]> {
  try {
    const { data, error } = await supabase.from('product_equivalences').select('product_a, product_b, relation')
    if (error) return []
    return (data ?? []).map((r) => ({ productA: r.product_a as string, productB: r.product_b as string, relation: r.relation as DecisionRelation }))
  } catch {
    return []
  }
}

/** Guarda (o cambia) lo que la familia decide sobre dos de sus productos. El par se guarda siempre ordenado. */
export async function setFamilyDecision(productA: string, productB: string, relation: DecisionRelation): Promise<void> {
  if (productA === productB) return
  const familyId = await currentFamilyId()
  const [a, b] = productA < productB ? [productA, productB] : [productB, productA]
  const { error } = await supabase.from('product_equivalences').upsert({ family_id: familyId, product_a: a, product_b: b, relation }, { onConflict: 'product_a,product_b' })
  if (error) throw error
}

/** Quita la decisión de la familia: el par vuelve a decidirse por el nombre / lo compartido. */
export async function clearFamilyDecision(productA: string, productB: string): Promise<void> {
  const [a, b] = productA < productB ? [productA, productB] : [productB, productA]
  const { error } = await supabase.from('product_equivalences').delete().eq('product_a', a).eq('product_b', b)
  if (error) throw error
}

/** Nivel compartido de los pares entre estos nombres (máx. 100 por llamada). Solo viajan nombres normalizados. */
export async function loadSharedEquivalences(displayNames: readonly string[]): Promise<SharedEquivalence[]> {
  const keys = [...new Set(displayNames.map((n) => productTextKey(n)).filter(Boolean))].slice(0, 100)
  if (keys.length < 2) return []
  try {
    const { data, error } = await supabase.rpc('resolve_shared_equivalences', { p_keys: keys })
    if (error) return []
    return ((data ?? []) as { key_a: string; key_b: string; level: string }[])
      .filter((r) => r.level === 'validated' || r.level === 'provisional' || r.level === 'blocked')
      .map((r) => ({ keyA: r.key_a, keyB: r.key_b, level: r.level as SharedEquivalence['level'] }))
  } catch {
    return []
  }
}
