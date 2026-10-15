import { KIND_ICONS, KIND_LABELS, SECTIONS, type CommunityTopic } from '@/domain/community'
import { ALL_KINDS, coherentFilters, orderLabel, parseKind, parseSection, searchOrders, topicsForSection, type DiscoveryFilters } from '@/domain/communityDiscovery'

// Filtros compartidos por el buscador y Guardados: sección, tema, tipo y (si se pide) orden. Son desplegables nativos: en el móvil abren el selector del
// sistema (cómodo con el pulgar) y los lectores de pantalla los entienden sin más. Cada uno lleva su etiqueta visible.
export function DiscoveryFilterFields({
  idPrefix,
  filters,
  topics,
  withOrder,
  onChange,
}: {
  idPrefix: string
  filters: DiscoveryFilters
  topics: CommunityTopic[] | null
  withOrder: boolean
  onChange: (next: DiscoveryFilters) => void
}) {
  const topicOptions = topics ? topicsForSection(topics, filters.section) : []
  return (
    <div className="community-filter-grid">
      <label htmlFor={`${idPrefix}-section`}>
        Sección
        <select
          id={`${idPrefix}-section`}
          value={filters.section ?? ''}
          onChange={(e) => onChange(coherentFilters({ ...filters, section: parseSection(e.target.value) }, topics))}
        >
          <option value="">Todas</option>
          {SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${idPrefix}-topic`}>
        Tema
        <select id={`${idPrefix}-topic`} value={filters.topic ?? ''} onChange={(e) => onChange({ ...filters, topic: e.target.value || null })} disabled={!topics}>
          <option value="">Todos</option>
          {topicOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${idPrefix}-kind`}>
        Tipo
        <select id={`${idPrefix}-kind`} value={filters.kind ?? ''} onChange={(e) => onChange({ ...filters, kind: parseKind(e.target.value) })}>
          <option value="">Todos</option>
          {ALL_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_ICONS[k]} {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      {withOrder && (
        <label htmlFor={`${idPrefix}-order`}>
          Ordenar por
          <select id={`${idPrefix}-order`} value={filters.order} onChange={(e) => onChange({ ...filters, order: e.target.value as DiscoveryFilters['order'] })}>
            {searchOrders(filters.section).map((o) => (
              <option key={o} value={o}>
                {orderLabel(o, true)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
