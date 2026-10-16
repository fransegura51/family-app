// Alergias e intolerancias de la ficha PRIVADA de cada miembro (DATOS DE SALUD, RGPD art. 9): catálogo cerrado, validación y motor de avisos de ingredientes.
// PURO: sin red, sin Supabase, sin IA. Este archivo NO debe importarlo ninguna función de servidor, ningún servicio de IA, ni Comunidad (lo comprueban
// src/data/dietaryPrivacyLock.test.ts y la regla de ESLint del proyecto); solo el módulo de datos src/data/dietaryRestrictions.ts y las pantallas de Cocina/Familia.
//
// REGLA DE ORO: el motor NUNCA dice que una receta es «segura». Si no encuentra coincidencias devuelve `ninguna_coincidencia` con el texto fijo
// NO_MATCH_DISCLAIMER; si no puede comprobar (receta sin ingredientes o incompleta) devuelve `sin_datos`. Los hallazgos van en tres niveles:
//   · conflicto → el ingrediente nombra el alérgeno o un derivado seguro («queso» para la leche, «harina de trigo» para el trigo);
//   · revisar   → producto compuesto o ambiguo que PUEDE llevarlo sin decirlo (salsa, caldo preparado, embutido, pesto, surimi…), o alérgeno emparentado;
//   · sin_datos → no se puede comprobar.
// El resultado NO lleva nombres de personas: solo el id de la restricción, para que la pantalla lo relacione con su dueña.
//
// FALSOS POSITIVOS / NEGATIVOS CONOCIDOS (el motor es una ayuda, no una garantía):
//   · Falsos negativos: ingredientes ocultos en productos elaborados que no se nombran («chocolate» puede llevar trazas; «pan» puede llevar leche o soja),
//     nombres regionales o extranjeros que no están en el diccionario, errores de ortografía, y todo lo que diga solo la etiqueta (trazas, contaminación cruzada).
//   · Falsos positivos: «dorada» (pescado) como adjetivo, «clara»/«mero» con otro sentido, «gluten»/«trigo» citados solo como aviso. Se evitan con excepciones
//     concretas «leche de coco», «nuez moscada», «mantequilla de cacahuete», «pan sin gluten»… pero no todas las variantes.
//   · Marcas y productos sin palabra clave («Cola Cao», «Nocilla», «galletas María») no se reconocen; «salsa de tomate» y los productos «caseros» (caldo, salsa,
//     embutido) no avisan de lo genérico (puede haber apio, gluten o leche en una salsa comercial de tomate).
//   · «sin gluten», «sin lactosa», «vegano»… escritos en el propio ingrediente se creen (el pan «sin gluten» no avisa), salvo que mencione el alérgeno concreto.
//   · No se comprueban el título ni los pasos de la receta, solo la lista de ingredientes.
//   · Alergias cruzadas: solo las relaciones listadas en dietaryRestrictionsRules.ts (frutos de cáscara entre sí; cacahuete y altramuz); el resto es médico.
import { GENERIC_COMPOUNDS, KEY_RULES, type RuleTerm } from './dietaryRestrictionsRules'

// ─── Catálogo cerrado ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

// Debe coincidir con private.dietary_allergen_keys() de la migración 0279 (lo comprueba una prueba).
export const DIETARY_ALLERGEN_KEYS = [
  'gluten', 'trigo', 'crustaceos', 'moluscos', 'huevo', 'pescado', 'cacahuete', 'soja', 'leche',
  'frutos_de_cascara', 'almendra', 'avellana', 'nuez', 'anacardo', 'pistacho', 'macadamia', 'pecana', 'nuez_de_brasil',
  'apio', 'mostaza', 'sesamo', 'sulfitos', 'altramuces',
  'lactosa', 'fructosa', 'gluten_no_celiaco',
] as const
export type DietaryAllergenKey = (typeof DIETARY_ALLERGEN_KEYS)[number]

export const DIETARY_KINDS = ['alergia', 'intolerancia', 'restriccion'] as const
export type DietaryKind = (typeof DIETARY_KINDS)[number]
export const DIETARY_SEVERITIES = ['leve', 'moderada', 'grave'] as const
export type DietarySeverity = (typeof DIETARY_SEVERITIES)[number]

export const DIETARY_KIND_LABELS: Record<DietaryKind, string> = { alergia: 'Alergia', intolerancia: 'Intolerancia', restriccion: 'Restricción' }
export const DIETARY_SEVERITY_LABELS: Record<DietarySeverity, string> = { leve: 'Leve', moderada: 'Moderada', grave: 'Grave' }

