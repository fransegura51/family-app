// «Solicitar nuevo producto»: una incidencia de Soporte de tipo «Solicitud de producto». Se usa el mismo Soporte de siempre (no hay un sistema paralelo): la respuesta llega
// por el mismo hilo. El texto lleva SOLO lo que hace falta para revisarla: nombre del ticket, producto buscado, categoría sugerida y observaciones. Nada personal ni financiero
// (ni tienda, ni importes, ni nombres de personas): por eso se construye aquí, con una lista cerrada de campos, y no se vuelca el contexto de la compra.
import { BODY_MAX, SUBJECT_MAX } from '@/support/validate'

export interface ProductRequestInput {
  /** Texto del artículo tal como sale en el ticket. */
  raw?: string
  /** Lo que la persona buscó en el catálogo sin encontrarlo. */
  searched?: string
  /** Categoría que PEPA sugería para la línea, si la hay. */
  suggestedCategory?: string
  /** Lo que la persona quiera añadir. */
  notes?: string
}

const clean = (s: string | undefined, max: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export interface ProductRequestTicket {
  kind: 'solicitud_producto'
  section: 'compras'
  subject: string
  body: string
}

export function buildProductRequest(input: ProductRequestInput): ProductRequestTicket {
  const raw = clean(input.raw, 120)
  const searched = clean(input.searched, 80)
  const category = clean(input.suggestedCategory, 60)
  const notes = clean(input.notes, 600)
  const wanted = searched || raw || 'producto sin nombre'
  const lines = [
    raw ? `Nombre en el ticket: ${raw}` : '',
    searched ? `Producto buscado: ${searched}` : '',
    category ? `Categoría sugerida: ${category}` : '',
    notes ? `Observaciones: ${notes}` : '',
  ].filter(Boolean)
  return {
    kind: 'solicitud_producto',
    section: 'compras',
    subject: `Solicitud de producto: ${wanted}`.slice(0, SUBJECT_MAX),
    body: (lines.length > 0 ? lines.join('\n') : 'Falta un producto en el catálogo.').slice(0, BODY_MAX),
  }
}
