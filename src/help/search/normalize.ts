// Normalización de texto para el buscador de la Ayuda: minúsculas, sin tildes ni signos, y palabras significativas (sin las de relleno).
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'lo', 'y', 'o', 'u', 'un', 'una', 'unos', 'unas', 'para', 'por', 'con', 'sin', 'en', 'a', 'al', 'como', 'que', 'se', 'es', 'mi', 'tu', 'su',
  'mis', 'tus', 'sus', 'me', 'te', 'le', 'les', 'nos', 'quiero', 'quieres', 'puedo', 'puedes', 'hacer', 'hago', 'saber', 'ver', 'donde', 'cuando', 'cual', 'cuales', 'esto', 'eso', 'esta', 'este',
  'ya', 'si', 'no', 'muy', 'mas', 'pepa', 'pepa', 'app', 'aplicacion', 'hay', 'tengo', 'tiene', 'tienen', 'esta', 'estan', 'ser', 'estoy',
])

// Palabras significativas de un texto (≥ 2 letras, sin palabras de relleno). Las muy cortas (2 letras) solo se mantienen si son números o siglas habituales.
export function significantTokens(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
}

// Plural/singular sencillo: «códigos» ~ «código», «recetas» ~ «receta», «correos» ~ «correo», «ciudades» ~ «ciudad».
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1)
  return w
}

// Raíz aproximada para emparejar formas de un mismo verbo o nombre: «apunto», «apuntar», «apuntes» → «apunt». Solo si queda una raíz de 4 letras o más.
export function root(w: string): string {
  const r = w.replace(/(ando|iendo|aron|amos|emos|imos|ar|er|ir|an|en|as|es|os|a|e|o|s)$/, '')
  return r.length >= 4 ? r : w
}

// Distancia de edición con transposiciones (Damerau-Levenshtein restringida), con tope: devuelve max+1 si lo supera.
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const al = a.length
  const bl = b.length
  let prev2: number[] = []
  let prev: number[] = Array.from({ length: bl + 1 }, (_, j) => j)
  for (let i = 1; i <= al; i++) {
    const cur: number[] = [i]
    let rowMin = i
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[bl]
}
