import { useEffect, useId, useRef, useState } from 'react'
import { ARTICLE_CRITERIA, checkArticleCriteria } from '@/domain/communityArticleCriteria'
import { Link } from 'react-router-dom'
import { adminApproveProposal, adminEditProposal, adminRejectProposal, adminReschedulePoll } from '@/data/community'
import { scheduleItem } from '@/data/communityEditorial'
import {
  canRevise,
  dayShort,
  scheduledApprovalText,
  slotLine,
} from '@/domain/communityEditorial'
import {
  MAX_POLL_OPTIONS,
  PROPOSAL_KIND_ICON,
  PROPOSAL_KIND_TEXT,
  PROPOSAL_STATUS_TEXT,
  approvalLine,
  approveResultText,
  nextMenuSaturdays,
  pollRescheduleText,
  batchWeekText,
  buildProposalPayload,
  formatMadrid,
  proposalToForm,
  safeSourceUrl,
  validateProposalForm,
  type ArticleSource,
  type Proposal,
  type ProposalForm,
} from '@/domain/communityAdmin'
import type { CommunityTopic } from '@/domain/community'
import { SECTIONS } from '@/domain/community'
import { CommunityRichText } from '@/ui/community/CommunityRichText'
import { paths } from '@/ui/community/communityNav'
import { ActionNotice, NoteForm, TwoTapButton } from '@/ui/community/admin/AdminShared'
import { ScheduleForm, isScheduled, publishAtOf } from '@/ui/community/admin/ScheduleForm'
import { recipeCardsOf } from '@/domain/communityEditorialRecipes'
import { RecipeCardsEditor, RecipeCardsList } from '@/ui/community/admin/EditorialRecipes'
import { RevisePanel } from '@/ui/community/admin/RevisePanel'
import { useAdminAction } from '@/ui/community/admin/useAdminData'

// Tarjeta de una propuesta oficial (consejo, encuesta o artículo): contenido completo y todas sus acciones. Se enseña en la vista de detalle del Centro Editorial.
export function topicName(topics: CommunityTopic[], id: string): string {
  return topics.find((t) => t.id === id)?.label ?? id.replace(/-/g, ' ')
}

