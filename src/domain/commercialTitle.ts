// LIMPIEZA DE TÍTULOS COMERCIALES IMPORTADOS (COMP-02). Lógica pura, sin red.
//
// Los pedidos de Amazon llegan con el título de posicionamiento del vendedor: 200 caracteres con la misma palabra repetida diez veces («Cadenas para Chupetes Bebe, Chupete Cuerda
// Tela Suave Cadena para Chupete con Clip Reutilizable Cadena Chupete Bebe…»). Esto lo deja en algo legible que conserva lo que identifica el artículo —marca, tipo de producto,
// cantidad y las características que lo distinguen (medidas, color, «reutilizable»…)— y quita repeticiones, relleno publicitario y códigos de modelo. NO lo limita a la longitud de
// un artículo de supermercado, y el título ORIGINAL completo se conserva aparte (products.original_name). Nunca se aplica solo sobre un nombre que la persona haya escrito o
// cambiado: quien lo use solo lo propone o lo aplica a lo recién importado.
//
// Copia para la función del servidor: supabase/functions/amazon-order-webhook/commercialTitle.ts (mantener a mano; la prueba de sincronía las compara).

const MAX_LEN = 110

/** Un nombre corto y limpio (un artículo de ticket de supermercado) no se toca nunca. */
export function looksLikeCommercialTitle(raw: string): boolean {
  const t = raw.trim()
  if (t.length < 70) return false
  const segments = t.split(/[,|;]/).length
  const words = t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3)
  const repeated = words.length - new Set(words.map(stem)).size
  return segments >= 3 || repeated >= 3 || t.length >= 110
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
}

/** Raíz muy simple para detectar repeticiones («chupetes»/«chupete»/«chupetero»). */
function stem(word: string): string {
  const w = fold(word).replace(/[^a-z0-9ñ]/g, '')
  if (w.length <= 4) return w
  return w.replace(/(es|s)$/, '').replace(/(ero|era)$/, '')
}

const CONNECTORS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'y', 'e', 'en', 'a', 'por', 'sin', 'o', 'un', 'una'])
const COLORS = ['blanco', 'negro', 'gris', 'rojo', 'azul', 'verde', 'amarillo', 'rosa', 'naranja', 'morado', 'marron', 'beige', 'plateado', 'dorado', 'transparente']
const FEATURES = ['reutilizable', 'recargable', 'inalambrico', 'impermeable', 'plegable', 'ajustable', 'antideslizante', 'ecologico', 'lavable', 'portatil', 'magnetico', 'extensible', 'apilable', 'sin bpa']
const QUANTITY_NOUNS = 'piezas?|pzas?|unidades?|uds?|pack|packs|juego|set|tubos?|colores|pares?|cajones|estantes|baldas|rollos?|bolsas?|sobres?|latas?|botellas?'
const DIMENSION = /\b\d{1,3}(?:[.,]\d+)?\s*[x×]\s*\d{1,3}(?:[.,]\d+)?(?:\s*[x×]\s*\d{1,3}(?:[.,]\d+)?)?\s*(?:cm|mm|m)\b/i
/** Código de modelo/fabricante al final: letras y números mezclados, sin significado para la persona («EBWG01W»). */
const MODEL_CODE = /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{5,}\b/

function tidy(s: string): string {
  return s.replace(/\s*\([^)]{0,4}\)\s*/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim()
}

/** Quita palabras repetidas (sin tildes ni plurales), conservando el orden y las conectoras necesarias. */
function dedupeWords(text: string): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of text.split(/\s+/)) {
    const key = stem(w)
    if (!key || CONNECTORS.has(key)) {
      out.push(w)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  // No deja conectoras colgando al final ni dobles seguidas.
  while (out.length > 0 && CONNECTORS.has(fold(out[out.length - 1]))) out.pop()
  return out.filter((w, i) => !(CONNECTORS.has(fold(w)) && i > 0 && CONNECTORS.has(fold(out[i - 1])))).join(' ')
}

/**
 * Nombre legible de un título comercial largo. Devuelve el mismo texto (sin tocar) si ya es corto y limpio.
 * Ejemplo: «ZOCONE 8 Piezas Cadenas para Chupetes Bebe, Chupete Cuerda Tela Suave … Reutilizable …» → «ZOCONE – 8 Piezas Cadenas para Chupetes Bebe · reutilizable».
 */
export function cleanCommercialTitle(raw: string): string {
  const original = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!looksLikeCommercialTitle(original)) return original

  // Segmento principal: hasta la primera coma / barra / punto y coma / guion largo.
  const segments = original.split(/\s*[,|;]\s*|\s+[-–—]\s+/).map(tidy).filter(Boolean)
  let main = segments[0] ?? original
  // Un título que arranca con «Marca …» (primera palabra en MAYÚSCULAS o capitalizada seguida de más texto) separa la marca con un guion.
  const firstWord = main.split(' ')[0] ?? ''
  const isBrand = firstWord.length >= 3 && /^[\p{Lu}][\p{Lu}\p{N}]+$/u.test(firstWord) && main.split(' ').length > 1
  let brand = ''
  if (isBrand) {
    brand = firstWord
    main = main.slice(firstWord.length).trim()
  }
  main = dedupeWords(main.replace(MODEL_CODE, ' ')).trim()

  const rest = original
  const extras: string[] = []
  const mainFold = fold(main)
  // Cantidad que el segmento principal no recoge («11 Tubos de plástico»).
  const qty = rest.match(new RegExp(`\\b(\\d{1,3})\\s*(?:${QUANTITY_NOUNS})\\b`, 'i'))
  if (qty && !mainFold.includes(fold(qty[0]))) extras.push(qty[0].toLowerCase())
  // Medidas y color: lo que distingue un mueble o un accesorio de otro igual.
  const dim = rest.match(DIMENSION)
  if (dim) extras.push(dim[0].replace(/\s+/g, '').toLowerCase())
  const lowered = fold(rest)
  const color = COLORS.find((c) => new RegExp(`\\b${c}\\b`).test(lowered) && !mainFold.includes(c))
  if (color) extras.push(color)
  const feature = FEATURES.find((f) => lowered.includes(f) && !mainFold.includes(f))
  if (feature) extras.push(feature)

  let out = brand ? `${brand} – ${main}` : main
  if (extras.length > 0) out += ` · ${extras.slice(0, 3).join(' · ')}`
  out = out.replace(/\s+/g, ' ').trim()
  if (out.length > MAX_LEN) out = out.slice(0, MAX_LEN).replace(/\s+\S*$/, '').trim() + '…'
  // Nunca devuelve algo más pobre que una sola palabra de marca.
  return out.length >= 6 ? out : original
}
