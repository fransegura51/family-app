// Pepa habla la respuesta DENTRO de la app nativa (Android). La síntesis de voz del propio navegador no suena dentro de la vista web de
// una app: la función existe pero no dice nada, y Pepa apuntaba lo dictado sin contestar en voz alta. Aquí se usa la voz de Android a través del
// complemento @capacitor-community/text-to-speech.
//
// Mismo contrato que speakAsync del navegador (services/voice.ts): se resuelve cuando Pepa termina de hablar (hace falta saberlo para no volver a
// escuchar mientras habla, que se oiría a sí misma) y NUNCA se queda colgada ni falla: si no hay voz, se da por terminada y listo.
import { QueueStrategy, TextToSpeech } from '@capacitor-community/text-to-speech'

// El español de España primero; algunos móviles solo traen «es» a secas o el latinoamericano.
const LANGUAGES = ['es-ES', 'es-US', 'es']

export async function speakNative(text: string): Promise<void> {
  const maxMs = Math.min(90_000, 6_000 + text.length * 110)
  let timer: ReturnType<typeof setTimeout> | undefined
  const giveUp = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, maxMs)
  })
  const speak = (async () => {
    for (const lang of LANGUAGES) {
      try {
        await TextToSpeech.speak({ text, lang, rate: 1.0, pitch: 1.0, volume: 1.0, queueStrategy: QueueStrategy.Flush })
        return
      } catch (err) {
        // Idioma no disponible en este móvil: se prueba el siguiente. Cualquier otro fallo: no hay voz, se termina sin ruido.
        const message = err instanceof Error ? err.message : String(err)
        if (!/language/i.test(message)) return
      }
    }
  })()
  await Promise.race([speak, giveUp])
  if (timer) clearTimeout(timer)
}

export function stopNativeSpeech(): void {
  void TextToSpeech.stop().catch(() => undefined)
}
