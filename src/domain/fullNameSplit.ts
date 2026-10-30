// Separar «Nombre Apellidos» (o «Apellidos Nombre») cuando la lista NO trae coma ni columnas separadas. Dominio puro.
// REGLA: se propone, nunca se impone. La vista previa siempre es editable; lo que no está claro se marca para revisar (y se puede dejar sin separar).
// Pistas, de más a menos fiables: (1) lista ordenada alfabéticamente por la primera palabra → «Apellidos Nombre» (así se ordenan las listas de clase);
// (2) nombres de pila conocidos al principio o al final de cada línea; (3) la costumbre española de dos apellidos y las partículas («de la», «del»…).
import { foldText } from '@/domain/groups'
import type { ImportRow } from '@/domain/participantImport'

export type FullNameMode = 'auto' | 'names-first' | 'surnames-first' | 'none'

/** Nombres de pila frecuentes (sin tildes, minúsculas). Es una pista, no una lista cerrada: un nombre que no esté aquí nunca se descarta, solo baja la confianza. */
const FIRST_NAMES = new Set(
  (
    'abel adam adan adela adriana adrian agustin aida aitana alba alberto alejandra alejandro alex alexandra alfonso alicia alma alonso alvaro amaia amanda amelia ana andrea andres angel angela ' +
    'angeles anna antonia antonio ariadna arturo asier ainhoa aaron aya ayoub beatriz belen berta bruno candela carla carlos carmen carolina cayetano cecilia celia cesar clara claudia cristian ' +
    'cristina cristobal damian daniel daniela dario david diana diego dolores domingo dora edgar eduardo elena eli elisa elsa emilia emilio emma enrique eric erika ernesto esteban estela ' +
    'eva fabian fatima federico felipe felix fernando francisca francisco gabriel gabriela gael gerard gerardo gloria gonzalo gregorio guillermo gustavo hector helena hugo ian ibai ignacio ' +
    'imanol ines irene iria irina isaac isabel isidro iker ismael ivan izan jaime jana javier jesus joan joaquin jordi jorge jose josefa josep josue juan judith julia julian julio ' +
    'karen karla kevin laia lara laura leire leo leon leonor lidia lola lorena lorenzo lourdes lucas lucia luis luisa luna manuel mar marc marcos marcus margarita maria mariam mariana marina ' +
    'mario marta martin mateo matias mauricio maximo mayra melania mercedes miguel mireia miriam monica nadia nahia naiara natalia nerea nicolas nieves noa noah noelia nora nuria oliver ' +
    'olivia oscar oriol pablo paola patricia paula pau pedro pilar rafael raquel raul rebeca ricardo roberto rocio rodrigo roger romina ruben ruth salma salvador samuel sandra santiago ' +
    'sara sebastian sergio silvia simon sofia soledad sonia tamara teresa tomas valentina valeria vanesa vera veronica vicente victor victoria violeta vera xavier yago yasmin yassine ' +
    'yolanda youssef zoe ' +
    'mohamed mohammed muhammad ahmed ali omar hamza ibrahim khalid nour sofiane seifeddine amira hiba ilyas karim leila malak rachid ' +
    'alexandru andrei bianca daniel elena ionut mihai ' +
    'john james michael william robert thomas emily sophie charlotte harry jack'
  )
    .split(/\s+/)
    .filter(Boolean),
)

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'van', 'von', 'da', 'di', 'do', 'dos', 'das', 'san', 'santa', 'bin', 'ben', 'ibn', 'al', 'el-'])

const isKnownName = (token: string) => FIRST_NAMES.has(foldText(token).replace(/[^a-z]/g, ''))

/** Une las partículas con la palabra que sigue («de la» + «Cruz» → «de la Cruz»): cada unidad es una pieza indivisible. */
function units(tokens: string[]): string[] {
  const out: string[] = []
  let carry: string[] = []
  for (const t of tokens) {
    if (PARTICLES.has(foldText(t)) && out.length + carry.length > 0 && t === t.toLowerCase()) carry.push(t)
    else {
      out.push([...carry, t].join(' '))
      carry = []
    }
  }
  if (carry.length) out.push(carry.join(' '))
  return out
}

interface Cut {
  name: string
  surname: string
  /** alta = estructura habitual y nombre de pila reconocido (o evidencia de toda la lista); baja = hay que confirmarlo. */
  sure: boolean
  why: string
}

function cut(u: string[], order: 'names-first' | 'surnames-first', listStrong: boolean): Cut | null {
  const n = u.length
  if (n < 2) return null
  const first = (i: number) => isKnownName(u[i].split(' ')[0])
  let nameUnits: number
  let standard = true
  if (order === 'names-first') {
    if (n === 2) nameUnits = 1
    else if (n === 3) {
      // «María José García» (nombre compuesto) frente a «Eric García López» (dos apellidos).
      if (first(1) && first(0) && !isKnownName(u[2])) {
        nameUnits = 2
        standard = false
      } else nameUnits = 1
    } else if (n === 4) {
      nameUnits = first(0) && first(1) ? 2 : 1
      standard = nameUnits === 2
    } else {
      nameUnits = first(0) && first(1) ? 2 : 1
      standard = false
    }
    const name = u.slice(0, nameUnits).join(' ')
    const surname = u.slice(nameUnits).join(' ')
    const known = first(0)
    return { name, surname, sure: standard && (known || listStrong), why: known ? 'el nombre de pila es conocido' : 'por el orden de la lista' }
  }
  if (n === 2) nameUnits = 1
  else if (n === 3) {
    if (first(n - 2) && first(n - 1) && !isKnownName(u[0])) {
      nameUnits = 2
      standard = false
    } else nameUnits = 1
  } else if (n === 4) {
    nameUnits = first(n - 2) && first(n - 1) ? 2 : 1
    standard = nameUnits === 2
  } else {
    nameUnits = first(n - 2) && first(n - 1) ? 2 : 1
    standard = false
  }
  const name = u.slice(n - nameUnits).join(' ')
  const surname = u.slice(0, n - nameUnits).join(' ')
  const known = isKnownName(u[n - 1].split(' ')[0])
  return { name, surname, sure: standard && (known || listStrong), why: known ? 'el nombre de pila es conocido' : 'por el orden de la lista' }
}

