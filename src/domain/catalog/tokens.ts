// Troceado común de textos de producto: el MISMO para las frases del catálogo, las de los atributos y el nombre que sale del ticket,
// de modo que «PAT. FRITAS», «patatas fritas» y «Patata frita» acaben en las mismas palabras.
import { productTextKey } from '../productText'
import { ABBREVIATIONS, NOISE, PHRASE_EXPANSIONS, SOFT_ABBREVIATIONS, STOPWORDS, singular } from './lexicon'

// Sinónimos que NO cambian de producto (cacao = chocolate en un batido; banana = plátano): se unifican en una sola palabra.
const SYNONYMS: Record<string, string> = {
  banana: 'platano',
  yoghurt: 'yogur',
  freson: 'fresa',
  mani: 'cacahuete',
  papas: 'patata',
  // Género de los adjetivos que distinguen productos: «congelada» y «congelado» son la misma palabra para el catálogo.
  congelada: 'congelado',
  cocida: 'cocido',
  cruda: 'crudo',
  fresca: 'fresco',
  ahumada: 'ahumado',
  rallada: 'rallado',
  pelada: 'pelado',
  picada: 'picado',
  troceada: 'troceado',
  fileteada: 'fileteado',
  laminada: 'laminado',
  desalada: 'desalado',
  asada: 'asado',
  frita: 'frito',
  tostada: 'tostado',
  molida: 'molido',
  blanca: 'blanco',
  negra: 'negro',
  roja: 'rojo',
  rellena: 'relleno',
  ondulada: 'ondulado',
  dentifrica: 'dentifrico',

  burger: 'hamburguesa',
  nueces: 'nuez',
  peces: 'pez',
  lapices: 'lapiz',
}

export interface TextTokens {
  tokens: string[]
  /** Abreviaturas poco seguras que hubo que expandir («INF» → infantil): el producto se propone, no se da por seguro. */
  soft: string[]
}

/** Texto ya normalizado (sin tildes, minúsculas, signos como espacios) con las expresiones de varias palabras expandidas. */
export function expandPhrases(text: string): string {
  let t = productTextKey(text)
  for (const [re, to] of PHRASE_EXPANSIONS) t = t.replace(re, to)
  return t
}

export function tokenize(text: string, options: { keepNoise?: boolean } = {}): TextTokens {
  const soft: string[] = []
  const out: string[] = []
  for (const raw of expandPhrases(text).split(' ')) {
    if (!raw) continue
    let w = raw
    if (ABBREVIATIONS[w]) w = ABBREVIATIONS[w]
    else if (SOFT_ABBREVIATIONS[w]) {
      soft.push(w)
      w = SOFT_ABBREVIATIONS[w]
    }
    w = SYNONYMS[w] ?? singular(w)
    w = SYNONYMS[w] ?? w
    if (STOPWORDS.has(w)) continue
    if (!options.keepNoise && NOISE.has(w)) continue
    out.push(w)
  }
  return { tokens: out, soft }
}

/** Solo las palabras (para frases del catálogo y de atributos). */
export function tokensOf(text: string): string[] {
  return tokenize(text).tokens
}
