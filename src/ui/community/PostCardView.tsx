import { useState } from 'react'
import { Link } from 'react-router-dom'
import { communityPhotoUrl, unblockUser } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { KIND_ICONS, KIND_LABELS, type CommunityCardItem } from '@/domain/community'
import { paths } from '@/ui/community/communityNav'

// Tarjeta COMPACTA de publicación (portada, secciones, buscador, guardados y perfiles): tipo, tema, alias, extracto de máximo dos líneas, miniatura si hay foto
// e interacciones clave. Tocar TODA la tarjeta abre la página completa (no un modal). Si la persona ha bloqueado al autor, el servidor no manda el contenido y
// aquí solo se enseña una capa neutra con «Desbloquear».
export function PostCardView({ item, onUnblocked }: { item: CommunityCardItem; onUnblocked?: () => void }) {
  const [error, setError] = useState<string | null>(null)

  if (item.blockedByMe) {
    return (
      <div className="community-blocked-card" role="group" aria-label="Contenido de usuario bloqueado por ti">
        <p>Contenido de usuario bloqueado por ti</p>
        <button
          type="button"
          className="link-button"
          onClick={async () => {
            try {
              await unblockUser(item.authorId)
              onUnblocked?.()
            } catch (e) {
              setError(communityErrorText(e))
            }
          }}
        >
          Desbloquear
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    )
  }

  const author = item.authorDeleted ? 'Usuario eliminado' : (item.authorAlias ?? 'Alguien')
  return (
    <Link to={paths.post(item.id)} className="community-card" aria-label={`${KIND_LABELS[item.kind]}: ${item.title}`}>
      <div className="community-card-body">
        <div className="community-card-meta">
          <span>
            {KIND_ICONS[item.kind]} {KIND_LABELS[item.kind]}
          </span>
          <span>· {item.topicLabel}</span>
          <span>
            · {item.authorAvatar ? `${item.authorAvatar} ` : ''}
            {author}
          </span>
          {item.isOfficial && item.officialLabel && <span className="community-tag-official">{item.officialLabel}</span>}
          {item.featured && <span className="community-tag-featured">⭐ Destacado por la comunidad</span>}
          {item.kind === 'pregunta' && item.unanswered && <span className="community-tag-unanswered">Sin respuesta</span>}
        </div>
        <h3 className="community-card-title">{item.title}</h3>
        {item.excerpt && <p className="community-card-excerpt">{item.excerpt}</p>}
        <div className="community-card-stats" aria-label="Interacciones">
          <span>❤️ {item.likeCount}</span>
          <span>💬 {item.commentCount}</span>
          {item.kind === 'receta' && item.avgRating !== null && (
            <span>
              ⭐ {Number(item.avgRating).toFixed(1)} ({item.ratingCount})
            </span>
          )}
          {item.kind === 'receta' && item.importCount > 0 && <span>📥 {item.importCount}</span>}
        </div>
      </div>
      {item.thumbPath && <img className="community-card-thumb" src={communityPhotoUrl(item.thumbPath)} alt="" loading="lazy" decoding="async" />}
    </Link>
  )
}
