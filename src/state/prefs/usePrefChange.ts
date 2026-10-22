import { useEffect, useRef } from 'react'

// Aviso interno de que una preferencia sincronizada cambió en la caché (por esta persona o por otro de sus dispositivos). Las pantallas que leen su preferencia
// una vez al montar lo escuchan para repintarse sin recargar.
export const PREF_CHANGED_EVENT = 'pepa:pref-changed'
export type PrefMatch = string | RegExp | readonly string[] | ((key: string) => boolean)

export function prefMatches(match: PrefMatch, key: string): boolean {
  if (typeof match === 'string') return match === key
  if (typeof match === 'function') return match(key)
  if (match instanceof RegExp) return match.test(key)
  return match.includes(key)
}

export function onPrefChange(match: PrefMatch, cb: (key: string) => void): () => void {
  const handler = (e: Event) => {
    const keys = (e as CustomEvent<{ keys?: string[] }>).detail?.keys ?? []
    const hit = keys.find((k) => prefMatches(match, k))
    if (hit !== undefined) cb(hit)
  }
  window.addEventListener(PREF_CHANGED_EVENT, handler)
  return () => window.removeEventListener(PREF_CHANGED_EVENT, handler)
}

export function usePrefChange(match: PrefMatch, cb: (key: string) => void): void {
  const cbRef = useRef(cb)
  cbRef.current = cb
  const matchRef = useRef(match)
  matchRef.current = match
  useEffect(() => onPrefChange((k) => prefMatches(matchRef.current, k), (k) => cbRef.current(k)), [])
}
