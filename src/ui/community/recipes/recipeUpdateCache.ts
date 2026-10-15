// Comunidad PEPA — recuerda qué recetas privadas NO vienen de Comunidad, para no preguntar al servidor cada vez que se abren (coste de Supabase).
// Una receta privada que no es una importación NUNCA llega a serlo: importar crea siempre una receta NUEVA con otro id. Por eso «no es importada» se puede
// recordar para siempre en este dispositivo. Lo contrario (sí es importada, hay o no versión nueva) se consulta una vez por sesión, porque Comunidad puede
// publicar una versión nueva en cualquier momento.
const PREFIX = 'pepa:recipe-not-imported:'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// El almacenamiento del navegador puede fallar (ventana privada, bloqueado): nunca debe romper la receta.
export function isKnownNotImported(store: KeyValueStore | null, privateRecipeId: string): boolean {
  try {
    return store?.getItem(PREFIX + privateRecipeId) === '1'
  } catch {
    return false
  }
}

export function rememberNotImported(store: KeyValueStore | null, privateRecipeId: string): void {
  try {
    store?.setItem(PREFIX + privateRecipeId, '1')
  } catch {
    // Sin almacenamiento: se consultará de nuevo la próxima vez. No pasa nada.
  }
}

export function forgetNotImported(store: KeyValueStore | null, privateRecipeId: string): void {
  try {
    store?.removeItem(PREFIX + privateRecipeId)
  } catch {
    // Igual que arriba.
  }
}

export function browserStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

// ---- Recetas ya compartidas desde este dispositivo (solo para avisar de que no se cree una copia pública repetida por descuido)
const PUBLISHED_PREFIX = 'pepa:recipe-shared-to-community:'

export function sharedPostFor(store: KeyValueStore | null, privateRecipeId: string): string | null {
  try {
    return store?.getItem(PUBLISHED_PREFIX + privateRecipeId) ?? null
  } catch {
    return null
  }
}

export function rememberShared(store: KeyValueStore | null, privateRecipeId: string, postId: string): void {
  try {
    store?.setItem(PUBLISHED_PREFIX + privateRecipeId, postId)
  } catch {
    // Solo es un aviso de comodidad: si no se puede guardar, no pasa nada.
  }
}
