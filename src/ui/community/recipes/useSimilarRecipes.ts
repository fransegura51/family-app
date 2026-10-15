// Comunidad PEPA — «¿Es lo mismo que…?»: antes de publicar una receta, Pepa sugiere hasta 3 publicaciones parecidas (especificación §4).
// Es solo una ayuda: no impide publicar ni obliga a leerlas, y si falla se sigue sin ellas. Mismo patrón que el editor de publicaciones:
// pausa de 600 ms tras dejar de escribir, al menos 4 letras y UNA sola petición por cambio de título (si el título cambia antes, la anterior se descarta).
import { useEffect, useState } from 'react'
import { similarPosts } from '@/data/community'
import type { PostCard } from '@/domain/community'

export const SIMILAR_MIN_LETTERS = 4
export const SIMILAR_DELAY_MS = 600
export const SIMILAR_MAX = 3

export function useSimilarRecipes(title: string, enabled: boolean): PostCard[] {
  const clean = title.trim()
  const eligible = enabled && clean.length >= SIMILAR_MIN_LETTERS
  // El resultado lleva el título al que corresponde: si el título cambia, el anterior deja de valer sin resetear nada dentro del efecto.
  const [result, setResult] = useState<{ title: string; list: PostCard[] } | null>(null)

  useEffect(() => {
    if (!eligible) return
    let cancelled = false
    const t = window.setTimeout(() => {
      similarPosts(clean, 'receta', 'recetas').then(
        (list) => {
          if (cancelled) return
          // Las de alguien bloqueado llegan como capa neutra y no se sugieren.
          setResult({ title: clean, list: list.filter((c) => (c as { blockedByMe?: boolean }).blockedByMe !== true).slice(0, SIMILAR_MAX) })
        },
        () => {
          if (!cancelled) setResult({ title: clean, list: [] })
        },
      )
    }, SIMILAR_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [clean, eligible])

  return eligible && result?.title === clean ? result.list : []
}