export function ProposalCard({
  proposal: p,
  topics,
  onDone,
  focus = null,
}: {
  proposal: Proposal
  topics: CommunityTopic[]
  onDone: (message: string, removeFromList: boolean) => void
  /** Cambia cuando «Revisar» (programa de la semana) pide abrir esta tarjeta: se desplaza hasta ella y se resalta. */
  focus?: number | null
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'reject' | 'revise' | 'schedule' | 'poll-schedule'>('view')
  const action = useAdminAction()
  const cardRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (focus == null) return
    cardRef.current?.scrollIntoView?.({ block: 'start' })
    cardRef.current?.focus({ preventScroll: true })
  }, [focus])
  const sectionTitle = SECTIONS.find((s) => s.id === p.section)?.title ?? p.section
  const approval = approvalLine(p)
  const editable = p.status === 'proposed' || p.status === 'approved'
  // Un artículo práctico del programa semanal (payload.editorial) puede aprobarse sin fuentes externas; uno con datos externos las sigue exigiendo.
  const noSources = p.kind === 'article' && p.payload.sources.length === 0 && !p.payload.editorial
  const programArticle = p.kind === 'article' && p.slotDate !== null
  const slot = slotLine(p.slotDate, p.tier, p.kind)
  const revisable = canRevise({ kind: p.kind, status: p.status, publishedPostId: p.publishedPostId })

  return (
    <article
      ref={cardRef}
      tabIndex={focus != null ? -1 : undefined}
      className={`cadm-card${focus != null ? ' cadm-card-focus' : ''}`}
      aria-label={`${PROPOSAL_KIND_TEXT[p.kind]}: ${p.title}`}
      data-proposal-id={p.id}
    >
      <header className="cadm-card-head">
        <h4>
          <span aria-hidden="true">{PROPOSAL_KIND_ICON[p.kind]} </span>
          {PROPOSAL_KIND_TEXT[p.kind]}
        </h4>
        <span className={`cadm-chip ${p.status === 'rejected' ? 'cadm-chip-warn' : p.status === 'proposed' ? '' : 'cadm-chip-ok'}`}>{PROPOSAL_STATUS_TEXT[p.status]}</span>
      </header>
      <p className="muted cadm-small">
        {sectionTitle} · Tema: {topicName(topics, p.topicId)} · {batchWeekText(p.batchWeek)} · Versión {p.version}
      </p>
      {(slot || p.generated) && (
        <p className="cadm-small cadm-slot">
          {slot}
          {slot && p.generated ? ' · ' : ''}
          {p.generated ? 'Borrador preparado por Pepa (IA)' : ''}
        </p>
      )}
      <p className="cadm-title">{p.title}</p>
      {mode !== 'edit' && <ProposalContent proposal={p} />}
      {noSources && p.status !== 'published' && (
        <p className="cadm-notice cadm-notice-error" role="note">
          Este artículo no tiene fuentes externas, así que no se puede aprobar. Añade al menos una fuente fiable al editarlo o recházalo.
        </p>
      )}

      {approval && <p className="cadm-small cadm-approval">{approval}</p>}
      {p.status === 'approved' && p.publishAt && <p className="cadm-small">Se publicará el {formatMadrid(p.publishAt, 'full')} (hora peninsular).</p>}
      {p.status === 'approved' && p.publishError && (
        <p className="cadm-notice cadm-notice-error" role="alert">
          La publicación programada ha fallado: {p.publishError}
        </p>
      )}
      {p.status === 'rejected' && p.reviewNote && <p className="cadm-small">Motivo del rechazo: {p.reviewNote}</p>}
      {p.status === 'published' && p.publishedPostId && (
        <Link className="link-button cadm-linkbtn" to={paths.post(p.publishedPostId)}>
          Ver la publicación en Comunidad
        </Link>
      )}

      <ActionNotice error={mode === 'view' ? action.error : null} />

      {editable && mode === 'view' && (
        <div className="cadm-actions" role="group" aria-label="Qué hacer con esta propuesta">
          <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setMode('edit')}>
            Editar
          </button>
          {revisable && (
            <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setMode('revise')} data-help-id="comunidad.revise-open">
              Rectificar con Pepa
            </button>
          )}
          {p.status === 'approved' && p.kind === 'article' && p.publishAt && (
            <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setMode('schedule')} data-help-id="comunidad.centro-reprogramar">
              Reprogramar
            </button>
          )}
          {p.status === 'approved' && p.kind === 'poll' && p.publishAt && (
            <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setMode('poll-schedule')} data-help-id="comunidad.centro-reprogramar">
              Reprogramar
            </button>
          )}
          {p.status === 'proposed' && (
            <TwoTapButton
              helpId="comunidad.centro-aprobar"
              label="Aprobar"
              armedLabel={p.kind === 'poll' ? 'Toca otra vez: aprobar y programar' : programArticle ? 'Toca otra vez: aprobar y programar para su día' : 'Toca otra vez: aprobar y publicar ya'}
              disabled={action.busy}
              onConfirm={() => {
                void (async () => {
                  const r = await action.run(() => adminApproveProposal(p.id))
                  if (r.ok) onDone(programArticle && isScheduled(r.result) ? scheduledApprovalText(publishAtOf(r.result)) : approveResultText(p.kind, r.result), true)
                })()
              }}
            />
          )}
          <button type="button" className="cadm-btn cadm-btn-danger" onClick={() => setMode('reject')}>
            Rechazar
          </button>
        </div>
      )}
      {editable && mode === 'view' && p.status === 'proposed' && (
        <p className="muted cadm-small">
          {p.kind === 'poll'
            ? 'Al aprobar, la encuesta NO se publica al momento: se programa y sale sola el próximo sábado a las 10:00 y cierra el domingo a las 17:00 (hora peninsular). Aprobar el mismo sábado a las 10:00 o más tarde la deja para el sábado siguiente.'
            : programArticle
              ? `Al aprobar, el artículo NO se publica al momento: se programa para el ${dayShort(p.slotDate)} a las 10:00 (hora de Madrid). Podrás reprogramarlo.`
              : 'Al aprobar, se publica al momento, con la identidad oficial de Pepa o de Equipo PEPA.'}
        </p>
      )}
      {editable && mode === 'view' && p.status === 'approved' && <p className="muted cadm-small">Si la editas, hay que aprobarla de nuevo.</p>}

      {mode === 'revise' && revisable && (
        <RevisePanel itemId={p.id} kind={p.kind as 'article' | 'poll'} section={p.section} onClose={() => setMode('view')} onChanged={(message) => onDone(message, p.status === 'approved')} />
      )}
      {mode === 'schedule' && p.publishAt && (
        <ScheduleForm
          current={p.publishAt}
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setMode('view')
            action.clear()
          }}
          onSave={(iso) => {
            void (async () => {
              const r = await action.run(() => scheduleItem(p.id, iso))
              if (r.ok) {
                setMode('view')
                onDone(scheduledApprovalText(iso), false)
              }
            })()
          }}
        />
      )}

      {mode === 'poll-schedule' && (
        <PollRescheduleForm
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setMode('view')
            action.clear()
          }}
          onSave={(iso) => {
            void (async () => {
              const r = await action.run(() => adminReschedulePoll(p.id, iso))
              if (r.ok) {
                setMode('view')
                onDone(pollRescheduleText(r.result), false)
              }
            })()
          }}
        />
      )}

      {mode === 'edit' && (
        <ProposalEditForm
          proposal={p}
          topics={topics.filter((t) => t.section === p.section)}
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setMode('view')
            action.clear()
          }}
          onSave={(form) => {
            void (async () => {
              const r = await action.run(() => adminEditProposal(p.id, form.title.trim(), form.body, buildProposalPayload(p.kind, p.payload, form), form.topicId || null))
              if (r.ok) {
                setMode('view')
                onDone(p.status === 'approved' ? `Guardado como versión ${r.result}. Como estaba aprobada, vuelve a «Pendientes»: hay que aprobarla de nuevo.` : `Guardado como versión ${r.result}.`, p.status === 'approved')
              }
            })()
          }}
        />
      )}
      {mode === 'reject' && (
        <NoteForm
          title="Rechazar esta propuesta"
          help="No se publicará. Queda guardada en «Rechazadas» con tu motivo."
          required
          confirmLabel="Confirmar: rechazar"
          danger
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setMode('view')
            action.clear()
          }}
          onSubmit={(note) => {
            void (async () => {
              const r = await action.run(() => adminRejectProposal(p.id, note))
              if (r.ok) onDone('Propuesta rechazada.', true)
            })()
          }}
        />
      )}
    </article>
  )
}

