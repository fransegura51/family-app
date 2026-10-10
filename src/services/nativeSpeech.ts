// Pepa habla la respuesta DENTRO de la app nativa (Android). La síntesis de voz del propio navegador no suena dentro de la vista web de
// una app: la función existe pero no dice nada, y Pepa apuntaba lo dictado sin contestar en voz alta. Aquí se usa la voz de Android a través del
// complemento @capacitor-community/text-to-speech.
//
// Mismo contrato que speakAsync del navegador (services/voice.ts): se resuelve cuando Pepa termina de hablar (hace falta saberlo para no volver a
// escuchar mientras habla, que se oiría a sí misma) y NUNCA se queda colgada ni falla: si no hay voz, se da por terminada y listo.
import { QueueStrategy, TextToSpeech } from '@capacitor-community/text-to-speech'

// El español de España primero; algunos móviles solo traen «es» a secas o el latinoamericano.
const LANGUAGES = ['es-ES', 'es-US', 'es']

// Si la voz falla (o «termina» al instante sin haber sonado), se deja constancia en el servidor (client_errors) con el motivo: en un móvil concreto
// es la única forma de saber por qué Pepa no habla sin tener el móvil delante. Nunca lanza; reportClientError ya limita cuántos manda por sesión.
// Import dinámico a propósito: voz.ts carga este módulo siempre, y errorReports arrastra el cliente del servidor (que exige las claves del entorno):
// cargarlo aquí al arrancar rompía cualquier prueba que solo importe la voz.
function reportVoice(detail: string): void {
  void import('@/data/errorReports')
    .then(({ reportClientError }) => reportClientError(new Error(`[voz nativa] ${detail}`)))
    .catch(() => undefined)
}

export async function speakNative(text: string): Promise<void> {
  const maxMs = Math.min(90_000, 6_000 + text.length * 110)
  let timer: ReturnType<typeof setTimeout> | undefined
  const giveUp = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      reportVoice(`no avisó de que terminaba en ${maxMs} ms (${text.length} letras)`)
      resolve()
    }, maxMs)
  })
  const startedAt = Date.now()
  const speak = (async () => {
    const failures: string[] = []
    for (const lang of LANGUAGES) {
      try {
        await TextToSpeech.speak({ text, lang, rate: 1.0, pitch: 1.0, volume: 1.0, queueStrategy: QueueStrategy.Flush })
        const took = Date.now() - startedAt
        // Una frase de más de 20 letras no se dice en menos de medio segundo: si «terminó» así, no sonó (volumen, motor de voz...).
        if (text.length > 20 && took < 500) reportVoice(`terminó en ${took} ms para ${text.length} letras (idioma ${lang}): probablemente no sonó`)
        return
      } catch (err) {
        // Idioma no disponible en este móvil: se prueba el siguiente. Cualquier otro fallo: no hay voz, se anota y se termina sin ruido.
        const message = err instanceof Error ? err.message : String(err)
        failures.push(`${lang}: ${message}`)
        if (!/language/i.test(message)) break
      }
    }
    reportVoice(`no se pudo hablar — ${failures.join(' | ')}`)
  })()
  await Promise.race([speak, giveUp])
  if (timer) clearTimeout(timer)
}

export function stopNativeSpeech(): void {
  void TextToSpeech.stop().catch(() => undefined)
}
