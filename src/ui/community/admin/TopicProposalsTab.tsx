import { useCallback, useState } from 'react'
import {
  adminAddCredit,
  adminDismissTopicProposals,
  adminGroupTopicProposals,
  adminLinkTopicProposals,
  adminListProposals,
  adminListTopicProposals,
  adminTopicProposalsToDraft,
  adminUnlinkTopicProposals,
} from '@/data/community'
import { peopleLabel, toTopicProposalGroups, type TopicProposalGroup } from '@/domain/communityAdmin'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox, TwoTapButton } from '@/ui/community/admin/AdminShared'
import { useAdminAction, useAdminData } from '@/ui/community/admin/useAdminData'

// Temas propuestos por las familias (desde «💡 Propón un tema»): agrupados para ver los más pedidos primero. NO se ve quién propone, solo cuántas personas distintas.
// Acciones: juntar a mano propuestas parecidas, convertir un grupo en BORRADOR editorial (entra en «Contenido oficial» como propuesta pendiente: sigue necesitando
// redacción, fuentes y aprobación humana), enlazarlo con un artículo que ya existe o descartarlo. Ya en borrador: añadir el agradecimiento público (solo con los alias de
// quienes lo aceptaron) o quitar el vínculo si era un error. Al publicarse el artículo, quienes propusieron la idea reciben un aviso privado. Nada se publica solo.
type Status = 'new' | 'drafted'

interface Linkable {
  id: string
  title: string
  status: string
}

async function loadLinkable(): Promise<Linkable[]> {
  const lists = await Promise.all((['proposed', 'approved', 'published'] as const).map((s) => adminListProposals(s)))
  return lists
    .flat()
    .filter((x) => (x.kind === 'article' || x.kind === 'tip') && typeof x.id === 'string' && typeof x.title === 'string')
    .map((x) => ({ id: x.id as string, title: x.title as string, status: String(x.status ?? '') }))
}

const STATUS_LABEL: Record<string, string> = { proposed: 'borrador', approved: 'aprobado', published: 'publicado' }

