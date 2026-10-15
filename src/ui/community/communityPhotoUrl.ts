// Comunidad PEPA — de dónde sale la dirección de una foto. El bucket «community-media» es PRIVADO: no existe ninguna dirección pública fija de Supabase.
//   1. Contenido PUBLICADO (de otras personas y lo propio ya publicado): la ruta `/img/<ruta>` del Worker (`${VITE_COMMUNITY_PUBLIC_BASE}/img/<ruta>`), que la
//      lee con la clave anónima y solo la sirve si sigue visible. No cuesta llamadas a Supabase desde la app y la caché del Worker (2 min) las ahorra casi todas.
//   2. Lo que el Worker NO puede servir (lo propio sin publicar: editor y borradores; contenido oculto que ve la administración): dirección FIRMADA temporal de
//      Supabase (10 min). Se pide de forma perezosa y EN LOTE (una llamada para todas las fotos que pidan a la vez) y se recuerda mientras siga siendo válida.
//   3. Sin `VITE_COMMUNITY_PUBLIC_BASE` (desarrollo): todo por firmada.
//   4. La vista previa inmediata tras elegir un archivo es el blob local (sin red): ver `rememberLocalPhotoPreview`.
// Si una dirección falla al cargar (p. ej. el Worker responde 404 porque el contenido ya no es público para esa persona) el hook pasa a la firmada una vez, y si
// también falla, la renueva una vez; después no se pinta nada (nunca un bucle de peticiones).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createCommunityPhotoSignedUrls } from '@/data/community'
import { isCommunityPhotoPath } from '@/domain/communityPhotoPath'

// 'public' = contenido que debería estar publicado (se intenta el Worker); 'private' = lo propio sin publicar o lo que ve la administración (siempre firmada).
export type PhotoAccess = 'public' | 'private'

// ---- Parte pura (se prueba sin navegador)

// Base del Worker sin barra final, o null si no está configurada o no es una dirección http(s).
export function normalizePublicBase(raw: string | undefined | null): string | null {
  const base = (raw ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^\s"'<>]+$/i.test(base) ? base : null
}

export function publicPhotoBase(): string | null {
  const env = import.meta.env as Record<string, string | undefined>
  return normalizePublicBase(env.VITE_COMMUNITY_PUBLIC_BASE)
}

// Dirección del Worker para una ruta. Solo con la forma exacta `<perfil>/<uuid>.<ext>` (la misma regla que aplica el Worker).
export function workerPhotoUrl(base: string | null, path: string): string | null {
  if (!base || !isCommunityPhotoPath(path)) return null
  return `${base}/img/${path}`
}

export type PhotoPlan = { kind: 'url'; url: string } | { kind: 'signed'; refresh: boolean } | { kind: 'none' }

// Qué hacer con una foto según su acceso, si hay Worker configurado y cuántas veces ha fallado ya al cargar (`failures`).
export function planCommunityPhoto(path: string, access: PhotoAccess, base: string | null, failures: number): PhotoPlan {
  const viaWorker = access === 'public' ? workerPhotoUrl(base, path) : null
  if (viaWorker) {
    if (failures === 0) return { kind: 'url', url: viaWorker }
    if (failures <= 2) return { kind: 'signed', refresh: failures === 2 }
    return { kind: 'none' }
  }
  if (failures <= 1) return { kind: 'signed', refresh: failures === 1 }
  return { kind: 'none' }
}

// ---- Vistas previas locales (blob de la foto recién elegida: se enseña sin red; se olvida al quitarla o al cerrar el editor)

const localPreviews = new Map<string, string>()

export function rememberLocalPhotoPreview(path: string, blob: Blob): void {
  forgetLocalPhotoPreview(path)
  localPreviews.set(path, URL.createObjectURL(blob))
}

export function forgetLocalPhotoPreview(path: string): void {
  const url = localPreviews.get(path)
  if (url === undefined) return
  localPreviews.delete(path)
  URL.revokeObjectURL(url)
}

// ---- Direcciones firmadas: caché + petición en lote

const SIGNED_REUSE_MS = 540_000 // la firmada dura 10 min: se reutiliza 9 y luego se pide otra
const BATCH_DELAY_MS = 20
interface SignedEntry {
  url: string
  expires: number
}
const signedCache = new Map<string, SignedEntry>()

// Tanda abierta: todas las fotos que se pidan durante la ventana comparten UNA llamada a Supabase.
let openBatch: { paths: Set<string>; done: Promise<void> } | null = null

function joinBatch(path: string): Promise<void> {
  if (!openBatch) {
    const paths = new Set<string>()
    const done = new Promise<void>((resolve) => {
      setTimeout(() => {
        openBatch = null
        createCommunityPhotoSignedUrls(Array.from(paths))
          .then((result) => {
            const expires = Date.now() + SIGNED_REUSE_MS
            for (const [p, url] of Object.entries(result)) signedCache.set(p, { url, expires })
          })
          // Sin dirección: cada petición de la tanda se resuelve a null y el hook no pinta la foto (no se reintenta en bucle).
          .catch(() => undefined)
          .finally(resolve)
      }, BATCH_DELAY_MS)
    })
    openBatch = { paths, done }
  }
  openBatch.paths.add(path)
  return openBatch.done
}

// Dirección firmada de UNA foto (o null). Con `refresh` se descarta la recordada (p. ej. si caducó mientras la pantalla seguía abierta).
export function requestSignedPhotoUrl(path: string, refresh = false): Promise<string | null> {
  if (refresh) signedCache.delete(path)
  const cached = signedCache.get(path)
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.url)
  return joinBatch(path).then(() => signedCache.get(path)?.url ?? null)
}

