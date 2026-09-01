import { FormEvent, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createTask, listCompletions, listTasks } from '@/data/tasks'
import { addShoppingItem, listShoppingItems } from '@/data/shopping'
import { listFamilyMembers } from '@/data/family'
import { createEvent } from '@/data/calendar'
import { splitEntries } from '@/domain/quickCapture'
import { isTaskDueOn } from '@/domain/tasks'
import { reminderLabel } from '@/domain/reminders'
import { recurrenceLabel } from '@/domain/recurrence'
import { detectIntent, matchMemberByHint } from '@/domain/voiceQuery'
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

// A qué lista se apunta (o qué acción se hace) depende de en qué
// pantalla estás — "si le hablo en tareas, quiero que me apunte en
// tareas; si le hablo en lista de la compra, en lista de la compra".
// Fuera de esas pantallas cae en Tareas, el sitio genérico para "cosas
// que hay que hacer".
function getTarget(pathname: string): { key: TargetKey; label: string } {
  if (pathname.startsWith('/compras')) return { key: 'compras', label: '🛒 Lista de la compra' }
  if (pathname.startsWith('/calendario')) return { key: 'calendario', label: '📅 Calendario' }
  return { key: 'tareas', label: '✅ Tareas' }
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

async function answerTasksQuery(memberHint: string | null): Promise<string> {
  const [tasks, members, completions] = await Promise.all([listTasks(), listFamilyMembers(), listCompletions()])
  const today = todayIso()
  let due = tasks.filter((t) => isTaskDueOn(t, today))
  let who = ''

  if (memberHint) {
    const member = matchMemberByHint(memberHint, members)
    if (member) {
      due = due.filter((t) => t.memberId === null || t.memberId === member.id)
      const doneToday = new Set(
        completions.filter((c) => c.memberId === member.id && c.completedDate === today).map((c) => c.taskId),
      )
      due = due.filter((t) => !doneToday.has(t.id))
      who = ` para ${member.name}`
    }
  }

  if (due.length === 0) return `No tienes tareas pendientes${who} hoy.`
  return `Tareas de hoy${who}: ${due.map((t) => t.title).join(', ')}.`
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
    for (const m of members) {
      const nameRe = new RegExp(`\\b${m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (nameRe.test(title)) {
        member = m
        title = title
          .replace(nameRe, '')
          .replace(/\s+/g, ' ')
          .replace(/^[,;]\s*/, '')
          .replace(/[,;]\s*$/, '')
          .trim()
        title = title ? title.charAt(0).toUpperCase() + title.slice(1) : parsed.title
        break
      }
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

  async function processText(text: string) {
    setStatus('saving')
    try {
      if (target.key === 'calendario') {
        const confirmation = await handleCalendarEntry(text)
        setStatus('done')
        respond(confirmation)
        return
      }

      const intent = detectIntent(text)
      if (intent.type === 'tasks_today') {
        const answer = await answerTasksQuery(intent.memberHint)
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
      await saveEntries(target.key as 'compras' | 'tareas', entries)
      setStatus('done')
      respond(`Apuntado en ${target.label}: ${entries.join(', ')}`)
    } catch (err) {
      setStatus('error')
      const detail = err instanceof Error ? err.message : String(err)
      respond(`No he podido hacerlo: ${detail}`)
    }
  }

  function handleListen() {
    setStatus('listening')
    setMessage('Escuchando…')
    listenOnce(
      (transcript) => processText(transcript),
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
        aria-label="Apuntar por voz"
        onClick={() => setOpen(true)}
      >
        🎤
      </button>

      {open && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Apunta por voz
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

            {dictationOk && (
              <button
                type="button"
                className={'voice-mic-button' + (status === 'listening' ? ' voice-mic-listening' : '')}
                onClick={handleListen}
                disabled={status === 'listening' || status === 'saving'}
              >
                {status === 'listening' ? '🎙️ Escuchando…' : status === 'saving' ? 'Guardando…' : '🎤 Empezar'}
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
