import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminListFeatured, adminSetFeatured } from '@/data/community'
import { ADMIN_TEXT, formatMadrid, toFeaturedItems, type FeaturedItem } from '@/domain/communityAdmin'
import { paths } from '@/ui/community/communityNav'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox, TwoTapButton } from '@/ui/community/admin/AdminShared'
import { useAdminAction, useAdminData } from '@/ui/community/admin/useAdminData'

// Destacados: la selección es automática; aquí solo se revisa y se puede retirar un destacado (o volver a ponerlo).
export function FeaturedTab({ onChanged }: { onChanged: () => void }) {
  const loader = useCallback(async () => toFeaturedItems(await adminListFeatured()), [])
  const { data, loading, error, reload, setData } = useAdminData(loader)
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <div className="cadm-stack">
      <InfoBox>{ADMIN_TEXT.featuredAuto}</InfoBox>
      <ActionNotice message={notice} />
      {loading && <AdminLoading label="Cargando destacados…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && data && data.length === 0 && <AdminEmpty>Ahora mismo no hay publicaciones destacadas.</AdminEmpty>}
      {!loading && data && (
        <ul className="cadm-list">
          {data.map((f) => (
            <li key={f.id}>
              <FeaturedCard
                item={f}
                onChanged={(featured) => {
                  setNotice(featured ? 'Vuelve a estar destacada.' : 'Retirada de destacados.')
                  setData((prev) => (prev ? prev.map((x) => (x.id === f.id ? { ...x, removed: !featured } : x)) : prev))
                  onChanged()
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function FeaturedCard({ item, onChanged }: { item: FeaturedItem; onChanged: (featured: boolean) => void }) {
  const action = useAdminAction()
  return (
    <article className="cadm-card" aria-label={`Destacado: ${item.title}`}>
      <header className="cadm-card-head">
        <h4>
          <Link to={paths.post(item.id)}>{item.title}</Link>
        </h4>
        <span className={`cadm-chip ${item.removed ? 'cadm-chip-warn' : 'cadm-chip-ok'}`}>{item.removed ? 'Retirada por administración' : 'Destacada'}</span>
      </header>
      <p className="muted cadm-small">
        Destacada desde {formatMadrid(item.featuredAt, 'date')} · {item.likes} me gusta · {item.comments} comentarios · {item.saves} guardados
      </p>
      <ActionNotice error={action.error} />
      {item.removed ? (
        <button
          type="button"
          className="cadm-btn cadm-btn-secondary"
          disabled={action.busy}
          onClick={() => {
            void (async () => {
              const r = await action.run(() => adminSetFeatured(item.id, true))
              if (r.ok) onChanged(true)
            })()
          }}
        >
          Volver a poner como destacada
        </button>
      ) : (
        <TwoTapButton
          label="Retirar de destacados"
          armedLabel="Toca otra vez para retirarla"
          variant="danger"
          disabled={action.busy}
          onConfirm={() => {
            void (async () => {
              const r = await action.run(() => adminSetFeatured(item.id, false))
              if (r.ok) onChanged(false)
            })()
          }}
        />
      )}
      <p className="muted cadm-small">Lo que retiras no vuelve a destacarse solo. La acción queda en el historial.</p>
    </article>
  )
}
