import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env y rellénalas.',
  )
}

// Cliente único de Supabase. ui/ nunca importa esto directamente: pasa
// siempre por funciones de data/ para que RLS sea el único punto de verdad.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})

// Preparación de escala (petición real: "que en el futuro no falle con
// muchos usuarios"): PostgREST devuelve como mucho 1000 filas por
// petición (límite por defecto del proyecto). Un select() sin rango
// sobre una tabla que crece sin tope —movimientos, transacciones del
// banco, tickets, eventos...— se corta AHÍ en silencio, sin error, y los
// totales salen mal sin que nadie lo vea. Este helper pide por páginas
// hasta que llega una corta. La consulta DEBE llevar un order()
// determinista (con desempate por id) para que las páginas no se
// solapen ni salten filas.
export const PAGE_SIZE = 1000

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) return rows
  }
}