// Lo que se publicaría: texto, opciones de la encuesta y, en los artículos, fuentes y metodología.
export function ProposalContent({ proposal: p }: { proposal: Proposal }) {
  return (
    <div className="cadm-proposal">
      {p.body && <CommunityRichText text={p.body} className="cadm-body" />}
      {(p.kind === 'article' || p.kind === 'tip') && <RecipeCardsList recipes={recipeCardsOf(p.payload.raw)} />}
      {p.kind === 'poll' && (
        <>
          <h5>Opciones de la encuesta</h5>
          <ol className="cadm-options">
            {p.payload.options.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ol>
        </>
      )}
      {p.kind === 'article' && (
        <>
          <h5>Fuentes externas</h5>
          {p.payload.sources.length === 0 && <p className="muted cadm-small">Sin fuentes.</p>}
          <ul className="cadm-sources">
            {p.payload.sources.map((s, i) => {
              const href = safeSourceUrl(s.url)
              return (
                <li key={i}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                      {s.title || s.url}
                    </a>
                  ) : (
                    <span>{s.title || 'Fuente sin enlace válido'}</span>
                  )}
                  {s.publisher ? ` · ${s.publisher}` : ''}
                  {s.date ? ` · ${s.date}` : ''}
                </li>
              )
            })}
          </ul>
          {p.payload.methodology && (
            <>
              <h5>Metodología</h5>
              <p className="cadm-small">{p.payload.methodology}</p>
            </>
          )}
          {p.payload.comparison && (
            <>
              <h5>Comparación y contexto</h5>
              <p className="cadm-small">{p.payload.comparison}</p>
            </>
          )}
        </>
      )}
    </div>
  )
}