// Límites iguales a los de la base de datos (0279).
export const DIETARY_LABEL_MAX = 60
export const DIETARY_NOTE_MAX = 200
export const DIETARY_PER_MEMBER_MAX = 40
// Versión del texto del consentimiento que se registra con cada alta. Súbela cuando cambie el texto legal.
export const DIETARY_NOTICE_VERSION = 'v1'

export interface DietaryCatalogEntry {
  key: DietaryAllergenKey
  label: string
  // Complemento de «lleva …» / «relacionado con …» para los textos de aviso.
  short: string
  examples: string
  group: 'ue14' | 'otras'
  allowedKinds: readonly DietaryKind[]
  // Textos que, escritos a mano como «restricción libre», se reconocen como esta clave.
  synonyms: readonly string[]
}

const ALL_KINDS: readonly DietaryKind[] = ['alergia', 'intolerancia', 'restriccion']
const INTOL_KINDS: readonly DietaryKind[] = ['intolerancia', 'restriccion']

export const DIETARY_CATALOG: readonly DietaryCatalogEntry[] = [
  { key: 'gluten', label: 'Cereales con gluten', short: 'gluten', examples: 'trigo, centeno, cebada, avena, espelta, kamut', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['gluten', 'celiaquia', 'celiaco', 'celiaca', 'tacc', 'cereales con gluten', 'sin gluten'] },
  { key: 'trigo', label: 'Trigo', short: 'trigo', examples: 'harina de trigo, sémola, cuscús, seitán', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['trigo', 'alergia al trigo'] },
  { key: 'crustaceos', label: 'Crustáceos', short: 'crustáceos', examples: 'gamba, langostino, cangrejo, langosta', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['crustaceos', 'crustaceo'] },
  { key: 'moluscos', label: 'Moluscos', short: 'moluscos', examples: 'mejillón, almeja, calamar, pulpo', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['moluscos', 'molusco'] },
  { key: 'huevo', label: 'Huevo', short: 'huevo', examples: 'clara, yema, mayonesa', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['huevo', 'huevos'] },
  { key: 'pescado', label: 'Pescado', short: 'pescado', examples: 'merluza, salmón, atún, anchoa', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['pescado', 'pescados'] },
  { key: 'cacahuete', label: 'Cacahuete', short: 'cacahuete', examples: 'cacahuete, mantequilla de cacahuete', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['cacahuete', 'cacahuetes', 'cacahuate', 'mani'] },
  { key: 'soja', label: 'Soja', short: 'soja', examples: 'tofu, salsa de soja, edamame', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['soja', 'soya'] },
  { key: 'leche', label: 'Leche (proteínas lácteas)', short: 'leche y sus derivados', examples: 'leche, nata, queso, yogur, mantequilla', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['leche', 'lacteos', 'lacteo', 'proteinas lacteas', 'proteina de la leche', 'alergia a la leche'] },
  { key: 'frutos_de_cascara', label: 'Frutos de cáscara (todos)', short: 'frutos de cáscara', examples: 'almendra, avellana, nuez, anacardo, pistacho', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['frutos de cascara', 'frutos secos', 'fruto seco', 'fruto de cascara'] },
  { key: 'almendra', label: 'Almendra', short: 'almendra', examples: 'almendra, mazapán, turrón', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['almendra', 'almendras'] },
  { key: 'avellana', label: 'Avellana', short: 'avellana', examples: 'avellana, crema de avellanas', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['avellana', 'avellanas'] },
  { key: 'nuez', label: 'Nuez', short: 'nuez', examples: 'nuez, nueces', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['nuez', 'nueces'] },
  { key: 'anacardo', label: 'Anacardo', short: 'anacardo', examples: 'anacardo, anacardos', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['anacardo', 'anacardos', 'caju'] },
  { key: 'pistacho', label: 'Pistacho', short: 'pistacho', examples: 'pistacho, pistachos', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['pistacho', 'pistachos'] },
  { key: 'macadamia', label: 'Nuez de macadamia', short: 'macadamia', examples: 'macadamia', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['macadamia', 'nuez de macadamia'] },
  { key: 'pecana', label: 'Pecana', short: 'pecana', examples: 'pecana, nuez pecana', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['pecana', 'pecan', 'pacana', 'nuez pecana'] },
  { key: 'nuez_de_brasil', label: 'Nuez de Brasil', short: 'nuez de Brasil', examples: 'nuez de Brasil, castaña de Pará', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['nuez de brasil', 'nueces de brasil'] },
  { key: 'apio', label: 'Apio', short: 'apio', examples: 'apio, apionabo, caldos de verduras', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['apio'] },
  { key: 'mostaza', label: 'Mostaza', short: 'mostaza', examples: 'mostaza, salsas y aliños', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['mostaza'] },
  { key: 'sesamo', label: 'Sésamo', short: 'sésamo', examples: 'sésamo, tahini, hummus', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['sesamo', 'ajonjoli'] },
  { key: 'sulfitos', label: 'Dióxido de azufre y sulfitos', short: 'sulfitos', examples: 'vino, fruta seca, vinagre', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['sulfitos', 'sulfito', 'dioxido de azufre'] },
  { key: 'altramuces', label: 'Altramuces', short: 'altramuz', examples: 'altramuz, harina de altramuz', group: 'ue14', allowedKinds: ALL_KINDS, synonyms: ['altramuces', 'altramuz', 'lupino'] },
  { key: 'lactosa', label: 'Lactosa (intolerancia)', short: 'lactosa', examples: 'leche, nata, yogur, queso fresco', group: 'otras', allowedKinds: INTOL_KINDS, synonyms: ['lactosa', 'intolerancia a la lactosa'] },
  { key: 'fructosa', label: 'Fructosa (intolerancia)', short: 'fructosa', examples: 'miel, jarabe de fructosa, algunas frutas', group: 'otras', allowedKinds: INTOL_KINDS, synonyms: ['fructosa', 'intolerancia a la fructosa'] },
  { key: 'gluten_no_celiaco', label: 'Gluten (sensibilidad no celíaca)', short: 'gluten', examples: 'trigo, centeno, cebada', group: 'otras', allowedKinds: INTOL_KINDS, synonyms: ['sensibilidad al gluten', 'gluten no celiaco'] },
]

