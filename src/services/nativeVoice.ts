// Dictado por voz DENTRO de la app nativa (Android). El reconocimiento de voz del navegador (webkitSpeechRecognition) no funciona en la vista
// web de una app: da siempre «not-allowed», por mucho permiso de micrófono que se conceda, y la app decía «Necesito permiso para usar el
// micrófono» sin remedio. Aquí se usa el reconocedor propio de Android a través del complemento @capacitor-community/speech-recognition.
//
// Mismo comportamiento que listenContinuous del navegador (services/voice.ts): se queda escuchando varias frases seguidas hasta que se llama a
// stop(); cada sesión es de UNA frase, y cuando el motor da por terminada la frase se confirma (unida a las anteriores con una coma, que es lo
// que separa los productos al dictar una lista) y se abre una sesión nueva. Solo escucha cuando se abre el panel de Pepa; nunca en segundo plano.
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import type { PluginListenerHandle } from '@capacitor/core'

export interface NativeListenHandlers {
  onTranscript: (text: string) => void
  onError: (message: string) => void
}

// Android entrega el resultado definitivo de la frase un instante DESPUÉS de avisar de que ha dejado de escuchar: se espera un poco antes de
// confirmar la frase y abrir la siguiente sesión, para no perder las últimas palabras.
const RESTART_DELAY_MS = 400

export function listenContinuousNative(handlers: NativeListenHandlers): { stop: () => void } {
  let stoppedByUser = false
  let committedText = ''
  let interimText = ''
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

  async function startSession() {
    if (stoppedByUser) return
    try {
      await SpeechRecognition.start({ language: 'es-ES', maxResults: 1, partialResults: true, popup: false })
    } catch {
      if (!stoppedByUser) handlers.onError('No se pudo iniciar el micrófono.')
    }
  }

  async function begin() {
    try {
      const { available } = await SpeechRecognition.available()
      if (!available) {
        handlers.onError('Este móvil no tiene un servicio de dictado por voz disponible.')
        return
      }
      let permission = await SpeechRecognition.checkPermissions()
      if (permission.speechRecognition !== 'granted') permission = await SpeechRecognition.requestPermissions()
      if (permission.speechRecognition !== 'granted') {
        handlers.onError('Necesito permiso para usar el micrófono. Puedes dárselo a PEPA en los ajustes del móvil (Permisos → Micrófono).')
        return
      }
      if (stoppedByUser) return
      listeners.push(
        await SpeechRecognition.addListener('partialResults', (data) => {
          if (stoppedByUser) return
          interimText = data.matches?.[0] ?? ''
          handlers.onTranscript(fullText())
        }),
        await SpeechRecognition.addListener('listeningState', (state) => {
          if (state.status !== 'stopped' || stoppedByUser) return
          setTimeout(() => {
            if (stoppedByUser) return
            commitInterim()
            void startSession()
          }, RESTART_DELAY_MS)
        }),
      )
      await startSession()
    } catch {
      handlers.onError('No se pudo iniciar el micrófono.')
    }
  }

  void begin()

  return {
    stop: () => {
      stoppedByUser = true
      for (const l of listeners) void l.remove()
      listeners.length = 0
      void SpeechRecognition.stop().catch(() => undefined)
    },
  }
}
