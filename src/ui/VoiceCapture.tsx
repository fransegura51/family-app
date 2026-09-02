import { FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createTask, listCompletions, listTasks } from '@/data/tasks'
import { addShoppingItem, listShoppingItems } from '@/data/shopping'
import { listFamilyMembers } from '@/data/family'
import { createEvent, listUpcomingEvents } from '@/data/calendar'
import { splitEntries } from '@/domain/quickCapture'
import { isTaskDueOn } from '@/domain/tasks'
import { expandOccurrences } from '@/domain/calendar'
import type { CalendarEvent } from '@/domain/types'
import { reminderLabel } from '@/domain/reminders'
import { recurrenceLabel } from '@/domain/recurrence'
import {
  detectIntent,
  detectTargetFromText,
  findMemberInText,
  matchMemberByHint,
  stripListFillers,
  stripWakeWord,
} from '@/domain/voiceQuery'
import { parseCalendarEntry } from '@/domain/calendarVoiceParser'
import { isDictationSupported, isSpeechSupported, listenOnce, speak } from '@/services/voice'
import { getSelectedCalendarDate } from '@/state/calendarSelection'

type ResponseMode = 'voice' | 'text'
const STORAGE_KEY = 'familyapp:voice-response-mode'

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

type TargetKey = 'compras' | 'tareas' | 'calendario'

const TARGET_INFO: Record<TargetKey, { label: string; path: string }> = {
  compras: { label: '🛒 Lista de la compra', path: '/compras' },
  calendario: { label: '📅 Calendario', path: '/calendario' },
  tareas: { label: '✅ Tareas', path: '/tareas' },
}

// A qué lista se apunta (o qué acción se hace) depende de en qué
// pantalla estás por defecto — "si le hablo en tareas, quiero que me
// apunte en tareas; si le hablo en lista de la compra, en lista de la
// compra". Fuera de esas pantallas cae en Tareas. Esto es solo el punto
// de partida: si lo que se dice apunta claramente a otro sitio (ver
// detectTargetFromText), gana el contenido y Pepa te lleva allí.
function getTarget(pathname: string): { key: TargetKey; label: string } {
  if (pathname.startsWith('/compras')) return { key: 'compras', label: TARGET_INFO.compras.label }
  if (pathname.startsWith('/calendario')) return { key: 'calendario', label: TARGET_INFO.calendario.label }
  return { key: 'tareas', label: TARGET_INFO.tareas.label }
}

async function saveEntries(targetKey: 'compras' | 'tareas', entries: string[], memberId: string | null): Promise<void> {
  for (const entry of entries) {
    if (targetKey === 'compras') {
      await addShoppingItem({ name: entry, quantity: '', unit: '', priority: 'normal', tripId: null })
    } else {
      await createTask({
        title: entry,
        taskType: 'unica',
        memberId,
        points: 0,
        recurrenceRule: null,
        startDate: todayIso(),
        timeOfDay: null,
      })
    }
  }
  // Mismo aviso que en Calendario: si ya estás en Lista de la compra o
  // en Tareas, que se vea al momento en vez de tener que recargar.
  window.dispatchEvent(new CustomEvent(`family-app:${targetKey}-changed`))
}

