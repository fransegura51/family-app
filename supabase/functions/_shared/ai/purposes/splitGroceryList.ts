import type { AiPurposeSpec } from '../types.ts'
import { asCleanString, asRecord, parseJsonLoose } from '../validate.ts'

// Separa una lista de la compra dictada de un tirón, sin pausas ni comas
// claras entre producto y producto ("patata lechuga lentejas agua vino"), en
// productos sueltos — petición real: "esto me lo sigue poniendo todo
// junto... yo quiero que me lo ponga cada producto en una línea". Hace falta
// entender el idioma para no partir un producto de varias palabras ("pan
// Bimbo", "papel higiénico") — por eso es un modelo y no otra heurística.
// Se llama solo cuando el troceo local por comas/"y" ya ha dejado un solo
// trozo con más de una palabra.

export interface SplitGroceryInput {
  text: string
}

export interface SplitGroceryOutput {
  items: string[]
}

const MAX_TEXT = 2000
const MAX_ITEMS = 50
const MAX_ITEM_LEN = 100

export const splitGroceryListSpec: AiPurposeSpec<SplitGroceryInput, SplitGroceryOutput> = {
  purpose: 'split-grocery-list',

  readInput(body) {
    const { text } = body
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'missing text' }
    if (text.length > MAX_TEXT) return { ok: false, error: 'text too long' }
    return { ok: true, input: { text } }
  },

  buildParts({ text }) {
    const prompt =
      'Esto es una lista de la compra dictada por voz de un tirón, en español, sin comas ni pausas claras entre ' +
      `producto y producto:\n"${text}"\n\n` +
      'Sepárala en productos sueltos. Cada producto es lo que se compraría como una sola cosa en el ' +
      'supermercado — un nombre de marca o un adjetivo pegado al producto NO es un producto aparte ("pan ' +
      'Bimbo" es UN producto, "papel higiénico" es UN producto, "leche entera" es UN producto), pero ' +
      'productos distintos dichos seguidos SÍ se separan ("patata lechuga" son DOS productos: "patata" y ' +
      '"lechuga"). No inventes ni quites ningún producto, no cambies el orden.\n\n' +
      'Responde ÚNICAMENTE un objeto JSON, sin texto adicional ni markdown: {"items": ["producto1", "producto2"]}'
    return [{ text: prompt }]
  },

  // Si la IA no devuelve nada utilizable, se deja tal cual como un solo
  // producto — igual que se guardaba antes de intentar separarlo.
  parseOutput(rawText, { text }) {
    const parsed = asRecord(parseJsonLoose(rawText))
    if (parsed && Array.isArray(parsed.items)) {
      const items = parsed.items
        .map((i: unknown) => asCleanString(i, MAX_ITEM_LEN))
        .filter((i: string | null): i is string => i !== null)
        .slice(0, MAX_ITEMS)
      if (items.length > 0) return { items }
    }
    return { items: [text.trim()] }
  },
}
