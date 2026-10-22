import { useCallback, useEffect, useState } from 'react'
import { prefSet } from '@/state/prefs/prefsWrite'

// Configuración del carrusel de Inicio, elegida por quien mira su propio móvil (igual que el orden de las tarjetas: localStorage, no Supabase; cada persona
// puede querer el suyo y no cuesta ninguna consulta). Todo activado y fotos al azar por defecto.
//  · enabled: el carrusel entero (apagado = no se ve en Inicio; se recupera desde Configuración).
//  · shopping / calendar / community / photos: cada parte por separado.
//  · photoMode: 'random' = hasta 5 fotos de la Galería PEPA elegidas al azar; 'fixed' = las que la persona elija (hasta 5), solo de la Galería PEPA.
export const MAX_CAROUSEL_PHOTOS = 5
export type CarouselPhotoMode = 'random' | 'fixed'

export interface HomeCarouselPrefs {
  enabled: boolean
  shopping: boolean
  calendar: boolean
  community: boolean
  photos: boolean
  photoMode: CarouselPhotoMode
  fixedPhotoIds: string[]
}

export const DEFAULT_HOME_CAROUSEL_PREFS: HomeCarouselPrefs = {
  enabled: true,
  shopping: true,
  calendar: true,
  community: true,
  photos: true,
  photoMode: 'random',
  fixedPhotoIds: [],
}

const STORAGE_KEY = 'familyapp:home-carousel'
export const HOME_CAROUSEL_CHANGED_EVENT = 'pepa:home-carousel-changed'

// Lo guardado puede venir de una versión anterior o estar corrupto: se completa con los valores por defecto y se descarta lo que no vale.
export function sanitizeHomeCarouselPrefs(raw: unknown): HomeCarouselPrefs {
  const d = DEFAULT_HOME_CAROUSEL_PREFS
  if (typeof raw !== 'object' || raw === null) return { ...d, fixedPhotoIds: [] }
  const r = raw as Record<string, unknown>
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  const ids = Array.isArray(r.fixedPhotoIds) ? r.fixedPhotoIds.filter((x): x is string => typeof x === 'string' && x !== '') : []
  return {
    enabled: bool(r.enabled, d.enabled),
    shopping: bool(r.shopping, d.shopping),
    calendar: bool(r.calendar, d.calendar),
    community: bool(r.community, d.community),
    photos: bool(r.photos, d.photos),
    photoMode: r.photoMode === 'fixed' ? 'fixed' : 'random',
    fixedPhotoIds: [...new Set(ids)].slice(0, MAX_CAROUSEL_PHOTOS),
  }
}

export function loadHomeCarouselPrefs(): HomeCarouselPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return sanitizeHomeCarouselPrefs(raw ? JSON.parse(raw) : null)
  } catch {
    return sanitizeHomeCarouselPrefs(null)
  }
}

export function saveHomeCarouselPrefs(prefs: HomeCarouselPrefs): void {
  try {
    prefSet(STORAGE_KEY, JSON.stringify(sanitizeHomeCarouselPrefs(prefs)))
  } catch {
    // localStorage no disponible (privado/bloqueado): el cambio vale hasta cerrar la app, no es crítico.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HOME_CAROUSEL_CHANGED_EVENT))
}

// Las preferencias en pantalla se mantienen al día entre el carrusel de Inicio y la tarjeta de Configuración (mismo móvil, otra pantalla o pestaña).
export function useHomeCarouselPrefs(): [HomeCarouselPrefs, (change: Partial<HomeCarouselPrefs>) => void] {
  const [prefs, setPrefs] = useState<HomeCarouselPrefs>(() => loadHomeCarouselPrefs())
  useEffect(() => {
    const refresh = () => setPrefs(loadHomeCarouselPrefs())
    window.addEventListener(HOME_CAROUSEL_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(HOME_CAROUSEL_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  const update = useCallback((change: Partial<HomeCarouselPrefs>) => {
    saveHomeCarouselPrefs({ ...loadHomeCarouselPrefs(), ...change })
  }, [])
  return [prefs, update]
}
