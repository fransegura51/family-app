import { supabase } from '@/data/supabaseClient'
import type { StoreChainAliasRow, StoreChainRow } from '@/domain/storeChains'

// Catálogo global de cadenas (store_chains) — mismo para todas las familias, de solo lectura desde la
// app (RLS: "leer" para authenticated; crear/editar cadenas es cosa de migraciones). Para el selector de
// tiendas de Compras solo interesan las que de verdad son supermercados activos — Repsol, Amazon o una
// tienda local puntual están en la tabla para otro propósito (interpretar texto de tickets/banco, ver
// 0142_store_chains.sql) y no deben ofrecerse aquí como "cadena conocida" para dar de alta una tienda.
export async function listSupermarketChains(): Promise<StoreChainRow[]> {
  const { data, error } = await supabase
    .from('store_chains')
    .select('key, name, kind, learnable, status, logo_asset')
    .eq('kind', 'supermarket')
    .eq('status', 'active')
    .order('name', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ key: r.key, name: r.name, kind: r.kind, learnable: r.learnable, status: r.status, logoAsset: r.logo_asset }))
}

// Alias de TODAS las cadenas (no solo supermercados) — hace falta el catálogo completo para que
// resolveStoreChain no dé falsos "ambiguo" al comparar solo contra el subconjunto de supermercados.
export async function listStoreChainAliases(): Promise<StoreChainAliasRow[]> {
  const { data, error } = await supabase.from('store_chain_aliases').select('chain_key, alias_norm, match_mode')
  if (error) throw error
  return data
}
