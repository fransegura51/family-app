// Núcleo PURO (sin APIs de Deno) del análisis de Economía con IA. Lo usan las DOS partes, para que
// sea exactamente la misma comprobación:
//   - el servidor (financeAnalysis.ts): valida lo que le llega y lo que devuelve el modelo;
//   - la app (src/domain/financeAnalysisAi.ts): vuelve a validarlo antes de enseñar nada.
//
// Principio: la IA NO escribe cifras. Recibe HECHOS agregados, cada uno con una referencia
// ("expenses.total"), y contesta citándolos como {{expenses.total}}. Ningún dígito puede aparecer
// fuera de una referencia, así que cualquier número que se vea lo ha puesto el código.

export const FINDING_TYPES = ['expense_change', 'category_change', 'savings', 'fixed_variable', 'price_change', 'data_quality', 'other'] as const
export type FindingType = (typeof FINDING_TYPES)[number]

export const FACT_KINDS = ['eur', 'eur_signed', 'pct', 'pct_signed', 'num', 'text'] as const
export type FactKind = (typeof FACT_KINDS)[number]

export const ANALYSIS_FOCUSES = ['overview', 'conclusions', 'explain'] as const
export type AnalysisFocus = (typeof ANALYSIS_FOCUSES)[number]

export interface AnalysisFact {
  ref: string
  label: string
  value: number | string
  kind: FactKind
}

export interface AiFinding {
  type: FindingType
  title: string
  explanation: string
  evidence: string[]
}

export interface AiAnalysisOutput {
  summary: string
  findings: AiFinding[]
  suggestions: string[]
}

export const MAX_FACTS = 90

// Nivel de detalle pedido: breve (por defecto, conversacional, casi sin cifras) o completo.
export const ANALYSIS_DETAILS = ['brief', 'full'] as const
export type AnalysisDetail = (typeof ANALYSIS_DETAILS)[number]

// Las referencias que son cifras (todo salvo los textos).
export function numericRefsOf(facts: AnalysisFact[]): Set<string> {
  return new Set(facts.filter((f) => f.kind !== 'text').map((f) => f.ref))
}
const REF_RE = /^[a-z0-9_.]{1,40}$/
const TOKEN = /\{\{\s*([a-z0-9_.]{1,40})\s*\}\}/g
const MAX_SUMMARY = 420
const MAX_TITLE = 80
const MAX_EXPLANATION = 320
const MAX_SUGGESTION = 260

// Nada de esto puede decirlo la IA: juicios ("gastáis demasiado") u órdenes financieras
// ("cancela el seguro", "invierte", "cambia de banco").
const FORBIDDEN =
  /\b(?:demasiado|excesiv\w+|despilfarr\w+|irresponsable\w*|malos habitos|gastais mucho|gastan mucho|cancela\w*|cancelar\w*|eliminar\w*|elimina\w*|dejad de|deja de|invierte|invertid|invertir|inversion\w*|cambia de banco|cambiad de banco|contrata\w*|vende\w*|prestamo\w*|hipoteca\w*|deuda\w*|seguro\w*|debeis|debes|tenei?s que|tienes que)\b/
// Una sugerencia solo puede invitar a REVISAR o mirar.
const REVIEW_WORDS = /\b(?:revis\w+|mirar|mirad|valorar|valorad|comprobar|comprobad|fijaros|fijate|repasar|repasad|vistazo|prestar atencion|tener en cuenta)\b/

export function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 32) return true
  }
  return false
}

export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1])
}

