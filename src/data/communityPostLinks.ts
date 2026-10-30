import { listPosts } from '@/data/community'

// Resuelve el título de una publicación (el de «[[Título]]») a su id. Usa la misma búsqueda y los mismos permisos que Comunidad: solo se encuentra lo que la persona
// puede ver. Coincidencia por título EXACTO (sin mayúsculas ni tildes). Se recuerda en memoria; un fallo de red no se recuerda (se reintenta).

export const normalizeTitle = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/["“”«»'‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const cache = new Map<string, Promise<string | null>>()

export function resolvePostTitle(title: string): Promise<string | null> {
  const key = normalizeTitle(title)
  const hit = cache.get(key)
  if (hit) return hit
  const p = (async () => {
    const rows = await listPosts({ query: title, limit: 10 })
    for (const r of rows) {
      if ('title' in r && r.title && normalizeTitle(r.title) === key) return r.id
    }
    return null
  })()
  cache.set(key, p)
  p.catch(() => cache.delete(key))
  return p
}

export function clearPostLinkCache() {
  cache.clear()
}
