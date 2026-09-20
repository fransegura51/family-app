// Alias en lugar de nombres reales cuando algo sale de la app hacia un
// servicio de IA externo: "qué tiene Eric mañana" viaja como "qué tiene
// Persona A mañana", y al volver la respuesta se restaura el nombre real.
// El mapa vive solo en memoria durante la llamada — nunca se guarda ni se
// envía. Limitación asumida: solo se reconocen los nombres de los miembros de
// la familia (y su primer nombre); un nombre ajeno (un médico, un vecino) no
// se puede detectar, por eso solo se manda texto corto y solo cuando las
// reglas locales no han entendido la frase.

export interface AliasMap {
  aliasize(text: string): string
  restore(text: string): string
}

// Minúsculas y sin acentos, conservando la longitud (1 carácter -> 1
// carácter) para poder sustituir en el texto original por posición.
function fold(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const base = ch.normalize('NFD')[0] ?? ch
    out += base.toLowerCase().slice(0, 1) || ch
  }
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function createAliasMap(names: string[]): AliasMap {
  const members = names.map((n) => n.trim()).filter(Boolean)
  const seen = new Set<string>()
  const entries: { key: string; alias: string }[] = []
  const aliasToName = new Map<string, string>()

  members.forEach((name, index) => {
    if (index >= LETTERS.length) return
    const alias = `Persona ${LETTERS[index]}`
    aliasToName.set(alias.toLowerCase(), name)
    const first = name.split(/\s+/)[0]
    for (const candidate of [name, first]) {
      const key = fold(candidate)
      if (key.length < 3 || seen.has(key)) continue
      seen.add(key)
      entries.push({ key, alias })
    }
  })
  // Los nombres largos primero, para que "Ana María" no se rompa por "Ana".
  entries.sort((a, b) => b.key.length - a.key.length)

  return {
    aliasize(text) {
      const folded = fold(text)
      const taken: boolean[] = new Array(text.length).fill(false)
      const replacements: { start: number; end: number; alias: string }[] = []
      for (const { key, alias } of entries) {
        const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(key)}(?![a-z0-9])`, 'g')
        let m: RegExpExecArray | null
        while ((m = re.exec(folded)) !== null) {
          const start = m.index
          const end = start + key.length
          if (taken.slice(start, end).some(Boolean)) continue
          for (let i = start; i < end; i++) taken[i] = true
          replacements.push({ start, end, alias })
        }
      }
      replacements.sort((a, b) => b.start - a.start)
      let result = text
      for (const r of replacements) result = result.slice(0, r.start) + r.alias + result.slice(r.end)
      return result
    },

    restore(text) {
      return text.replace(/\bPersona ([A-Z])\b/gi, (match, letter: string) => aliasToName.get(`persona ${letter.toLowerCase()}`) ?? match)
    },
  }
}
