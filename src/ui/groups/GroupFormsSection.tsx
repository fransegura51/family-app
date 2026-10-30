import { Link } from 'react-router-dom'
import { formatDate } from '@/domain/dateFormat'
import { formStatusLabel, todayIn } from '@/domain/groupForms'
import type { FormSummary } from '@/data/groupForms'

/** Una solicitud de datos en forma compacta: título, estado, fecha límite, respuestas recibidas y quién falta. Abre el formulario real (no hay copias). */
export function FormRow({ groupId, summary }: { groupId: string; summary: FormSummary }) {
  const { form, responses, pending } = summary
  const status = formStatusLabel(form, todayIn(new Date()))
  const base = `/grupos/${groupId}/formularios/${form.id}`
  return (
    <div className="grp-card grp-form-row" style={{ marginBottom: 8 }}>
      <Link to={base} className="grp-row" style={{ marginBottom: 4 }}>
        <span aria-hidden="true">📋</span>
        <span className="grp-row-main">
          <span className="grp-row-title">{form.title}</span>
          <span className="grp-row-sub" style={{ display: 'block' }}>
            {form.deadline ? `Fecha límite ${formatDate(form.deadline)} · ` : ''}
            {responses} {responses === 1 ? 'respuesta' : 'respuestas'}
            {pending !== null ? ` · ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}` : ''}
          </span>
        </span>
        <span className="grp-status">{status}</span>
      </Link>
      <div className="grp-chips">
        <Link className="chip" to={`${base}?pestana=respuestas`}>
          Respuestas
        </Link>
        {status !== 'Cerrado' && (
          <Link className="chip" to={`${base}?pestana=enviar`}>
            {form.status === 'borrador' ? 'Publicar' : 'Compartir o cerrar'}
          </Link>
        )}
        {status !== 'Cerrado' && (
          <Link className="chip" to={`${base}?pestana=editar`}>
            Editar
          </Link>
        )}
      </div>
    </div>
  )
}

/** Sección «Solicitudes de datos» de la ficha del grupo (como Botes, Eventos y Listas). Crear nuevas sigue siendo «＋ Añadir → Solicitar datos». */
export function FormsSection({ groupId, summaries }: { groupId: string; summaries: FormSummary[] }) {
  if (summaries.length === 0) return null
  return (
    <div data-help-id="grupos.solicitudes-datos">
      <p className="grp-section">Solicitudes de datos</p>
      {summaries.map((s) => (
        <FormRow key={s.form.id} groupId={groupId} summary={s} />
      ))}
    </div>
  )
}
