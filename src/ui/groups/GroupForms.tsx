import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/data/supabaseClient'
import { deleteForm, listForms, loadFormDetail, type FormDetail } from '@/data/groupForms'
import { listLinkedContacts } from '@/data/groupContacts'
import { groupsErrorMessage, listParticipants, loadGroup } from '@/data/groups'
import type { LinkedContactRow } from '@/domain/contactShare'
import { formatDate } from '@/domain/dateFormat'
import type { FormItem } from '@/domain/groupForms'
import { groupTitle, type GroupItem, type Participant } from '@/domain/groups'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { FormEditor, TemplatePicker, type StartTemplate } from '@/ui/groups/GroupFormBuilder'
import { FormResponses, FormSend } from '@/ui/groups/GroupFormManage'
import '@/ui/groups/groups.css'

const STATUS_LABEL = { borrador: 'Borrador', abierto: 'Abierto', cerrado: 'Cerrado' } as const

/** «Solicitar datos» de un grupo: lista de formularios y alta de uno nuevo (plantilla o desde cero). Ruta: /grupos/<grupo>/formularios */
export function FormsList({ groupId }: { groupId: string }) {
  const navigate = useNavigate()
  const [group, setGroup] = useState<GroupItem | null | undefined>(undefined)
  const [forms, setForms] = useState<FormItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [creating, setCreating] = useState<StartTemplate | 'pick' | null>(null)
  const [defaultRequester, setDefaultRequester] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [g, f, u] = await Promise.all([loadGroup(groupId), listForms(groupId), supabase.auth.getUser()])
      setGroup(g)
      setForms(f)
      if (u.data.user) {
        const { data: p } = await supabase.from('profiles').select('display_name').eq('id', u.data.user.id).maybeSingle()
        setDefaultRequester((p?.display_name as string | undefined) ?? '')
      }
      if (f.length > 0) {
        const { data } = await supabase.from('group_form_responses').select('form_id').in('form_id', f.map((x) => x.id)).limit(20000)
        const c: Record<string, number> = {}
        for (const r of data ?? []) c[r.form_id as string] = (c[r.form_id as string] ?? 0) + 1
        setCounts(c)
      }
      setError(null)
    } catch (e) {
      setError(groupsErrorMessage(e, 'No se han podido cargar los formularios.'))
      setGroup((prev) => (prev === undefined ? null : prev))
    }
  }, [groupId])
  useEffect(() => {
    void reload()
  }, [reload])
  useRealtimeRefresh(['group_forms', 'group_form_responses'], reload, { paused: creating !== null })

  if (group === undefined) return <div className="screen grp-screen">Cargando…</div>
  if (group === null)
    return (
      <div className="screen grp-screen">
        {error && <p className="error">{error}</p>}
        <p>No se encuentra este grupo, o no tienes acceso a él.</p>
        <Link to="/grupos">Volver a Gestión de grupos</Link>
      </div>
    )

  return (
    <div className="screen grp-screen">
      <SectionBreadcrumb subsection={[{ label: 'Inicio', to: '/grupos' }, { label: group.name, to: `/grupos/${group.id}` }, { label: 'Solicitar datos' }]} />
      {error && <p className="error">{error}</p>}
      <h2 className="grp-title">Solicitar datos · {groupTitle(group)}</h2>
      <p className="muted grp-sub">Formularios que se responden desde el móvil, sin instalar PEPA ni registrarse.</p>

      {creating === null && !group.archivedAt && (
        <div className="grp-actions">
          <button type="button" className="primary-button" data-help-id="grupos.formulario-nuevo" onClick={() => setCreating('pick')}>
            ＋ Nuevo formulario
          </button>
        </div>
      )}
      {creating === 'pick' && (
        <div className="grp-card">
          <p style={{ marginTop: 0 }}><strong>¿Cómo quieres empezar?</strong></p>
          <TemplatePicker onPick={(t) => setCreating(t)} />
          <button type="button" className="link-button" onClick={() => setCreating(null)}>
            Cancelar
          </button>
        </div>
      )}
      {creating && creating !== 'pick' && (
        <FormEditor
          groupId={group.id}
          groupName={groupTitle(group)}
          defaultRequester={defaultRequester}
          form={null}
          start={creating}
          onSaved={(id) => navigate(`/grupos/${group.id}/formularios/${id}`)}
          onCancel={() => setCreating(null)}
        />
      )}

      {creating === null && (
        <div style={{ marginTop: 10 }}>
          {forms.map((f) => (
            <Link key={f.id} to={`/grupos/${group.id}/formularios/${f.id}`} className="grp-row">
              <span aria-hidden="true">📋</span>
              <span className="grp-row-main">
                <span className="grp-row-title">{f.title}</span>
                <span className="grp-row-sub" style={{ display: 'block' }}>
                  {STATUS_LABEL[f.status]}
                  {f.deadline ? ` · hasta el ${formatDate(f.deadline)}` : ''} · {counts[f.id] ?? 0} {(counts[f.id] ?? 0) === 1 ? 'respuesta' : 'respuestas'}
                </span>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          ))}
          {forms.length === 0 && <p className="muted">Todavía no hay ningún formulario. Crea uno para pedir correos, documentación de un viaje, tallas, menús…</p>}
        </div>
      )}
    </div>
  )
}