const CATALOG_BY_KEY = new Map<string, DietaryCatalogEntry>(DIETARY_CATALOG.map((e) => [e.key, e]))
export function getDietaryCatalogEntry(key: string): DietaryCatalogEntry | null {
  return CATALOG_BY_KEY.get(key) ?? null
}
export function isDietaryAllergenKey(value: unknown): value is DietaryAllergenKey {
  return typeof value === 'string' && CATALOG_BY_KEY.has(value)
}

// ─── Modelo ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DietaryRestriction {
  id: string
  memberId: string
  kind: DietaryKind
  // O una clave del catálogo, O un texto libre corto (nunca los dos).
  allergenKey: DietaryAllergenKey | null
  customLabel: string | null
  severity: DietarySeverity | null
  note: string | null
  createdAt: string
  updatedAt: string
}
// Lo único que necesita el motor (una DietaryRestriction completa vale).
export type DietaryRestrictionInput = Pick<DietaryRestriction, 'id' | 'kind' | 'allergenKey' | 'customLabel'> & { severity?: DietarySeverity | null }

export interface RecipeIngredientInput {
  name: string
  quantity?: string | null
  unit?: string | null
}

export type DietaryFindingLevel = 'conflicto' | 'revisar' | 'sin_datos'
export interface DietaryFinding {
  level: DietaryFindingLevel
  // Id de la restricción afectada (la pantalla la relaciona con la persona). null en «sin datos» generales de la receta.
  restrictionId: string | null
  kind: DietaryKind | null
  severity: DietarySeverity | null
  ingredientIndex: number | null
  // Texto del ingrediente tal como está en la receta.
  ingredient: string | null
  // Frases del diccionario que coincidieron (fijas, no texto del usuario).
  matchedTerms: string[]
  // Texto fijo en español: por qué se avisa.
  reason: string
}
export type RecipeDietaryStatus = 'hallazgos' | 'sin_datos' | 'ninguna_coincidencia' | 'sin_restricciones'
export interface RecipeDietaryCheck {
  status: RecipeDietaryStatus
  findings: DietaryFinding[]
  counts: { conflicto: number; revisar: number; sin_datos: number }
  // Texto para mostrar según el estado (vacío si no hay restricciones registradas).
  message: string
  // Descargo general: se muestra SIEMPRE junto a cualquier aviso.
  disclaimer: string
}

// ─── Textos fijos (todo lo que el motor puede mostrar) ──────────────────────────────────────────────────────────────────────────────────────────

