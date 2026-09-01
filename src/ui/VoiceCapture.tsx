import { useState } from 'react'
import { createTask } from '@/data/tasks'
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

type Status = 'idle' | 'listening' | 'saving' | 'done' | 'error'

// Botón flotante disponible en toda la app (Skill: dictado por voz). Al
// hablar, apunta lo dicho como una tarea familiar de hoy — "los apuntes
// que hayan que hacer se dirijan hablándole a la aplicación" — y responde
// hablando o por texto según lo que el usuario haya elegido.
export function VoiceCapture() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<ResponseMode>(loadResponseMode)
  const dictationOk = isDictationSupported()

  function respond(text: string) {
    if (mode === 'voice' && isSpeechSupported()) speak(text)
    setMessage(text)
  }

  function handleListen() {
    setStatus('listening')
    setMessage('Escuchando…')
    listenOnce(
      async (transcript) => {
        setStatus('saving')
        try {
          await createTask({
            title: transcript,
            taskType: 'unica',
            memberId: null,
            points: 0,
            recurrenceRule: null,
            startDate: todayIso(),
            timeOfDay: null,
          })
          setStatus('done')
          respond(`Apuntado: ${transcript}`)
        } catch {
          setStatus('error')
          respond('No he podido guardarlo, inténtalo de nuevo.')
        }
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

  function changeMode(next: ResponseMode) {
    setMode(next)
    saveResponseMode(next)
  }

  function close() {
    setOpen(false)
    setStatus('idle')
    setMessage('')
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

            {!dictationOk && (
              <p className="muted">
                Este navegador no admite dictado por voz. Puedes seguir usando la app normalmente
                escribiendo — funciona igual, solo falta el micrófono aquí.
              </p>
            )}

            {dictationOk && (
              <>
                <p className="muted">Di lo que hay que apuntar y se guarda como tarea de hoy para toda la familia.</p>
                <button
                  type="button"
                  className={'voice-mic-button' + (status === 'listening' ? ' voice-mic-listening' : '')}
                  onClick={handleListen}
                  disabled={status === 'listening' || status === 'saving'}
                >
                  {status === 'listening' ? '🎙️ Escuchando…' : status === 'saving' ? 'Guardando…' : '🎤 Toca para hablar'}
                </button>
                {message && <p className={status === 'error' ? 'error' : 'muted'}>{message}</p>}
              </>
            )}

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
