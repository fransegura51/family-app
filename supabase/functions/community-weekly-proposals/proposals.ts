import type { AiPart } from '../_shared/ai/types.ts'
import { asRecord, parseJsonLoose } from '../_shared/ai/validate.ts'
import { type CommunityAi, cleanAiText } from '../_shared/communityAi.ts'
import { type Row, type ServiceClient, authorizeCron, jsonResponse, mondayOfMadridWeek } from '../_shared/communityServer.ts'
import {
  EUROSTAT_CATALOG,
  type EurostatDataset,
  type EurostatEntry,
  type Facts,
  buildFacts,
  eurostatBrowserUrl,
  fetchEurostat,
  formatDateEs,
  formatEs,
  pickEntry,
  verifyNumbers,
} from './eurostat.ts'

// LOTE SEMANAL de contenido oficial (la llama el cron los miércoles a las 08:00 UTC con la cabecera x-cron-secret; la propuesta debe llegar antes del sábado):
//   · 2-3 consejos oficiales de Pepa (kind «tip»),
//   · UNA encuesta (kind «poll», 2-6 opciones) sobre un tema de familia u hogar,
//   · y, SOLO si hay una aportación externa fiable (datos reales de Eurostat verificados), UN artículo de investigación (kind «article»).
// TODO queda como PROPUESTA para revisión humana: la única escritura que hace esta función es community_service_create_proposals, que deja las filas en estado
// «proposed». Publicar exige que una persona administradora apruebe (migración 0270); nada se publica solo ni por fecha.

// Temas del catálogo de Comunidad (migración 0264, tabla community_topics). Un test comprueba que esta copia coincide con la migración.
export const TOPICS: Record<string, 'recetas' | 'hogar'> = {
  'platos-principales': 'recetas',
  'entrantes-aperitivos-tapas': 'recetas',
  'recetas-faciles': 'recetas',
  'postres-dulces': 'recetas',
  'cocina-saludable': 'recetas',
  'menus-planificacion': 'recetas',
  'trucos-de-cocina': 'recetas',
  'aprovechamiento-alimentos': 'recetas',
  'ahorro-economia': 'hogar',
  'organizacion-familiar': 'hogar',
  'crianza-educacion': 'hogar',
  'limpieza-hogar': 'hogar',
  'actividades-familia': 'hogar',
  'manualidades-decoracion': 'hogar',
}
export const TOPIC_IDS = Object.keys(TOPICS)
export const HOGAR_TOPIC_IDS = TOPIC_IDS.filter((t) => TOPICS[t] === 'hogar')

// Aviso fijo que la especificación exige en los artículos: las encuestas de PEPA no son muestras representativas.
export const NOT_REPRESENTATIVE_NOTE =
  'Las encuestas de PEPA no son muestras representativas: este artículo se basa solo en los datos oficiales citados, no en las respuestas de la comunidad.'

export const TIPS_MIN = 2
export const TIPS_MAX = 3

// ---------------------------------------------------------------------------------------------------------------------------------
// Consejos y encuesta (una sola llamada a la IA)
// ---------------------------------------------------------------------------------------------------------------------------------
export const TIPS_POLL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tips: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, body: { type: 'STRING' }, topic_id: { type: 'STRING', format: 'enum', enum: TOPIC_IDS } },
        required: ['title', 'body', 'topic_id'],
      },
    },
    poll: {
      type: 'OBJECT',
      properties: {
        question: { type: 'STRING' },
        intro: { type: 'STRING' },
        topic_id: { type: 'STRING', format: 'enum', enum: HOGAR_TOPIC_IDS },
        options: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['question', 'intro', 'topic_id', 'options'],
    },
  },
  required: ['tips', 'poll'],
}

export interface ProposalItem {
  kind: 'tip' | 'poll' | 'article'
  section: 'recetas' | 'hogar'
  topic_id: string
  title: string
  body: string
  payload: Record<string, unknown>
}

