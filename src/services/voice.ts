// Dictado por voz (Web Speech API) y respuesta hablada — nativos del
// navegador, sin coste ni servicio externo. Safari/iOS tiene la API bajo
// el prefijo webkit. Para escuchar varias frases seguidas sin que la
// usuaria tenga que tocar nada entre una y otra, se encadenan sesiones
// de UNA frase cada una (ver listenContinuous) en vez de fiarse del modo
// "continuo" nativo del navegador, que en móvil corta a media frase.

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

// Escucha varias frases seguidas hasta que se llama a stop() — no una
// sola frase y para, sino que se queda escuchando de verdad ("activarla
// por voz... que lo podamos hacer todo con voz", petición real de la
// usuaria). OJO con cómo: cada sesión de reconocimiento es de UNA frase
// (continuous = false) — es el propio motor quien decide cuándo esa
// frase ha terminado (silencio detectado), y solo ENTONCES se da por
// buena y se abre una sesión nueva para la siguiente.
//
// Se probó primero con continuous = true y reinicio propio en cada
// onend, pero en Android el navegador corta la sesión sola muchas veces
// dentro de una misma frase (no espera a que se termine de hablar) — y
// como el reinicio guardaba lo que hubiera en ese momento aunque
// todavía no fuera un resultado definitivo, cada corte volvía a oír el
// mismo trozo y lo dejaba pegado una y otra vez ("Pepa apunta en la
// Pepa apunta en la Pepa apunta en la...", bug real reportado con
// captura de pantalla). Encadenando frases COMPLETAS en vez de cortes a
// medias, cada trozo se añade una sola vez.
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
  let committedText = '' // frases ya terminadas y confirmadas
  let interimText = '' // lo que se está oyendo ahora mismo, todavía sin terminar

  function fullText(): string {
    return (committedText + ' ' + interimText).trim()
  }

  function startSession() {
    const r = new RecognitionCtor()
    r.lang = 'es-ES'
    r.continuous = false
    r.interimResults = true

    r.onresult = (event) => {
      let text = ''
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i]?.[0]?.transcript ?? ''
      }
      interimText = text
      handlers.onTranscript(fullText())
    }

    r.onerror = (event) => {
      // 'no-speech'/'aborted' son normales (silencio entre frases, o el
      // reinicio que hacemos nosotros) — no son un fallo real.
      if (event.error === 'no-speech' || event.error === 'aborted') return
      handlers.onError(speechErrorMessage(event.error))
    }

    r.onend = () => {
      if (stoppedByUser) return
      // La frase ha terminado de verdad (el motor ha detectado el
      // silencio de después) — se confirma y se abre sesión nueva para
      // la siguiente, sin volver a tocar lo ya dicho.
      if (interimText) {
        committedText = fullText()
        interimText = ''
      }
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
