import { FormEvent, PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pepaAvatar from '@/assets/pepa/pepa-avatar.jpg'
import { addShoppingItem, listShoppingItems } from '@/data/shopping'
import { listShoppingStores } from '@/data/shoppingStores'
import { listFamilyMembers } from '@/data/family'
import { createEvent, listEventCompletions, listUpcomingEvents } from '@/data/calendar'
import {
  listExternalEventCompletions,
  listExternalEventDismissals,
  listExternalEvents,
  listFeeds,
} from '@/data/externalCalendarFeeds'
import { splitEntries } from '@/domain/quickCapture'
import { expandOccurrences } from '@/domain/calendar'
import { reminderLabel } from '@/domain/reminders'
import { recurrenceLabel } from '@/domain/recurrence'
import {
  extractShoppingStore,
  findMemberInText,
  isUnsupportedDelete,
  looksLikeSaveInstruction,
  matchMemberByHint,
  normalize,
  parseCalendarQuery,
  parseShoppingQuery,
  stripActivateCommand,
  stripListFillers,
  stripWakeWord,
} from '@/domain/voiceQuery'
import { parseCalendarEntry } from '@/domain/calendarVoiceParser'
import { isDictationSupported, isSpeechSupported, listenContinuous, speakAsync } from '@/services/voice'
import { splitGroceryListWithAi } from '@/services/splitGroceryList'
import { getSelectedCalendarDate } from '@/state/calendarSelection'
import { getCalendarMemberFilter } from '@/state/calendarMemberFilter'

type ResponseMode = 'voice' | 'text'
const STORAGE_KEY = 'familyapp:voice-response-mode'
// Cuánto se espera en silencio antes de apuntar/preguntar sola —
// petición real: "que espere solamente tres segundos" (antes 5s, se
// notaba lento).
const SILENCE_TIMEOUT_MS = 3000

function loadResponseMode(): ResponseMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'voice' ? 'voice' : 'text'
  } catch {
    return 'text'
  }
}

function saveResponseMode(mode: ResponseMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // localStorage puede fallar en privado/incógnito — no es crítico, solo
    // se pierde recordar la preferencia entre sesiones.
  }
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayIso(): string {
  return dateStr(new Date())
}

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return dateStr(d)
}

// Ejemplos fijos para acostumbrar a decirle siempre a Pepa la pregunta o
// el encargo de la misma forma — no cambian según nada, para que se
// aprendan de memoria y ya no haga falta ni mirarlos. Uno por botón, ya
// que cada botón ahora deja claro de qué trata sin tener que adivinarlo
// (petición real: "vamos a dejar Pepa calendario y Pepa lista de la
// compra, dos botones independientes... apuntar calendario, apuntar
// lista de la compra" — cuatro botones en vez de dos que tenían que
// adivinar de qué iba lo dicho, origen de varios fallos reales:
// "Mercadona, patata, huevo" se apuntaba en el calendario en vez de en
// la compra). Tocar un ejemplo lo escribe abajo, listo para enviar tal
// cual o retocarlo antes.
const ASK_CALENDARIO_EXAMPLES = [
  '¿Qué tengo hoy?',
  '¿Qué tengo el 9 de septiembre?',
  '¿Qué tengo ahora?',
  'Lo siguiente que tengo',
  '¿Qué tengo la semana que viene?',
  '¿Qué tengo dentro de dos semanas?',
  '¿Qué tiene Eric la semana que viene?',
]

const ASK_COMPRAS_EXAMPLES = ['¿Qué tengo pendiente?', '¿Qué tengo de Mercadona?', '¿Qué tengo de Aldi?']

const CREATE_CALENDARIO_EXAMPLES = [
  'El dentista el 9 de septiembre a las 10',
  'Eric que saque la basura',
  'Cumpleaños de mamá el 27 de octubre',
]

const CREATE_COMPRAS_EXAMPLES = ['Leche y pan', 'Mercadona, patatas', 'Aldi, arenques, queso']

type Destination = 'calendario' | 'compras'
type PanelMode = 'ask-calendario' | 'ask-compras' | 'create-calendario' | 'create-compras'
const PANEL_MODES: PanelMode[] = ['ask-calendario', 'ask-compras', 'create-calendario', 'create-compras']
const BUTTON_TAP_THRESHOLD_PX = 8

// Los 4 botones se pueden arrastrar a cualquier sitio de la pantalla,
// no solo intercambiar posición entre ellos — petición real: "que se
// puedan mover de un lado para otro y poner en la posición que
// queramos". Por defecto salen en una sola fila arriba del todo, fuera
// del hueco reservado en .app-content para que no tapen ni el título
// ni el saludo de Inicio (petición real: "en el móvil se tapan").
const FAB_SIZE = 42
const FAB_GAP = 7
const FAB_DEFAULT_TOP = 8
interface FabPosition {
  top: number
  left: number
}
const DEFAULT_FAB_POSITIONS: Record<PanelMode, FabPosition> = Object.fromEntries(
  PANEL_MODES.map((m, i) => [m, { top: FAB_DEFAULT_TOP, left: FAB_DEFAULT_TOP + i * (FAB_SIZE + FAB_GAP) }]),
) as Record<PanelMode, FabPosition>

const FAB_POSITIONS_KEY = 'familyapp:pepa-fab-positions'

