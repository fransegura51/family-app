import { useId } from "react";
import {
  PROPOSAL_FILTERS,
  PROPOSAL_KIND_ICON,
  PROPOSAL_KIND_TEXT,
  type ProposalStatus,
} from "@/domain/communityAdmin";
import {
  NO_FILTER,
  PAGE_SIZE,
  filterCenter,
  pageOf,
  sortCenter,
  type CenterFilter,
  type CenterItem,
} from "@/domain/communityEditorialCenter";
import { AdminEmpty } from "@/ui/community/admin/AdminShared";

// Listas COMPACTAS del Centro Editorial: cada elemento es una tarjeta corta (tipo, título, tema, fecha, estado, versión y «Ver / Gestionar»). El contenido completo (párrafos,
// fichas, opciones…) solo se pinta en la vista de detalle, nunca en la lista. Los filtros y la búsqueda actúan sobre la lista ya cargada; se enseñan 20 y «Ver más» añade otros 20.

export interface ListState {
  status: ProposalStatus;
  filter: CenterFilter;
  shown: number;
}
export const INITIAL_LIST: ListState = {
  status: "proposed",
  filter: NO_FILTER,
  shown: PAGE_SIZE,
};

const KIND_LABEL: Record<CenterItem["kind"], string> = {
  ...PROPOSAL_KIND_TEXT,
};

export function CenterCard({
  item,
  onOpen,
}: {
  item: CenterItem;
  onOpen: (item: CenterItem) => void;
}) {
  const chipClass = item.hasError
    ? "cadm-chip-warn"
    : item.status === "rejected"
      ? "cadm-chip-warn"
      : item.status === "proposed"
        ? ""
        : "cadm-chip-ok";
  return (
    <article
      className="cadm-card cadm-compact"
      aria-label={`${KIND_LABEL[item.kind]}: ${item.title}`}
      data-item-id={item.id}
      data-help-id="comunidad.centro-tarjeta"
    >
      <header className="cadm-compact-head">
        <span className="cadm-compact-kind">
          <span aria-hidden="true">{PROPOSAL_KIND_ICON[item.kind]} </span>
          {KIND_LABEL[item.kind]}
        </span>
        <span className={`cadm-chip ${chipClass}`}>{item.stateText}</span>
      </header>
      <p className="cadm-title cadm-compact-title">{item.title}</p>
      <p className="muted cadm-small cadm-compact-meta">
        {[item.topicLabel, item.dateText, `Versión ${item.version}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {item.hasError && item.errorText && (
        <p className="cadm-notice cadm-notice-error cadm-small" role="note">
          {item.errorText}
        </p>
      )}
      <div className="cadm-actions">
        <button
          type="button"
          className="cadm-btn cadm-btn-secondary"
          aria-label={`Ver o gestionar: ${item.title}`}
          onClick={() => onOpen(item)}
          data-help-id="comunidad.centro-gestionar"
        >
          Ver / Gestionar
        </button>
      </div>
    </article>
  );
}

// Estados (conservados), fechas y búsqueda por título.
export function CenterFilterBar({
  state,
  onChange,
  onStatus,
  counts,
}: {
  state: ListState;
  onChange: (next: ListState) => void;
  onStatus: (s: ProposalStatus) => void;
  counts?: Partial<Record<ProposalStatus, number>>;
}) {
  const id = useId();
  const f = state.filter;
  const setFilter = (patch: Partial<CenterFilter>) =>
    onChange({ ...state, filter: { ...f, ...patch }, shown: PAGE_SIZE });
  const active = f.query !== "" || f.from !== "" || f.to !== "";
  return (
    <div
      className="cadm-center-filters"
      data-help-id="comunidad.centro-filtros"
    >
      <div className="cadm-filter" role="group" aria-label="Qué estado ver">
        {PROPOSAL_FILTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`cadm-chip-button${state.status === s.id ? " active" : ""}`}
            aria-pressed={state.status === s.id}
            onClick={() => onStatus(s.id)}
          >
            {s.label}
            {counts?.[s.id] !== undefined ? ` (${counts[s.id]})` : ""}
          </button>
        ))}
      </div>
      <div className="cadm-center-search">
        <label htmlFor={`${id}-q`}>Buscar por título</label>
        <input
          id={`${id}-q`}
          type="search"
          inputMode="search"
          value={f.query}
          maxLength={80}
          onChange={(e) => setFilter({ query: e.target.value })}
          placeholder="Título o tema"
        />
      </div>
      <details
        className="cadm-center-datefilter"
        open={f.from !== "" || f.to !== "" ? true : undefined}
      >
        <summary>Filtrar por fechas{f.from || f.to ? " (activo)" : ""}</summary>
        <div className="cadm-center-dates">
          <div>
            <label htmlFor={`${id}-from`}>Desde</label>
            <input
              id={`${id}-from`}
              type="date"
              value={f.from}
              max={f.to || undefined}
              onChange={(e) => setFilter({ from: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-to`}>Hasta</label>
            <input
              id={`${id}-to`}
              type="date"
              value={f.to}
              min={f.from || undefined}
              onChange={(e) => setFilter({ to: e.target.value })}
            />
          </div>
        </div>
      </details>
      {active && (
        <button
          type="button"
          className="cadm-btn cadm-btn-ghost"
          onClick={() =>
            onChange({ ...state, filter: NO_FILTER, shown: PAGE_SIZE })
          }
        >
          Quitar filtros
        </button>
      )}
    </div>
  );
}

export function CenterItems({
  items,
  state,
  onChange,
  onOpen,
  emptyText,
  loading,
}: {
  items: CenterItem[];
  state: ListState;
  onChange: (next: ListState) => void;
  onOpen: (item: CenterItem) => void;
  emptyText: string;
  loading?: boolean;
}) {
  const filtered = sortCenter(filterCenter(items, state.filter), state.status);
  const { visible, remaining } = pageOf(filtered, state.shown);
  const filtering =
    state.filter.query !== "" ||
    state.filter.from !== "" ||
    state.filter.to !== "";
  return (
    <>
      {!loading && filtered.length === 0 && (
        <AdminEmpty>
          {filtering ? "Ningún elemento coincide con esos filtros." : emptyText}
        </AdminEmpty>
      )}
      {filtered.length > 0 && (
        <p className="muted cadm-small" role="status">
          {filtered.length} {filtered.length === 1 ? "elemento" : "elementos"}
        </p>
      )}
      <ul className="cadm-list cadm-compact-list">
        {visible.map((i) => (
          <li key={i.id}>
            <CenterCard item={i} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <div className="cadm-actions">
          <button
            type="button"
            className="cadm-btn cadm-btn-secondary"
            onClick={() =>
              onChange({ ...state, shown: state.shown + PAGE_SIZE })
            }
          >
            Ver {Math.min(PAGE_SIZE, remaining)} más ({remaining} sin mostrar)
          </button>
        </div>
      )}
    </>
  );
}