export const NO_MATCH_DISCLAIMER = 'No hemos detectado coincidencias con lo que tienes registrado, pero esto no garantiza que la receta sea segura: revisa etiquetas y posibles trazas.'
export const DIETARY_GENERAL_DISCLAIMER = 'PEPA es una ayuda de organización, no un consejo médico ni una garantía. Puede equivocarse: confirma siempre con la persona afectada y con su médico.'
export const REVIEW_MESSAGE = 'Revisa estos ingredientes antes de cocinar. PEPA no conoce las trazas ni lo que lleva cada producto: confirma siempre las etiquetas.'
export const NO_DATA_MESSAGE = 'No se puede comprobar esta receta: faltan ingredientes o están incompletos. Revísala tú a mano.'
export const NO_INGREDIENTS_REASON = 'La receta no tiene ingredientes anotados, así que PEPA no puede comprobar nada.'
export const INCOMPLETE_INGREDIENT_REASON = 'Este ingrediente está incompleto (sin nombre claro): PEPA no puede comprobarlo.'
export const UNCHECKABLE_RESTRICTION_REASON = 'Esta restricción está escrita de una forma que PEPA no puede comprobar.'
export const CUSTOM_MATCH_REASON = 'Coincide con lo que escribiste tú en la ficha. Revisa si te afecta.'
export const CLAIM_DOWNGRADE_REASON = 'El ingrediente indica que no lo lleva, pero menciona un producto relacionado. Confírmalo en la etiqueta.'

function reasonConflicto(term: string, short: string): string {
  return `Contiene «${term}»: es o lleva ${short}.`
}
function reasonRevisar(term: string, short: string): string {
  return `«${term}» puede llevar ${short} sin que se indique. Revisa la etiqueta o pregunta.`
}
function reasonClaimed(term: string, short: string): string {
  return `Indica que no lleva ${short}, pero menciona «${term}». Confírmalo en la etiqueta.`
}

// ─── Normalización y texto ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'al', 'un', 'una', 'unos', 'unas', 'en', 'para', 'a', 'por', 'lo', 'su', 'sus'])
const CONNECTORS = new Set(['y', 'o', 'e', 'ni'])
const NEGATORS = new Set(['sin', 'libre', 'exento'])

// Minúsculas y sin tildes (la «ñ» pasa a «n»: «piñón» = «pinon»).
export function normalizeDietaryText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' y ')
}

// Plural y raíz sencillos y SIMÉTRICOS (se aplican igual a la receta y al diccionario): «nueces»→«nuez», «mejillones»→«mejillon», «cacahuetes»→«cacahuete».
export function stemWord(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith('ces')) return word.slice(0, -3) + 'z'
  if (word.length > 4 && /[nlrdzj]es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

// Variantes de una palabra de la receta: su raíz y, si parece un diminutivo (-ito/-ita), la palabra base («quesito»→«queso», «lechita»→«leche»).
function variantsOf(raw: string): string[] {
  const s = stemWord(raw)
  const out = [s]
  if (s.length >= 6) {
    if (s.endsWith('ito')) out.push(s.slice(0, -3) + 'o', s.slice(0, -3) + 'e')
    else if (s.endsWith('ita')) out.push(s.slice(0, -3) + 'a', s.slice(0, -3) + 'e')
  }
  return out
}

interface Tok {
  raw: string
  alts: string[]
}

// Un ingrediente se parte en trozos por , ; ( ) / : etc. Una negación («sin») no cruza de un trozo a otro.
function segmentsOf(text: string): Tok[][] {
  return normalizeDietaryText(text)
    .split(/[,;()[\]/:·•|\n]+/)
    .map((seg) =>
      seg
        .split(/[^a-z0-9]+/)
        .filter((w) => w && !STOPWORDS.has(w))
        .map((raw) => ({ raw, alts: variantsOf(raw) })),
    )
    .filter((seg) => seg.length > 0)
}

function phraseTokens(display: string): string[] {
  return normalizeDietaryText(display)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stemWord)
}

// ─── Reglas compiladas ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type TermLevel = 'named' | 'cls' | 'review'
interface CTerm {
  display: string
  // Producto compuesto genérico (salsa, caldo, embutido…): no avisa si el ingrediente dice «casero».
  generic: boolean
  tokens: string[]
  not: string[][]
  why?: string
  level: TermLevel
}
interface CKey {
  terms: CTerm[]
  selfClaim: string[][]
  freeClaim: string[][]
  downgradeClaim: string[][]
}

const GENERIC_SET = new Set(GENERIC_COMPOUNDS)
const HOMEMADE = new Set(['casero', 'casera', 'caseros', 'caseras'])