/** Un formulario: editarlo, enviarlo (quién falta) y ver las respuestas. Ruta: /grupos/<grupo>/formularios/<formulario> */
export function FormScreen({ groupId, formId }: { groupId: string; formId: string }) {
  const navigate = useNavigate()
  const [group, setGroup] = useState<GroupItem | null | undefined>(undefined)
  const [detail, setDetail] = useState<FormDetail | null | undefined>(undefined)
  const [people, setPeople] = useState<Participant[]>([])
  const [links, setLinks] = useState<LinkedContactRow[]>([])
  const [userId, setUserId] = useState('')
  const [defaultRequester, setDefaultRequester] = useState('')
  const [tab, setTab] = useState<'enviar' | 'respuestas' | 'editar'>('enviar')
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [g, d, p, l, u] = await Promise.all([loadGroup(groupId), loadFormDetail(formId), listParticipants(groupId), listLinkedContacts(groupId).catch(() => []), supabase.auth.getUser()])
      setGroup(g)
      setDetail(d)
      setPeople(p)
      setLinks(l)
      setUserId(u.data.user?.id ?? '')
      if (u.data.user) {
        const { data: pr } = await supabase.from('profiles').select('display_name').eq('id', u.data.user.id).maybeSingle()
        setDefaultRequester((pr?.display_name as string | undefined) ?? '')
      }
      setError(null)
    } catch (e) {
      setError(groupsErrorMessage(e, 'No se ha podido cargar el formulario.'))
      setDetail((prev) => (prev === undefined ? null : prev))
    }
  }, [groupId, formId])
  useEffect(() => {
    void reload()
  }, [reload])
  useRealtimeRefresh(['group_forms', 'group_form_recipients', 'group_form_responses', 'group_form_deletion_requests', 'group_participants'], reload, { paused: tab === 'editar' })

  if (detail === undefined || group === undefined) return <div className="screen grp-screen">Cargando…</div>
  if (!detail || !group)
    return (
      <div className="screen grp-screen">
        {error && <p className="error">{error}</p>}
        <p>No se encuentra este formulario, o no tienes acceso a él.</p>
        <Link to={`/grupos/${groupId}/formularios`}>Volver a los formularios</Link>
      </div>
    )
  const { form } = detail

  return (
    <div className="screen grp-screen">
      <SectionBreadcrumb
        subsection={[
          { label: 'Inicio', to: '/grupos' },
          { label: group.name, to: `/grupos/${group.id}` },
          { label: 'Solicitar datos', to: `/grupos/${group.id}/formularios` },
          { label: form.title },
        ]}
      />
      {error && <p className="error">{error}</p>}
      <h2 className="grp-title">{form.title}</h2>
      <p className="muted grp-sub">
        {STATUS_LABEL[form.status]} · solicita {form.requesterName}
      </p>
      <div className="grp-tabs" role="tablist">
        {(
          [
            ['enviar', form.status === 'borrador' ? 'Publicar' : 'Enviar y seguimiento'],
            ['respuestas', `Respuestas (${detail.responses.length})`],
            ['editar', 'Editar'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={'chip' + (tab === id ? ' chip-active' : '')} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'enviar' && <FormSend group={group} detail={detail} participants={people} links={links} onChanged={() => void reload()} />}
      {tab === 'respuestas' && <FormResponses group={group} detail={detail} participants={people} userId={userId} onChanged={() => void reload()} />}
      {tab === 'editar' && (
        <>
          {form.status !== 'borrador' && <div className="grp-banner">El formulario ya está publicado. Si cambias las preguntas, quien ya respondió conserva sus respuestas; las preguntas nuevas las verá si vuelve a abrir su enlace.</div>}
          <FormEditor
            groupId={group.id}
            groupName={groupTitle(group)}
            defaultRequester={defaultRequester}
            form={form}
            onSaved={() => {
              setTab('enviar')
              void reload()
            }}
            onCancel={() => setTab('enviar')}
          />
          {detail.responses.length === 0 && (
            <ConfirmButton
              label="Eliminar el formulario"
              confirmMessage="Se borra el formulario y sus enlaces. No tiene respuestas."
              onConfirm={() => {
                void deleteForm(form.id)
                  .then(() => navigate(`/grupos/${group.id}/formularios`))
                  .catch((e) => setError(groupsErrorMessage(e)))
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
