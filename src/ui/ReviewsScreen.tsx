// Reseñas y opiniones: cada persona valora de 1 a 5 estrellas la app en general y, si quiere, cada sección, y cuenta «lo que me gusta» y «lo que no me gusta».
// Aparte del Buzón de sugerencias (ese es para proponer cambios). Lo simple por delante: las estrellas de la app en general; el detalle por secciones y los
// comentarios van plegados. La dueña de la app ve además las de todas las familias (lo decide la base de datos, no esta pantalla).
import { useEffect, useMemo, useState } from 'react'
import { deleteAppReview, listAppReviews, saveAppReview } from '@/data/appReviews'
import { amIAppOwner, getFamilyNameForSuggestion } from '@/data/suggestions'
import { supabase } from '@/data/supabaseClient'
import { errorMessage } from '@/domain/errorMessage'
import { formatDateFromTimestamp } from '@/domain/dateFormat'
import { GENERAL_SECTION, REVIEW_SECTIONS, sectionLabel, starsText, summarizeReviews, type AppReview, type ReviewSection } from '@/domain/appReviews'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { StarPicker } from '@/ui/StarPicker'
import { emitHelpEvent } from '@/help/tours/helpBus'

function ReviewRow({ section, review, onChanged, onError, big, helpId }: { section: ReviewSection; review: AppReview | undefined; onChanged: () => void; onError: (m: string) => void; big?: boolean; helpId?: string }) {
  const [liked, setLiked] = useState(review?.liked ?? '')
  const [disliked, setDisliked] = useState(review?.disliked ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setLiked(review?.liked ?? '')
    setDisliked(review?.disliked ?? '')
  }, [review?.id, review?.liked, review?.disliked])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setSaved(false)
    try {
      await action()
      onChanged()
      setSaved(true)
      emitHelpEvent('resenas.review-saved') // para los tutoriales «Enséñame»: la valoración YA está guardada
    } catch (err) {
      onError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setBusy(false)
    }
  }

  const stars = review?.stars ?? 0
  return (
    <div className="card review-row" data-help-id={helpId}>
      <div className="review-row-head">
        <strong style={big ? { fontSize: 17 } : undefined}>
          {section.icon} {section.label}
        </strong>
        <StarPicker value={stars} label={section.label} disabled={busy} onPick={(n) => run(() => saveAppReview({ section: section.id, stars: n, liked, disliked }))} />
      </div>
      <details className="review-more">
        <summary>
          <span>{review?.liked || review?.disliked ? 'Mi comentario' : 'Contar qué me gusta y qué no'}</span>
          <span className="review-chevron" aria-hidden="true">
            ▾
          </span>
        </summary>
        {stars === 0 && <p className="muted">Primero elige las estrellas.</p>}
        <label>
          Lo que me gusta
          <textarea value={liked} maxLength={1000} rows={2} onChange={(e) => setLiked(e.target.value)} placeholder="Lo que más te gusta de esto…" />
        </label>
        <label>
          Lo que no me gusta
          <textarea value={disliked} maxLength={1000} rows={2} onChange={(e) => setDisliked(e.target.value)} placeholder="Lo que cambiarías o no te convence…" />
        </label>
        <div className="inline-fields">
          <button type="button" disabled={busy || stars === 0} onClick={() => run(() => saveAppReview({ section: section.id, stars, liked, disliked }))}>
            {busy ? 'Guardando…' : 'Guardar comentario'}
          </button>
          {review && (
            <button type="button" className="link-button" disabled={busy} onClick={() => run(() => deleteAppReview(section.id))}>
              Quitar mi valoración
            </button>
          )}
        </div>
      </details>
      {saved && (
        <p className="muted" role="status">
          ✓ Guardado
        </p>
      )}
    </div>
  )
}

export function ReviewsScreen() {
  const [reviews, setReviews] = useState<AppReview[]>([])
  const [myProfileId, setMyProfileId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [familyNames, setFamilyNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    Promise.all([listAppReviews(), amIAppOwner(), supabase.auth.getUser().then(({ data }) => data.user?.id ?? null)])
      .then(async ([rows, owner, me]) => {
        setReviews(rows)
        setIsOwner(owner)
        setMyProfileId(me)
        if (owner) {
          const ids = [...new Set(rows.map((r) => r.familyId))]
          const entries = await Promise.all(ids.map(async (id) => [id, await getFamilyNameForSuggestion(id)] as const))
          setFamilyNames(new Map(entries.filter((e): e is [string, string] => !!e[1])))
        }
        setError(null)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las reseñas')))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [])

  const mine = useMemo(() => new Map(reviews.filter((r) => r.profileId === myProfileId).map((r) => [r.section, r])), [reviews, myProfileId])
  const summary = useMemo(() => summarizeReviews(reviews), [reviews])

  if (loading) return <p className="muted">Cargando reseñas…</p>

  return (
    <div className="screen">
      <h1>⭐ Reseñas y opiniones</h1>
      <SectionBreadcrumb subsection="Inicio" />
      <p className="muted">¿Qué tal te va con PEPA? Valórala de 1 a 5 estrellas y cuéntanos qué te gusta y qué no. Si quieres proponer un cambio, usa el Buzón de sugerencias.</p>
      {error && <p className="error">{error}</p>}

      <ReviewRow big helpId="resenas.general" section={GENERAL_SECTION} review={mine.get(GENERAL_SECTION.id)} onChanged={reload} onError={setError} />

      <details className="card review-sections">
        <summary data-help-id="resenas.secciones">
          <span className="review-summary-main">
            <strong>📋 Valorar cada sección (opcional)</strong>
            <span className="muted">Compras, Economía, Galería, Ubicación… cada una con sus estrellas</span>
          </span>
          <span className="review-chevron" aria-hidden="true">
            ▾
          </span>
        </summary>
        {REVIEW_SECTIONS.map((s) => (
          <ReviewRow key={s.id} section={s} review={mine.get(s.id)} onChanged={reload} onError={setError} />
        ))}
      </details>

      {isOwner && (
        <section style={{ marginTop: 20 }}>
          <h2>Todas las reseñas</h2>
          {reviews.length === 0 && <p className="muted">Todavía no hay ninguna reseña.</p>}
          {summary.length > 0 && (
            <div className="card">
              <strong>Media por sección</strong>
              <ul className="review-summary">
                {summary.map((s) => (
                  <li key={s.section}>
                    {sectionLabel(s.section)}: <strong>{s.average.toFixed(1)}</strong> {starsText(Math.round(s.average))} ({s.count})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="event-list">
            {reviews.map((r) => (
              <div key={r.id} className="card task-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>
                    {familyNames.get(r.familyId) ?? 'Familia'} · {sectionLabel(r.section)} · {starsText(r.stars)}
                  </strong>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {formatDateFromTimestamp(r.updatedAt)}
                  </span>
                </div>
                {r.liked && <p style={{ margin: 0 }}>👍 {r.liked}</p>}
                {r.disliked && <p style={{ margin: 0 }}>👎 {r.disliked}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
