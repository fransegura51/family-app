// Única capa de salida de "Hablar con PEPA" (y de los botones de siempre): TODA respuesta final,
// venga de Compras, Calendario, Cocina, Economía, reglas o IA, pasa por aquí.
//   - Por escrito: solo se muestra el texto.
//   - Hablando: se muestra el texto y además se lee.
// El modo se lee en el momento de contestar (nunca de una copia antigua), y nadie más llama a la voz.
export type ResponseMode = 'voice' | 'text'

export interface SpeechEngine {
  supported(): boolean
  speak(text: string): Promise<void>
  prime(): void
}

export interface PepaOutputDeps {
  getMode(): ResponseMode
  show(text: string): void
  engine: SpeechEngine
}

export interface PepaOutput {
  // Muestra la respuesta y, si el modo es Hablando, la lee. Termina cuando acaba de hablar.
  say(text: string): Promise<void>
  // Solo la voz, para superficies que ya pintan el texto por su cuenta (respuestas dentro de una tarjeta).
  speakOnly(text: string): Promise<void>
  // Desbloquea la voz en Safari/iOS; se llama dentro de un toque, con el modo ya elegido.
  prime(): void
}

export function createPepaOutput(deps: PepaOutputDeps): PepaOutput {
  async function speakOnly(text: string): Promise<void> {
    if (deps.getMode() !== 'voice' || !deps.engine.supported() || !text.trim()) return
    await deps.engine.speak(text)
  }
  return {
    async say(text) {
      deps.show(text)
      await speakOnly(text)
    },
    speakOnly,
    prime() {
      if (deps.getMode() === 'voice' && deps.engine.supported()) deps.engine.prime()
    },
  }
}
