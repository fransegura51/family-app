// VOCABULARIO COMÚN del catálogo maestro: abreviaturas de ticket, palabras vacías, marcas y utilidades de texto.
// Puro: sin red, sin IA, sin datos de ninguna familia. Lo comparten el normalizador (identify.ts) y la identidad de producto (productIdentity.ts).
import { productTextKey } from '../productText'

// Abreviaturas habituales de ticket → palabra completa (ya sin tildes ni mayúsculas). Solo las inequívocas.
export const ABBREVIATIONS: Record<string, string> = {
  ent: 'entera',
  entera: 'entera',
  desn: 'desnatada',
  desnat: 'desnatada',
  semi: 'semidesnatada',
  semid: 'semidesnatada',
  semides: 'semidesnatada',
  integ: 'integral',
  nat: 'natural',
  cong: 'congelado',
  pq: 'pequeno',
  peq: 'pequeno',
  gde: 'grande',
  lact: 'lactosa',
  vin: 'vinagre',
  agridulc: 'agridulce',
  azuc: 'azucar',
  frit: 'frito',
  tom: 'tomate',
  yog: 'yogur',
  yogu: 'yogur',
  yogurt: 'yogur',
  gall: 'galleta',
  choc: 'chocolate',
  mant: 'mantequilla',
  mermel: 'mermelada',
  ensal: 'ensalada',
  cerv: 'cerveza',
  refres: 'refresco',
  refr: 'refresco',
  pech: 'pechuga',
  pechg: 'pechuga',
  filet: 'filete',
  fte: 'filete',
  filt: 'filete',
  salch: 'salchicha',
  hamb: 'hamburguesa',
  rall: 'rallado',
  rallad: 'rallado',
  lonch: 'lonchas',
  mand: 'mandarina',
  manz: 'manzana',
  plat: 'platano',
  zanah: 'zanahoria',
  calab: 'calabacin',
  esparr: 'esparrago',
  champi: 'champinon',
  pimien: 'pimiento',
  lechug: 'lechuga',
  precoc: 'precocinado',
  ultracong: 'ultracongelado',
  det: 'detergente',
  deterg: 'detergente',
  suav: 'suavizante',
  lavav: 'lavavajillas',
  higien: 'higienico',
  desodor: 'desodorante',
  dent: 'dental',
  ctra: 'crema',
  liq: 'liquido',
  liqu: 'liquido',
}

// Abreviaturas que NO son seguras por sí solas (pueden significar otra cosa fuera del supermercado): el producto se propone, no se da por seguro.
export const SOFT_ABBREVIATIONS: Record<string, string> = {
  inf: 'infantil',
  pat: 'patata',
  nar: 'naranja',
  cr: 'crema',
  esp: 'espagueti',
}

// Expresiones de varias palabras (sobre el texto ya normalizado: sin tildes, signos como espacios). «ACEITE O.V.E.» → «aceite o v e».
export const PHRASE_EXPANSIONS: [RegExp, string][] = [
  [/\bo v e\b/g, 'oliva virgen extra'],
  [/\baove\b/g, 'oliva virgen extra'],
  [/\bove\b/g, 'oliva virgen extra'],
  [/\bvirg(en)? ex(tr)?\b/g, 'virgen extra'],
  // «BOLSA SUPERMERCADO» es la bolsa que se paga en caja; «bolsa» sola es ruido de ticket (STOPWORDS), por eso se junta en una sola palabra.
  [/\bbolsas? (de |para )?(la )?(compra|supermercado|reutilizable|rafia|carrito|tienda)\b/g, 'bolsacompra'],
  [/\bsin lac\b/g, 'sin lactosa'],
  [/\bs lactosa\b/g, 'sin lactosa'],
  [/\bs lact\b/g, 'sin lactosa'],
  [/\bs gas\b/g, 'sin gas'],
  [/\bc gas\b/g, 'con gas'],
  [/\bsemi desnatada\b/g, 'semidesnatada'],
  [/\bsin alc\b/g, 'sin alcohol'],
  [/\bs alcohol\b/g, 'sin alcohol'],
  [/\bs gluten\b/g, 'sin gluten'],
  [/\bsin glut\b/g, 'sin gluten'],
  [/\bs azucar\b/g, 'sin azucar'],
  [/\bsin azuc\b/g, 'sin azucar'],
  [/\bpan mold\b/g, 'pan molde'],
  [/\bpan de molde\b/g, 'pan molde'],
  [/\bpapel hig\b/g, 'papel higienico'],
  [/\bpapel cocina\b/g, 'papel cocina'],
]

