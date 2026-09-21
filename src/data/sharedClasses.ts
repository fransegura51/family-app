import { supabase } from '@/data/supabaseClient'
import { createSharedClassLoader, type SharedBatchRow } from '@/domain/sharedClassLoader'

// Aprendizaje compartido PEPA por lotes: una sola RPC para todos los (tienda, texto) que necesita una pantalla, con caché.
// Solo viaja la tienda y el texto comercial. Un fallo NO rompe nada: el resolutor sigue con clase guardada → reglas → respaldo.
export const sharedClassLoader = createSharedClassLoader(async (items) => {
  const { data, error } = await supabase.rpc('resolve_shared_product_classes', { p_items: items })
  if (error) throw error
  return (data ?? []) as SharedBatchRow[]
})
