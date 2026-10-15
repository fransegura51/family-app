import { useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecipeReviews, rateRecipe, unblockUser } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import type { RecipeReview } from '@/domain/community'
import { formatRecipeDate } from '@/domain/communityRecipeBridge'
import { paths } from '@/ui/community/communityNav'
import { useCommunity } from '@/ui/community/CommunityProvider'
import '@/ui/community/recipes/communityRecipes.css'

// Estrellas del 1 al 5 de solo lectura («★★★★☆»), con el valor dicho en palabras para lectores de pantalla.
export function StarsText({ value }: { value: number }) {
  const full = Math.max(0, Math.min(5, Math.round(value)))
  return (
    <span className="community-stars-static" role="img" aria-label={`${full} de 5 estrellas`}>
      {'★'.repeat(full)}
      {'☆'.repeat(5 - full)}
    </span>
  )
}

const REVIEW_MAX = 1000
const STAR_WORDS = ['', 'Muy floja', 'Regular', 'Buena', 'Muy buena', 'Excelente']

export interface RatingSummary {
  avgRating: number | null
  ratingCount: number
  myRating: number | null
}

// Valoración con estrellas y reseña opcional (CMN-§5.4). Antes de enviar se pide participar (alias y normas la primera vez). Una persona = una valoración por
// receta; puede cambiarla. OJO: al cambiarla se sustituye también su reseña (el servidor no devuelve la reseña propia a la ficha), y se avisa de ello.
export function RecipeRatingBox({
  recipeId,
  summary,
  canRate,
  cannotRateReason,
  onChanged,
}: {
  recipeId: string
  summary: RatingSummary
  canRate: boolean
  cannotRateReason?: string
  onChanged: (next: RatingSummary) => void
}) {
  const { requireParticipation } = useCommunity()
  const [editing, setEditing] = useState(summary.myRating === null)
  const [stars, setStars] = useState<number>(summary.myRating ?? 0)
  const [review, setReview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function send() {
    if (stars < 1 || busy) return
    setBusy(true)
    setError(null)
    try {
      if (!(await requireParticipation())) return
      const r = await rateRecipe(recipeId, stars, review.trim() === '' ? null : review.trim())
      onChanged({ avgRating: r.avgRating, ratingCount: r.ratingCount, myRating: stars })
      setSaved(true)
      setEditing(false)
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="community-rating-box" aria-label="Valoración de la receta">
      <div className="community-rating-summary">
        {summary.avgRating !== null && summary.ratingCount > 0 ? (
          <>
            <span className="community-rating-average" aria-label={`Valoración media ${Number(summary.avgRating).toFixed(1).replace('.', ',')} de 5`}>
              ★ {Number(summary.avgRating).toFixed(1).replace('.', ',')}
            </span>
            <span className="muted">
              {summary.ratingCount} {summary.ratingCount === 1 ? 'valoración' : 'valoraciones'}
            </span>
          </>
        ) : (
          <span className="muted">Todavía nadie ha valorado esta receta.</span>
        )}
      </div>

      {!canRate && <p className="muted">{cannotRateReason ?? 'No puedes valorar esta receta.'}</p>}

      {canRate && !editing && summary.myRating !== null && (
        <div>
          <p style={{ margin: '0 0 6px' }}>
            Tu valoración: <StarsText value={summary.myRating} /> {saved && <span className="muted">· Guardada. ¡Gracias!</span>}
          </p>
          <button
            type="button"
            className="link-button"
            style={{ minHeight: 44 }}
            onClick={() => {
              setEditing(true)
              setSaved(false)
            }}
          >
            Cambiar mi valoración
          </button>
        </div>
      )}

      {canRate && editing && (
        <div>
          <p style={{ margin: '0 0 4px' }}>
            <strong>{summary.myRating === null ? '¿Qué te ha parecido?' : 'Cambia tu valoración'}</strong>
          </p>
          <div className="community-stars" role="radiogroup" aria-label="Tu valoración, de 1 a 5 estrellas">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}: ${STAR_WORDS[n]}`}
                className={'community-star' + (n <= stars ? ' on' : '')}
                onClick={() => setStars(n)}
                disabled={busy}
              >
                ★
              </button>
            ))}
          </div>
          {stars > 0 && <p className="muted" style={{ margin: '0 0 8px' }}>{STAR_WORDS[stars]}</p>}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Tu reseña (opcional)</span>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              maxLength={REVIEW_MAX}
              rows={3}
              placeholder="Cuenta cómo te ha salido o qué cambiarías."
              disabled={busy}
            />
          </label>
          <p className="muted" style={{ margin: '4px 0 8px', fontSize: 13 }}>
            {summary.myRating !== null ? 'Al guardar se sustituye tu reseña anterior: si quieres conservarla, vuelve a escribirla. ' : ''}
            Tu reseña la podrá leer cualquier persona con tu alias, nunca tu nombre.
          </p>
          {error && <p className="error">{error}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="primary" style={{ minHeight: 48 }} onClick={send} disabled={busy || stars < 1}>
              {busy ? 'Enviando…' : 'Enviar valoración'}
            </button>
            {summary.myRating !== null && (
              <button type="button" className="link-button" style={{ minHeight: 44 }} onClick={() => setEditing(false)} disabled={busy}>
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

const PAGE = 20

// Reseñas de la receta (con alias, nunca nombres reales). Se piden SOLO cuando la persona pulsa «Ver reseñas», de 20 en 20. Las de alguien bloqueado salen
// como una capa neutra (el servidor ni manda su contenido) con «Desbloquear».
export function RecipeReviewsList({ recipeId, ratingCount }: { recipeId: string; ratingCount: number }) {
  const [items, setItems] = useState<RecipeReview[] | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(offset: number) {
    setBusy(true)
    setError(null)
    try {
      const page = await listRecipeReviews(recipeId, PAGE, offset)
      setItems((prev) => (offset === 0 ? page : [...(prev ?? []), ...page]))
      setMore(page.length === PAGE)
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (ratingCount === 0 && items === null) return null
  if (items === null) {
    return (
      <div>
        <button type="button" className="link-button" style={{ minHeight: 44 }} onClick={() => load(0)} disabled={busy}>
          {busy ? 'Cargando…' : `Ver reseñas (${ratingCount})`}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    )
  }
  return (
    <div>
      <h3>Reseñas</h3>
      {items.length === 0 && <p className="muted">Todavía no hay reseñas.</p>}
      <ul className="community-review-list">
        {items.map((r) => (
          <li key={r.authorId} className="community-review">
            {r.blockedByMe ? (
              <div className="community-blocked-card" role="group" aria-label="Reseña de usuario bloqueado por ti">
                <p>Contenido de usuario bloqueado por ti</p>
                <button
                  type="button"
                  className="link-button"
                  onClick={async () => {
                    try {
                      await unblockUser(r.authorId)
                      await load(0)
                    } catch (e) {
                      setError(communityErrorText(e))
                    }
                  }}
                >
                  Desbloquear
                </button>
              </div>
            ) : (
              <>
                <div className="community-review-head">
                  <Link to={paths.profile(r.authorId)}>
                    {r.authorAvatar ? `${r.authorAvatar} ` : ''}
                    {r.authorAlias ?? 'Alguien'}
                  </Link>
                  {r.mine && <span className="muted">(tú)</span>}
                  {typeof r.stars === 'number' && <StarsText value={r.stars} />}
                  {r.createdAt && <span className="muted">{formatRecipeDate(r.createdAt)}</span>}
                </div>
                {r.review && <p>{r.review}</p>}
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
      {more && (
        <button type="button" className="link-button" style={{ minHeight: 44 }} onClick={() => load(items.length)} disabled={busy}>
          {busy ? 'Cargando…' : 'Ver más reseñas'}
        </button>
      )}
    </div>
  )
}
