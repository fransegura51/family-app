import type { PostDetail } from '@/domain/community'

// PROVISIONAL (lo sustituye la construcción de recetas): ingredientes, pasos, raciones, valoración con estrellas y reseñas, importar a mi Cocina.
export function RecipePanel({ detail }: { detail: PostDetail; onChanged?: () => void }) {
  return <p className="muted">Receta de «{detail.title}» (en construcción).</p>
}
