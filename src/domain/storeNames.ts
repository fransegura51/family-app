import { normalize } from './voiceQuery'

// Bug real reportado: «Añadiendo tickets del mismo super los detecta como diferentes tiendas, añadiendo a uno de ellos un nombre más
// largo». Un ticket leído como «MERCADONA S.A.» y otro como «Mercadona» (o «Mercadona Av. Valencia») sin tienda dada de alta en Compras
// salían como carpetas distintas: solo se unificaba con las tiendas registradas.
//
// Aquí se añaden a las tiendas registradas los nombres BASE de los propios tickets: el nombre más corto cuyas palabras (sin tildes ni
// mayúsculas) están contenidas, seguidas, en otros nombres más largos. Así findKnownStore lleva «Mercadona S.A.» a «Mercadona».
// Solo une cuando el nombre corto aparece ENTERO como palabras del largo: no adivina que dos nombres distintos son el mismo sitio.
export function withReceiptStoreBases(registered: string[], receiptStores: (string | null | undefined)[]): string[] {
  const words = (s: string) => normalize(s).replace(/[.,;:!?]+/g, ' ').split(/\s+/).filter(Boolean)
  const containsRun = (long: string[], short: string[]) => {
    for (let i = 0; i + short.length <= long.length; i++) if (short.every((w, k) => long[i + k] === w)) return true
    return false
  }
  const result = [...registered]
  const bases: { raw: string; words: string[] }[] = registered.filter((s) => s.trim()).map((raw) => ({ raw, words: words(raw) }))
  const distinct = new Map<string, string>()
  for (const s of receiptStores) {
    const raw = s?.trim()
    if (!raw) continue
    const key = words(raw).join(' ')
    if (key && !distinct.has(key)) distinct.set(key, raw)
  }
  const candidates = [...distinct.values()].map((raw) => ({ raw, words: words(raw) })).sort((a, b) => a.words.length - b.words.length)
  for (const c of candidates) {
    if (bases.some((b) => b.words.length > 0 && containsRun(c.words, b.words))) continue
    bases.push(c)
    result.push(c.raw)
  }
  return result
}
