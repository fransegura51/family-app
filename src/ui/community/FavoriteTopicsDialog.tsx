import { useEffect, useRef, useState } from 'react'
import { getFavoriteTopics, setFavoriteTopics } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { SECTIONS, type CommunityTopic } from '@/domain/community'
import { useCommunity } from '@/ui/community/CommunityProvider'

// «Mis temas favoritos»: opcional. Se abre desde la sección; solo al GUARDAR se pide alias (requireParticipation). Los temas favoritos suben las
// publicaciones de esos temas en «Para mí». Una sola petición para leer los favoritos al abrir y otra al guardar.
export function FavoriteTopicsDialog({ topics, onClose, onSaved }: { topics: CommunityTopic[]; onClose: () => void; onSaved: () => void }) {
  const { requireParticipation } = useCommunity()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Si no se pudieron leer los favoritos actuales, NO se permite guardar: guardar sustituye la lista entera y borraría los que ya había.
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let cancelled = false
    getFavoriteTopics().then(
      (ids) => {
        if (cancelled) return
        setSelected(new Set(ids))
        setLoading(false)
      },
      (e) => {
        if (cancelled) return
        setError(communityErrorText(e))
        setLoadFailed(true)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Teclado: el foco entra en el diálogo y Escape lo cierra.
  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      if (!(await requireParticipation())) return
      await setFavoriteTopics([...selected])
      onSaved()
      onClose()
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-sheet community-fav-dialog" role="dialog" aria-modal="true" aria-labelledby="community-fav-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="community-fav-title" ref={titleRef} tabIndex={-1}>
          Mis temas favoritos
        </h2>
        <p className="muted">Elige los temas que más te interesan. «Para mí» te enseñará antes lo que se publique en ellos. Es opcional y puedes cambiarlo cuando quieras.</p>
        {loading && <p role="status">Cargando…</p>}
        {!loading &&
          SECTIONS.map((s) => (
            <fieldset key={s.id} className="community-fav-group">
              <legend>
                {s.icon} {s.title}
              </legend>
              {topics
                .filter((t) => t.section === s.id)
                .map((t) => (
                  <label key={t.id} className="checkbox-label community-fav-option">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                    {t.label}
                  </label>
                ))}
            </fieldset>
          ))}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="primary" onClick={() => void save()} disabled={loading || saving || loadFailed}>
            {saving ? 'Guardando…' : 'Guardar mis temas'}
          </button>
          <button type="button" className="link-button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