export function buildTipsPollParts(weekMonday: string): AiPart[] {
  return [
    {
      text: [
        'Eres Pepa, la ayudante cálida y práctica de una comunidad de familias (cocina, hogar, crianza, ahorro). Preparas el contenido oficial de la semana para que lo REVISE una persona antes de publicarlo.',
        `La semana empieza el ${formatDateEs(weekMonday)}; si ayuda, ten en cuenta la época del año.`,
        `Prepara EXACTAMENTE ${TIPS_MAX} consejos prácticos y una encuesta:`,
        '- Cada consejo: un título corto (máx. 100 caracteres), un cuerpo de 2 a 5 frases (máx. 600 caracteres) y un tema del catálogo. Que sean útiles, concretos y de temas distintos entre sí.',
        '- La encuesta: una pregunta sencilla y neutra (máx. 120 caracteres) sobre un tema de familia u hogar (nunca política, religión ni salud), una frase de introducción (máx. 250 caracteres) y de 3 a 5 opciones cortas (máx. 50 caracteres) que no se solapen.',
        'Reglas para todo: español claro y cercano; sin enlaces, sin HTML, sin direcciones de correo ni teléfonos; sin porcentajes ni estadísticas ni afirmaciones de «estudios»; sin consejos médicos, legales ni financieros que puedan ser peligrosos; sin marcas comerciales ni nombres de personas.',
        'Devuelve únicamente un JSON con "tips" y "poll".',
      ].join('\n'),
    },
  ]
}

export interface TipsPollResult {
  tips: ProposalItem[]
  poll: ProposalItem | null
}

// % delata una estadística que no podemos comprobar: en consejos y encuestas no se admite.
const noStat = (s: string): boolean => !s.includes('%')

// Valida y construye los elementos. Cada uno es independiente: lo que no cumple se descarta y el resto sigue.
export function validateTipsAndPoll(rawText: string): TipsPollResult | null {
  const rec = asRecord(parseJsonLoose(rawText))
  if (!rec) return null
  const tips: ProposalItem[] = []
  const seenTitles = new Set<string>()
  for (const t of Array.isArray(rec.tips) ? rec.tips : []) {
    const r = asRecord(t)
    if (!r || tips.length >= TIPS_MAX) continue
    const title = cleanAiText(r.title, { min: 8, max: 120 })
    const body = cleanAiText(r.body, { min: 80, max: 700, multiline: true })
    const topic = typeof r.topic_id === 'string' ? r.topic_id : ''
    if (!title || !body || !(topic in TOPICS) || !noStat(title + body) || seenTitles.has(title.toLowerCase())) continue
    seenTitles.add(title.toLowerCase())
    tips.push({ kind: 'tip', section: TOPICS[topic], topic_id: topic, title, body, payload: {} })
  }

  let poll: ProposalItem | null = null
  const p = asRecord(rec.poll)
  if (p) {
    const question = cleanAiText(p.question, { min: 10, max: 140 })
    const intro = p.intro === '' || p.intro === undefined ? '' : cleanAiText(p.intro, { min: 5, max: 300 })
    const topic = typeof p.topic_id === 'string' ? p.topic_id : ''
    const options: string[] = []
    for (const o of Array.isArray(p.options) ? p.options : []) {
      const opt = cleanAiText(o, { min: 1, max: 60 })
      if (opt && !options.some((x) => x.toLowerCase() === opt.toLowerCase())) options.push(opt)
    }
    // La encuesta es de familia/hogar; de 2 a 6 opciones distintas (el servidor lo exige también).
    if (question && intro !== null && TOPICS[topic] === 'hogar' && options.length >= 2 && noStat(question + intro + options.join(' '))) {
      poll = { kind: 'poll', section: 'hogar', topic_id: topic, title: question, body: intro, payload: { options: options.slice(0, 6) } }
    }
  }
  if (tips.length === 0 && !poll) return null
  return { tips, poll }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Artículo de investigación (datos de Eurostat verificados por código)
// ---------------------------------------------------------------------------------------------------------------------------------
export const ARTICLE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    body: { type: 'STRING' },
    comparison: { type: 'STRING' },
    methodology: { type: 'STRING' },
  },
  required: ['title', 'body', 'comparison', 'methodology'],
}

// Tabla de datos en texto para la IA: las ÚNICAS cifras que puede usar.
export function describeFacts(ds: EurostatDataset, facts: Facts): string {
  const e = ds.entry
  const lines = facts.rows.map((r) => `- ${r.period}: España ${formatEs(r.es)} | Unión Europea ${formatEs(r.eu)} | diferencia España menos UE ${formatEs(r.diff)}`)
  return [
    `Indicador: ${e.title}`,
    `Qué mide: ${e.measure}`,
    `Unidad: ${e.unit}`,
    `Datos de Eurostat (actualizados en ${ds.updated.slice(0, 4)}):`,
    ...lines,
    `Cambio entre ${facts.rows[0].period} y ${facts.rows[facts.rows.length - 1].period}: España ${formatEs(facts.esChange)}; Unión Europea ${formatEs(facts.euChange)}.`,
  ].join('\n')
}

