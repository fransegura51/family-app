// Convierte el texto suelto que devuelve el OCR de un ticket en líneas
// de producto + precio, más una fecha y un total si se detectan. Es una
// lectura por patrones (números al final de línea), no comprensión real
// del ticket — por diseño: sin IA de por medio no hay forma de "entender"
// el ticket, así que esto es lo mejor que se puede hacer gratis, y por
// eso el resultado siempre se enseña para corregir antes de guardar.

export interface ParsedReceiptLine {
  name: string
  price: number
}

export interface ParsedReceipt {
  lines: ParsedReceiptLine[]
  total: number | null
  date: string | null // YYYY-MM-DD
}

// Palabras que casi seguro no son un producto sino texto de cabecera/pie
// del ticket (totales, formas de pago, datos fiscales…).
const STOPWORDS = [
  'total',
  'subtotal',
  'iva',
  'cambio',
  'entregado',
  'tarjeta',
  'efectivo',
  'visa',
  'devuelto',
  'ticket',
  'fecha',
  'hora',
  'cif',
  'nif',
  'gracias',
  'atencion',
  'cliente',
  'importe',
  'descuento',
  'operacion',
  'caja',
  'factura',
  'articulos',
]

const PRICE_AT_END = /(\d{1,4}[.,]\d{2})\s*€?\s*$/
const DATE_RE = /(\d{2})[/\-.](\d{2})[/\-.](\d{2,4})/

function toPrice(raw: string): number {
  return Number(raw.replace(',', '.'))
}

function looksLikeProduct(name: string): boolean {
  if (name.length < 2) return false
  if (/^\d+$/.test(name)) return false
  const lower = name.toLowerCase()
  return !STOPWORDS.some((w) => lower.includes(w))
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText.split('\n').map((l) => l.trim())

  let total: number | null = null
  const items: ParsedReceiptLine[] = []

  for (const line of lines) {
    if (!line) continue
    const priceMatch = line.match(PRICE_AT_END)
    if (!priceMatch) continue
    const name = line.slice(0, priceMatch.index).replace(/[.\s]+$/, '').trim()
    const price = toPrice(priceMatch[1])
    if (Number.isNaN(price)) continue

    if (/\btotal\b/i.test(line) && !/subtotal/i.test(line)) {
      total = price
      continue
    }
    if (looksLikeProduct(name)) {
      items.push({ name, price })
    }
  }

  let date: string | null = null
  const dateMatch = rawText.match(DATE_RE)
  if (dateMatch) {
    const day = Number(dateMatch[1])
    const month = Number(dateMatch[2])
    let year = Number(dateMatch[3])
    if (year < 100) year += 2000
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return { lines: items, total, date }
}
