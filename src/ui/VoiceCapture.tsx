import { FormEvent, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createTask } from '@/data/tasks'
import { addShoppingItem } from '@/data/shopping'
import { splitEntries } from '@/domain/quickCapture'
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

type TargetKey = 'compras' | 'tareas'

// A qué lista se apunta depende de en qué pantalla estás — "si le hablo
// en tareas, quiero que me apunte en tareas; si le hablo en lista de la
// compra, quiero que me apunte en lista de la compra". Fuera de esas dos
// pantallas no hay una lista obvia, así que cae en Tareas (el sitio
// genérico para "cosas que hay que hacer").
function getTarget(pathname: string): { key: TargetKey; label: string } {
  if (pathname.startsWith('/compras')) return { key: 'compras', label: '🛒 Lista de la compra' }
  return { key: 'tareas', label: '✅ Tareas' }
}

async function saveEntries(targetKey: TargetKey, entries: string[]): Promise<void> {
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

type Status = 'idle' | 'listening' | 'saving' | 'done' | 'error'

// Botón flotante disponible en toda la app (Skill: dictado por voz). Apunta
// lo dicho o escrito en la lista de la pantalla donde estés — compras o
// tareas — y responde hablando o por texto según lo que el usuario elija.
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
    const entries = splitEntries(text)
    if (entries.length === 0) return
    setStatus('saving')
    try {
      await saveEntries(target.key, entries)
      setStatus('done')
      respond(`Apuntado en ${target.label}: ${entries.join(', ')}`)
    } catch {
      setStatus('error')
      respond('No he podido guardarlo, inténtalo de nuevo.')
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
            </p>

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
                placeholder="O escribe aquí: leche, patatas, huevos…"
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
