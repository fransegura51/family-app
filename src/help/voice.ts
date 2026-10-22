import { isSpeechSupported, primeSpeech, speakAsync, stopSpeech } from '@/services/voice'

// Voz de la Ayuda: usa EXACTAMENTE el mismo motor y la misma voz oficial de Pepa que «Hablar con PEPA» (services/voice.ts), sin tocarlos. Solo añade lo que la Ayuda necesita:
// reproducir, detener y repetir un texto, y que al empezar a hablar corte lo que sonara antes (la voz de la Ayuda y la de «Hablar con PEPA» nunca se solapan).
let speaking = 0

export function helpSpeechSupported(): boolean {
  return isSpeechSupported()
}

// Desbloquea la voz en Safari/iOS; hay que llamarlo dentro de un toque (por ejemplo, al abrir la Ayuda o al pulsar «Escuchar»).
export function primeHelpVoice(): void {
  primeSpeech()
}

export function stopHelpSpeech(): void {
  speaking += 1 // invalida lo que estuviera esperando
  stopSpeech()
}

// Lee el texto. Devuelve cuando termina (o se detiene). Nunca lanza.
export async function speakHelp(text: string, onEnd?: () => void): Promise<void> {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean || !isSpeechSupported()) {
    onEnd?.()
    return
  }
  stopHelpSpeech()
  const mine = speaking
  try {
    await speakAsync(clean)
  } catch {
    /* sin voz */
  }
  if (mine === speaking) onEnd?.()
}
