// Dictado por voz DENTRO de la app nativa (Android). El reconocimiento de voz del navegador (webkitSpeechRecognition) no funciona en la vista
// web de una app: da siempre «not-allowed», por mucho permiso de micrófono que se conceda. Aquí se usa el reconocedor propio de Android a
// través del complemento @capacitor-community/speech-recognition.
//
// Dos formas, porque en algunos móviles (sobre todo Xiaomi) el servicio de reconocimiento interno está desactivado o se cierra solo:
//  1. Continuo (preferida): escucha varias frases seguidas hasta que se llama a stop(); cada sesión es de UNA frase y cuando el motor la da por
//     terminada se confirma (unida a las anteriores con una coma, que es lo que separa los productos al dictar una lista) y se abre otra.
//  2. Con ventana del sistema (la de «Habla ahora» de Google): una frase por vez. Se usa si el servicio interno no está disponible o se cierra
//     sin oír nada dos veces seguidas.
// Cada fallo se cuenta con su causa real, no con un mensaje genérico. Solo escucha cuando se abre el panel de Pepa; nunca en segundo plano.
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import type { PluginListenerHandle } from '@capacitor/core'

export interface NativeListenHandlers {
  onTranscript: (text: string) => void
  onError: (message: string) => void
}

// Android entrega el resultado definitivo de la frase un instante DESPUÉS de avisar de que ha dejado de escuchar: se espera un poco antes de
// confirmar la frase y abrir la siguiente sesión, para no perder las últimas palabras.
const RESTART_DELAY_MS = 400
// Una sesión que se cierra antes de esto sin haber oído nada no es un silencio: es un servicio de voz que no funciona.
const TOO_SHORT_MS = 2500
const MAX_SILENT_FAILURES = 2

function reason(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
  return text && text !== '{}' ? text : 'sin detalle'
}

export function listenContinuousNative(handlers: NativeListenHandlers): { stop: () => void } {
  let stoppedByUser = false
  let committedText = ''
  let interimText = ''
  let heardSinceStart = false
  let startedAt = 0
  let silentFailures = 0
  let popupMode = false
  const listeners: PluginListenerHandle[] = []

  // La coma entre frases es lo que separa los productos al dictar una lista («patatas, queso»): se pone ya al enseñar el texto, no solo al confirmar.
  function fullText(): string {
    return committedText && interimText ? `${committedText}, ${interimText}` : committedText || interimText
  }

  function commitInterim() {
    if (!interimText) return
    committedText = committedText ? `${committedText}, ${interimText}` : interimText
    interimText = ''
  }

  async function removeListeners() {
    for (const l of listeners) void l.remove()
    listeners.length = 0
  }

  // Plan B: la ventana de dictado del sistema, una frase por vez.
  async function startPopupSession(prior?: string) {
    if (stoppedByUser) return
    popupMode = true
    await removeListeners()
    try {
      const result = await SpeechRecognition.start({ language: 'es-ES', maxResults: 1, prompt: 'Habla ahora', popup: true, partialResults: false })
      if (stoppedByUser) return
      const heard = result.matches?.[0]?.trim()
      if (heard) {
        committedText = committedText ? `${committedText}, ${heard}` : heard
        handlers.onTranscript(fullText())
      }
    } catch (err) {
      if (!stoppedByUser) handlers.onError(`No se pudo escuchar con la ventana de voz del móvil (${reason(err)}${prior ? `; antes: ${prior}` : ''}).`)
    }
  }

  async function startSession() {
    if (stoppedByUser) return
    heardSinceStart = false
    startedAt = Date.now()
    try {
      await SpeechRecognition.start({ language: 'es-ES', maxResults: 1, partialResults: true, popup: false })
    } catch (err) {
      if (stoppedByUser) return
      // El servicio interno no arranca: se pasa al plan B en vez de quedarse mudo.
      await startPopupSession(reason(err))
    }
  }

  async function begin() {
    let step = 'comprobar el dictado'
    try {
      const { available } = await SpeechRecognition.available()
      step = 'pedir el permiso del micrófono'
      let permission = await SpeechRecognition.checkPermissions()
      if (permission.speechRecognition !== 'granted') permission = await SpeechRecognition.requestPermissions()
      if (permission.speechRecognition !== 'granted') {
        handlers.onError('Necesito permiso para usar el micrófono. Puedes dárselo a PEPA en los ajustes del móvil (Permisos → Micrófono).')
        return
      }
      if (stoppedByUser) return
      if (!available) {
        // Sin servicio interno de reconocimiento: directamente la ventana de voz del sistema.
        step = 'abrir la ventana de voz del móvil'
        await startPopupSession()
        return
      }
      step = 'empezar a escuchar'
      listeners.push(
        await SpeechRecognition.addListener('partialResults', (data) => {
          if (stoppedByUser) return
          interimText = data.matches?.[0] ?? ''
          if (interimText) heardSinceStart = true
          handlers.onTranscript(fullText())
        }),
        await SpeechRecognition.addListener('listeningState', (state) => {
          if (state.status !== 'stopped' || stoppedByUser || popupMode) return
          const tooShort = !heardSinceStart && Date.now() - startedAt < TOO_SHORT_MS
          silentFailures = tooShort ? silentFailures + 1 : 0
          if (silentFailures >= MAX_SILENT_FAILURES) {
            // Se cierra solo una y otra vez sin oír nada: el servicio interno no sirve en este móvil.
            void startPopupSession()
            return
          }
          setTimeout(() => {
            if (stoppedByUser || popupMode) return
            commitInterim()
            void startSession()
          }, RESTART_DELAY_MS)
        }),
      )
      await startSession()
    } catch (err) {
      handlers.onError(`No se pudo iniciar el micrófono al ${step} (${reason(err)}).`)
    }
  }

  void begin()

  return {
    stop: () => {
      stoppedByUser = true
      void removeListeners()
      void SpeechRecognition.stop().catch(() => undefined)
    },
  }
}
