import { useCallback, useState } from 'react'
import { adminDismissTopicProposals, adminGroupTopicProposals, adminListTopicProposals, adminTopicProposalsToDraft } from '@/data/community'
import { peopleLabel, toTopicProposalGroups, type TopicProposalGroup } from '@/domain/communityAdmin'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox, TwoTapButton } from '@/ui/community/admin/AdminShared'
import { useAdminAction, useAdminData } from '@/ui/community/admin/useAdminData'

// Temas propuestos por las familias (desde «💡 Propón un tema»): agrupados para ver los más pedidos primero. NO se ve quién propone, solo cuántas personas distintas.
// Acciones: juntar a mano propuestas parecidas, convertir un grupo en BORRADOR editorial (entra en «Contenido oficial» como propuesta pendiente: sigue necesitando
// redacción, fuentes y aprobación humana) o descartarlo. Nada se publica solo.
export function TopicProposalsTab({ onChanged }: { onChanged: () => void }) {
  const loader = useCallback(async () => toTopicProposalGroups(await adminListTopicProposals('new')), [])
  const { data, loading, error, reload } = useAdminData(loader)
  const action = useAdminAction()
  const [picked, setPicked] = useState<string[]>([])
  const [mergeLabel, setMergeLabel] = useState('')

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

  return (
    <div className="cadm-stack">
      <InfoBox>
        Ideas de artículos que proponen las familias, de las más pedidas a las menos. Aquí no se ve quién las propone. Convertir un tema en borrador lo añade a «Contenido oficial» como
        propuesta pendiente: hay que redactarlo, añadir fuentes y aprobarlo. Nada se publica automáticamente.
      </InfoBox>
      <ActionNotice message={action.message} />
      {action.error && <AdminError message={action.error} />}
      {loading && <AdminLoading label="Cargando temas propuestos…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && groups.length === 0 && <AdminEmpty>Todavía no hay temas propuestos pendientes de revisar.</AdminEmpty>}
      {pickedGroups.length >= 2 && (
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
                picked={picked.includes(g.groupKey)}
                onToggle={() => toggle(g.groupKey)}
                busy={action.busy}
                onDraft={async (title) => {
                  const res = await action.run(() => adminTopicProposalsToDraft(g.groupKey, title), 'Borrador creado en «Contenido oficial» (pendiente de redactar y aprobar).')
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
  picked,
  onToggle,
  busy,
  onDraft,
  onDismiss,
}: {
  group: TopicProposalGroup
  picked: boolean
  onToggle: () => void
  busy: boolean
  onDraft: (title: string) => void
  onDismiss: () => void
}) {
  const [title, setTitle] = useState(group.label)
  return (
    <article className="cadm-card" aria-label={`Tema propuesto: ${group.label}`}>
      <header className="cadm-card-head">
        <label className="checkbox-label">
          <input type="checkbox" checked={picked} onChange={onToggle} aria-label={`Elegir «${group.label}» para juntar con otros`} />
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
      <label>
        Título del borrador
        <input type="text" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="cadm-actions">
        <button type="button" className="cadm-btn cadm-btn-primary" disabled={busy || title.trim().length < 3} onClick={() => onDraft(title.trim())}>
          Convertir en borrador
        </button>
        <TwoTapButton label="Descartar" variant="danger" disabled={busy} onConfirm={onDismiss} />
      </div>
    </article>
  )
}