// Número de fichas de recetas importables que lleva la propuesta (el texto no debe repetirlas).
function recipeCardCount(p: Proposal): number {
  const r = (p.payload as { recipes?: unknown } | null)?.recipes
  return Array.isArray(r) ? r.length : 0
}

// Criterio editorial permanente (ayuda, nunca bloquea): los puntos acordados y avisos sencillos sobre el texto que se está escribiendo.
function EditorialCriteria({ body, hasRecipeCards }: { body: string; hasRecipeCards: boolean }) {
  const warnings = checkArticleCriteria({ body, hasRecipeCards })
  return (
    <details className="cadm-criteria">
      <summary>Criterio editorial de Pepa{warnings.length > 0 ? ` · ${warnings.length} ${warnings.length === 1 ? 'aviso' : 'avisos'}` : ''}</summary>
      {warnings.length > 0 && (
        <ul className="cadm-criteria-warnings" role="status">
          {warnings.map((w) => (
            <li key={w}>⚠️ {w}</li>
          ))}
        </ul>
      )}
      <ol className="cadm-small">
        {ARTICLE_CRITERIA.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
    </details>
  )
}

// Edición: título, texto, tema y, según el tipo, opciones de encuesta o fuentes del artículo.
export function ProposalEditForm({
  proposal: p,
  topics,
  busy,
  error,
  onSave,
  onCancel,
}: {
  proposal: Proposal
  topics: CommunityTopic[]
  busy: boolean
  error: string | null
  onSave: (form: ProposalForm) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ProposalForm>(() => proposalToForm(p))
  const [problem, setProblem] = useState<string | null>(null)
  const id = useId()
  const set = (patch: Partial<ProposalForm>) => setForm((f) => ({ ...f, ...patch }))
  const setSource = (i: number, patch: Partial<ArticleSource>) => set({ sources: form.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  return (
    <form
      className="cadm-noteform"
      onSubmit={(e) => {
        e.preventDefault()
        const msg = validateProposalForm(p.kind, form, p.payload)
        setProblem(msg)
        if (!msg) onSave(form)
      }}
    >
      <p className="cadm-noteform-title">Editar la propuesta</p>
      {p.status === 'approved' && <p className="muted cadm-small">Esta propuesta ya estaba aprobada: al guardar, tendrás que aprobarla de nuevo.</p>}

      <label htmlFor={`${id}-title`}>Título</label>
      <input id={`${id}-title`} value={form.title} maxLength={140} onChange={(e) => set({ title: e.target.value })} />

      <label htmlFor={`${id}-body`}>Texto</label>
      <textarea id={`${id}-body`} rows={6} value={form.body} maxLength={10000} onChange={(e) => set({ body: e.target.value })} />
      {(p.kind === 'article' || p.kind === 'tip') && <EditorialCriteria body={form.body} hasRecipeCards={recipeCardCount(p) > 0} />}

      {topics.length > 0 && (
        <>
          <label htmlFor={`${id}-topic`}>Tema</label>
          <select id={`${id}-topic`} value={form.topicId} onChange={(e) => set({ topicId: e.target.value })}>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </>
      )}

      {p.kind === 'poll' && (
        <fieldset className="cadm-fieldset">
          <legend>Opciones (de 2 a {MAX_POLL_OPTIONS})</legend>
          {form.options.map((o, i) => (
            <div key={i} className="cadm-row">
              <label htmlFor={`${id}-opt-${i}`} className="cadm-sr">
                Opción {i + 1}
              </label>
              <input id={`${id}-opt-${i}`} value={o} maxLength={120} onChange={(e) => set({ options: form.options.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Opción ${i + 1}`} />
              {form.options.length > 2 && (
                <button type="button" className="cadm-btn cadm-btn-ghost" aria-label={`Quitar la opción ${i + 1}`} onClick={() => set({ options: form.options.filter((_, j) => j !== i) })}>
                  Quitar
                </button>
              )}
            </div>
          ))}
          {form.options.length < MAX_POLL_OPTIONS && (
            <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => set({ options: [...form.options, ''] })}>
              Añadir opción
            </button>
          )}
        </fieldset>
      )}

      {p.kind === 'article' && (
        <>
          <fieldset className="cadm-fieldset">
            <legend>Fuentes externas (INE, Eurostat u otras fiables)</legend>
            {form.sources.map((s, i) => (
              <div key={i} className="cadm-source-edit">
                <label htmlFor={`${id}-st-${i}`}>Título de la fuente {i + 1}</label>
                <input id={`${id}-st-${i}`} value={s.title} onChange={(e) => setSource(i, { title: e.target.value })} />
                <label htmlFor={`${id}-sp-${i}`}>Organismo o medio</label>
                <input id={`${id}-sp-${i}`} value={s.publisher} onChange={(e) => setSource(i, { publisher: e.target.value })} />
                <label htmlFor={`${id}-su-${i}`}>Enlace (https://…)</label>
                <input id={`${id}-su-${i}`} type="url" inputMode="url" value={s.url} onChange={(e) => setSource(i, { url: e.target.value })} />
                <label htmlFor={`${id}-sd-${i}`}>Fecha de los datos</label>
                <input id={`${id}-sd-${i}`} value={s.date} onChange={(e) => setSource(i, { date: e.target.value })} />
                <button type="button" className="cadm-btn cadm-btn-ghost" onClick={() => set({ sources: form.sources.filter((_, j) => j !== i) })}>
                  Quitar la fuente {i + 1}
                </button>
              </div>
            ))}
            <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => set({ sources: [...form.sources, { title: '', publisher: '', url: '', date: '' }] })}>
              Añadir fuente
            </button>
          </fieldset>
          <label htmlFor={`${id}-met`}>Metodología</label>
          <textarea id={`${id}-met`} rows={3} value={form.methodology} onChange={(e) => set({ methodology: e.target.value })} />
          <label htmlFor={`${id}-cmp`}>Comparación y contexto</label>
          <textarea id={`${id}-cmp`} rows={3} value={form.comparison} onChange={(e) => set({ comparison: e.target.value })} />
          <RecipeCardsEditor value={form.recipes} onChange={(recipes) => set({ recipes })} disabled={busy} />
        </>
      )}

      {problem && (
        <p className="error cadm-small" role="alert">
          {problem}
        </p>
      )}
      {error && (
        <p className="error cadm-small" role="alert">
          {error}
        </p>
      )}
      <div className="cadm-actions">
        <button type="submit" className="cadm-btn cadm-btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" className="cadm-btn cadm-btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// Trasladar una encuesta aprobada a otro fin de semana: solo se pueden elegir sábados a las 10:00 (hora de Madrid); cierra el domingo siguiente a las 17:00. Solo cambia las
// fechas: el texto, las opciones y la aprobación se quedan como están. No publica nada.
function PollRescheduleForm({ busy, error, onSave, onCancel }: { busy: boolean; error: string | null; onSave: (iso: string) => void; onCancel: () => void }) {
  const id = useId()
  const [when, setWhen] = useState('')
  const saturdays = nextMenuSaturdays(new Date(), 8)
  return (
    <form
      className="cadm-noteform"
      onSubmit={(e) => {
        e.preventDefault()
        if (when) onSave(when)
      }}
    >
      <p className="cadm-noteform-title">Reprogramar la encuesta</p>
      <p className="muted cadm-small">Abre el sábado elegido a las 10:00 y cierra el domingo siguiente a las 17:00 (hora peninsular). No cambia el contenido ni las opciones. Si ese fin de semana ya tiene otra encuesta, no se podrá.</p>
      <label htmlFor={`${id}-when`}>Sábado de apertura</label>
      <select id={`${id}-when`} value={when} onChange={(e) => setWhen(e.target.value)}>
        <option value="">Elige un sábado…</option>
        {saturdays.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="error cadm-small" role="alert">
          {error}
        </p>
      )}
      <div className="cadm-actions">
        <button type="submit" className="cadm-btn cadm-btn-primary" disabled={busy || !when}>
          {busy ? 'Guardando…' : 'Reprogramar'}
        </button>
        <button type="button" className="cadm-btn cadm-btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