export function buildArticleParts(ds: EurostatDataset, facts: Facts): AiPart[] {
  return [
    {
      text: [
        'Eres el equipo editorial de PEPA, una aplicación para familias. Escribe un breve artículo divulgativo, en español claro, a partir de DATOS OFICIALES DE EUROSTAT. Lo revisará una persona antes de publicarlo.',
        'Reglas estrictas:',
        '- Usa EXCLUSIVAMENTE las cifras y los años de la tabla de datos. Escríbelos tal cual (con coma decimal). NO calcules otras cifras (ni medias, ni porcentajes de cambio, ni «el doble de»), NO redondees, NO añadas datos de otras fuentes ni de memoria.',
        '- Si usas una diferencia o un cambio, copia el que figura en la tabla. Cuando hablas de subidas o bajadas, que coincida con el signo de los datos.',
        '- Cuenta qué mide el indicador, compara España con la Unión Europea (di «la Unión Europea», sin números en el nombre), da contexto sin afirmar causas que los datos no prueban y termina con una idea práctica para una familia.',
        '- "body": el artículo (de 3 a 5 párrafos cortos, máx. 1600 caracteres). "comparison": la comparación España-UE en un párrafo (máx. 600 caracteres). "methodology": cómo se han obtenido los datos (máx. 600 caracteres: quién los publica, qué indicador, qué años y que son datos oficiales ya publicados).',
        '- "title": título claro (máx. 110 caracteres).',
        '- Sin enlaces, sin HTML, sin nombres de personas. No hables de las encuestas de PEPA.',
        'Devuelve únicamente un JSON con "title", "body", "comparison" y "methodology".',
      ].join('\n'),
    },
    { text: `DATOS (las únicas cifras permitidas):\n${describeFacts(ds, facts)}` },
  ]
}

export interface ArticleDraft {
  title: string
  body: string
  comparison: string
  methodology: string
}

// Valida el JSON del modelo (longitudes, sin enlaces/HTML) y VERIFICA las cifras contra los datos. null = el artículo se descarta.
export function validateArticle(rawText: string, facts: Facts): ArticleDraft | null {
  const rec = asRecord(parseJsonLoose(rawText))
  if (!rec) return null
  const title = cleanAiText(rec.title, { min: 10, max: 130 })
  const body = cleanAiText(rec.body, { min: 300, max: 1900, multiline: true })
  const comparison = cleanAiText(rec.comparison, { min: 80, max: 700, multiline: true })
  const methodology = cleanAiText(rec.methodology, { min: 80, max: 700, multiline: true })
  if (!title || !body || !comparison || !methodology) return null
  if (!verifyNumbers([title, body, comparison, methodology], facts).ok) return null
  return { title, body, comparison, methodology }
}