function loadFabPositions(): Partial<Record<PanelMode, FabPosition>> {
  try {
    const raw = localStorage.getItem(FAB_POSITIONS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<Record<PanelMode, FabPosition>>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveFabPositions(positions: Partial<Record<PanelMode, FabPosition>>) {
  try {
    localStorage.setItem(FAB_POSITIONS_KEY, JSON.stringify(positions))
  } catch {
    // localStorage puede fallar en privado/incógnito — no es crítico, solo
    // se pierde recordar dónde se dejaron los botones.
  }
}

const DESTINATION_INFO: Record<Destination, { label: string; path: string }> = {
  compras: { label: '🛒 Lista de la compra', path: '/compras' },
  calendario: { label: '📅 Calendario', path: '/calendario' },
}

function destinationOf(mode: PanelMode): Destination {
  return mode.endsWith('calendario') ? 'calendario' : 'compras'
}

function kindOf(mode: PanelMode): 'ask' | 'create' {
  return mode.startsWith('ask') ? 'ask' : 'create'
}

// Petición real: "cada vez que se abra alguna de esas cuatro
// funciones, que aparezcan las instrucciones de cómo funcionan
// debajo" — no solo qué hace el botón, sino cómo se usa de principio a
// fin: cómo se activa por voz, qué pasa mientras escucha, y que se
// cierra sola al terminar (para que "sigue estando la línea roja" deje
// de sorprender).
const PANEL_INFO: Record<
  PanelMode,
  { icon: string; title: string; instructions: string[]; submitLabel: string; examples: string[] }
> = {
  'ask-calendario': {
    icon: '🐣📅',
    title: '🐣📅 Pepa · Calendario',
    instructions: [
      'Te dice qué tienes en el calendario — nunca apunta nada.',
      'En cuanto veas "Te escucho", haz tu pregunta (p. ej. "¿qué tengo hoy?").',
      'También puedes preguntar por una semana entera: di "la semana que viene", "dentro de dos semanas" o "dentro de tres semanas" — te contesta con lo de todos los días de esa semana.',
      'Si dices el nombre de alguien de la familia (p. ej. "¿qué tiene Eric la semana que viene?"), te contesta solo con lo suyo.',
      'Se cierra sola al contestarte — para volver a preguntar, toca este icono otra vez.',
    ],
    submitLabel: 'Preguntar',
    examples: ASK_CALENDARIO_EXAMPLES,
  },
  'ask-compras': {
    icon: '🐣🛒',
    title: '🐣🛒 Pepa · Lista de la compra',
    instructions: [
      'Te dice qué tienes pendiente en la lista de la compra — nunca apunta nada.',
      'En cuanto veas "Te escucho", haz tu pregunta (p. ej. "¿qué tengo de Mercadona?").',
      'Se cierra sola al contestarte — para volver a preguntar, toca este icono otra vez.',
    ],
    submitLabel: 'Preguntar',
    examples: ASK_COMPRAS_EXAMPLES,
  },
  'create-calendario': {
    icon: '🎤📅',
    title: '🎤📅 Apuntar · Calendario',
    instructions: [
      'Guarda en el calendario lo que digas — nunca responde preguntas.',
      'En cuanto veas "Te escucho", di lo que quieres apuntar; se guarda sola al quedarte 3s callado.',
      'Se cierra sola al guardarlo — para apuntar otra cosa, toca este icono otra vez.',
    ],
    submitLabel: 'Apuntar',
    examples: CREATE_CALENDARIO_EXAMPLES,
  },
  'create-compras': {
    icon: '🎤🛒',
    title: '🎤🛒 Apuntar · Lista de la compra',
    instructions: [
      'Guarda en la lista de la compra lo que digas — nunca responde preguntas.',
      'En cuanto veas "Te escucho", di lo que quieres apuntar; se guarda sola al quedarte 3s callado.',
      'Se cierra sola al guardarlo — para apuntar otra cosa, toca este icono otra vez.',
    ],
    submitLabel: 'Apuntar',
    examples: CREATE_COMPRAS_EXAMPLES,
  },
}

async function saveShoppingEntries(entries: string[], store: string | null): Promise<void> {
  for (const entry of entries) {
    await addShoppingItem({ name: entry, quantity: '', unit: '', priority: 'normal', tripId: null, store })
  }
  // Si ya estás en Lista de la compra, que se vea al momento en vez de
  // tener que recargar.
  window.dispatchEvent(new CustomEvent('family-app:compras-changed'))
}

function eventMinutes(ev: { allDay: boolean; startAt: string }): number {
  if (ev.allDay) return -1
  const d = new Date(ev.startAt)
  return d.getHours() * 60 + d.getMinutes()
}

function eventTimeLabel(ev: { allDay: boolean; startAt: string }): string {
  return ev.allDay ? '' : ` a las ${new Date(ev.startAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
}

// Pepa también tiene que "ver" las notas importadas de un calendario
// externo (Google/Outlook/...) al contestar preguntas del calendario —
// petición real: "que Pepa las pueda detectar". Se cargan aparte de
// las propias (listUpcomingEvents) porque viven en una tabla distinta
// y se identifican de otra forma (ver domain de externalCalendarFeeds
// y la migración 0052) — respeta lo ya borrado/marcado hecho desde el
// calendario, para no anunciar algo que ya se ha quitado de en medio.
interface ExternalAgendaOccurrence {
  date: string
  title: string
  allDay: boolean
  startAt: string
  memberId: string | null
}

async function loadExternalAgendaOccurrences(from: string, to: string): Promise<ExternalAgendaOccurrence[]> {
  const [feeds, events, dismissals, completions] = await Promise.all([
    listFeeds(),
    listExternalEvents(),
    listExternalEventDismissals(),
    listExternalEventCompletions(),
  ])
  const feedById = new Map(feeds.map((f) => [f.id, f]))
  const seriesDismissed = new Set(dismissals.filter((d) => d.occurrenceDate === null).map((d) => `${d.feedId}:${d.uid}`))
  const occurrenceDismissed = new Set(
    dismissals.filter((d) => d.occurrenceDate !== null).map((d) => `${d.feedId}:${d.uid}:${d.occurrenceDate}`),
  )
  const completedSet = new Set(completions.map((c) => `${c.feedId}:${c.uid}:${c.occurrenceDate}`))

  const out: ExternalAgendaOccurrence[] = []
  for (const ev of events) {
    if (seriesDismissed.has(`${ev.feedId}:${ev.uid}`)) continue
    const feed = feedById.get(ev.feedId)
    for (const date of expandOccurrences(ev, from, to)) {
      const key = `${ev.feedId}:${ev.uid}:${date}`
      if (occurrenceDismissed.has(key) || completedSet.has(key)) continue
      out.push({ date, title: ev.title, allDay: ev.allDay, startAt: ev.startAt, memberId: feed?.memberId ?? null })
    }
  }
  return out
}

// Antes esto miraba tareas Y eventos por separado (y Pepa a veces
// confundía cuál era cuál); ahora una tarea ES un evento, así que basta
// con mirar el calendario — petición real: "quitamos la pestaña de
// tarea... porque a veces Pepa se confunde las tareas con los
// eventos". Lo ya marcado "hecho" ese día no cuenta como pendiente.
async function answerAgendaQuery(
  memberHint: string | null,
  rawText: string,
  when: 'today' | 'tomorrow',
  nowOnly: boolean,
  explicitDate: string | null,
): Promise<string> {
  const [members, events, eventCompletions] = await Promise.all([
    listFamilyMembers(),
    listUpcomingEvents(),
    listEventCompletions(),
  ])
  const target = explicitDate ?? (when === 'tomorrow' ? tomorrowIso() : todayIso())
  const externalOnTarget = await loadExternalAgendaOccurrences(target, target)
  const dateLabel = explicitDate
    ? new Date(explicitDate + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
    : null
  const dayWord = dateLabel ? `el ${dateLabel}` : when === 'tomorrow' ? 'mañana' : 'hoy'
  // "Ahora" solo tiene sentido preguntando por hoy mismo — ni "mañana"
  // ni una fecha concreta suelta tienen un "ya ha pasado" que valga.
  const isToday = !explicitDate && when === 'today'
  const applyNowFilter = nowOnly && isToday
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  let eventsOnTarget = events.filter((ev) => expandOccurrences(ev, target, target).includes(target))
  eventsOnTarget = eventsOnTarget.filter(
    (ev) => !eventCompletions.some((c) => c.eventId === ev.id && c.occurrenceDate === target),
  )

  // Notas importadas de un calendario externo — mismo tratamiento que
  // un evento propio con UN solo miembro asignado (el que tenga
  // enlazado su calendario en Externos), o "toda la familia" si no
  // tiene ninguno enlazado.
  const externalAsEvents = externalOnTarget.map((ev) => ({
    title: ev.title,
    allDay: ev.allDay,
    startAt: ev.startAt,
    memberIds: ev.memberId ? [ev.memberId] : [],
  }))

  // El nombre puede venir con "soy X"/"para X" delante, o dicho suelto
  // ("Jennifer, ¿qué tengo que hacer hoy?") — se prueban las dos formas
  // antes de rendirse (bug real: preguntar así no filtraba por persona,
  // y salían también las cosas asignadas a otro miembro de la familia).
  // Si no se ha nombrado a nadie, se usa el filtro de miembros que
  // tengas activo en la pantalla de Calendario — petición real: "que
  // puedas filtrar por cada miembro... y que Pepa detecte solamente
  // las tareas de ese miembro". Nombrar a alguien en la propia
  // pregunta siempre gana al filtro.
  const activeFilterIds = getCalendarMemberFilter()
  const memberByIdForFilter = new Map(members.map((m) => [m.id, m]))
  const member =
    (memberHint ? matchMemberByHint(memberHint, members) : null) ??
    findMemberInText(rawText, members) ??
    (activeFilterIds.length === 1 ? (memberByIdForFilter.get(activeFilterIds[0]) ?? null) : null)

  if (member) {
    let memberEvents = [...eventsOnTarget, ...externalAsEvents].filter(
      (ev) => ev.memberIds.length === 0 || ev.memberIds.includes(member.id),
    )
    if (applyNowFilter) {
      memberEvents = memberEvents.filter((ev) => ev.allDay || eventMinutes(ev) >= nowMinutes)
    }
    const who = ` para ${member.name}`
    if (memberEvents.length === 0) return `No tienes nada pendiente${who} ${dayWord}.`
    const items = memberEvents
      .map((ev) => ({ minutes: eventMinutes(ev), label: `${ev.title}${eventTimeLabel(ev)}` }))
      .sort((a, b) => a.minutes - b.minutes)
    return `Lo que tienes${who} ${dayWord}: ${items.map((i) => i.label).join(', ')}.`
  }

  // "Todos" — sin decir de quién, se cuenta la agenda de TODA la
  // familia, cada cosa con quién tiene que hacerla — "Fernando tiene
  // que bañarse a las 6, Eric a las 7..." en vez de un listado plano
  // sin decir de quién es cada una. El filtro por hora ("ya ha pasado,
  // no cuenta") solo se aplica si de verdad se ha preguntado "ahora"
  // explícitamente — que haya pasado la hora no significa que esté
  // hecho (bug real reportado: "si tenía bajar la basura a las cinco y
  // son las seis, Pepa no me dice que tengo que bajar la basura").
  const memberById = new Map(members.map((m) => [m.id, m]))
  let allEvents = [...eventsOnTarget, ...externalAsEvents]
  if (applyNowFilter) {
    allEvents = allEvents.filter((ev) => ev.allDay || eventMinutes(ev) >= nowMinutes)
  }

  if (allEvents.length === 0) return `No queda nada pendiente por ${dayWord}.`

  const items = allEvents
    .map((ev) => {
      const owner = ev.memberIds.length === 1 ? (memberById.get(ev.memberIds[0])?.name ?? null) : null
      const withTime = `${ev.title}${eventTimeLabel(ev)}`
      return { minutes: eventMinutes(ev), label: owner ? `${owner}: ${withTime}` : withTime }
    })
    .sort((a, b) => a.minutes - b.minutes)

  return `Lo que queda por ${dayWord}: ${items.map((i) => i.label).join(', ')}.`
}

// "¿Qué tengo la semana que viene?" / "¿qué tiene Eric dentro de dos
// semanas?" — petición real: preguntar por una semana completa (de
// lunes a domingo), de toda la familia o de una persona en concreto.
// Mismo criterio que answerAgendaQuery para reconocer a quién se
// refiere y qué cuenta como "ya hecho", pero recorriendo cada día del
// rango en vez de uno solo, y agrupando la respuesta por día.
async function answerWeekRangeQuery(memberHint: string | null, rawText: string, from: string, to: string, label: string): Promise<string> {
  const [members, events, eventCompletions, externalOccurrences] = await Promise.all([
    listFamilyMembers(),
    listUpcomingEvents(),
    listEventCompletions(),
    loadExternalAgendaOccurrences(from, to),
  ])
  const memberById = new Map(members.map((m) => [m.id, m]))
  // Nombrar a alguien en la propia pregunta siempre gana; si no se
  // nombra a nadie, se usa el filtro de miembros activo en Calendario
  // (uno solo se trata igual que si se hubiera nombrado; varios a la
  // vez acotan la lista sin fijar un único "para X").
  const activeFilterIds = getCalendarMemberFilter()
  const member =
    (memberHint ? matchMemberByHint(memberHint, members) : null) ??
    findMemberInText(rawText, members) ??
    (activeFilterIds.length === 1 ? (memberById.get(activeFilterIds[0]) ?? null) : null)
  const multiFilterIds = !member && activeFilterIds.length > 1 ? activeFilterIds : null

  const occurrences: { date: string; minutes: number; text: string }[] = []
  for (const ev of events) {
    if (member && ev.memberIds.length > 0 && !ev.memberIds.includes(member.id)) continue
    if (multiFilterIds && !ev.memberIds.some((id) => multiFilterIds.includes(id))) continue
    for (const date of expandOccurrences(ev, from, to)) {
      if (eventCompletions.some((c) => c.eventId === ev.id && c.occurrenceDate === date)) continue
      const owner = !member && ev.memberIds.length === 1 ? (memberById.get(ev.memberIds[0])?.name ?? null) : null
      const withTime = `${ev.title}${eventTimeLabel(ev)}`
      occurrences.push({ date, minutes: eventMinutes(ev), text: owner ? `${owner}: ${withTime}` : withTime })
    }
  }
  // Notas importadas de un calendario externo, en el mismo rango —
  // loadExternalAgendaOccurrences ya descarta lo borrado/hecho.
  for (const ev of externalOccurrences) {
    if (member && ev.memberId && ev.memberId !== member.id) continue
    if (multiFilterIds && (!ev.memberId || !multiFilterIds.includes(ev.memberId))) continue
    const owner = !member && ev.memberId ? (memberById.get(ev.memberId)?.name ?? null) : null
    const withTime = `${ev.title}${eventTimeLabel(ev)}`
    occurrences.push({ date: ev.date, minutes: eventMinutes(ev), text: owner ? `${owner}: ${withTime}` : withTime })
  }

  const who = member ? ` para ${member.name}` : ''
  if (occurrences.length === 0) return `No tienes nada pendiente${who} ${label}.`

  occurrences.sort((a, b) => (a.date === b.date ? a.minutes - b.minutes : a.date.localeCompare(b.date)))
  const byDay = new Map<string, string[]>()
  for (const o of occurrences) {
    const list = byDay.get(o.date) ?? []
    list.push(o.text)
    byDay.set(o.date, list)
  }
  const dayParts = [...byDay.entries()].map(([date, items]) => {
    const dayLabel = new Date(date + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    return `${dayLabel}: ${items.join(', ')}`
  })
  return `Lo que tienes${who} ${label}: ${dayParts.join('. ')}.`
}

// "Pepa, lo siguiente que tengo en el calendario" — el próximo EVENTO
// (no tarea) que toca, mirando los próximos 90 días y expandiendo los
// recurrentes igual que hace la propia pantalla de Calendario. Si el
// evento es hoy pero su hora ya pasó, no cuenta — hay que mirar el
// siguiente de verdad, no repetir uno que ya tocó.
async function answerNextCalendarEvent(): Promise<string> {
  const now = new Date()
  const todayStr = todayIso()
  const rangeEnd = new Date(now)
  rangeEnd.setDate(rangeEnd.getDate() + 90)
  const rangeEndStr = dateStr(rangeEnd)

  const [allEvents, allExternalOccurrences] = await Promise.all([
    listUpcomingEvents(),
    loadExternalAgendaOccurrences(todayStr, rangeEndStr),
  ])

  // Si tienes un filtro de miembros activo en Calendario, "lo
  // siguiente" se busca solo entre lo suyo — mismo criterio que el
  // resto de preguntas de Pepa.
  const activeFilterIds = getCalendarMemberFilter()
  const events =
    activeFilterIds.length === 0 ? allEvents : allEvents.filter((ev) => ev.memberIds.some((id) => activeFilterIds.includes(id)))
  const externalOccurrences =
    activeFilterIds.length === 0
      ? allExternalOccurrences
      : allExternalOccurrences.filter((ev) => !!ev.memberId && activeFilterIds.includes(ev.memberId))

  function minutesOfDay(ev: { allDay: boolean; startAt: string }): number {
    if (ev.allDay) return -1
    const d = new Date(ev.startAt)
    return d.getHours() * 60 + d.getMinutes()
  }

  let best: { event: { title: string; allDay: boolean; startAt: string }; occurrenceDate: string } | null = null
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  for (const ev of events) {
    const occurrences = expandOccurrences(ev, todayStr, rangeEndStr)
    for (const occurrenceDate of occurrences) {
      if (occurrenceDate === todayStr && !ev.allDay && minutesOfDay(ev) < nowMinutes) continue
      if (
        !best ||
        occurrenceDate < best.occurrenceDate ||
        (occurrenceDate === best.occurrenceDate && minutesOfDay(ev) < minutesOfDay(best.event))
      ) {
        best = { event: ev, occurrenceDate }
      }
      break // dentro de un mismo evento, la primera ocurrencia válida ya es la más próxima
    }
  }

  // Notas importadas de un calendario externo — ya vienen expandidas
  // por loadExternalAgendaOccurrences, así que aquí solo hay que
  // comparar cada ocurrencia con la mejor encontrada hasta ahora.
  for (const ev of externalOccurrences) {
    if (ev.date === todayStr && !ev.allDay && minutesOfDay(ev) < nowMinutes) continue
    if (!best || ev.date < best.occurrenceDate || (ev.date === best.occurrenceDate && minutesOfDay(ev) < minutesOfDay(best.event))) {
      best = { event: { title: ev.title, allDay: ev.allDay, startAt: ev.startAt }, occurrenceDate: ev.date }
    }
  }

  if (!best) return 'No tienes nada apuntado próximamente en el calendario.'

  const dateLabel = new Date(best.occurrenceDate + 'T00:00').toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const timeLabel = best.event.allDay
    ? ''
    : ` a las ${new Date(best.event.startAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
  return `Lo siguiente en el calendario: ${best.event.title} — ${dateLabel}${timeLabel}.`
}

// "Qué tengo en la lista de la compra de Mercadona" — petición real:
// poder preguntar por una tienda concreta, no solo por toda la lista.
// Sin nombrar tienda ("¿qué tengo en la lista de la compra?"), se
// entiende como "general" — de todas a la vez, cada una por separado
// (petición real: "que vea todas las listas de la compra... Mercadona,
// patata, Hipervel, huevo, Aldi, leche", sin tener que decir ninguna
// palabra especial, "ya se entiende que es general").
async function answerShoppingQuery(storeHint: string | null, general: boolean): Promise<string> {
  const items = await listShoppingItems()
  const pending = items.filter((i) => i.status === 'pendiente')

  if (general) {
    if (pending.length === 0) return 'No tienes nada pendiente en ninguna lista de la compra.'
    const byStore = new Map<string, string[]>()
    for (const i of pending) {
      const key = i.store || 'Sin tienda'
      const list = byStore.get(key) ?? []
      list.push(i.name)
      byStore.set(key, list)
    }
    const groups = [...byStore.entries()].sort((a, b) => {
      if (a[0] === 'Sin tienda') return 1
      if (b[0] === 'Sin tienda') return -1
      return a[0].localeCompare(b[0])
    })
    return groups.map(([store, names]) => `${store}: ${names.join(', ')}`).join('. ') + '.'
  }

  const storeLabel = storeHint ? ` de ${storeHint}` : ''
  const filtered = storeHint
    ? pending.filter((i) => i.store && normalize(i.store).includes(normalize(storeHint)))
    : pending
  if (filtered.length === 0) return `No tienes nada pendiente en la lista de la compra${storeLabel}.`
  return `En la lista de la compra${storeLabel}: ${filtered.map((i) => i.name).join(', ')}.`
}

async function handleCalendarEntry(text: string): Promise<string> {
  const parsed = parseCalendarEntry(text, new Date())
  const members = await listFamilyMembers()
  let member = parsed.memberHint ? matchMemberByHint(parsed.memberHint, members) : null
  let title = parsed.title

  // Si la frase no decía ninguna fecha, se usa el día que tengas abierto
  // en Calendario (su ventana emergente) en vez de caer siempre en hoy —
  // "marco el 17 y digo 'taller coche' sin fecha" tiene que apuntarlo el
  // 17, no el día de hoy (bug real reportado).
  const date = parsed.dateExplicit ? parsed.date : (getSelectedCalendarDate() ?? parsed.date)

  // "entrenamiento fútbol, Eric, 14 de septiembre..." — el nombre a
  // veces se dice suelto, sin "para" delante. Si no se ha encontrado ya
  // así, se busca el nombre de algún miembro tal cual dentro del título
  // y se saca de ahí en vez de dejarlo colgando en el texto.
  if (!member) {
    const found = findMemberInText(title, members)
    if (found) {
      member = found
      const nameRe = new RegExp(`\\b${found.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      title = title
        .replace(nameRe, '')
        .replace(/\s+/g, ' ')
        .replace(/^[,;]\s*/, '')
        .replace(/[,;]\s*$/, '')
        .trim()
      title = title ? title.charAt(0).toUpperCase() + title.slice(1) : parsed.title
    }
  }

  // Un recordatorio "al terminar" no tiene sentido si no se ha dicho
  // hora de fin — se degrada a "al empezar" en vez de quedarse mudo.
  const reminders = parsed.reminders.map((r) => ({
    ...r,
    anchor: r.anchor === 'end' && !parsed.endTime ? ('start' as const) : r.anchor,
  }))

  await createEvent({
    title,
    startAt: new Date(`${date}T${parsed.time ?? '09:00'}`).toISOString(),
    endAt: parsed.endTime ? new Date(`${date}T${parsed.endTime}`).toISOString() : null,
    allDay: parsed.time === null,
    recurrenceRule: parsed.recurrenceRule,
    reminders,
    memberIds: member ? [member.id] : [],
  })

  // VoiceCapture vive fuera de la pantalla de Calendario (está montado en
  // NavShell, en toda la app) — sin este aviso, CalendarScreen no se
  // entera de que hay un evento nuevo y la cuadrícula del mes se queda
  // igual hasta que recargas a mano (bug real: "no me lo pone en la
  // casilla" — el evento SÍ se guardaba, solo que no se veía).
  window.dispatchEvent(new CustomEvent('family-app:calendar-changed', { detail: { date } }))

  const dateLabel = new Date(date + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  const timeLabel = parsed.time ? ` a las ${parsed.time}` : ''
  const endTimeLabel = parsed.endTime ? ` – ${parsed.endTime}` : ''
  const memberLabel = member ? ` · para ${member.name}` : ''
  const reminderText =
    reminders.length > 0 ? ` · 🔔 ${reminders.map((r) => reminderLabel(r.minutesBefore, r.anchor)).join(', ')}` : ''
  const recurrenceText = parsed.recurrenceRule ? ` · ${recurrenceLabel(parsed.recurrenceRule)}` : ''
  return `Apuntado en el calendario: ${title} — ${dateLabel}${timeLabel}${endTimeLabel}${memberLabel}${recurrenceText}${reminderText}`
}

type Status = 'idle' | 'listening' | 'saving' | 'done' | 'error'

// Botón flotante disponible en toda la app (Skill: dictado por voz).
// Apunta lo dicho o escrito en la lista/calendario de la pantalla donde
// estés, responde preguntas sencillas sobre tareas y compra de hoy, y
// contesta hablando o por texto según lo que el usuario elija.
export function VoiceCapture() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  openRef.current = open
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [typedText, setTypedText] = useState('')
  const [mode, setMode] = useState<ResponseMode>(loadResponseMode)
  const dictationOk = isDictationSupported()

  // Cuatro botones, cuatro usos, sin ambigüedad — antes dos botones
  // tenían que ADIVINAR de qué screen/categoría iba lo dicho ("Mercadona,
  // patata, huevo" se apuntaba en el calendario en vez de en la compra;
  // preguntar por Mercadona a veces contestaba también con Aldi), y
  // aunque se afinó varias veces seguía fallando (petición real: "vamos
  // a dejar Pepa calendario y Pepa lista de la compra, dos botones
  // independientes... apuntar calendario, apuntar lista de la compra").
  // Ahora el botón que se toca YA dice destino y acción, así que dentro
  // no hace falta adivinar ninguna de las dos cosas.
  const [panelMode, setPanelMode] = useState<PanelMode>('create-calendario')
  // openPanel cambia panelMode y arranca a escuchar EN EL MISMO
  // instante — React todavía no ha vuelto a renderizar, así que
  // processText, si leyera panelMode directamente, seguiría viendo el
  // botón anterior la primera vez (bug real: tocar "🐣📅 Pepa
  // Calendario" apuntaba una cita en vez de responder, la primera vez
  // después de cada cambio de botón; la segunda vez ya iba bien,
  // porque para entonces sí había repintado). Una ref no tiene ese
  // problema — se lee siempre el valor más reciente, venga de la
  // clausura que venga.
  const panelModeRef = useRef(panelMode)
  panelModeRef.current = panelMode

  // Devuelve una promesa que no termina hasta que Pepa deja de hablar —
  // así se sabe el momento exacto en que es seguro volver a escuchar sin
  // que el propio móvil se oiga a sí mismo por el altavoz y se lo tome
  // como un encargo nuevo.
  async function respond(text: string) {
    setMessage(text)
    if (mode === 'voice' && isSpeechSupported()) await speakAsync(text)
  }

  async function processText(rawText: string) {
    setStatus('saving')
    try {
      const text = stripWakeWord(rawText)
      const destination = destinationOf(panelModeRef.current)
      const kind = kindOf(panelModeRef.current)

      // Borrar por voz no está soportado en ningún botón todavía — se
      // comprueba siempre, para no acabar creando una cita nueva con el
      // literal "borra la cita del nueve de septiembre" por título.
      if (isUnsupportedDelete(text)) {
        setStatus('done')
        await respond('Todavía no puedo borrar citas hablando — ábrela en el calendario y pulsa "Borrar".')
        return
      }

      // Botones 🐣 Pepa: SOLO preguntas, nunca guardan nada — así no hay
      // riesgo de que una pregunta mal reconocida se cuele como un
      // apunte nuevo. El botón pulsado ("Pepa Calendario" / "Pepa
      // Compra") ya dice de qué trata la pregunta, así que aquí no hay
      // que adivinar la categoría — solo sacar el día/tienda de lo
      // dicho dentro de esa categoría.
      if (kind === 'ask') {
        // "Apunta que tengo que comprar leche" es un ENCARGO, no una
        // pregunta, aunque comparta palabras con "¿qué tengo que
        // comprar?" — mejor decir que no se ha entendido que devolver
        // una respuesta con datos viejos como si fuera la contestación.
        if (looksLikeSaveInstruction(text)) {
          setStatus('done')
          await respond(
            destination === 'calendario'
              ? 'Eso suena a un encargo para guardar, no a una pregunta — usa el botón "🎤 Apuntar Calendario".'
              : 'Eso suena a un encargo para guardar, no a una pregunta — usa el botón "🎤 Apuntar Compra".',
          )
          return
        }

        if (destination === 'calendario') {
          const query = parseCalendarQuery(text, new Date())
          const answer =
            query.type === 'next_calendar_event'
              ? await answerNextCalendarEvent()
              : query.type === 'week_range'
                ? await answerWeekRangeQuery(null, text, query.from, query.to, query.label)
                : await answerAgendaQuery(query.memberHint, text, query.when, query.nowOnly, query.explicitDate)
          setStatus('done')
          await respond(answer)
          return
        }

        const knownStores = await listShoppingStores()
        const storeNames = knownStores.map((s) => s.name)
        const { storeHint, general } = parseShoppingQuery(text, storeNames)
        const answer = await answerShoppingQuery(storeHint, general)
        setStatus('done')
        await respond(answer)
        return
      }

      // Botones 🎤 Apuntar: SOLO guardan, nunca responden una pregunta —
      // para preguntar están los botones de Pepa. El destino ya lo dice
      // el botón pulsado ("Apuntar Calendario" / "Apuntar Compra"), así
      // que aquí tampoco hay que adivinar nada de contenido.
      if (destination === 'calendario') {
        navigate(DESTINATION_INFO.calendario.path)
        const confirmation = await handleCalendarEntry(text)
        setStatus('done')
        await respond(confirmation)
        return
      }

      navigate(DESTINATION_INFO.compras.path)
      const knownStores = await listShoppingStores()
      const storeNames = knownStores.map((s) => s.name)

      // "Mercadona, patatas" -> tienda "Mercadona", producto "patatas"
      // — sin esto se guardaba la frase entera como nombre del producto
      // (petición real: "que no me ponga todo el texto... que reconozca
      // el nombre de la tienda"). Se reconoce primero contra las tiendas
      // ya dadas de alta en Compras (fiable pase lo que pase alrededor)
      // y, si no es ninguna de esas, por heurística.
      const { store: shoppingStore, text: textForEntries } = extractShoppingStore(text, storeNames)

      let entries = splitEntries(stripListFillers(textForEntries))
      if (entries.length === 0) {
        // Solo se ha dicho el nombre de la tienda, sin ningún producto
        // detrás ("Mercadona") — se entiende como "ábreme la lista de
        // Mercadona", no como un apunte vacío (petición real: "cuando
        // le diga Aldi, que me abra directamente la lista de Aldi").
        if (shoppingStore) {
          window.dispatchEvent(new CustomEvent('family-app:focus-store', { detail: { store: shoppingStore } }))
          setStatus('done')
          await respond(`Aquí tienes la lista de la compra de ${shoppingStore}.`)
          return
        }
        setStatus('idle')
        return
      }

      // Si se ha dictado de un tirón, sin comas ni "y" de por medio
      // ("patata lechuga lentejas agua vino"), splitEntries deja un
      // solo trozo largo — se prueba a separarlo con IA antes de
      // guardarlo así (petición real: "esto me lo sigue poniendo todo
      // junto... quiero que me lo ponga cada producto en una línea").
      // Si la IA falla (sin red, etc.) se guarda tal cual, como antes.
      if (entries.length === 1 && entries[0].trim().includes(' ')) {
        try {
          const split = await splitGroceryListWithAi(entries[0])
          if (split.length > 1) entries = split
        } catch {
          // Sin conexión a la IA no pasa nada — se guarda como un solo
          // producto, igual que se hacía antes de este respaldo.
        }
      }

      await saveShoppingEntries(entries, shoppingStore)
      setStatus('done')
      const storeSuffix = shoppingStore ? ` (${shoppingStore})` : ''
      await respond(`Apuntado en ${DESTINATION_INFO.compras.label}${storeSuffix}: ${entries.join(', ')}`)
    } catch (err) {
      setStatus('error')
      const detail = err instanceof Error ? err.message : String(err)
      await respond(`No he podido hacerlo: ${detail}`)
    }
  }

  const sessionRef = useRef<{ stop: () => void } | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHeardRef = useRef('')
  const [listening, setListening] = useState(false)

  function clearSilenceTimer() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }

  function stopListening() {
    clearSilenceTimer()
    sessionRef.current?.stop()
    sessionRef.current = null
    setListening(false)
  }

  // Antes había que tocar "Empezar" y luego "Apuntar" para cada frase —
  // ahora, en cuanto se abre el panel, ya escucha sola: se apunta al
  // decir "Pepa, activa" (o parecido) o, si no, sola tras el silencio
  // de abajo, exactamente como pedido ("que lo podamos hacer todo con
  // voz", "es como si le diese a apuntar").
  function startListening() {
    if (!dictationOk || sessionRef.current) return
    lastHeardRef.current = ''
    setTypedText('')
    setListening(true)
    setStatus('listening')
    setMessage('Pepa te escucha… habla cuando quieras, se apunta sola al quedarte callado')
    sessionRef.current = listenContinuous({
      onTranscript: (text) => {
        const { activated, text: cleaned } = stripActivateCommand(text)
        setTypedText(activated ? cleaned : text)
        if (activated) {
          clearSilenceTimer()
          submitFromVoice(cleaned)
          return
        }
        if (text && text !== lastHeardRef.current) {
          lastHeardRef.current = text
          clearSilenceTimer()
          silenceTimerRef.current = setTimeout(() => submitFromVoice(text), SILENCE_TIMEOUT_MS)
        }
      },
      onError: (errorMessage) => {
        stopListening()
        setStatus('error')
        setMessage(errorMessage)
      },
    })
  }

  async function submitFromVoice(text: string) {
    stopListening()
    const trimmed = text.trim()
    setTypedText('')
    if (!trimmed) {
      setStatus('idle')
      startListening()
      return
    }
    await processText(trimmed)
    // Petición real: "cuando termine de decirme... quiero que se cierre
    // automáticamente Pepa. Y si quiero volver a abrirlo, pues volver a
    // decirle la frase" — antes se quedaba escuchando para un segundo
    // encargo sin cerrar, y el aviso de "te escucho" (la línea roja) se
    // quedaba puesto aunque ya se hubiera contestado. En modo voz la
    // respuesta ya se ha oído entera en este punto (respond espera a que
    // acabe de hablar), así que cerrar no se pierde nada — para lo
    // siguiente, se vuelve a decir la frase de activación. En modo texto
    // no hay ninguna señal de que ya se ha leído la respuesta, así que
    // ahí se sigue escuchando como antes, para no hacerla desaparecer
    // sin darle tiempo a leerla.
    if (mode === 'voice') {
      close()
    } else if (openRef.current) {
      startListening()
    }
  }

  function handleTypedSubmit(e: FormEvent) {
    e.preventDefault()
    if (!typedText.trim()) return
    stopListening()
    processText(typedText)
    setTypedText('')
  }

  function changeMode(next: ResponseMode) {
    setMode(next)
    saveResponseMode(next)
  }

  // Activación por voz sin tocar nada probada y descartada: la propia
  // app no puede apagar el pitido que el sistema (Android) suena cada
  // vez que el motor de reconocimiento reinicia sesión — al escuchar
  // de fondo sin parar, eso eran pitidos constantes ("truru truru
  // truru", petición real: "no quiero eso... si no se puede, lo dejas
  // solo con los botones"). Solo botón/frase dicha DENTRO de un panel
  // ya abierto, nunca escucha en segundo plano.
  function openPanel(nextMode: PanelMode) {
    setPanelMode(nextMode)
    setOpen(true)
    openedAtRef.current = Date.now()
    if (dictationOk) startListening()
  }

  // Red de seguridad además del preventDefault de más abajo — si por
  // lo que sea el móvil todavía cuela un toque/clic fantasma justo al
  // abrir el panel, que caiga sobre el fondo (que cierra al tocarlo),
  // se ignora en vez de cerrar el panel que se acaba de abrir (bug
  // real: "se conecta el micrófono pero no sale la pantalla" — se
  // abría y cerraba en el mismo instante).
  const openedAtRef = useRef(0)
  function handleOverlayClick() {
    if (Date.now() - openedAtRef.current < 500) return
    close()
  }

  // Los 4 botones se pueden arrastrar a CUALQUIER sitio de la pantalla
  // (petición real: "que se puedan mover de un lado para otro y poner
  // en la posición que queramos") — cada uno guarda su propia posición
  // en px, no un orden dentro de una rejilla fija. El que no se haya
  // tocado nunca sale en su sitio por defecto (fila arriba del todo).
  const [fabPositions, setFabPositions] = useState<Partial<Record<PanelMode, FabPosition>>>(() => loadFabPositions())
  const buttonDragRef = useRef<{ mode: PanelMode; startX: number; startY: number; moved: number } | null>(null)
  const [draggingButton, setDraggingButton] = useState<PanelMode | null>(null)
  const [buttonDragOffset, setButtonDragOffset] = useState({ x: 0, y: 0 })

  // Abrir el panel ya no depende de los eventos táctiles/de puntero
  // (pointerdown/up), que resultaron poco fiables en algunos móviles
  // (bug real, persistente: "en el móvil no me funciona... se conecta
  // el micrófono pero no sale la pantalla" — dos intentos previos con
  // preventDefault y con un margen de medio segundo no lo arreglaron
  // del todo). Ahora abrir pasa SOLO por onClick, el evento más
  // simple y fiable que hay en cualquier navegador — pointerdown/
  // move/up se quedan únicamente para detectar y dibujar el
  // arrastre, y si se detecta un arrastre de verdad, wasDraggedRef
  // hace que el clic que viene detrás no abra el panel.
  const wasDraggedRef = useRef(false)

  function handleButtonDragStart(e: ReactPointerEvent, mode: PanelMode, el: HTMLElement) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    el.setPointerCapture(e.pointerId)
    wasDraggedRef.current = false
    buttonDragRef.current = { mode, startX: e.clientX, startY: e.clientY, moved: 0 }
    setDraggingButton(mode)
  }

  function handleButtonDragMove(e: ReactPointerEvent) {
    const drag = buttonDragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(dy))
    if (drag.moved >= BUTTON_TAP_THRESHOLD_PX) wasDraggedRef.current = true
    setButtonDragOffset({ x: dx, y: dy })
  }

  function handleButtonDragEnd(e: ReactPointerEvent) {
    const drag = buttonDragRef.current
    buttonDragRef.current = null
    setDraggingButton(null)
    setButtonDragOffset({ x: 0, y: 0 })
    if (!drag) return
    if (drag.moved >= BUTTON_TAP_THRESHOLD_PX) {
      // Posición final = donde quedó el botón en pantalla, acotada
      // para que no se pueda soltar tapado fuera de la ventana.
      const el = e.currentTarget as HTMLElement
      const maxLeft = Math.max(0, window.innerWidth - FAB_SIZE)
      const maxTop = Math.max(0, window.innerHeight - FAB_SIZE)
      const rect = el.getBoundingClientRect()
      const next = {
        ...fabPositions,
        [drag.mode]: {
          top: Math.min(Math.max(0, rect.top), maxTop),
          left: Math.min(Math.max(0, rect.left), maxLeft),
        },
      }
      setFabPositions(next)
      saveFabPositions(next)
    }
  }

  function handleButtonClick(mode: PanelMode) {
    // Si justo antes hubo un arrastre de verdad (para reordenar), este
    // clic que viene detrás no cuenta como "abrir" — ya se ha hecho lo
    // que se quería hacer.
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false
      return
    }
    openPanel(mode)
  }

  function close() {
    stopListening()
    setOpen(false)
    setStatus('idle')
    setMessage('')
    setTypedText('')
  }

  const panel = PANEL_INFO[panelMode]

  return (
    <>
      {/* Cuatro botones redondos, solo icono — petición real: "ocupan
          mucho espacio en la pantalla... hazlos más pequeños,
          redondos... ponlos arriba, donde no tapen la vista", y luego
          "en una línea, en la parte superior, para que no tapen qué
          tenemos hoy ni hola Paco". Cada uno flota en su propia
          posición (por defecto, en fila arriba del todo) y se puede
          arrastrar a cualquier sitio de la pantalla; el nombre
          completo sigue disponible al tacto (aria-label) y, ya
          abierto, en el título del panel. */}
      {PANEL_MODES.map((m) => {
        const isDragging = draggingButton === m
        const pos = fabPositions[m] ?? DEFAULT_FAB_POSITIONS[m]
        return (
          <button
            key={m}
            type="button"
            className={'voice-fab-round ' + (kindOf(m) === 'ask' ? 'voice-fab-ask' : 'voice-fab-create') + (isDragging ? ' voice-fab-dragging' : '')}
            style={{
              top: pos.top + (isDragging ? buttonDragOffset.y : 0),
              left: pos.left + (isDragging ? buttonDragOffset.x : 0),
            }}
            aria-label={PANEL_INFO[m].title}
            onClick={() => handleButtonClick(m)}
            onPointerDown={(e) => handleButtonDragStart(e, m, e.currentTarget)}
            onPointerMove={handleButtonDragMove}
            onPointerUp={handleButtonDragEnd}
            onPointerCancel={handleButtonDragEnd}
          >
            {/* Los botones "Pepa" (preguntar) llevan su avatar en vez
                del emoji 🐣 — petición real: "sustituyas el pollo que
                has puesto como icono de pepa por este avatar" — con
                el destino (📅/🛒) como distintivo pequeño encima. */}
            {kindOf(m) === 'ask' ? (
              <>
                <img src={pepaAvatar} alt="Pepa" className="voice-fab-avatar" />
                <span className="voice-fab-badge">{destinationOf(m) === 'calendario' ? '📅' : '🛒'}</span>
              </>
            ) : (
              PANEL_INFO[m].icon
            )}
          </button>
        )
      })}

      {open && (
        <div className="modal-overlay" onClick={handleOverlayClick}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {panel.title}
              </h2>
              <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">
                ✕
              </button>
            </div>

            {dictationOk && (
              <button
                type="button"
                className={'voice-mic-button' + (listening ? ' voice-mic-listening' : '')}
                onClick={() => (listening ? stopListening() : startListening())}
                disabled={status === 'saving'}
              >
                {status === 'saving'
                  ? 'Guardando…'
                  : listening
                    ? '🎙️ Te escucho… habla ya (toca para parar)'
                    : '🎤 Toca y habla'}
              </button>
            )}
            <div className="day-modal-group">
              <p className="muted" style={{ marginBottom: 4 }}>
                Cómo funciona:
              </p>
              <ul className="voice-instructions">
                {panel.instructions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            {!dictationOk && (
              <p className="muted">
                Este navegador no admite dictado por voz — escribe abajo en su lugar, funciona igual.
              </p>
            )}

            <div className="day-modal-group">
              <p className="muted" style={{ marginBottom: 4 }}>
                Ejemplos — dilo así siempre y Pepa lo entenderá seguro (toca uno para usarlo):
              </p>
              <div className="voice-examples">
                {panel.examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="chip voice-example-chip"
                    onClick={() => setTypedText(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleTypedSubmit} className="voice-text-form">
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="O escribe aquí…"
              />
              <button type="submit" disabled={status === 'saving' || !typedText.trim()}>
                {panel.submitLabel}
              </button>
            </form>

            {message && <p className={status === 'error' ? 'error' : 'muted'}>{message}</p>}

            <div className="day-modal-group">
              <p className="muted">¿Cómo prefieres que responda la app?</p>
              <div className="filter-row">
                <button
                  type="button"
                  className={'chip' + (mode === 'voice' ? ' chip-active' : '')}
                  onClick={() => changeMode('voice')}
                >
                  🔊 Hablando
                </button>
                <button
                  type="button"
                  className={'chip' + (mode === 'text' ? ' chip-active' : '')}
                  onClick={() => changeMode('text')}
                >
                  💬 Por escrito
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