function compileTerm(t: RuleTerm, level: TermLevel): CTerm {
  const obj = typeof t === 'string' ? { p: t } : t
  const why = 'why' in obj ? obj.why : undefined
  const not = 'not' in obj ? (obj.not ?? []).map(phraseTokens).filter((x) => x.length > 0) : []
  return { display: obj.p, generic: GENERIC_SET.has(obj.p), tokens: phraseTokens(obj.p), not, why, level }
}

const COMPILED: Record<string, CKey> = {}
// Frases que declaran la ausencia por sí solas («gluten free», «vegano»): su texto no cuenta como mención del alérgeno.
const FREE_CLAIMS: string[][] = []
// Índice global de TODAS las frases (para saber qué palabras son «elementos reconocidos» al seguir una negación en cadena: «sin gluten ni lactosa»).
const RECOGNIZED = new Map<string, string[][]>()
function addRecognized(tokens: string[]) {
  if (tokens.length === 0) return
  const list = RECOGNIZED.get(tokens[0]) ?? []
  list.push(tokens)
  RECOGNIZED.set(tokens[0], list)
}
for (const key of DIETARY_ALLERGEN_KEYS) {
  const r = KEY_RULES[key]
  const terms = [
    ...r.named.map((t) => compileTerm(t, 'named')),
    ...(r.cls ?? []).map((t) => compileTerm(t, 'cls')),
    ...(r.review ?? []).map((t) => compileTerm(t, 'review')),
  ].filter((t) => t.tokens.length > 0)
  const compiled: CKey = {
    terms,
    selfClaim: r.selfClaim.map(phraseTokens),
    freeClaim: (r.freeClaim ?? []).map(phraseTokens),
    downgradeClaim: (r.downgradeClaim ?? []).map(phraseTokens),
  }
  COMPILED[key] = compiled
  for (const t of terms) addRecognized(t.tokens)
  for (const c of [...compiled.selfClaim, ...compiled.freeClaim, ...compiled.downgradeClaim]) addRecognized(c)
  for (const c of compiled.freeClaim) FREE_CLAIMS.push(c)
}

function matchesAt(seg: Tok[], i: number, phrase: string[]): boolean {
  if (i + phrase.length > seg.length) return false
  for (let j = 0; j < phrase.length; j++) if (!seg[i + j].alts.includes(phrase[j])) return false
  return true
}

interface SegInfo {
  toks: Tok[]
  // Posiciones donde empieza un elemento reconocido que va negado («sin X», «libre de X», «sin Y ni X»).
  negated: Set<number>
}
interface IngredientAnalysis {
  segs: SegInfo[]
}

function analyze(text: string): IngredientAnalysis {
  const segs: SegInfo[] = segmentsOf(text).map((toks) => {
    const items: { start: number; end: number }[] = []
    for (let i = 0; i < toks.length; i++) {
      for (const alt of toks[i].alts) {
        for (const phrase of RECOGNIZED.get(alt) ?? []) if (matchesAt(toks, i, phrase)) items.push({ start: i, end: i + phrase.length })
      }
    }
    const memo = new Map<number, boolean>()
    const isNeg = (start: number): boolean => {
      const cached = memo.get(start)
      if (cached !== undefined) return cached
      memo.set(start, false) // evita ciclos
      const prev = toks[start - 1]
      let result = false
      if (prev) {
        if (NEGATORS.has(prev.raw)) result = true
        else if (CONNECTORS.has(prev.raw)) result = items.some((it) => it.end === start - 1 && isNeg(it.start))
      }
      memo.set(start, result)
      return result
    }
    const negated = new Set<number>()
    for (const it of items) if (isNeg(it.start)) negated.add(it.start)
    for (let i = 0; i < toks.length; i++) {
      for (const c of FREE_CLAIMS) if (matchesAt(toks, i, c)) for (let j = i; j < i + c.length; j++) negated.add(j)
    }
    return { toks, negated }
  })
  return { segs }
}

function followedByAny(seg: Tok[], end: number, nots: string[][]): boolean {
  return nots.some((n) => matchesAt(seg, end, n))
}

interface KeyHit {
  level: 'conflicto' | 'revisar'
  terms: string[]
  reason: string
}