// El texto sin las referencias no puede llevar ningún dígito: toda cifra sale de un valor calculado.
function textIsSafe(text: unknown, refs: Set<string>, maxLen: number, minLen = 3): text is string {
  if (typeof text !== 'string' || text.length < minLen || text.length > maxLen) return false
  if (hasControlChars(text)) return false
  if (!tokensIn(text).every((t) => refs.has(t))) return false
  const bare = text.replace(TOKEN, ' ')
  if (/\d/.test(bare) || /[€%]/.test(bare) || /\{\{|\}\}/.test(bare)) return false
  if (/https?:|www\./.test(bare)) return false
  if (FORBIDDEN.test(plain(bare))) return false
  return true
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

// Lo que la IA devuelve. null = no válido (se descarta entero y PEPA contesta con código).
// `numericRefs`: las referencias que son cifras (importes, porcentajes, contadores).
//  - Modo COMPLETO: un resumen sin ninguna cifra citada no aporta nada sobre lo que ya calcula el código: se rechaza.
//  - Modo BREVE (por defecto en la conversación): pocas cifras. El resumen lleva como mucho 2, cada hallazgo como
//    mucho 1 (si no, se descarta), como mucho 2 hallazgos y 1 sugerencia sin cifras.
export function validateAnalysisOutput(
  raw: unknown,
  refs: Set<string>,
  opts: { numericRefs?: Set<string>; brief?: boolean } = {},
): AiAnalysisOutput | null {
  const numericRefs = opts.numericRefs ?? new Set<string>()
  const brief = opts.brief === true
  const numericTokens = (text: string) => tokensIn(text).filter((t) => numericRefs.has(t)).length
  const rec = asRecord(raw)
  if (!rec) return null
  if (!textIsSafe(rec.summary, refs, MAX_SUMMARY, 10)) return null
  if (!brief && numericRefs.size > 0 && numericTokens(rec.summary) === 0) return null
  if (brief && numericTokens(rec.summary) > 2) return null

  // Cada hallazgo y cada sugerencia se comprueba por separado: los que no valen se descartan (nunca se
  // enseñan) y el resto se aprovecha. La respuesta solo se rechaza entera si el resumen no es válido.
  const rawFindings = Array.isArray(rec.findings) ? rec.findings.slice(0, 8) : []
  const findings: AiFinding[] = []
  for (const item of rawFindings) {
    const f = asRecord(item)
    if (!f || typeof f.type !== 'string' || !(FINDING_TYPES as readonly string[]).includes(f.type)) continue
    if (!textIsSafe(f.title, refs, MAX_TITLE) || !textIsSafe(f.explanation, refs, MAX_EXPLANATION, 10)) continue
    if (brief && numericTokens(f.explanation) > 1) continue
    // Las referencias de la evidencia pueden venir con llaves ("{{a.b}}"): se limpian y solo quedan las que existen.
    const evidence = (Array.isArray(f.evidence) ? f.evidence : [])
      .filter((e): e is string => typeof e === 'string')
      .map((e) => e.replace(/[{}\s]/g, ''))
      .filter((e) => refs.has(e))
      .slice(0, 6)
    findings.push({ type: f.type as FindingType, title: f.title.trim(), explanation: f.explanation.trim(), evidence })
  }

  const suggestions: string[] = []
  for (const item of Array.isArray(rec.suggestions) ? rec.suggestions.slice(0, 6) : []) {
    if (textIsSafe(item, refs, MAX_SUGGESTION, 10) && REVIEW_WORDS.test(plain(item)) && (!brief || numericTokens(item) === 0)) suggestions.push(item.trim())
  }
  return { summary: (rec.summary as string).trim(), findings: findings.slice(0, brief ? 2 : 4), suggestions: suggestions.slice(0, brief ? 1 : 2) }
}

const IBAN_RE = /\b[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}\b/
const EMAIL_RE = /\S+@\S+\.\S+/
const LONG_NUMBER_RE = /\d{9,}/

// Lo que se acepta que llegue a la IA: SOLO hechos agregados con referencia. Se rechaza cualquier cosa que
// parezca un IBAN, un correo o un identificador largo, aunque el cliente se equivocara y lo enviara.
export function readAnalysisRequest(
  body: Record<string, unknown>,
): { ok: true; focus: AnalysisFocus; detail: AnalysisDetail; facts: AnalysisFact[] } | { ok: false; error: string } {
  const detail: AnalysisDetail = body.detail === 'full' ? 'full' : 'brief'
  const focus = typeof body.focus === 'string' && (ANALYSIS_FOCUSES as readonly string[]).includes(body.focus) ? (body.focus as AnalysisFocus) : null
  if (!focus) return { ok: false, error: 'invalid focus' }
  if (!Array.isArray(body.facts) || body.facts.length < 1 || body.facts.length > MAX_FACTS) return { ok: false, error: 'invalid facts' }
  const facts: AnalysisFact[] = []
  const seen = new Set<string>()
  for (const item of body.facts) {
    const f = asRecord(item)
    if (!f) return { ok: false, error: 'invalid fact' }
    if (typeof f.ref !== 'string' || !REF_RE.test(f.ref) || seen.has(f.ref)) return { ok: false, error: 'invalid ref' }
    if (typeof f.label !== 'string' || f.label.length < 1 || f.label.length > 100 || hasControlChars(f.label)) return { ok: false, error: 'invalid label' }
    if (typeof f.kind !== 'string' || !(FACT_KINDS as readonly string[]).includes(f.kind)) return { ok: false, error: 'invalid kind' }
    let value: number | string
    if (typeof f.value === 'number') {
      if (!Number.isFinite(f.value) || Math.abs(f.value) > 1e9) return { ok: false, error: 'invalid value' }
      value = f.value
    } else if (typeof f.value === 'string') {
      if (f.value.length < 1 || f.value.length > 120 || hasControlChars(f.value)) return { ok: false, error: 'invalid value' }
      value = f.value
    } else return { ok: false, error: 'invalid value' }
    if ((f.kind === 'text') !== (typeof value === 'string')) return { ok: false, error: 'kind/value mismatch' }
    for (const s of [f.label, typeof value === 'string' ? value : '']) {
      if (IBAN_RE.test(s) || EMAIL_RE.test(s) || LONG_NUMBER_RE.test(s)) return { ok: false, error: 'sensitive data' }
    }
    seen.add(f.ref)
    facts.push({ ref: f.ref, label: f.label, value, kind: f.kind as FactKind })
  }
  return { ok: true, focus, detail, facts }
}
