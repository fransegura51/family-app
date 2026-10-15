import { useCallback, useState } from 'react'
import { adminHandleRemoval, adminListHidden, adminListReadmissions, adminListRemovalRequests, adminResolveReadmission, adminSetVisibility } from '@/data/community'
import {
  REMOVAL_STATUS_TEXT,
  TARGET_TYPE_TEXT,
  formatMadrid,
  removalScopeText,
  toHiddenItems,
  toReadmissions,
  toRemovalRequests,
  type HiddenItem,
  type Readmission,
  type RemovalRequest,
  type RemovalStatus,
} from '@/domain/communityAdmin'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox, NoteForm } from '@/ui/community/admin/AdminShared'
import { useAdminAction, useAdminData } from '@/ui/community/admin/useAdminData'

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Ocultos: se pueden restaurar (cualquiera de los dos administradores puede deshacer lo del otro, sin segunda aprobación).
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export function HiddenPanel({ onChanged }: { onChanged: () => void }) {
  const loader = useCallback(async () => toHiddenItems(await adminListHidden()), [])
  const { data, loading, error, reload, setData } = useAdminData(loader)
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <div className="cadm-stack">
      <InfoBox>
        Aquí están las publicaciones y comentarios ocultos. Lo que se oculta solo (varias denuncias graves) es provisional y espera tu revisión: para confirmarlo, resuelve su
        denuncia con «Ocultar»; para devolverlo, usa «Restaurar». Lo restaurado vuelve a verse para todos y queda en el historial.
      </InfoBox>
      <ActionNotice message={notice} />
      {loading && <AdminLoading label="Cargando contenido oculto…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && data && data.length === 0 && <AdminEmpty>No hay contenido oculto.</AdminEmpty>}
      {!loading && data && (
        <ul className="cadm-list">
          {data.map((h) => (
            <li key={h.key}>
              <HiddenCard
                item={h}
                onRestored={() => {
                  setNotice('Contenido restaurado: ya se ve de nuevo.')
                  setData((prev) => (prev ? prev.filter((x) => x.key !== h.key) : prev))
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

export function HiddenCard({ item, onRestored }: { item: HiddenItem; onRestored: () => void }) {
  const [open, setOpen] = useState(false)
  const action = useAdminAction()
  return (
    <article className="cadm-card" aria-label={`${TARGET_TYPE_TEXT[item.type]} oculta`}>
      <header className="cadm-card-head">
        <h4>
          {TARGET_TYPE_TEXT[item.type]} de {item.authorAlias}
        </h4>
        {item.automatic && <span className="cadm-chip cadm-chip-warn">Ocultado solo · pendiente de revisar</span>}
      </header>
      {item.title && <p className="cadm-excerpt">{item.title}</p>}
      <p className="muted cadm-small">
        Oculto desde {formatMadrid(item.hiddenAt)}
        {item.reason && !item.automatic ? ` · Motivo: ${item.reason}` : ''}
      </p>
      {!open ? (
        <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setOpen(true)}>
          Restaurar
        </button>
      ) : (
        <NoteForm
          title="Restaurar este contenido"
          help="Volverá a verse para todos."
          required
          confirmLabel="Confirmar: restaurar"
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setOpen(false)
            action.clear()
          }}
          onSubmit={(note) => {
            void (async () => {
              const r = await action.run(() => adminSetVisibility(item.type, item.id, true, note))
              if (r.ok) onRestored()
            })()
          }}
        />
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Readmisiones: personas cuya expulsión de 30 días ha terminado y piden volver.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export function ReadmissionsPanel({ onChanged }: { onChanged: () => void }) {
  const loader = useCallback(async () => toReadmissions(await adminListReadmissions()), [])
  const { data, loading, error, reload, setData } = useAdminData(loader)
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <div className="cadm-stack">
      <InfoBox>
        Tres advertencias llevan a una expulsión de Comunidad de 30 días (la cuenta de PEPA y los datos de la familia no se tocan). Cuando termina, la persona puede pedir volver y lo
        decides tú. Si la apruebas, vuelve a participar y se recuperan sus medallas legítimas.
      </InfoBox>
      <ActionNotice message={notice} />
      {loading && <AdminLoading label="Cargando peticiones de readmisión…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && data && data.length === 0 && <AdminEmpty>No hay peticiones de readmisión pendientes.</AdminEmpty>}
      {!loading && data && (
        <ul className="cadm-list">
          {data.map((r) => (
            <li key={r.banId}>
              <ReadmissionCard
                item={r}
                onDone={(text) => {
                  setNotice(text)
                  setData((prev) => (prev ? prev.filter((x) => x.banId !== r.banId) : prev))
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

export function ReadmissionCard({ item, onDone }: { item: Readmission; onDone: (message: string) => void }) {
  const [choice, setChoice] = useState<'approve' | 'reject' | null>(null)
  const action = useAdminAction()
  return (
    <article className="cadm-card" aria-label={`Readmisión de ${item.alias}`}>
      <header className="cadm-card-head">
        <h4>{item.alias}</h4>
        <span className="cadm-chip">Pide volver</span>
      </header>
      <p className="muted cadm-small">
        Pidió volver el {formatMadrid(item.requestedAt)}. Su expulsión terminaba el {formatMadrid(item.endsAt, 'date')}.
      </p>
      {item.reason && <p className="cadm-small">Motivo de la expulsión: {item.reason}</p>}
      {!choice ? (
        <div className="cadm-actions" role="group" aria-label={`Decidir la readmisión de ${item.alias}`}>
          <button type="button" className="cadm-btn cadm-btn-primary" onClick={() => setChoice('approve')}>
            Aprobar
          </button>
          <button type="button" className="cadm-btn cadm-btn-danger" onClick={() => setChoice('reject')}>
            Rechazar
          </button>
        </div>
      ) : (
        <NoteForm
          title={choice === 'approve' ? `Aprobar la readmisión de ${item.alias}` : `Rechazar la readmisión de ${item.alias}`}
          help={choice === 'approve' ? 'La persona vuelve a poder participar y se le avisa.' : 'Sigue sin poder participar; podrá volver a pedirlo más adelante. Se le avisa.'}
          required
          noteLabel="Nota"
          confirmLabel={choice === 'approve' ? 'Confirmar: aprobar' : 'Confirmar: rechazar'}
          danger={choice === 'reject'}
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setChoice(null)
            action.clear()
          }}
          onSubmit={(note) => {
            void (async () => {
              const r = await action.run(() => adminResolveReadmission(item.banId, choice === 'approve', note))
              if (r.ok) onDone(choice === 'approve' ? `Readmisión de ${item.alias} aprobada.` : `Readmisión de ${item.alias} rechazada.`)
            })()
          }}
        />
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Solicitudes de eliminación de contenido (derecho de supresión): quien pide que se borre lo suyo.
// ---------------------------------------------------------------------------------------------------------------------------------------------------
export function RemovalsPanel({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<RemovalStatus>('open')
  const loader = useCallback(async () => toRemovalRequests(await adminListRemovalRequests(status)), [status])
  const { data, loading, error, reload, setData } = useAdminData(loader)
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <div className="cadm-stack">
      <InfoBox tone="warn">
        Cuando alguien pide borrar su contenido, aprobarlo lo elimina de forma definitiva (texto y fotos) y NO se puede deshacer. Si lo rechazas, la persona recibe tu nota.
      </InfoBox>
      <div className="cadm-filter" role="group" aria-label="Qué solicitudes ver">
        {(Object.keys(REMOVAL_STATUS_TEXT) as RemovalStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`cadm-chip-button${status === s ? ' active' : ''}`}
            aria-pressed={status === s}
            onClick={() => {
              setStatus(s)
              setNotice(null)
            }}
          >
            {REMOVAL_STATUS_TEXT[s]}
          </button>
        ))}
      </div>
      <ActionNotice message={notice} />
      {loading && <AdminLoading label="Cargando solicitudes…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && data && data.length === 0 && <AdminEmpty>No hay solicitudes en este apartado.</AdminEmpty>}
      {!loading && data && (
        <ul className="cadm-list">
          {data.map((r) => (
            <li key={r.id}>
              <RemovalCard
                item={r}
                onDone={(text) => {
                  setNotice(text)
                  setData((prev) => (prev ? prev.filter((x) => x.id !== r.id) : prev))
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

export function RemovalCard({ item, onDone }: { item: RemovalRequest; onDone: (message: string) => void }) {
  const [choice, setChoice] = useState<'approve' | 'reject' | null>(null)
  const action = useAdminAction()
  return (
    <article className="cadm-card" aria-label="Solicitud de eliminación de contenido">
      <header className="cadm-card-head">
        <h4>{item.alias ?? 'Persona sin perfil'}</h4>
        <span className="cadm-chip">{REMOVAL_STATUS_TEXT[item.status]}</span>
      </header>
      <p>{removalScopeText(item)}</p>
      {item.detail && <p className="cadm-excerpt">«{item.detail}»</p>}
      <p className="muted cadm-small">Pedido el {formatMadrid(item.createdAt)}</p>
      {item.status === 'open' &&
        (!choice ? (
          <div className="cadm-actions" role="group" aria-label="Decidir la solicitud">
            <button type="button" className="cadm-btn cadm-btn-danger" onClick={() => setChoice('approve')}>
              Eliminar el contenido
            </button>
            <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setChoice('reject')}>
              Rechazar
            </button>
          </div>
        ) : (
          <NoteForm
            title={choice === 'approve' ? 'Eliminar el contenido pedido (definitivo)' : 'Rechazar la solicitud'}
            help={choice === 'approve' ? 'Se borra para siempre y se avisa a la persona.' : 'Se avisa a la persona y se le enseña tu nota.'}
            required
            noteLabel="Nota"
            confirmLabel={choice === 'approve' ? 'Confirmar: eliminar' : 'Confirmar: rechazar'}
            danger={choice === 'approve'}
            busy={action.busy}
            error={action.error}
            onCancel={() => {
              setChoice(null)
              action.clear()
            }}
            onSubmit={(note) => {
              void (async () => {
                const r = await action.run(() => adminHandleRemoval(item.id, choice === 'approve', note))
                if (r.ok) onDone(choice === 'approve' ? 'Contenido eliminado.' : 'Solicitud rechazada.')
              })()
            }}
          />
        ))}
    </article>
  )
}