// Evalúa UNA clave del catálogo contra un ingrediente ya analizado.
function evaluateKey(a: IngredientAnalysis, key: DietaryAllergenKey): KeyHit | null {
  const ck = COMPILED[key]
  const entry = CATALOG_BY_KEY.get(key)
  if (!ck || !entry) return null
  let claimSuppress = false
  let claimDowngrade = false
  for (const s of a.segs) {
    for (let i = 0; i < s.toks.length; i++) {
      for (const c of ck.selfClaim) if (s.negated.has(i) && matchesAt(s.toks, i, c)) claimSuppress = true
      for (const c of ck.freeClaim) if (matchesAt(s.toks, i, c)) claimSuppress = true
      for (const c of ck.downgradeClaim) if (s.negated.has(i) && matchesAt(s.toks, i, c)) claimDowngrade = true
    }
  }
  const hits: { term: CTerm; afterCon: boolean }[] = []
  const homemade = a.segs.some((s) => s.toks.some((t) => HOMEMADE.has(t.raw)))
  for (const s of a.segs) {
    const firstCon = s.toks.findIndex((t) => t.raw === 'con')
    for (let i = 0; i < s.toks.length; i++) {
      for (const term of ck.terms) {
        if (!matchesAt(s.toks, i, term.tokens)) continue
        if (s.negated.has(i)) continue // «sin leche»: es justo lo contrario
        if (followedByAny(s.toks, i + term.tokens.length, term.not)) continue
        // «caldo casero», «salsa casera»: lo has hecho tú; solo el apio sigue avisando (casi todo caldo lo lleva).
        if (homemade && term.generic && term.level === 'review' && key !== 'apio') continue
        // «galletas veganas con leche»: lo que viene después de «con» se añade de nuevo, la declaración ya no lo cubre.
        hits.push({ term, afterCon: firstCon >= 0 && i > firstCon })
      }
    }
  }
  if (hits.length === 0) return null
  const resolved: { level: 'conflicto' | 'revisar'; term: CTerm; claimed: boolean }[] = []
  for (const { term, afterCon } of hits) {
    const suppress = claimSuppress && !afterCon
    const downgrade = claimDowngrade && !afterCon
    if (term.level === 'named') {
      resolved.push({ level: suppress ? 'revisar' : 'conflicto', term, claimed: suppress })
    } else if (term.level === 'cls') {
      if (suppress) continue
      resolved.push({ level: downgrade ? 'revisar' : 'conflicto', term, claimed: downgrade })
    } else {
      if (suppress) continue
      resolved.push({ level: 'revisar', term, claimed: false })
    }
  }
  if (resolved.length === 0) return null
  const top: 'conflicto' | 'revisar' = resolved.some((r) => r.level === 'conflicto') ? 'conflicto' : 'revisar'
  const atTop = resolved.filter((r) => r.level === top)
  const first = atTop[0]
  const terms = [...new Set(atTop.map((r) => r.term.display))].slice(0, 4)
  let reason: string
  if (first.term.why) reason = first.term.why
  else if (first.claimed) reason = reasonClaimed(first.term.display, entry.short)
  else reason = top === 'conflicto' ? reasonConflicto(first.term.display, entry.short) : reasonRevisar(first.term.display, entry.short)
  return { level: top, terms, reason }
}

// Texto libre escrito a mano («kiwi», «histamina»): coincide si sus palabras aparecen seguidas en el ingrediente y no van negadas. Nivel «revisar».
function evaluateCustom(a: IngredientAnalysis, label: string): KeyHit | null {
  const tokens = phraseTokens(label)
  if (tokens.length === 0) return null
  for (const s of a.segs) {
    for (let i = 0; i < s.toks.length; i++) {
      if (!matchesAt(s.toks, i, tokens)) continue
      // La negación de un texto libre solo se detecta de forma directa («sin kiwi»).
      const prev = s.toks[i - 1]
      if (prev && NEGATORS.has(prev.raw)) continue
      return { level: 'revisar', terms: [label.trim()], reason: CUSTOM_MATCH_REASON }
    }
  }
  return null
}

// ─── Reconocer un texto libre como una clave del catálogo ─────────────────────────────────────────────────────────────────────────────────────────

// «Gluten», «frutos secos», «Lactosa»… escritos a mano se reconocen como la clave del catálogo (para sugerirla y para que el motor los trate igual).
export function suggestCatalogKeys(text: string): DietaryAllergenKey[] {
  const norm = phraseTokens(text).join(' ')
  if (!norm) return []
  const out: DietaryAllergenKey[] = []
  for (const e of DIETARY_CATALOG) {
    const candidates = [e.label, e.key.replace(/_/g, ' '), ...e.synonyms]
    if (candidates.some((c) => phraseTokens(c).join(' ') === norm)) out.push(e.key)
  }
  return out
}

