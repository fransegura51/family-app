import { FormEvent, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createTask, listCompletions, listTasks } from '@/data/tasks'
import { addShoppingItem, listShoppingItems } from '@/data/shopping'
import { listFamilyMembers } from '@/data/family'
import { createEvent } from '@/data/calendar'
import { splitEntries } from '@/domain/quickCapture'
import { isTaskDueOn } from '@/domain/tasks'
import { reminderLabel } from '@/domain/reminders'
import { detectIntent, matchMemberByHint } from '@/domain/voiceQuery'
import { parseCalendarEntry } from '@/domain/calendarVoiceParser'
import { isDictationSupported, isSpeechSupported, listenOnce, speak } from '@/services/voice'

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
  const member = parsed.memberHint ? matchMemberByHint(parsed.memberHint, members) : null

  await createEvent({
    title: parsed.title,
    startAt: new Date(`${parsed.date}T${parsed.time ?? '09:00'}`).toISOString(),
    allDay: parsed.time === null,
    recurrenceRule: null,
    reminders: parsed.reminderMinutes != null ? [parsed.reminderMinutes] : [],
    memberIds: member ? [member.id] : [],
  })

  const dateLabel = new Date(parsed.date + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  const timeLabel = parsed.time ? ` a las ${parsed.time}` : ''
  const memberLabel = member ? ` · para ${member.name}` : ''
  const reminderText = parsed.reminderMinutes != null ? ` · 🔔 ${reminderLabel(parsed.reminderMinutes)}` : ''
  return `Apuntado en el calendario: ${parsed.title} — ${dateLabel}${timeLabel}${memberLabel}${reminderText}`
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
