// Separar productos dictados que la transcripción ha pegado ("leche huevo",
// "leche huevos y pan"), SIN usar IA cuando se puede decidir de forma fiable.
//
// Causa de la incidencia "leche, huevo, pan": la voz a veces pierde una coma y
// llega "leche huevo, pan". splitEntries solo separa por comas y por " y ", así
// que queda ["leche huevo", "pan"] — dos entradas — y la IA de separación solo
// se llamaba cuando había UNA entrada, así que "leche huevo" nunca se corregía.
//
// Aquí se reconoce cada palabra contra una lista de productos habituales (con sus
// adjetivos: "leche entera", "pan de molde") y, si TODA la entrada se explica con
// palabras conocidas, se separa. Si aparece una palabra desconocida ("pan Bimbo")
// no se decide: queda como estaba (y solo se consulta a la IA cuando aporta).
import { normalize } from '@/domain/voiceQuery'

// Productos que se compran solos. Formas en singular y sin acentos.
const STAPLES = new Set(
  (
    'leche huevo pan agua vino cerveza patata tomate cebolla ajo zanahoria lechuga pepino pimiento calabacin berenjena champinon seta espinaca judia ' +
    'guisante lenteja garbanzo alubia arroz pasta macarron espagueti fideo harina azucar sal aceite vinagre mayonesa ketchup mostaza atun sardina ' +
    'salmon merluza bacalao gamba mejillon pollo pavo cerdo ternera cordero jamon chorizo salchicha salchichon lomo bacon panceta hamburguesa queso ' +
    'yogur mantequilla margarina nata flan natilla cuajada fruta manzana pera platano naranja mandarina limon fresa uva melon sandia melocoton kiwi ' +
    'pina cereza aguacate galleta cereal chocolate cacao cafe te infusion zumo refresco cola tostada croissant bollo magdalena donut papel detergente ' +
    'suavizante lejia jabon champu gel dentifrico cepillo esponja bayeta bolsa servilleta panal toallita compresa desodorante colonia pila bombilla ' +
    'mermelada miel nutella aceituna pepinillo ensalada sopa caldo pizza empanadilla croqueta nugget helado hielo edulcorante levadura pimienta ' +
    'oregano perejil albahaca curry pimenton canela vainilla maiz palomitas nuez almendra cacahuete pistacho anacardo avellana pasa datil higo ciruela ' +
    'brocoli coliflor col puerro apio calabaza remolacha rabano esparrago alcachofa acelga champin ternera solomillo costilla filete pescado marisco ' +
    'calamar pulpo sepia anchoa tortilla tortita pan_rallado turron polvoron mazapan cordero conejo pato gallina embutido morcilla mortadela'
  ).split(' '),
)

// Palabras que acompañan a un producto y no son otro producto.
const MODIFIERS = new Set(
  (
    'entera desnatada semidesnatada natural griego griega integral fresco fresca frescos frescas rallado rallada picada molida molido congelado congelada ' +
    'ecologico ecologica gas mineral grande pequeno pequena tinto blanco rosado dulce salado light cocido cocida frito frita ahumado curado serrano york ' +
    'iberico tierno maduro verde rojo amarillo negro plana redondo largo tostado tostada higienico normal sabor virgen extra'
  ).split(' '),
)

// Cantidades y envases delante del producto: "dos litros de leche", "un paquete de pasta".
const PREFIXES = new Set(
  (
    'un una uno dos tres cuatro cinco seis siete ocho nueve diez medio media kilo kilos kg litro litros l gramos gramo g paquete paquetes botella botellas ' +
    'lata latas docena docenas bolsa bolsas caja cajas pack packs tarro tarros brik briks barra barras de del'
  ).split(' '),
)

function stem(token: string): string {
  const t = normalize(token).replace(/[^a-z0-9ñ]/g, '')
  return t.length > 3 && t.endsWith('es') && !t.endsWith('ces') ? t.slice(0, -2) : t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t
}

function isStaple(token: string): boolean {
  const norm = normalize(token).replace(/[^a-z0-9ñ]/g, '')
  return STAPLES.has(norm) || STAPLES.has(stem(token))
}

function isNumber(token: string): boolean {
  return /^\d+([.,]\d+)?$/.test(token)
}

export type EntryAnalysis = { kind: 'single' } | { kind: 'split'; parts: string[] } | { kind: 'ambiguous' }

export function analyzeEntry(entry: string): EntryAnalysis {
  const tokens = entry.trim().split(/\s+/).filter(Boolean)
  if (tokens.length <= 1) return { kind: 'single' }

  const parts: string[] = []
  let prefix: string[] = []
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    const norm = normalize(token).replace(/[^a-z0-9ñ]/g, '')

    // Cantidad o envase delante de un producto.
    if (isNumber(token) || PREFIXES.has(norm)) {
      prefix.push(token)
      i++
      continue
    }
    if (!isStaple(token)) return { kind: 'ambiguous' }

    const part = [...prefix, token]
    prefix = []
    i++
    // Adjetivos y complementos que pertenecen a ese producto.
    while (i < tokens.length) {
      const next = normalize(tokens[i]).replace(/[^a-z0-9ñ]/g, '')
      if (MODIFIERS.has(next)) {
        part.push(tokens[i])
        i++
      } else if ((next === 'de' || next === 'del' || next === 'sin') && i + 1 < tokens.length) {
        part.push(tokens[i], tokens[i + 1])
        i += 2
      } else break
    }
    parts.push(part.join(' '))
  }
  // Una cantidad suelta al final ("leche dos") no se explica: no se decide.
  if (prefix.length > 0 || parts.length === 0) return { kind: 'ambiguous' }
  return parts.length === 1 ? { kind: 'single' } : { kind: 'split', parts }
}

export interface ExpandedEntries {
  entries: string[]
  // Entradas que siguen sin decidirse (palabras desconocidas) — candidatas a la IA.
  ambiguous: string[]
}

// Aplica el análisis a cada entrada que ya separó splitEntries (comas y " y ").
export function expandEntries(entries: string[]): ExpandedEntries {
  const result: string[] = []
  const ambiguous: string[] = []
  for (const entry of entries) {
    const analysis = analyzeEntry(entry)
    if (analysis.kind === 'split') result.push(...analysis.parts)
    else {
      result.push(entry)
      if (analysis.kind === 'ambiguous') ambiguous.push(entry)
    }
  }
  return { entries: result, ambiguous }
}

// ¿Merece la pena preguntar a la IA por esta entrada? Solo si sigue sin decidirse Y
// puede ser varios productos: 3 o más palabras, o dos palabras cuando es lo único
// que se ha dictado (comportamiento de siempre para "patata lechuga").
export function shouldAskAi(entry: string, totalEntries: number): boolean {
  const words = entry.trim().split(/\s+/).length
  return words >= 3 || (words >= 2 && totalEntries === 1)
}