// ─── Validación de lo que escribe la persona (misma regla que la base de datos) ─────────────────────────────────────────────────────────────────

export interface DietaryDraft {
  kind: string
  allergenKey?: string | null
  customLabel?: string | null
  severity?: string | null
  note?: string | null
}
export type DietaryDraftError = 'kind' | 'key' | 'both' | 'none' | 'label' | 'note' | 'severity' | 'kind_not_allowed'
export type DietaryDraftResult =
  | { ok: true; value: { kind: DietaryKind; allergenKey: DietaryAllergenKey | null; customLabel: string | null; severity: DietarySeverity | null; note: string | null } }
  | { ok: false; error: DietaryDraftError }

export function validateDietaryDraft(draft: DietaryDraft): DietaryDraftResult {
  if (!(DIETARY_KINDS as readonly string[]).includes(draft.kind)) return { ok: false, error: 'kind' }
  const kind = draft.kind as DietaryKind
  const label = (draft.customLabel ?? '').replace(/\s+/g, ' ').trim()
  const note = (draft.note ?? '').trim()
  const hasKey = draft.allergenKey !== null && draft.allergenKey !== undefined && draft.allergenKey !== ''
  if (hasKey && label) return { ok: false, error: 'both' }
  if (!hasKey && !label) return { ok: false, error: 'none' }
  if (hasKey && !isDietaryAllergenKey(draft.allergenKey)) return { ok: false, error: 'key' }
  if (label.length > DIETARY_LABEL_MAX) return { ok: false, error: 'label' }
  if (note.length > DIETARY_NOTE_MAX) return { ok: false, error: 'note' }
  const severity = draft.severity ? draft.severity : null
  if (severity !== null && !(DIETARY_SEVERITIES as readonly string[]).includes(severity)) return { ok: false, error: 'severity' }
  if (hasKey) {
    const entry = CATALOG_BY_KEY.get(draft.allergenKey as string)
    if (entry && !entry.allowedKinds.includes(kind)) return { ok: false, error: 'kind_not_allowed' }
  }
  return {
    ok: true,
    value: {
      kind,
      allergenKey: hasKey ? (draft.allergenKey as DietaryAllergenKey) : null,
      customLabel: hasKey ? null : label,
      severity: severity as DietarySeverity | null,
      note: note || null,
    },
  }
}

// Nombre que se enseña de una restricción (sin nombres de personas).
export function dietaryRestrictionLabel(r: Pick<DietaryRestriction, 'allergenKey' | 'customLabel'>): string {
  if (r.allergenKey) return CATALOG_BY_KEY.get(r.allergenKey)?.label ?? r.allergenKey
  return r.customLabel ?? ''
}

// ─── El motor ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const UNIT_WORDS = new Set(['g', 'gr', 'kg', 'mg', 'ml', 'l', 'cl', 'dl', 'cucharada', 'cucharadita', 'cdta', 'cda', 'pizca', 'taza', 'vaso', 'unidad', 'ud', 'uds', 'gusto', 'puñado', 'punado', 'rama', 'diente', 'lata', 'sobre', 'paquete', 'loncha', 'rodaja'])

// Una línea como «Para la salsa:» es un título de grupo, no un ingrediente.
function isHeader(name: string): boolean {
  return name.trim().endsWith(':')
}
// Nombre vacío, de una sola letra o que solo es una cantidad («200 g», «al gusto»): no se puede comprobar.
function isIncomplete(name: string): boolean {
  const words = normalizeDietaryText(name).split(/[^a-z0-9]+/).filter((w) => w && !STOPWORDS.has(w))
  if (words.length === 0) return true
  return words.every((w) => /^\d+$/.test(w) || UNIT_WORDS.has(w) || UNIT_WORDS.has(stemWord(w)) || w.length < 2)
}

