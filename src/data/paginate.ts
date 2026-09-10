// Preparación de escala (petición real: "que en el futuro no falle con
// muchos usuarios"): PostgREST devuelve como mucho 1000 filas por
// petición (límite por defecto del proyecto). Un select() sin rango
// sobre una tabla que crece sin tope —movimientos, transacciones del
// banco, tickets, eventos...— se corta AHÍ en silencio, sin error, y los
// totales salen mal sin que nadie lo vea (comprobado con una familia de
// 1250 movimientos: content-range 0-999/1250). Este helper pide por
// páginas hasta que llega una corta. La consulta DEBE llevar un order()
// determinista (con desempate por id) para que las páginas no se
// solapen ni salten filas.
//
// Vive aparte de supabaseClient.ts a propósito: no depende del cliente
// ni de variables de entorno, así se puede testear en CI.
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
