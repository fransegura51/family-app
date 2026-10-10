// Cadenas de supermercados habituales en España. Cuando alguien dicta «Mercadona patatas» o «patatas Mercadona» sin decir «añade», y esa cuenta
// no tiene la tienda dada de alta, Pepa no lo tomaba por un encargo de compra (lo mandaba a la IA, que lo interpretaba como una PREGUNTA y leía lo
// que ya había en la lista: «En la lista de la compra de Mercadona: pañuelos, huevos»). Con el nombre de la cadena reconocido, se apunta a esa tienda.
//
// Solo nombres que no son palabras corrientes ("Día" se deja fuera a propósito: se confundiría con «el día»). Si la tienda SÍ está dada de alta
// manda siempre la dada de alta (ver findKnownStore); esto solo entra cuando no hay ninguna que encaje.

interface Chain {
  display: string
  pattern: string
}

const CHAINS: Chain[] = [
  { display: 'Mercadona', pattern: 'mercadona' },
  { display: 'Lidl', pattern: 'lidl' },
  { display: 'Aldi', pattern: 'aldi' },
  { display: 'Carrefour', pattern: 'carrefour' },
  { display: 'Alcampo', pattern: 'alcampo' },
  { display: 'Eroski', pattern: 'eroski' },
  { display: 'Consum', pattern: 'consum' },
  { display: 'Hiperber', pattern: 'hiperber' },
  { display: 'Hipercor', pattern: 'hipercor' },
  { display: 'Ahorramás', pattern: 'ahorram[aá]s' },
  { display: 'Gadis', pattern: 'gadis' },
  { display: 'Froiz', pattern: 'froiz' },
  { display: 'Bonpreu', pattern: 'bonpreu' },
  { display: 'Condis', pattern: 'condis' },
  { display: 'Supersol', pattern: 'supersol' },
  { display: 'Supercor', pattern: 'supercor' },
  { display: 'Makro', pattern: 'makro' },
  { display: 'Simply', pattern: 'simply' },
  { display: 'El Corte Inglés', pattern: String.raw`el\s+corte\s+ingl[eé]s` },
]

// Sin \b: con acentos y la «ñ» no funciona. Una cadena es una palabra entera ("Consum" sí, "consumo" no).
const BEFORE = String.raw`(?<![\p{L}\d])`
const AFTER = String.raw`(?![\p{L}\d])`
const matchers = CHAINS.map((chain) => ({ chain, regex: new RegExp(`${BEFORE}(?:${chain.pattern})${AFTER}`, 'iu') }))

export function mentionsChain(text: string): boolean {
  return matchers.some(({ regex }) => regex.test(text))
}

// Saca la cadena de la frase y la deja sin ella (y sin la preposición que se quede colgando: "...pan a", "...lista de la compra de").
export function extractChain(text: string): { store: string; text: string } | null {
  for (const { chain, regex } of matchers) {
    const match = regex.exec(text)
    if (!match) continue
    const before = text.slice(0, match.index).replace(/(?:^|[\s,])(?:a|en|de|del|para)\s*$/i, ' ')
    const after = text.slice(match.index + match[0].length)
    const rest = `${before} ${after}`
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[,;:.]\s*/, '')
      .replace(/[,;:.]\s*$/, '')
      .trim()
    return { store: chain.display, text: rest }
  }
  return null
}