// "Pepa, apunta a Eric que saque la basura" — reconoce a quién es la
// tarea (igual que ya se hace en el calendario) y lo quita del texto
// junto con el conector que suele ir delante ("a"/"para"), para no
// dejarlo colgando en el título de la tarea.
async function extractTaskMember(text: string): Promise<{ memberId: string | null; text: string }> {
  const members = await listFamilyMembers()
  const member = findMemberInText(text, members)
  if (!member) return { memberId: null, text }
  const escaped = member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const nameRe = new RegExp(`\\b(a|para)?\\s*${escaped}\\b,?`, 'i')
  const cleaned = text.replace(nameRe, ' ').replace(/\s+/g, ' ').trim()
  return { memberId: member.id, text: cleaned }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function eventMinutes(ev: CalendarEvent): number {
  if (ev.allDay) return -1
  const d = new Date(ev.startAt)
  return d.getHours() * 60 + d.getMinutes()
}

function eventTimeLabel(ev: CalendarEvent): string {
  return ev.allDay ? '' : ` a las ${new Date(ev.startAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
}

async function answerTasksQuery(
  memberHint: string | null,
  rawText: string,
  when: 'today' | 'tomorrow',
  nowOnly: boolean,
  explicitDate: string | null,
): Promise<string> {
  const [tasks, members, completions, events] = await Promise.all([
    listTasks(),
    listFamilyMembers(),
    listCompletions(),
    listUpcomingEvents(),
  ])
  const target = explicitDate ?? (when === 'tomorrow' ? tomorrowIso() : todayIso())
  const dateLabel = explicitDate
    ? new Date(explicitDate + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
    : null
  const dayWord = dateLabel ? `el ${dateLabel}` : when === 'tomorrow' ? 'mañana' : 'hoy'
  // "Ahora" solo tiene sentido preguntando por hoy mismo — ni "mañana"
  // ni una fecha concreta suelta tienen un "ya ha pasado" que valga.
  const isToday = !explicitDate && when === 'today'
  const applyNowFilter = nowOnly && isToday
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  // Antes solo se miraban las TAREAS — si lo de hoy era una cita del
  // calendario ("ir a trabajar") en vez de una tarea, Pepa decía que no
  // había nada aunque sí hubiera (bug real reportado). Se expanden los
  // recurrentes igual que en el resto de la app y se filtra al día
  // exacto preguntado.
  const eventsOnTarget = events.filter((ev) => expandOccurrences(ev, target, target).includes(target))

  let due = tasks.filter((t) => isTaskDueOn(t, target))
  let who = ''

  // El nombre puede venir con "soy X"/"para X" delante, o dicho suelto
  // ("Jennifer, ¿qué tengo que hacer hoy?") — se prueban las dos formas
  // antes de rendirse (bug real: preguntar así no filtraba por persona,
  // y salían también las tareas asignadas a otro miembro de la familia).
  const member = (memberHint ? matchMemberByHint(memberHint, members) : null) ?? findMemberInText(rawText, members)

  if (member) {
    due = due.filter((t) => t.memberId === null || t.memberId === member.id)
    const doneOnTarget = new Set(
      completions.filter((c) => c.memberId === member.id && c.completedDate === target).map((c) => c.taskId),
    )
    due = due.filter((t) => !doneOnTarget.has(t.id))

    let memberEvents = eventsOnTarget.filter((ev) => ev.memberIds.length === 0 || ev.memberIds.includes(member.id))

    if (applyNowFilter) {
      due = due.filter((t) => {
        if (!t.timeOfDay) return true
        return toMinutes(t.timeOfDay) >= nowMinutes
      })
      memberEvents = memberEvents.filter((ev) => ev.allDay || eventMinutes(ev) >= nowMinutes)
    }
    who = ` para ${member.name}`

    if (due.length === 0 && memberEvents.length === 0) return `No tienes nada pendiente${who} ${dayWord}.`

    const items = [
      ...due.map((t) => ({
        minutes: t.timeOfDay ? toMinutes(t.timeOfDay) : -1,
        label: t.timeOfDay ? `${t.title} a las ${t.timeOfDay.slice(0, 5)}` : t.title,
      })),
      ...memberEvents.map((ev) => ({ minutes: eventMinutes(ev), label: `${ev.title}${eventTimeLabel(ev)}` })),
    ].sort((a, b) => a.minutes - b.minutes)

    return `Lo que tienes${who} ${dayWord}: ${items.map((i) => i.label).join(', ')}.`
  }

  // "Todos" — sin decir de quién, se cuenta la agenda de TODA la familia,
  // cada tarea/cita con quién tiene que hacerla — "Fernando tiene que
  // bañarse a las 6, Eric a las 7..." en vez de un listado plano sin
  // decir de quién es cada una. Preguntando por HOY, siempre se cuenta
  // desde la hora actual (no hace falta decir "ahora" — así ya se probó
  // y confirmó antes); preguntando por MAÑANA no aplica, ahí no hay
  // "ya ha pasado".
  const memberById = new Map(members.map((m) => [m.id, m]))
  due = due.filter((t) => {
    if (isToday && t.timeOfDay && toMinutes(t.timeOfDay) < nowMinutes) return false
    const doneBy = t.memberId
      ? completions.some((c) => c.taskId === t.id && c.memberId === t.memberId && c.completedDate === target)
      : completions.some((c) => c.taskId === t.id && c.completedDate === target)
    return !doneBy
  })

  let allEvents = eventsOnTarget
  if (isToday) {
    allEvents = allEvents.filter((ev) => ev.allDay || eventMinutes(ev) >= nowMinutes)
  }

  if (due.length === 0 && allEvents.length === 0) return `No queda nada pendiente por ${dayWord}.`

  const items = [
    ...due.map((t) => {
      const owner = t.memberId ? (memberById.get(t.memberId)?.name ?? null) : null
      const withTime = t.timeOfDay ? `${t.title} a las ${t.timeOfDay.slice(0, 5)}` : t.title
      return { minutes: t.timeOfDay ? toMinutes(t.timeOfDay) : -1, label: owner ? `${owner}: ${withTime}` : withTime }
    }),
    ...allEvents.map((ev) => {
      const owner = ev.memberIds.length === 1 ? (memberById.get(ev.memberIds[0])?.name ?? null) : null
      const withTime = `${ev.title}${eventTimeLabel(ev)}`
      return { minutes: eventMinutes(ev), label: owner ? `${owner}: ${withTime}` : withTime }
    }),
  ].sort((a, b) => a.minutes - b.minutes)

  return `Lo que queda por ${dayWord}: ${items.map((i) => i.label).join(', ')}.`
}

// "Pepa, lo siguiente que tengo en el calendario" — el próximo EVENTO
// (no tarea) que toca, mirando los próximos 90 días y expandiendo los
// recurrentes igual que hace la propia pantalla de Calendario. Si el
// evento es hoy pero su hora ya pasó, no cuenta — hay que mirar el
// siguiente de verdad, no repetir uno que ya tocó.
async function answerNextCalendarEvent(): Promise<string> {
  const events = await listUpcomingEvents()
  const now = new Date()
  const todayStr = todayIso()
  const rangeEnd = new Date(now)
  rangeEnd.setDate(rangeEnd.getDate() + 90)
  const rangeEndStr = dateStr(rangeEnd)

  function minutesOfDay(ev: CalendarEvent): number {
    if (ev.allDay) return -1
    const d = new Date(ev.startAt)
    return d.getHours() * 60 + d.getMinutes()
  }

  let best: { event: CalendarEvent; occurrenceDate: string } | null = null
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

async function answerShoppingQuery(): Promise<string> {
  const items = await listShoppingItems()
  const pending = items.filter((i) => i.status === 'pendiente')
  if (pending.length === 0) return 'No tienes nada pendiente en la lista de la compra.'
  return `En la lista de la compra: ${pending.map((i) => i.name).join(', ')}.`
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
  const location = useLocation()
  const navigate = useNavigate()
  const target = getTarget(location.pathname)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [typedText, setTypedText] = useState('')
  const [mode, setMode] = useState<ResponseMode>(loadResponseMode)
  const dictationOk = isDictationSupported()

  function respond(text: string) {
    if (mode === 'voice' && isSpeechSupported()) speak(text)
    setMessage(text)
  }

  async function processText(rawText: string) {
    setStatus('saving')
    try {
      const text = stripWakeWord(rawText)

      // Las preguntas (qué tengo hoy/mañana, lo siguiente del calendario,
      // qué hay en la compra) se resuelven ANTES que la navegación/
      // creación — si no, "lo siguiente que tengo en el CALENDARIO" se
      // intentaría guardar como una cita nueva en vez de responder (la
      // palabra "calendario" también dispara la navegación a Calendario,
      // bug real detectado al diseñar esta pregunta).
      const intent = detectIntent(text, new Date())
      if (intent.type === 'unsupported_delete') {
        setStatus('done')
        respond('Todavía no puedo borrar citas hablando — ábrela en el calendario y pulsa "Borrar".')
        return
      }
      if (intent.type === 'tasks_today') {
        const answer = await answerTasksQuery(intent.memberHint, text, intent.when, intent.nowOnly, intent.explicitDate)
        setStatus('done')
        respond(answer)
        return
      }
      if (intent.type === 'next_calendar_event') {
        const answer = await answerNextCalendarEvent()
        setStatus('done')
        respond(answer)
        return
      }
      if (intent.type === 'shopping_list') {
        const answer = await answerShoppingQuery()
        setStatus('done')
        respond(answer)
        return
      }

      // El contenido manda sobre la pantalla en la que estés — "Pepa,
      // ponme en el calendario que..." tiene que ir al calendario aunque
      // lo digas estando en Tareas, no guardarse donde estuvieras (eso
      // era lo que pasaba antes: solo miraba la pantalla actual). Si no
      // hay ninguna pista clara en lo dicho, se usa la pantalla actual,
      // como siempre.
      const contentTargetKey = detectTargetFromText(text)
      const effectiveTargetKey = contentTargetKey ?? target.key
      const effectiveTarget = TARGET_INFO[effectiveTargetKey]
      if (effectiveTargetKey !== target.key) {
        navigate(effectiveTarget.path)
      }

      if (effectiveTargetKey === 'calendario') {
        const confirmation = await handleCalendarEntry(text)
        setStatus('done')
        respond(confirmation)
        return
      }

      // En Tareas (no en Compras — la compra no es de una persona en
      // concreto) se reconoce a quién es, igual que ya se hace en el
      // calendario — "Pepa, apunta a Eric que saque la basura" la
      // asigna a Eric en vez de dejarla sin nadie.
      let memberId: string | null = null
      let textForEntries = text
      if (effectiveTargetKey === 'tareas') {
        const extracted = await extractTaskMember(text)
        memberId = extracted.memberId
        textForEntries = extracted.text
      }

      const entries = splitEntries(stripListFillers(textForEntries))
      if (entries.length === 0) {
        setStatus('idle')
        return
      }
      await saveEntries(effectiveTargetKey as 'compras' | 'tareas', entries, memberId)
      setStatus('done')
      respond(`Apuntado en ${effectiveTarget.label}: ${entries.join(', ')}`)
    } catch (err) {
      setStatus('error')
      const detail = err instanceof Error ? err.message : String(err)
      respond(`No he podido hacerlo: ${detail}`)
    }
  }

  // El reconocimiento de voz no es perfecto (eso no lo controla la app,
  // es el motor de Google que usa Chrome por debajo) — así que en vez de
  // guardar directamente lo que ha creído oír, lo deja escrito en el
  // campo de texto para revisarlo/corregirlo antes de pulsar "Apuntar",
  // igual que ya se revisan los tickets, las recetas o la foto de la
  // nevera antes de guardar nada.
  function handleListen() {
    setStatus('listening')
    setMessage('Pepa te escucha…')
    listenOnce(
      (transcript) => {
        setTypedText(transcript)
        setStatus('idle')
        setMessage('Pepa ha oído esto — revísalo y pulsa "Apuntar"')
      },
      (errorMessage) => {
        setStatus('error')
        setMessage(errorMessage)
      },
      () => {
        setStatus((s) => (s === 'listening' ? 'idle' : s))
      },
    )
  }

  function handleTypedSubmit(e: FormEvent) {
    e.preventDefault()
    if (!typedText.trim()) return
    processText(typedText)
    setTypedText('')
  }

  function changeMode(next: ResponseMode) {
    setMode(next)
    saveResponseMode(next)
  }

  function close() {
    setOpen(false)
    setStatus('idle')
    setMessage('')
    setTypedText('')
  }

  return (
    <>
      <button
        type="button"
        className="voice-fab"
        aria-label="Hablar con Pepa"
        onClick={() => setOpen(true)}
      >
        🎤
      </button>

      {open && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                🐣 Pepa
              </h2>
              <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <p className="muted">
              Se apunta en: <strong>{target.label}</strong>
              {target.key !== 'calendario' && ' — o pregúntame "qué tareas tengo hoy" / "qué hay en la lista de la compra"'}
            </p>
            {target.key === 'calendario' && (
              <p className="muted">
                Ej.: "el 3 de septiembre, cita con el dentista a las 19 horas para Eric, aviso un día antes"
              </p>
            )}
            <p className="muted">
              Di "Pepa" y lo que quieras, y te lleva a la pantalla que toque aunque estés en otra — p. ej. "Pepa,
              vamos a hacer la lista de la compra" o "Pepa, ponme en el calendario que el 27 de octubre es el
              cumpleaños de mi mujer".
            </p>

            {dictationOk && (
              <button
                type="button"
                className={'voice-mic-button' + (status === 'listening' ? ' voice-mic-listening' : '')}
                onClick={handleListen}
                disabled={status === 'listening' || status === 'saving'}
              >
                {status === 'listening' ? '🎙️ Pepa te escucha…' : status === 'saving' ? 'Guardando…' : '🎤 Empezar'}
              </button>
            )}
            {!dictationOk && (
              <p className="muted">
                Este navegador no admite dictado por voz — escribe abajo en su lugar, funciona igual.
              </p>
            )}

            <form onSubmit={handleTypedSubmit} className="voice-text-form">
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="O escribe aquí…"
              />
              <button type="submit" disabled={status === 'saving' || !typedText.trim()}>
                Apuntar
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
