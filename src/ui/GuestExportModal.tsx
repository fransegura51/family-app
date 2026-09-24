import { useEffect, useMemo, useState } from 'react'
import { listEventGuestMembersForEvent, listEventGuests, listEventTables } from '@/data/events'
import { DUAL_LOCATION_EVENT_TYPES } from '@/domain/events'
import { errorMessage } from '@/domain/errorMessage'
import {
  buildAlfabeticoView,
  buildFamiliasView,
  buildGuestExportModel,
  buildMesasView,
  guestExportCsv,
  guestExportFilename,
  guestExportReportHtml,
  type GuestExportAttendanceFilter,
  type GuestExportModel,
  type GuestExportOrganizeMode,
} from '@/domain/guestExport'
import type { EventGuest, EventGuestMember, EventTableSeat, FamilyEvent } from '@/domain/types'
import { downloadTextFile } from '@/services/exportFile'
import { openPrintReport } from '@/services/printReport'

// Fase 14E — modelo + vista previa (14E.1), CSV (14E.2), impresión/PDF
// (14E.3). Compartir llega en 14E.4, sobre este mismo modal y el mismo
// modelo canónico de domain/guestExport.ts — nunca una lógica distinta
// por formato. EventosScreen.tsx solo abre/cierra este modal y le pasa
// el evento — la lógica de exportación vive aquí, no allí.
const ORGANIZE_OPTIONS: { value: GuestExportOrganizeMode; label: string }[] = [
  { value: 'mesas', label: '🪑 Mesas' },
  { value: 'familias', label: '👨‍👩‍👧 Familias' },
  { value: 'alfabetico', label: '🔤 Alfabético' },
]

const ATTENDANCE_OPTIONS: { value: GuestExportAttendanceFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'confirmados', label: 'Confirmados' },
]