export const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'y', 'a', 'en', 'un', 'una', 'al', 'por', 'e', 'o',
  'bandeja', 'bolsa', 'envase', 'botella', 'bote', 'brik', 'tarro', 'sabor', 'tipo', 'estilo',
])

/** Ruido de ticket que no describe el producto. */
export const NOISE = new Set(['pack', 'pk', 'ud', 'uds', 'unidades', 'unidad', 'x', 'pcs', 'bolsa', 'bandeja', 'ofe', 'oferta', 'promo', 'dto'])

// Marcas blancas y marcas nacionales frecuentes (solo nombres inconfundibles: una palabra corriente como «gel» o «estrella» NO es una marca).
// Una marca distinta NO impide la equivalencia; una marca igual con producto distinto, sí. Las marcas blancas de tienda van en STORE_BRANDS.
export const STORE_BRANDS = new Set([
  'hacendado', 'deliplus', 'bosque verde', 'milbona', 'carrefour', 'alcampo', 'eroski', 'auchan', 'consum', 'compy', 'cien', 'pilos',
  'alteza', 'selex', 'hipercor', 'simpl', 'gutbio', 'bonarea', 'sensilis', 'garden gourmet', 'dia', 'dia vegetalis', 'dia baby', 'carrefour baby',
  'carrefour kids', 'carrefour classic', 'carrefour bio', 'carrefour selection', 'mercadona',
])

