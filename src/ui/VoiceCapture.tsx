import { FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createTask, listCompletions, listTasks } from '@/data/tasks'
import { addShoppingItem, listShoppingItems } from '@/data/shopping'
import { listFamilyMembers } from '@/data/family'
import { createEvent } from '@/data/calendar'
import { splitEntries } from '@/domain/quickCapture'
import { isTaskDueOn } from '@/domain/tasks'
import { reminderLabel } from '@/domain/reminders'
import { recurrenceLabel } from '@/domain/recurrence'
import { detectIntent, detectTargetFromText, findMemberInText, matchMemberByHint, stripWakeWord } from '@/domain/voiceQuery'
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

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

async function saveEntries(targetKey: 'compras' | 'tareas', entries: string[]): Promise<void> {
  for (const entry of entries) {
    if (targetKey === 'compras') {
      await addShoppingItem({ name: entry, quantity: '', unit: '', priority: 'normal', tripId: null })
    } else {
      await createTask({
        title: entry,
        taskType: 'unica',
        memberId: null,
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

async function answerTasksQuery(memberHint: string | null, rawText: string): Promise<string> {
  const [tasks, members, completions] = await Promise.all([listTasks(), listFamilyMembers(), listCompletions()])
  const today = todayIso()
  let due = tasks.filter((t) => isTaskDueOn(t, today))
  let who = ''

  // El nombre puede venir con "soy X"/"para X" delante, o dicho suelto
  // ("Jennifer, ¿qué tengo que hacer hoy?") — se prueban las dos formas
  // antes de rendirse (bug real: preguntar así no filtraba por persona,
  // y salían también las tareas asignadas a otro miembro de la familia).
  const member = (memberHint ? matchMemberByHint(memberHint, members) : null) ?? findMemberInText(rawText, members)

  if (member) {
    due = due.filter((t) => t.memberId === null || t.memberId === member.id)
    const doneToday = new Set(
      completions.filter((c) => c.memberId === member.id && c.completedDate === today).map((c) => c.taskId),
    )
    due = due.filter((t) => !doneToday.has(t.id))
    who = ` para ${member.name}`

    if (due.length === 0) return `No tienes tareas pendientes${who} hoy.`
    const ordered = sortByTime(due)
    const labels = ordered.map((t) => (t.timeOfDay ? `${t.title} a las ${t.timeOfDay.slice(0, 5)}` : t.title))
    return `Tareas de hoy${who}: ${labels.join(', ')}.`
  }

  // "Todos" — sin decir de quién, se cuenta la agenda de TODA la familia
  // a partir de AHORA (no lo que ya pasó), cada tarea con quién tiene
  // que hacerla — "Fernando tiene que bañarse a las 6, Eric a las 7..."
  // en vez de un listado plano sin decir de quién es cada una.
  const memberById = new Map(members.map((m) => [m.id, m]))
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()
  due = due.filter((t) => {
    if (t.timeOfDay) {
      const [h, m] = t.timeOfDay.split(':').map(Number)
      if (h * 60 + m < nowMinutes) return false
    }
    const doneBy = t.memberId
      ? completions.some((c) => c.taskId === t.id && c.memberId === t.memberId && c.completedDate === today)
      : completions.some((c) => c.taskId === t.id && c.completedDate === today)
    return !doneBy
  })

  if (due.length === 0) return 'No queda ninguna tarea pendiente por hoy.'
  const ordered = sortByTime(due)
  const labels = ordered.map((t) => {
    const owner = t.memberId ? (memberById.get(t.memberId)?.name ?? null) : null
    const withTime = t.timeOfDay ? `${t.title} a las ${t.timeOfDay.slice(0, 5)}` : t.title
    return owner ? `${owner}: ${withTime}` : withTime
  })
  return `Lo que queda por hoy: ${labels.join(', ')}.`
}

// Ordenadas por hora (las que la tienen, primero) para que la respuesta
// siga el orden real del día, no el orden en que se crearon.
function sortByTime<T extends { timeOfDay: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.timeOfDay && b.timeOfDay) return a.timeOfDay.localeCompare(b.timeOfDay)
    if (a.timeOfDay) return -1
    if (b.timeOfDay) return 1
    return 0
  })
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

      const intent = detectIntent(text)
      if (intent.type === 'tasks_today') {
        const answer = await answerTasksQuery(intent.memberHint, text)
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

      const entries = splitEntries(text)
      if (entries.length === 0) {
        setStatus('idle')
        return
      }
      await saveEntries(effectiveTargetKey as 'compras' | 'tareas', entries)
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