export function TopicProposalsTab({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<Status>('new')
  const loader = useCallback(async () => toTopicProposalGroups(await adminListTopicProposals(status)), [status])
  const { data, loading, error, reload } = useAdminData(loader)
  const action = useAdminAction()
  const [picked, setPicked] = useState<string[]>([])
  const [mergeLabel, setMergeLabel] = useState('')
  const [linkable, setLinkable] = useState<Linkable[] | null>(null)

  const groups = data ?? []
  const pickedGroups = groups.filter((g) => picked.includes(g.groupKey))
  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]))

  async function merge() {
    const ids = pickedGroups.flatMap((g) => g.ids)
    const res = await action.run(() => adminGroupTopicProposals(ids, mergeLabel.trim() || null), 'Propuestas juntas en un solo tema.')
    if (res.ok) {
      setPicked([])
      setMergeLabel('')
      reload()
    }
  }

  // La lista de artículos a los que se puede enlazar se pide solo cuando se necesita.
  async function ensureLinkable() {
    if (linkable) return
    try {
      setLinkable(await loadLinkable())
    } catch {
      setLinkable([])
    }
  }

  return (
    <div className="cadm-stack">
      <InfoBox>
        Ideas de artículos que proponen las familias, de las más pedidas a las menos. Aquí no se ve quién las propone. Convertir un tema en borrador lo añade a «Contenido oficial» como
        propuesta pendiente: hay que redactarlo, añadir fuentes y aprobarlo. Nada se publica automáticamente. Al publicarse un artículo nacido de una propuesta, quien la envió recibe un
        aviso privado. Al redactar el borrador se aplica el criterio editorial de Pepa (introducción breve, contenido útil y recetas importables desarrolladas una sola vez, en sus fichas).
      </InfoBox>
      <div className="cadm-actions" role="group" aria-label="Estado de las propuestas">
        <button type="button" className={'cadm-btn' + (status === 'new' ? ' cadm-btn-primary' : '')} aria-pressed={status === 'new'} onClick={() => setStatus('new')}>
          Nuevas
        </button>
        <button type="button" className={'cadm-btn' + (status === 'drafted' ? ' cadm-btn-primary' : '')} aria-pressed={status === 'drafted'} onClick={() => setStatus('drafted')}>
          Ya enlazadas a un artículo
        </button>
      </div>
      <ActionNotice message={action.message} />
      {action.error && <AdminError message={action.error} />}
      {loading && <AdminLoading label="Cargando temas propuestos…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && groups.length === 0 && <AdminEmpty>{status === 'new' ? 'Todavía no hay temas propuestos pendientes de revisar.' : 'Ninguna propuesta enlazada todavía.'}</AdminEmpty>}
      {status === 'new' && pickedGroups.length >= 2 && (
        <div className="cadm-card" role="group" aria-label="Juntar temas">
          <p>
            <strong>{pickedGroups.length} temas elegidos.</strong> Puedes juntarlos en uno solo para contar a cuántas personas interesa.
          </p>
          <label>
            Nombre del tema (opcional)
            <input type="text" value={mergeLabel} maxLength={140} onChange={(e) => setMergeLabel(e.target.value)} />
          </label>
          <button type="button" className="cadm-btn cadm-btn-primary" disabled={action.busy} onClick={() => void merge()}>
            Juntar temas
          </button>
        </div>
      )}
      {!loading && groups.length > 0 && (
        <ul className="cadm-list">
          {groups.map((g) => (
            <li key={g.groupKey}>
              <TopicGroupCard
                group={g}
                status={status}
                picked={picked.includes(g.groupKey)}
                onToggle={() => toggle(g.groupKey)}
                busy={action.busy}
                linkable={linkable}
                onNeedLinkable={() => void ensureLinkable()}
                onDraft={async (title) => {
                  const res = await action.run(() => adminTopicProposalsToDraft(g.groupKey, title), 'Borrador creado en «Contenido oficial» (pendiente de redactar y aprobar).')
                  if (res.ok) {
                    onChanged()
                    reload()
                  }
                }}
                onLink={async (itemId) => {
                  const res = await action.run(() => adminLinkTopicProposals(g.groupKey, itemId), 'Propuestas enlazadas con el artículo.')
                  if (res.ok) {
                    onChanged()
                    reload()
                  }
                }}
                onUnlink={async () => {
                  const res = await action.run(() => adminUnlinkTopicProposals(g.groupKey), 'Vínculo quitado: las propuestas vuelven a «nuevas».')
                  if (res.ok) {
                    onChanged()
                    reload()
                  }
                }}
                onCredit={async () => {
                  if (!g.itemId) return
                  const itemId = g.itemId
                  const res = await action.run(() => adminAddCredit(itemId), 'Agradecimiento añadido al final del borrador (hay que aprobarlo de nuevo).')
                  if (res.ok) {
                    onChanged()
                    reload()
                  }
                }}
                onDismiss={async () => {
                  const res = await action.run(() => adminDismissTopicProposals(g.groupKey), 'Tema descartado.')
                  if (res.ok) reload()
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TopicGroupCard({
  group,
  status = 'new',
  picked,
  onToggle,
  busy,
  onDraft,
  onDismiss,
  linkable = null,
  onNeedLinkable,
  onLink,
  onUnlink,
  onCredit,
}: {
  group: TopicProposalGroup
  status?: Status
  picked: boolean
  onToggle: () => void
  busy: boolean
  onDraft: (title: string) => void
  onDismiss: () => void
  linkable?: Linkable[] | null
  onNeedLinkable?: () => void
  onLink?: (itemId: string) => void
  onUnlink?: () => void
  onCredit?: () => void
}) {
  const [title, setTitle] = useState(group.label)
  const [linking, setLinking] = useState(false)
  const [target, setTarget] = useState('')
  const published = group.itemStatus === 'published'
  return (
    <article className="cadm-card" aria-label={`Tema propuesto: ${group.label}`}>
      <header className="cadm-card-head">
        <label className="checkbox-label">
          {status === 'new' && <input type="checkbox" checked={picked} onChange={onToggle} aria-label={`Elegir «${group.label}» para juntar con otros`} />}
          <strong>{group.label}</strong>
        </label>
        <span className="cadm-chip">
          {peopleLabel(group.people)} · {group.topicLabel}
        </span>
      </header>
      {group.texts.length > 1 && (
        <ul>
          {group.texts.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {group.creditPeople > 0 && (
        <p className="muted" style={{ margin: '4px 0' }}>
          💛 {group.creditPeople === 1 ? '1 persona acepta' : `${group.creditPeople} personas aceptan`} que se mencione su alias público si se publica el artículo.
        </p>
      )}
      {status === 'new' ? (
        <>
          <label>
            Título del borrador
            <input type="text" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="cadm-actions">
            <button type="button" className="cadm-btn cadm-btn-primary" disabled={busy || title.trim().length < 3} onClick={() => onDraft(title.trim())}>
              Convertir en borrador
            </button>
            {onLink && (
              <button
                type="button"
                className="cadm-btn"
                aria-expanded={linking}
                disabled={busy}
                onClick={() => {
                  setLinking((v) => !v)
                  onNeedLinkable?.()
                }}
              >
                Enlazar con un artículo
              </button>
            )}
            <TwoTapButton label="Descartar" variant="danger" disabled={busy} onConfirm={onDismiss} />
          </div>
          {linking && onLink && (
            <div className="cadm-actions" role="group" aria-label="Enlazar con un artículo">
              <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Artículo con el que enlazar">
                <option value="">Elige un artículo…</option>
                {(linkable ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title} ({STATUS_LABEL[i.status] ?? i.status})
                  </option>
                ))}
              </select>
              <button type="button" className="cadm-btn cadm-btn-primary" disabled={busy || !target} onClick={() => onLink(target)}>
                Enlazar
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ margin: '4px 0' }}>
            Artículo: <strong>{group.itemTitle ?? 'sin título'}</strong> ({STATUS_LABEL[group.itemStatus ?? ''] ?? group.itemStatus ?? '—'}){group.notified ? ' · ya se ha avisado a quienes lo propusieron' : ''}
          </p>
          <div className="cadm-actions">
            {group.creditPeople > 0 && !published && onCredit && (
              <button type="button" className="cadm-btn cadm-btn-primary" disabled={busy} onClick={onCredit}>
                Añadir agradecimiento al borrador
              </button>
            )}
            {!published && !group.notified && onUnlink && <TwoTapButton label="Quitar vínculo" variant="danger" disabled={busy} onConfirm={onUnlink} />}
          </div>
        </>
      )}
    </article>
  )
}
