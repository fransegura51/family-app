// Fallo real (24/10/2026, «sacar la basura»): la misma frase llegaba DOS veces a «Hablar con PEPA» (el reconocimiento de voz a veces entrega la misma
// transcripción dos veces seguidas) y cada pasada abría una tarjeta y la leía en voz alta. Una frase igual a la anterior dentro de este margen es la misma
// frase repetida, no una orden nueva: se ignora.
export const REPEATED_UTTERANCE_WINDOW_MS = 6000

export interface LastUtterance {
  key: string
  at: number
}

function keyOf(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Devuelve true si `text` es la misma frase que la anterior dicha hace menos de REPEATED_UTTERANCE_WINDOW_MS; si no, devuelve false y anota esta frase. */
export function isRepeatedUtterance(last: { current: LastUtterance | null }, text: string, now: number): boolean {
  const key = keyOf(text)
  if (!key) return false
  const previous = last.current
  if (previous && previous.key === key && now - previous.at < REPEATED_UTTERANCE_WINDOW_MS) return true
  last.current = { key, at: now }
  return false
}
