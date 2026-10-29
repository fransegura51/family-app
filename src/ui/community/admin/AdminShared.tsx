import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ADMIN_TAB_GROUPS, ADMIN_TABS, NOTE_MAX, validateAdminNote, type AdminTabId } from '@/domain/communityAdmin'
import '@/ui/community/communityAdmin.css'

// Piezas comunes del Centro de Mando: barra de pestañas accesible, avisos, botón de «dos toques» y formulario de motivo.

// ---- Estados de carga: nunca una pantalla en blanco.
export function AdminLoading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p className="cadm-loading" role="status">
      {label}
    </p>
  )
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="cadm-error" role="alert">
      <p className="error">{message}</p>
      {onRetry && (
        <button type="button" className="cadm-btn cadm-btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  )
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="cadm-empty muted">{children}</p>
}

// Resultado de la última acción (éxito o error); el lector de pantalla lo anuncia.
export function ActionNotice({ message, error }: { message?: string | null; error?: string | null }) {
  if (error)
    return (
      <p className="cadm-notice cadm-notice-error" role="alert">
        {error}
      </p>
    )
  if (message)
    return (
      <p className="cadm-notice cadm-notice-ok" role="status">
        {message}
      </p>
    )
  return null
}

export function InfoBox({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={`cadm-infobox cadm-infobox-${tone}`} role="note">
      {children}
    </div>
  )
}

// ---- Botón de dos toques: el primero lo «arma» (cambia el texto), el segundo ejecuta; se desarma solo a los 6 segundos.
export function TwoTapButton({
  label,
  armedLabel = 'Toca otra vez para confirmar',
  onConfirm,
  disabled,
  variant = 'primary',
  helpId,
}: {
  label: string
  armedLabel?: string
  onConfirm: () => void
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'secondary'
  /** Marca de la Ayuda (data-help-id) del botón. */
  helpId?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 6000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <span className="cadm-twotap">
      <button
        type="button"
        className={`cadm-btn cadm-btn-${variant}${armed ? ' cadm-btn-armed' : ''}`}
        disabled={disabled}
        data-help-id={helpId}
        onClick={() => {
          if (!armed) {
            setArmed(true)
            return
          }
          setArmed(false)
          onConfirm()
        }}
      >
        {armed ? armedLabel : label}
      </button>
      {armed && (
        <button type="button" className="cadm-btn cadm-btn-ghost" onClick={() => setArmed(false)}>
          Cancelar
        </button>
      )}
    </span>
  )
}

// ---- Formulario de motivo (en línea, dentro de la tarjeta). Valida el motivo ANTES de llamar al servidor.
export function NoteForm({
  title,
  help,
  required,
  noteLabel = 'Motivo',
  confirmLabel,
  danger,
  busy,
  error,
  extra,
  onSubmit,
  onCancel,
}: {
  title: string
  help?: string
  required: boolean
  noteLabel?: string
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  error?: string | null
  // Campo adicional (por ejemplo, una casilla) que se enseña entre el motivo y los botones; su estado lo lleva quien lo pone.
  extra?: ReactNode
  onSubmit: (note: string) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const id = useId()
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <form
      className="cadm-noteform"
      onSubmit={(e) => {
        e.preventDefault()
        const p = validateAdminNote(note, required)
        setProblem(p)
        if (!p) onSubmit(note.trim())
      }}
    >
      <p className="cadm-noteform-title">{title}</p>
      {help && <p className="muted cadm-small">{help}</p>}
      <label htmlFor={`${id}-note`}>
        {noteLabel}
        {required ? ' (obligatorio)' : ' (opcional)'}
      </label>
      <textarea
        id={`${id}-note`}
        ref={ref}
        value={note}
        maxLength={NOTE_MAX}
        rows={3}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
        onChange={(e) => setNote(e.target.value)}
      />
      {problem && (
        <p id={`${id}-problem`} className="error cadm-small" role="alert">
          {problem}
        </p>
      )}
      {error && (
        <p className="error cadm-small" role="alert">
          {error}
        </p>
      )}
      {extra}
      <div className="cadm-actions">
        <button type="submit" className={`cadm-btn ${danger ? 'cadm-btn-danger' : 'cadm-btn-primary'}`} disabled={busy}>
          {busy ? 'Un momento…' : confirmLabel}
        </button>
        <button type="button" className="cadm-btn cadm-btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ---- Barra de pestañas (patrón WAI-ARIA: flechas, Inicio y Fin; solo la pestaña activa entra con Tab). La usan las pestañas del Centro de Mando de Comunidad y las áreas
// del Centro de Administración: `short` es el texto corto que se usa en pantallas estrechas (si no hay, se usa la etiqueta).
export interface TabBarItem<T extends string> {
  id: T
  label: string
  icon: string
  short?: string
}

export function TabBar<T extends string>({
  tabs,
  active,
  onSelect,
  idBase,
  label,
  className = 'cadm-tabs',
  groups,
}: {
  tabs: readonly TabBarItem<T>[]
  active: T
  onSelect: (id: T) => void
  idBase: string
  label: string
  className?: string
  /** Agrupa las pestañas por tema con una etiqueta por grupo (solo visual; el teclado y los roles no cambian). */
  groups?: { label: string; ids: readonly T[] }[]
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const entries: ({ kind: 'label'; label: string } | { kind: 'tab'; tab: TabBarItem<T> })[] = groups
    ? groups.flatMap((g) => [
        { kind: 'label' as const, label: g.label },
        ...g.ids.flatMap((id) => {
          const tab = tabs.find((t) => t.id === id)
          return tab ? [{ kind: 'tab' as const, tab }] : []
        }),
      ])
    : tabs.map((tab) => ({ kind: 'tab' as const, tab }))
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active)
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next < 0) return
    e.preventDefault()
    const t = tabs[next]
    onSelect(t.id)
    refs.current[t.id]?.focus()
  }
  return (
    <div className={className} role="tablist" aria-label={label} onKeyDown={move}>
      {entries.map((entry) => {
        if (entry.kind === 'label') {
          return (
            <span key={`g-${entry.label}`} role="presentation" className="cadm-tab-group-label">
              {entry.label}
            </span>
          )
        }
        const t = entry.tab
        const selected = t.id === active
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={`cadm-tab${selected ? ' active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            <span aria-hidden="true">{t.icon} </span>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function AdminTabs({ active, onSelect, idBase, grouped = false }: { active: AdminTabId; onSelect: (id: AdminTabId) => void; idBase: string; grouped?: boolean }) {
  return <TabBar tabs={ADMIN_TABS} active={active} onSelect={onSelect} idBase={idBase} label="Secciones del Centro de Mando" groups={grouped ? ADMIN_TAB_GROUPS : undefined} />
}
