import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { newsBreakdown } from '@/data/community'
import type { NewsBreakdownItem } from '@/domain/community'
import { communityErrorText } from '@/domain/communityErrors'
import { commentsLabel, newsSummary } from '@/domain/communityProfile'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { pageCrumbs, paths } from '@/ui/community/communityNav'
import '@/ui/community/communityProfile.css'

// Novedades (sec. 12): desglose por conversación de los comentarios aún sin ver. ABRIR el desglose NO marca nada como leído: solo se marcan los comentarios de
// la conversación a la que entras (y cuando de verdad se ven, lo hace la publicación). El desglose se vuelve a pedir cada vez que se muestra la pantalla, así que
// al volver desde una conversación quedan las demás.
export function NewsPage() {
  const [items, setItems] = useState<NewsBreakdownItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await newsBreakdown())
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <Breadcrumbs crumbs={pageCrumbs('Novedades')} />
      <h1>Novedades</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items === null && !error && (
        <p className="muted" role="status">
          Mirando qué hay de nuevo…
        </p>
      )}
      {items && <NewsList items={items} />}
      {(error || items) && (
        <button type="button" className="link-button" disabled={loading} onClick={() => void load()}>
          {loading ? 'Actualizando…' : error ? 'Volver a intentarlo' : 'Actualizar'}
        </button>
      )}
    </>
  )
}

// Lista (separada para probarla sin red).
export function NewsList({ items }: { items: NewsBreakdownItem[] }) {
  if (items.length === 0) {
    return (
      <div className="card community-news-empty">
        <p className="community-news-empty-title">🎉 Estás al día</p>
        <p className="muted">No hay comentarios nuevos en las conversaciones que sigues, en tus publicaciones ni en respuestas a tus comentarios.</p>
        <Link to={paths.home} className="link-button">
          Ver la portada de Comunidad
        </Link>
      </div>
    )
  }
  return (
    <>
      <p className="community-news-summary" role="status">
        {newsSummary(items)}
      </p>
      <p className="muted">Mirar esta lista no marca nada como leído. Toca una conversación para ir directamente a lo nuevo.</p>
      <ul className="community-news-list">
        {items.map((i) => (
          <li key={i.postId}>
            <Link to={paths.post(i.postId, { nuevos: true, comment: i.firstCommentId })} className="community-news-item" aria-label={`${i.title}: ${commentsLabel(i.count)}`}>
              <span className="community-news-title">{i.title}</span>
              <span className="community-news-count">{commentsLabel(i.count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
