import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminGetContent, adminListReports, adminResolveContent } from '@/data/community'
import {
  ADMIN_TEXT,
  RESOLUTION_TEXT,
  TARGET_TYPE_TEXT,
  contentStatusText,
  formatMadrid,
  reasonLabel,
  reportCountText,
  resolveActionsFor,
  splitPage,
  starsLabel,
  toAdminContent,
  toReportGroups,
  type ReportGroup,
  type ResolveAction,
} from '@/domain/communityAdmin'
import { CommunityRichText } from '@/ui/community/CommunityRichText'
import { paths } from '@/ui/community/communityNav'
import { useCommunityPhotoUrls } from '@/ui/community/communityPhotoUrl'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox, NoteForm } from '@/ui/community/admin/AdminShared'
import { useAdminAction, useAdminData } from '@/ui/community/admin/useAdminData'

const PAGE = 20

interface ReportsState {
  items: ReportGroup[]
  hasMore: boolean
  fetched: number
}

// Denuncias AGRUPADAS por contenido: un contenido con 5 denuncias es una sola tarjeta. Lo que resuelve uno de los dos administradores queda resuelto para el otro.
export function ReportsPanel({ onChanged }: { onChanged: () => void }) {
  const [filter, setFilter] = useState<'open' | 'resolved'>('open')
  const [notice, setNotice] = useState<string | null>(null)
  const loader = useCallback(async (): Promise<ReportsState> => {
    const { page, hasMore } = splitPage(toReportGroups(await adminListReports(filter, PAGE + 1, 0)), PAGE)
    return { items: page, hasMore, fetched: page.length }
  }, [filter])
  const { data, loading, error, reload, setData } = useAdminData(loader)
  const more = useAdminAction()

  const loadMore = () => {
    if (!data) return
    void more.run(async () => {
      const { page, hasMore } = splitPage(toReportGroups(await adminListReports(filter, PAGE + 1, data.fetched)), PAGE)
      setData((prev) => (prev ? { items: [...prev.items, ...page], hasMore, fetched: prev.fetched + page.length } : prev))
    })
  }

  return (
    <div className="cadm-stack">
      <InfoBox>
        <p>{ADMIN_TEXT.reportAloneRemovesNothing}</p>
        <p>{ADMIN_TEXT.autoHide}</p>
        <p>{ADMIN_TEXT.threeWarnings}</p>
        <p>{ADMIN_TEXT.resolvedForBoth}</p>
      </InfoBox>

      <div className="cadm-filter" role="group" aria-label="Qué denuncias ver">
        {(['open', 'resolved'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`cadm-chip-button${filter === f ? ' active' : ''}`}
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f)
              setNotice(null)
            }}
          >
            {f === 'open' ? 'Por revisar' : 'Ya resueltas'}
          </button>
        ))}
      </div>

      <ActionNotice message={notice} />
      {loading && <AdminLoading label="Cargando denuncias…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && data && data.items.length === 0 && <AdminEmpty>{filter === 'open' ? 'No hay denuncias por revisar. ¡Todo al día!' : 'Todavía no hay denuncias resueltas.'}</AdminEmpty>}
      {!loading && data && (
        <ul className="cadm-list">
          {data.items.map((g) => (
            <li key={g.key}>
              <ReportGroupCard
                group={g}
                onResolved={(text) => {
                  setNotice(text)
                  setData((prev) => (prev ? { ...prev, items: prev.items.filter((x) => x.key !== g.key) } : prev))
                  onChanged()
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {!loading && data?.hasMore && (
        <>
          <ActionNotice error={more.error} />
          <button type="button" className="cadm-btn cadm-btn-secondary" onClick={loadMore} disabled={more.busy}>
            {more.busy ? 'Cargando…' : 'Ver más denuncias'}
          </button>
        </>
      )}
    </div>
  )
}

// Una tarjeta = un contenido (publicación, comentario o persona) con todas sus denuncias.
export function ReportGroupCard({ group, onResolved }: { group: ReportGroup; onResolved: (message: string) => void }) {
  const [detail, setDetail] = useState(false)
  const [choice, setChoice] = useState<ResolveAction | null>(null)
  const action = useAdminAction()
  const actions = resolveActionsFor(group.targetType)
  const picked = actions.find((a) => a.id === choice) ?? null
  const c = group.content

  return (
    <article className="cadm-card" aria-label={`${TARGET_TYPE_TEXT[group.targetType]} denunciada`}>
      <header className="cadm-card-head">
        <h4>
          {TARGET_TYPE_TEXT[group.targetType]}
          {c ? ` de ${c.authorAlias}` : ''}
        </h4>
        <span className="cadm-chip cadm-chip-warn">{reportCountText(group.reportCount)}</span>
      </header>

      <ul className="cadm-chips" aria-label="Motivos de las denuncias">
        {group.reasons.map((r) => (
          <li key={r} className="cadm-chip">
            {reasonLabel(r)}
          </li>
        ))}
      </ul>
      <p className="muted cadm-small">
        Primera denuncia: {formatMadrid(group.firstAt)} · Última: {formatMadrid(group.lastAt)}
      </p>

      {c && (
        <>
          {c.title && <p className="cadm-title">{c.title}</p>}
          {group.targetType === 'review' && c.stars !== null && <p className="cadm-small">Valoración: {starsLabel(c.stars)}</p>}
          {c.excerpt && <p className="cadm-excerpt">{c.excerpt}</p>}
          <p className="muted cadm-small">Ahora mismo: {contentStatusText(c.status)}</p>
          {group.targetType === 'review' && c.postId && c.status === 'published' && (
            <Link className="link-button cadm-linkbtn" to={paths.post(c.postId)}>
              Ver la receta
            </Link>
          )}
        </>
      )}
      {!c && <p className="muted">El contenido ya no existe.</p>}

      {group.targetType !== 'user' && c && (
        <button type="button" className="link-button cadm-linkbtn" aria-expanded={detail} onClick={() => setDetail((d) => !d)}>
          {detail ? 'Ocultar el detalle' : 'Ver el contenido completo y cada denuncia'}
        </button>
      )}
      {detail && group.targetType !== 'user' && <ContentDetail type={group.targetType} id={group.targetId} />}

      {group.status === 'resolved' && <p className="cadm-resolution">Resuelta: {group.resolution ? RESOLUTION_TEXT[group.resolution] : 'sin dato'}</p>}

      {group.status === 'open' && !picked && (
        <div className="cadm-actions" role="group" aria-label="Qué hacer con esta denuncia">
          {actions.map((a) => (
            <button key={a.id} type="button" className={`cadm-btn ${a.danger ? 'cadm-btn-danger' : 'cadm-btn-secondary'}`} onClick={() => setChoice(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      {group.status === 'open' && picked && (
        <NoteForm
          title={`${picked.label}: ${TARGET_TYPE_TEXT[group.targetType].toLowerCase()} de ${c?.authorAlias ?? 'esta persona'}`}
          help={`${picked.help} Esto resuelve la denuncia para los dos administradores.`}
          required={picked.needsNote}
          confirmLabel={`Confirmar: ${picked.label}`}
          danger={picked.danger}
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setChoice(null)
            action.clear()
          }}
          onSubmit={(note) => {
            void (async () => {
              const r = await action.run(() => adminResolveContent(group.targetType, group.targetId, picked.id, note || null))
              if (r.ok) onResolved(`Hecho: ${picked.label}. La denuncia queda resuelta para los dos administradores.`)
            })()
          }}
        />
      )}
    </article>
  )
}

// Contenido completo (también si está oculto) y cada denuncia por separado, para decidir con todos los datos.
// Fotos del contenido denunciado. La administración también ve las de contenido OCULTO, que el Worker ya no sirve: van siempre con dirección firmada temporal
// (la política de Storage deja leer todo a la administración), pedidas en una sola llamada para todas las fotos.
function ReportedPhotos({ paths: photoPaths }: { paths: string[] }) {
  const { urls, onError } = useCommunityPhotoUrls(photoPaths, 'private')
  if (photoPaths.length === 0) return null
  return (
    <ul className="cadm-photos" aria-label="Fotos del contenido">
      {photoPaths.map((p, i) => (
        <li key={p}>{urls[i] && <img src={urls[i] as string} alt="Foto del contenido denunciado" loading="lazy" width={120} height={120} onError={() => onError(p)} />}</li>
      ))}
    </ul>
  )
}

function ContentDetail({ type, id }: { type: 'post' | 'comment' | 'review'; id: string }) {
  const loader = useCallback(async () => toAdminContent(await adminGetContent(type, id)), [type, id])
  const { data, loading, error, reload } = useAdminData(loader)
  if (loading) return <AdminLoading label="Cargando el contenido…" />
  if (error) return <AdminError message={error} onRetry={reload} />
  if (!data) return <AdminEmpty>Este contenido ya no está disponible.</AdminEmpty>
  // La reseña vive dentro de la publicación de su receta: el enlace abre esa publicación.
  const postId = data.type === 'post' ? data.id : data.postId
  return (
    <div className="cadm-detail">
      {data.title && <p className="cadm-title">{data.title}</p>}
      <p className="muted cadm-small">
        De {data.authorAlias} · {formatMadrid(data.createdAt)} · {contentStatusText(data.status)}
      </p>
      {data.hiddenReason && <p className="cadm-small">Motivo de la ocultación: {data.hiddenReason}</p>}
      {data.type === 'review' && data.stars !== null && <p className="cadm-small">Valoración: {starsLabel(data.stars)}</p>}
      {/* Una reseña es texto plano (sin formato): se pinta tal cual, como texto de React. */}
      {data.body && data.type === 'review' && <p className="cadm-body cadm-plain">{data.body}</p>}
      {data.body && data.type !== 'review' && <CommunityRichText text={data.body} className="cadm-body" />}
      <ReportedPhotos paths={data.photos} />
      {postId && data.status === 'published' && (
        <Link className="link-button cadm-linkbtn" to={paths.post(postId)}>
          Abrir en Comunidad
        </Link>
      )}
      <h5>Denuncias recibidas</h5>
      <ul className="cadm-reportlist">
        {data.reports.map((r, i) => (
          <li key={i}>
            <strong>{reasonLabel(r.reason)}</strong> · {formatMadrid(r.createdAt)}
            {r.detail && <span className="cadm-reportdetail">«{r.detail}»</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