export function GuestExportModal({ event, onClose }: { event: FamilyEvent; onClose: () => void }) {
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [members, setMembers] = useState<EventGuestMember[]>([])
  const [tables, setTables] = useState<EventTableSeat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [organize, setOrganize] = useState<GuestExportOrganizeMode>('mesas')
  const [attendance, setAttendance] = useState<GuestExportAttendanceFilter>('todos')

  useEffect(() => {
    setLoading(true)
    Promise.all([listEventGuests(event.id), listEventGuestMembersForEvent(event.id), listEventTables(event.id)])
      .then(([g, m, t]) => {
        setGuests(g)
        setMembers(m)
        setTables(t)
      })
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los invitados')))
      .finally(() => setLoading(false))
  }, [event.id])

  const membersByGuestId = useMemo(() => {
    const map: Record<string, EventGuestMember[]> = {}
    for (const m of members) (map[m.guestId] ??= []).push(m)
    return map
  }, [members])

  const model: GuestExportModel = useMemo(
    () => buildGuestExportModel({ guests, membersByGuestId, tables }, attendance),
    [guests, membersByGuestId, tables, attendance],
  )

  // invite_scope solo aporta información en eventos con ceremonia +
  // celebración separadas — mismo criterio que ya usa GuestsSection
  // para decidir si enseña ese <select>.
  const showInviteScope = DUAL_LOCATION_EVENT_TYPES.includes(event.type)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            📤 Exportar invitados
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Organizar por
        </p>
        <div className="filter-row">
          {ORGANIZE_OPTIONS.map((o) => (
            <button key={o.value} type="button" className={'chip' + (organize === o.value ? ' chip-active' : '')} onClick={() => setOrganize(o.value)}>
              {o.label}
            </button>
          ))}
        </div>

        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          Incluir
        </p>
        <div className="filter-row">
          {ATTENDANCE_OPTIONS.map((o) => (
            <button key={o.value} type="button" className={'chip' + (attendance === o.value ? ' chip-active' : '')} onClick={() => setAttendance(o.value)}>
              {o.label}
            </button>
          ))}
        </div>

        <p className="muted" style={{ fontSize: 13, marginTop: 12, marginBottom: 4 }}>
          Vista previa
        </p>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : guests.length === 0 ? (
          <p className="muted">Todavía no hay invitados que exportar.</p>
        ) : (
          <>
            <GuestExportPreview model={model} organize={organize} showInviteScope={showInviteScope} />
            <div className="form-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() =>
                  openPrintReport(
                    guestExportReportHtml(
                      model,
                      {
                        eventTitle: event.title,
                        organize,
                        attendance,
                        generatedAtLabel: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
                      },
                      showInviteScope,
                    ),
                  )
                }
              >
                📄 Imprimir / PDF
              </button>
              <button
                type="button"
                onClick={() => downloadTextFile(guestExportFilename(event.title, organize, 'csv'), guestExportCsv(model, organize), 'text/csv;charset=utf-8', true)}
              >
                📊 CSV
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function GuestExportPreview({ model, organize, showInviteScope }: { model: GuestExportModel; organize: GuestExportOrganizeMode; showInviteScope: boolean }) {
  if (organize === 'mesas') return <MesasPreview model={model} />
  if (organize === 'familias') return <FamiliasPreview model={model} showInviteScope={showInviteScope} />
  return <AlfabeticoPreview model={model} />
}

function MesasPreview({ model }: { model: GuestExportModel }) {
  const view = useMemo(() => buildMesasView(model), [model])
  if (view.tableGroups.length === 0 && view.pending.length === 0) return <p className="muted">Nada que mostrar con este filtro.</p>
  return (
    <div className="event-list" style={{ maxHeight: '45vh', overflowY: 'auto' }}>
      {view.tableGroups.map((t, i) => (
        <div key={i} className="card task-card">
          <div className="task-card-main" style={{ width: '100%' }}>
            <strong style={t.overCapacity ? { color: '#b45309' } : undefined}>
              {t.tableName}
              {t.capacity != null ? ` — ${t.occupied}/${t.capacity}` : ` — ${t.occupied}`}
              {t.overCapacity ? ' · ⚠️ Aforo superado' : ''}
            </strong>
            {t.entries.length === 0 ? (
              <p className="muted" style={{ margin: '2px 0' }}>
                Sin invitados asignados.
              </p>
            ) : (
              t.entries.map((e, i) => (
                <p key={i} className="muted" style={{ margin: '2px 0' }}>
                  {e.label}
                </p>
              ))
            )}
          </div>
        </div>
      ))}
      {view.pending.length > 0 && (
        <div className="card task-card">
          <div className="task-card-main" style={{ width: '100%' }}>
            <strong>⚠️ Pendientes de asignar</strong>
            {view.pending.map((p, i) => (
              <p key={i} className="muted" style={{ margin: '2px 0' }}>
                <strong>{p.groupName}</strong> — {p.lines.join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FamiliasPreview({ model, showInviteScope }: { model: GuestExportModel; showInviteScope: boolean }) {
  const view = useMemo(() => buildFamiliasView(model, showInviteScope), [model, showInviteScope])
  if (view.groups.length === 0) return <p className="muted">Nada que mostrar con este filtro.</p>
  return (
    <div className="event-list" style={{ maxHeight: '45vh', overflowY: 'auto' }}>
      {view.groups.map((g, i) => (
        <div key={i} className="card task-card">
          <div className="task-card-main" style={{ width: '100%' }}>
            <strong>{g.groupName}</strong>
            <p className="muted" style={{ margin: '2px 0' }}>
              Invitados: {g.declaredTotal}
              {g.confirmedTotal != null ? ` · Confirmados: ${g.confirmedTotal}` : ''} · {g.rsvpStatusLabel}
              {g.inviteScopeLabel ? ` · ${g.inviteScopeLabel}` : ''}
            </p>
            {g.namedLines.map((l, j) => (
              <p key={j} className="muted" style={{ margin: '2px 0' }}>
                {l.text}
              </p>
            ))}
            {g.pendingLines.map((l, j) => (
              <p key={j} className="muted" style={{ margin: '2px 0' }}>
                {l}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AlfabeticoPreview({ model }: { model: GuestExportModel }) {
  const view = useMemo(() => buildAlfabeticoView(model), [model])
  if (view.entries.length === 0 && view.pending.length === 0) return <p className="muted">Nada que mostrar con este filtro.</p>
  return (
    <div className="event-list" style={{ maxHeight: '45vh', overflowY: 'auto' }}>
      {view.entries.map((e, i) => (
        <p key={i} className="muted" style={{ margin: '4px 0' }}>
          {e.text}
        </p>
      ))}
      {view.pending.length > 0 && (
        <div className="card task-card" style={{ marginTop: 8 }}>
          <div className="task-card-main" style={{ width: '100%' }}>
            <strong>Pendientes de identificar</strong>
            {view.pending.map((p, i) => (
              <p key={i} className="muted" style={{ margin: '2px 0' }}>
                <strong>{p.groupName}</strong> — {p.lines.join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