// Comprueba una receta contra las restricciones registradas. NUNCA devuelve «segura»: si no hay coincidencias, `ninguna_coincidencia` + NO_MATCH_DISCLAIMER.
export function checkRecipeIngredients(ingredients: readonly RecipeIngredientInput[], restrictions: readonly DietaryRestrictionInput[]): RecipeDietaryCheck {
  const findings: DietaryFinding[] = []
  const rows = ingredients.map((ing, index) => ({ ing, index })).filter(({ ing }) => !isHeader(ing.name ?? ''))
  const usable = rows.filter(({ ing }) => !isIncomplete(ing.name ?? ''))

  if (restrictions.length === 0) {
    return { status: 'sin_restricciones', findings: [], counts: { conflicto: 0, revisar: 0, sin_datos: 0 }, message: '', disclaimer: DIETARY_GENERAL_DISCLAIMER }
  }

  if (rows.length === 0) {
    findings.push({ level: 'sin_datos', restrictionId: null, kind: null, severity: null, ingredientIndex: null, ingredient: null, matchedTerms: [], reason: NO_INGREDIENTS_REASON })
  }
  for (const { ing, index } of rows) {
    if (isIncomplete(ing.name ?? '')) {
      findings.push({ level: 'sin_datos', restrictionId: null, kind: null, severity: null, ingredientIndex: index, ingredient: ing.name ?? '', matchedTerms: [], reason: INCOMPLETE_INGREDIENT_REASON })
    }
  }

  // Restricciones de texto libre que no se pueden comprobar (sin palabras útiles): se dice, no se ignora en silencio.
  const checkable = restrictions.filter((r) => {
    if (r.allergenKey) return true
    const ok = phraseTokens(r.customLabel ?? '').length > 0
    if (!ok) findings.push({ level: 'sin_datos', restrictionId: r.id, kind: r.kind, severity: r.severity ?? null, ingredientIndex: null, ingredient: null, matchedTerms: [], reason: UNCHECKABLE_RESTRICTION_REASON })
    return ok
  })

  const keyCache = new Map<string, KeyHit | null>()
  for (const { ing, index } of usable) {
    // Se mira el nombre y también la cantidad y la unidad (en recetas importadas a veces la línea entera cae ahí). Separados por coma: una negación no los cruza.
    const analysis = analyze([ing.name, ing.quantity ?? '', ing.unit ?? ''].join(' , '))
    for (const r of checkable) {
      const hits: KeyHit[] = []
      const keys: DietaryAllergenKey[] = r.allergenKey ? [r.allergenKey] : suggestCatalogKeys(r.customLabel ?? '')
      for (const k of keys) {
        const ckey = `${index}|${k}`
        if (!keyCache.has(ckey)) keyCache.set(ckey, evaluateKey(analysis, k))
        const h = keyCache.get(ckey)
        if (h) hits.push(h)
      }
      if (!r.allergenKey) {
        const h = evaluateCustom(analysis, r.customLabel ?? '')
        if (h) hits.push(h)
      }
      if (hits.length === 0) continue
      const best = hits.find((h) => h.level === 'conflicto') ?? hits[0]
      findings.push({
        level: best.level,
        restrictionId: r.id,
        kind: r.kind,
        severity: r.severity ?? null,
        ingredientIndex: index,
        ingredient: ing.name ?? '',
        matchedTerms: [...new Set(hits.filter((h) => h.level === best.level).flatMap((h) => h.terms))].slice(0, 4),
        reason: best.reason,
      })
    }
  }

  const order: Record<DietaryFindingLevel, number> = { conflicto: 0, revisar: 1, sin_datos: 2 }
  findings.sort((x, y) => order[x.level] - order[y.level] || (x.ingredientIndex ?? -1) - (y.ingredientIndex ?? -1))
  const counts = {
    conflicto: findings.filter((f) => f.level === 'conflicto').length,
    revisar: findings.filter((f) => f.level === 'revisar').length,
    sin_datos: findings.filter((f) => f.level === 'sin_datos').length,
  }
  let status: RecipeDietaryStatus
  let message: string
  if (counts.conflicto + counts.revisar > 0) {
    status = 'hallazgos'
    message = REVIEW_MESSAGE
  } else if (counts.sin_datos > 0) {
    status = 'sin_datos'
    message = NO_DATA_MESSAGE
  } else {
    status = 'ninguna_coincidencia'
    message = NO_MATCH_DISCLAIMER
  }
  return { status, findings, counts, message, disclaimer: DIETARY_GENERAL_DISCLAIMER }
}

// Marca discreta para tarjetas y listas. Devuelve null cuando no hay nada que decir (JAMÁS una insignia de «todo bien»).
export function dietaryBadgeText(check: RecipeDietaryCheck): string | null {
  if (check.status === 'hallazgos') {
    const n = check.counts.conflicto + check.counts.revisar
    return n === 1 ? 'Revisar: 1 aviso' : `Revisar: ${n} avisos`
  }
  if (check.status === 'sin_datos') return 'No se puede comprobar'
  return null
}
