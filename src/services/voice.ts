// Dictado por voz (Web Speech API) y respuesta hablada — nativos del
// navegador, sin coste ni servicio externo. Safari/iOS tiene la API bajo
// el prefijo webkit y con peor soporte que Chrome (no corta sola la
// escucha al detectar silencio, por ejemplo), así que todo aquí usa
// modo continuo con reinicio automático propio en vez de fiarse del
// comportamiento de cada navegador — así funciona igual en los dos.

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionEventLike {
  results: {
    length: number
    [index: number]: SpeechRecognitionResultLike
  }
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

function speechErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    'not-allowed': 'Necesito permiso para usar el micrófono.',
    'audio-capture': 'No encuentro ningún micrófono.',
  }
  return messages[error] ?? 'No se pudo escuchar. Inténtalo de nuevo.'
}

export interface ListenSession {
  stop: () => void
}

// Escucha en modo continuo hasta que se llama a stop() — no una sola
// frase y para, sino que se queda escuchando de verdad ("activarla por
// voz... que lo podamos hacer todo con voz", petición real de la
// usuaria). El navegador (sobre todo en móvil) corta la sesión de vez en
// cuando aunque se siga hablando, así que al terminar sola (onend, sin
// haberla parado nosotros) se vuelve a arrancar por dentro sin que se
// note desde fuera — lo ya dicho en sesiones anteriores no se pierde,
// se conserva y se añade lo nuevo.
export function listenContinuous(handlers: {
  onTranscript: (text: string) => void
  onError: (message: string) => void
}): ListenSession {
  const found = getRecognitionConstructor()
  if (!found) {
    handlers.onError('Este navegador no admite dictado por voz.')
    return { stop: () => {} }
  }
  // TS no conserva el "ya se ha comprobado que no es null" dentro de una
  // función anidada (startSession se puede volver a llamar más tarde,
  // desde onend) — se guarda ya con el tipo correcto para no repetir la
  // comprobación en cada reinicio.
  const RecognitionCtor: SpeechRecognitionConstructor = found

  let stoppedByUser = false
  let recognition: SpeechRecognitionLike | null = null
  let committedText = ''
  let sessionText = ''

  function fullText(): string {
    return (committedText + ' ' + sessionText).trim()
  }

  function startSession() {
    const r = new RecognitionCtor()
    r.lang = 'es-ES'
    r.continuous = true
    r.interimResults = true

    r.onresult = (event) => {
      let text = ''
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i]?.[0]?.transcript ?? ''
      }
      sessionText = text
      handlers.onTranscript(fullText())
    }

    r.onerror = (event) => {
      // 'no-speech'/'aborted' son normales en modo continuo (silencio
      // entre frases, o el reinicio que hacemos nosotros) — no son un
      // fallo real, no hay que avisar de nada.
      if (event.error === 'no-speech' || event.error === 'aborted') return
      handlers.onError(speechErrorMessage(event.error))
    }

    r.onend = () => {
      if (stoppedByUser) return
      committedText = fullText()
      sessionText = ''
      try {
        startSession()
      } catch {
        // No se ha podido reiniciar (p. ej. permiso retirado a medias) —
        // se deja tal cual, quien lo usa lo notará porque deja de
        // responder y puede volver a tocar el micrófono.
      }
    }

    recognition = r
    try {
      r.start()
    } catch {
      handlers.onError('No se pudo iniciar el micrófono.')
    }
  }

  startSession()

  return {
    stop: () => {
      stoppedByUser = true
      recognition?.stop()
    },
  }
}

// Habla y avisa cuando termina — hace falta saber el momento exacto en
// que acaba para no reanudar la escucha mientras Pepa todavía está
// hablando (si no, el propio micrófono se oiría a sí misma por el
// altavoz y lo tomaría como un encargo nuevo).
export function speakAsync(text: string): Promise<void> {
  if (!isSpeechSupported()) return Promise.resolve()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-ES'
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  })
}