const NATIONAL_BRANDS = [
  // lácteos, bebidas y alimentación infantil
  'pascual', 'puleva', 'president', 'danone', 'nestle', 'nescafe', 'coca cola', 'pepsi', 'fanta', 'sprite', 'aquarius', 'nutella', 'kinder',
  'oreo', 'gallina blanca', 'lechera', 'asturiana', 'kaiku', 'calvo', 'bonduelle', 'barilla', 'brillante', 'fallera', 'ybarra',
  'hellmanns', 'heinz', 'knorr', 'maggi', 'sos', 'gallo', 'cola cao', 'nesquik', 'lays', 'pringles', 'campofrio', 'oscar mayer', 'elpozo', 'central lechera',
  'ariel', 'fairy', 'scottex', 'colhogar', 'dodot', 'mahou', 'estrella damm', 'cruzcampo', 'san miguel', 'heineken', 'font vella', 'bezoya', 'vichy',
  'larsa', 'lauki', 'covap', 'feiraco', 'hero baby', 'ordesa', 'blevit', 'almiron', 'nutriben', 'sandoz', 'sanutri', 'smileat', 'babybio',
  'holle', 'milupa', 'aptamil', 'enfamil', 'chicco', 'huggies', 'pampers', 'dodotis', 'weleda', 'mustela', 'suavinex', 'avent', 'moltex',
  'activia', 'actimel', 'yoplait', 'chobani', 'alpro', 'isola', 'vivesoy', 'don simon', 'zumosol', 'granini', 'minute maid', 'schweppes',
  'nestea', 'monster', 'red bull', 'powerade', 'gatorade', 'solan de cabras', 'lanjaron', 'cabreiroa', 'mondariz', 'sanpellegrino', 'perrier',
  'evian', 'damm', 'alhambra', 'amstel', 'budweiser', 'estrella galicia', 'voll damm', 'moritz', 'keler', 'turia', 'freixenet', 'codorniu',
  'marques de caceres', 'campo viejo', 'larios', 'bombay', 'havana club', 'brugal', 'barcelo', 'bacardi', 'jack daniels', 'ballantines',
  // despensa, conservas, dulces y snacks
  'carretilla', 'koipe', 'coosur', 'hojiblanca', 'borges', 'carbonell', 'cidacos', 'isabel', 'ortiz', 'frinsa', 'jealsa', 'escurís', 'escuris',
  'rio mare', 'palacio de oriente', 'luengo', 'marcilla', 'saimaza', 'bonka', 'tassimo', 'dolce gusto', 'nespresso', 'cacaolat', 'nocilla',
  'ferrero', 'lacasa', 'milka', 'lindt', 'suchard', 'chupa chups', 'haribo', 'fini', 'trolli', 'conguitos', 'kit kat', 'toblerone', 'twix',
  'snickers', 'bounty', 'gullon', 'artiach', 'fontaneda', 'cuetara', 'marbu', 'chips ahoy', 'bimbo', 'panrico', 'bollycao', 'kelloggs', 'kellogs',
  'special k', 'chocapic', 'weetabix', 'quaker', 'solis', 'goya', 'buitoni', 'avecrem', 'maizena', 'yatekomo', 'nissin', 'noel', 'argal',
  'casademont', 'doritos', 'ruffles', 'cheetos', 'risi', 'matutano', 'tostitos', 'bugles', 'grefusa', 'tosfrit',
  // limpieza e higiene
  'asevi', 'skip', 'persil', 'colon', 'flota', 'wipp express', 'norit', 'woolite', 'lenor', 'mimosin', 'vernel', 'sanytol', 'don limpio',
  'cillit bang', 'harpic', 'domestos', 'mr proper', 'ajax', 'finish', 'somat', 'rexona', 'nivea', 'dove', 'sanex', 'palmolive', 'lactovit',
  'magno', 'heno de pravia', 'pantene', 'head and shoulders', 'elvive', 'fructis', 'garnier', 'loreal', 'schwarzkopf', 'syoss', 'timotei',
  'herbal essences', 'colgate', 'oral b', 'signal', 'sensodyne', 'lacer', 'vitis', 'listerine', 'parodontax', 'kukident', 'fixodent', 'gillette',
  'wilkinson', 'veet', 'evax', 'ausonia', 'tampax', 'compeed', 'tena', 'hansaplast', 'durex', 'foxy', 'renova', 'kleenex', 'albal', 'neutrogena',
  'eucerin', 'isdin', 'avene', 'bioderma', 'ladival', 'staedtler', 'pelikan', 'faber castell', 'pentel', 'papermate', 'stabilo',
  // mascotas
  'purina', 'friskies', 'whiskas', 'pedigree', 'dreamies', 'sheba', 'royal canin', 'brekkies', 'affinity', 'natura diet', 'pro plan', 'proplan',
  'josera', 'acana', 'orijen', 'eukanuba', 'iams', 'gimborn', 'vitakraft', 'catsan', 'sanicat', 'tigerino', 'dentastix', 'schesir', 'animonda',
]

export const BRANDS: string[] = [...STORE_BRANDS, ...NATIONAL_BRANDS]

function uniqueSorted(list: readonly string[]): string[] {
  return [...new Set(list.map((b) => productTextKey(b)).filter(Boolean))].sort((a, b) => b.length - a.length)
}
export const BRAND_KEYS: readonly string[] = uniqueSorted(BRANDS)
export const STORE_BRAND_KEYS: ReadonlySet<string> = new Set([...STORE_BRANDS].map((b) => productTextKey(b)))

export function singular(word: string): string {
  // «yogures» → yogur, «limones» → limón, «cereales» → cereal; pero «verdes» → verde y «tomates» → tomate (la «e» es de la palabra).
  if (word.length > 4 && word.endsWith('es') && /[lrnsxz]es$/.test(word) && !/[bdt]res$/.test(word)) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/** Marca reconocida en un texto ya normalizado, o la declarada por la familia. Devuelve el texto sin la marca. */
export function extractBrand(text: string, declared: string | null | undefined): { brand: string | null; rest: string } {
  const keyed = ` ${text} `
  const candidates = [...(declared ? [productTextKey(declared)] : []), ...BRAND_KEYS].filter(Boolean).sort((a, b) => b.length - a.length)
  for (const b of candidates) {
    if (keyed.includes(` ${b} `)) return { brand: b, rest: keyed.replace(` ${b} `, ' ').trim() }
  }
  return { brand: null, rest: text }
}