// Elemento final del artículo: fuentes construidas por el código (nunca por la IA), texto con las secciones y el aviso de representatividad.
export function buildArticleItem(ds: EurostatDataset, facts: Facts, draft: ArticleDraft): ProposalItem {
  const e: EurostatEntry = ds.entry
  const methodology = `${draft.methodology} ${NOT_REPRESENTATIVE_NOTE}`
  const source = { title: `Eurostat — ${e.title} (${e.dataset})`, publisher: 'Eurostat (Oficina Estadística de la Unión Europea)', url: eurostatBrowserUrl(e.dataset), date: ds.updated }
  const body = [
    draft.body,
    `**Qué dicen los datos**\n${draft.comparison}`,
    `**Cómo se ha hecho**\n${methodology}`,
    `Fuente: ${source.title}, datos actualizados el ${formatDateEs(ds.updated)}.`,
  ].join('\n\n')
  return {
    kind: 'article',
    section: 'hogar',
    topic_id: e.topicId,
    title: draft.title,
    body,
    payload: {
      sources: [source],
      methodology,
      comparison: draft.comparison,
      // Tabla de los datos usados (por si la pantalla del artículo la quiere enseñar).
      table: {
        unit: e.unit,
        columns: ['Año', 'España', 'Unión Europea'],
        rows: facts.rows.map((r) => [r.period, r.es, r.eu]),
      },
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------------------------------------------------------------
export interface WeeklyDeps {
  admin: ServiceClient
  getAi(): Promise<CommunityAi | null>
  fetchFn?: typeof fetch
  now?: () => Date
  catalog?: EurostatEntry[]
}

export interface WeeklyReport {
  week: string
  skipped?: 'ai_not_allowed' | 'already_proposed' | 'check_failed' | 'ai_unavailable'
  tips: number
  poll: boolean
  article: 'proposed' | 'no_external_data' | 'invalid_output' | 'ai_failed' | 'not_attempted'
  created: number
}

// ¿Ya hay propuestas de esta semana? (el cron podría repetirse; no se duplican). null = no se ha podido comprobar.
async function alreadyProposed(admin: ServiceClient, week: string): Promise<boolean | null> {
  try {
    const { data, error } = await admin.from('community_official_items').select('id').eq('batch_week', week)
    if (error) return null
    return (data as Row[] | null ?? []).length > 0
  } catch {
    return null
  }
}

export async function runWeekly(deps: WeeklyDeps): Promise<WeeklyReport> {
  const { admin } = deps
  const now = (deps.now ?? (() => new Date()))()
  const week = mondayOfMadridWeek(now)
  const report: WeeklyReport = { week, tips: 0, poll: false, article: 'not_attempted', created: 0 }

  const allowed = await admin.rpc('community_service_ai_allowed')
  if (allowed.error || allowed.data !== true) return { ...report, skipped: 'ai_not_allowed' }
  const exists = await alreadyProposed(admin, week)
  if (exists === null) return { ...report, skipped: 'check_failed' }
  if (exists) return { ...report, skipped: 'already_proposed' }

  const ai = await deps.getAi()
  if (!ai) return { ...report, skipped: 'ai_unavailable' }

  // Los datos de Eurostat y los consejos/encuesta se piden a la vez (no dependen entre sí).
  const entry = pickEntry(week, deps.catalog ?? EUROSTAT_CATALOG)
  const [tipsResult, dataset] = await Promise.all([
    ai.generate('proposals', { parts: buildTipsPollParts(week), responseSchema: TIPS_POLL_SCHEMA, maxOutputTokens: 3000 }, validateTipsAndPoll),
    fetchEurostat(entry, { fetchFn: deps.fetchFn, now: () => now }),
  ])

  const items: ProposalItem[] = []
  if (tipsResult.ok) {
    items.push(...tipsResult.value.tips)
    report.tips = tipsResult.value.tips.length
    if (tipsResult.value.poll) {
      items.push(tipsResult.value.poll)
      report.poll = true
    }
  }

  if (!dataset) {
    report.article = 'no_external_data' // sin aportación externa fiable NO hay artículo
  } else {
    const facts = buildFacts(dataset)
    const article = await ai.generate('proposals', { parts: buildArticleParts(dataset, facts), responseSchema: ARTICLE_SCHEMA, maxOutputTokens: 2500 }, (raw) => validateArticle(raw, facts))
    if (article.ok) {
      items.push(buildArticleItem(dataset, facts, article.value))
      report.article = 'proposed'
    } else {
      report.article = article.reason === 'invalid_output' ? 'invalid_output' : 'ai_failed'
    }
  }

  if (items.length === 0) return report
  // ÚNICA escritura: deja las propuestas en estado «proposed» para revisión humana y avisa a los administradores.
  const created = await admin.rpc('community_service_create_proposals', { p_week: week, p_items: items })
  if (created.error) {
    console.error('[community-weekly] no se pudieron guardar las propuestas')
    return report
  }
  report.created = typeof created.data === 'number' ? created.data : 0
  return report
}

export async function handleWeekly(req: Request, deps: WeeklyDeps): Promise<Response> {
  const denied = await authorizeCron(req, deps.admin)
  if (denied) return denied
  try {
    return jsonResponse({ ok: true, ...(await runWeekly(deps)) })
  } catch (err) {
    console.error('[community-weekly] error inesperado:', String(err))
    return jsonResponse({ ok: false, error: 'internal_error' }, 500)
  }
}