const sortedShare = (words: string[]) => {
  if (words.length < 2) return 0
  let ok = 0
  for (let i = 1; i < words.length; i++) if (words[i - 1] <= words[i]) ok++
  return ok / (words.length - 1)
}

/** Qué orden parece tener la lista y con qué fuerza. */
export function detectOrder(rows: { full: string }[]): { order: 'names-first' | 'surnames-first'; strong: boolean; reason: string } {
  const toks = rows.map((r) => units(r.full.split(/\s+/).filter(Boolean)))
  const multi = toks.filter((t) => t.length >= 2)
  let nameFirst = 0
  let surnameFirst = 0
  for (const t of multi) {
    const a = isKnownName(t[0].split(' ')[0])
    const b = isKnownName(t[t.length - 1].split(' ')[0])
    if (a && !b) nameFirst++
    else if (b && !a) surnameFirst++
  }
  const firstWords = multi.map((t) => foldText(t[0]))
  const lastWords = multi.map((t) => foldText(t[t.length - 1]))
  const sortedFirst = sortedShare(firstWords)
  const sortedLast = sortedShare(lastWords)
  // Listas de 6 o más personas ordenadas por la primera palabra y no por la última: es el orden por apellidos de las listas de clase.
  if (multi.length >= 6 && sortedFirst >= 0.9 && sortedLast < 0.7) return { order: 'surnames-first', strong: true, reason: 'la lista está ordenada alfabéticamente por la primera palabra' }
  if (multi.length >= 6 && sortedLast >= 0.9 && sortedFirst < 0.7) return { order: 'names-first', strong: true, reason: 'la lista está ordenada alfabéticamente por la última palabra' }
  if (nameFirst + surnameFirst >= 2 && nameFirst !== surnameFirst) {
    const win = nameFirst > surnameFirst ? 'names-first' : 'surnames-first'
    const big = Math.max(nameFirst, surnameFirst)
    return { order: win, strong: big >= 0.7 * (nameFirst + surnameFirst) && big >= 3, reason: 'por los nombres de pila que reconozco' }
  }
  if (nameFirst + surnameFirst === 1) return { order: nameFirst ? 'names-first' : 'surnames-first', strong: false, reason: 'por el nombre de pila que reconozco' }
  return { order: 'names-first', strong: false, reason: 'es lo más habitual' }
}

export const FULL_NAME_NOTICE = 'Nombre y apellidos sin coma'

/**
 * Propone separar nombre y apellidos en las filas que traen una sola cadena («Eric García Pérez»). Solo actúa si NINGUNA fila trae ya apellidos ni madre/padre
 * (si los hay, la lista tiene estructura propia y no se toca). Cada fila separada guarda el texto original en `fullName` para poder volver a leerla con otro criterio.
 */
export function splitFullNames(rows: ImportRow[], mode: FullNameMode = 'auto'): { rows: ImportRow[]; notices: string[] } {
  if (mode === 'none') return { rows: rows.map(restore), notices: [] }
  const restored = rows.map(restore)
  const candidates = restored.filter((r) => r.name.trim() && !r.surname && !r.guardianName && units(r.name.split(/\s+/).filter(Boolean)).length >= 2)
  if (candidates.length === 0 || restored.some((r) => r.surname || r.guardianName)) return { rows: restored, notices: [] }

  const detected = detectOrder(candidates.map((r) => ({ full: r.name })))
  const order = mode === 'auto' ? detected.order : mode
  const listStrong = mode === 'auto' ? detected.strong : true // elegido por la persona = criterio firme
  let doubtful = 0
  let split = 0
  const out = restored.map((r) => {
    if (!candidates.includes(r)) return r
    const c = cut(units(r.name.split(/\s+/).filter(Boolean)), order, listStrong)
    if (!c) return r
    split++
    const row: ImportRow = { ...r, fullName: r.name, name: c.name, surname: c.surname }
    if (!c.sure) {
      doubtful++
      row.doubts = [...r.doubts, `¿Nombre «${c.name}» y apellidos «${c.surname}»? Compruébalo: no estoy seguro de dónde acaba el nombre.`]
    }
    return row
  })
  const notices: string[] = []
  if (split > 0) {
    const how = order === 'surnames-first' ? '«Apellidos Nombre»' : '«Nombre Apellidos»'
    notices.push(
      `${FULL_NAME_NOTICE}: he propuesto leer ${split === 1 ? 'la línea' : `las ${split} líneas`} como ${how} (${mode === 'auto' ? detected.reason : 'como has elegido'}).` +
        (doubtful ? ` ${doubtful} ${doubtful === 1 ? 'pide' : 'piden'} que la compruebes.` : '') +
        ' Corrígelo abajo si no es así.',
    )
  }
  return { rows: out, notices }
}

/** Vuelve a la cadena original de una fila que se había separado (y quita su aviso de separación). */
function restore(r: ImportRow): ImportRow {
  if (r.fullName === undefined) return r
  const { fullName, ...rest } = r
  return { ...rest, name: fullName, surname: null, doubts: r.doubts.filter((d) => !d.startsWith('¿Nombre «')) }
}