// Para usos puntuales fuera de React (descargar una foto, ampliar…): la dirección que toca según el acceso, ya resuelta.
export async function resolveCommunityPhotoUrl(path: string, access: PhotoAccess = 'public'): Promise<string | null> {
  const local = localPreviews.get(path)
  if (local) return local
  const plan = planCommunityPhoto(path, access, publicPhotoBase(), 0)
  if (plan.kind === 'url') return plan.url
  if (plan.kind === 'signed') return requestSignedPhotoUrl(path, plan.refresh)
  return null
}

// Solo para las pruebas.
export function resetCommunityPhotoCaches(): void {
  signedCache.clear()
  openBatch = null
  for (const path of Array.from(localPreviews.keys())) forgetLocalPhotoPreview(path)
}

// ---- Hooks

export interface CommunityPhotoUrls {
  // Una por foto, en el mismo orden: null = todavía sin dirección (pidiéndola) o sin acceso. No se pinta nada mientras sea null.
  urls: (string | null)[]
  // Llamar cuando la imagen no cargue (`onError`): prueba la siguiente alternativa una vez.
  onError: (path: string) => void
}

export function useCommunityPhotoUrls(paths: readonly string[], access: PhotoAccess = 'public'): CommunityPhotoUrls {
  const base = publicPhotoBase()
  const [failures, setFailures] = useState<Record<string, number>>({})
  const [signed, setSigned] = useState<Record<string, string>>({})

  // Lo que hay que pedir firmado, como texto estable (así el efecto solo corre cuando cambia de verdad).
  const needKey = paths
    .map((p) => {
      if (localPreviews.has(p)) return null
      const plan = planCommunityPhoto(p, access, base, failures[p] ?? 0)
      return plan.kind === 'signed' ? `${plan.refresh ? 1 : 0}${p}` : null
    })
    .filter((x): x is string => x !== null)
    .join('\n')

  useEffect(() => {
    if (!needKey) return
    let alive = true
    for (const item of needKey.split('\n')) {
      const refresh = item[0] === '1'
      const path = item.slice(1)
      void requestSignedPhotoUrl(path, refresh).then((url) => {
        if (alive && url) setSigned((prev) => (prev[path] === url ? prev : { ...prev, [path]: url }))
      })
    }
    return () => {
      alive = false
    }
  }, [needKey])

  const urls = paths.map((p) => {
    const local = localPreviews.get(p)
    if (local) return local
    const plan = planCommunityPhoto(p, access, base, failures[p] ?? 0)
    if (plan.kind === 'url') return plan.url
    if (plan.kind === 'signed') return signed[p] ?? null
    return null
  })
  // `urls` cambia en cada render (es un arreglo nuevo): quien lo use como dependencia debe fijarse en su contenido.
  const key = urls.join('\n')
  const stable = useMemo(() => urls, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const onError = useCallback((path: string) => setFailures((prev) => ({ ...prev, [path]: (prev[path] ?? 0) + 1 })), [])
  return { urls: stable, onError }
}

// Una sola foto (tarjetas, comentarios…). `src` es null mientras no hay dirección.
export function useCommunityPhotoUrl(path: string | null | undefined, access: PhotoAccess = 'public'): { src: string | null; onError: () => void } {
  const list = useMemo(() => (path ? [path] : []), [path])
  const { urls, onError } = useCommunityPhotoUrls(list, access)
  return { src: path ? (urls[0] ?? null) : null, onError: useCallback(() => (path ? onError(path) : undefined), [onError, path]) }
}
