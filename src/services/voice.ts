// Dictado por voz (Web Speech API) y respuesta hablada — nativos del
// navegador, sin coste ni servicio externo. Safari/iOS no implementa
// reconocimiento de voz (solo síntesis), así que todo aquí se comprueba
// con feature-detection y se degrada con calma en vez de romper.

interface SpeechRecognitionResultLike {
  transcript: string
}

interface SpeechRecognitionEventLike {
  results: { [index: number]: { [index: number]: SpeechRecognitionResultLike } }
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isDictationSupported(): boolean {
  return getRecognitionConstructor() !== null
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// Escucha una sola frase y devuelve la transcripción. `onError` recibe
// un mensaje ya en español, listo para mostrar.
export function listenOnce(
  onResult: (text: string) => void,
  onError: (message: string) => void,
  onEnd: () => void,
): { stop: () => void } {
  const Recognition = getRecognitionConstructor()
  if (!Recognition) {
    onError('Este navegador no admite dictado por voz.')
    onEnd()
    return { stop: () => {} }
  }

  const recognition = new Recognition()
  recognition.lang = 'es-ES'
  recognition.continuous = false
  recognition.interimResults = false

  recognition.onresult = (event) => {
    const text = event.results[0]?.[0]?.transcript ?? ''
    if (text) onResult(text.trim())
  }
  recognition.onerror = (event) => {
    const messages: Record<string, string> = {
      'no-speech': 'No he oído nada, inténtalo de nuevo.',
      'not-allowed': 'Necesito permiso para usar el micrófono.',
      'audio-capture': 'No encuentro ningún micrófono.',
    }
    onError(messages[event.error] ?? 'No se pudo escuchar. Inténtalo de nuevo.')
  }
  recognition.onend = onEnd

  recognition.start()
  return { stop: () => recognition.stop() }
}

export function speak(text: string): void {
  if (!isSpeechSupported()) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'es-ES'
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
