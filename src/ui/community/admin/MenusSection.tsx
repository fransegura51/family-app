import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { MEAL_TEXT, type MealKind } from '@/domain/communityEditorial'
import { RevisePanel, type DishTarget } from '@/ui/community/admin/RevisePanel'
import { Link } from 'react-router-dom'
import { adminApproveProposal, adminEditProposal, adminGetMenu, adminListMenus, adminRejectProposal, adminRescheduleMenu, adminRetryPublish } from '@/data/community'
import {
  ADMIN_TEXT,
  MENU_MAX_ATTEMPTS,
  MENU_STATE_TEXT,
  approvalLine,
  menuApproveText,
  menuRescheduleText,
  menuRetryText,
  menuStateLine,
  nextMenuSaturdays,
  toMenuDetail,
  toMenuList,
  toProposals,
  type MenuDetail,
  type MenuRow,
  type Proposal,
} from '@/domain/communityAdmin'
import type { CommunityTopic } from '@/domain/community'
import { CommunityRichText } from '@/ui/community/CommunityRichText'
import { paths } from '@/ui/community/communityNav'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox, NoteForm, TwoTapButton } from '@/ui/community/admin/AdminShared'
import { ProposalEditForm } from '@/ui/community/admin/ProposalCard'
import { useAdminAction, useAdminData } from '@/ui/community/admin/useAdminData'

// Menú semanal de Pepa: borradores, programados, publicados y con error. La publicación AUTOMÁTICA depende de un ajuste técnico de solo lectura
// (weekly_menu_autopublish): mientras esté desactivado no se publica nada solo. Aprobar un menú semanal NO lo publica: lo programa para el próximo sábado a las 10:00.
export function MenusSection({ topics, onChanged, focus = null }: { topics: CommunityTopic[]; onChanged: () => void; focus?: { id: string; seq: number } | null }) {
  const [notice, setNotice] = useState<string | null>(null)
  const loader = useCallback(async () => toMenuList(await adminListMenus()), [])
  const { data, loading, error, reload } = useAdminData(loader)

  return (
    <section className="cadm-stack" aria-labelledby="cadm-menus-title">
      <h3 id="cadm-menus-title">Menú semanal de Pepa</h3>
      {data && (
        <InfoBox tone={data.autopublish ? 'info' : 'warn'}>
          <strong>{data.autopublish ? ADMIN_TEXT.menuAutopublishOn : ADMIN_TEXT.menuAutopublishOff}.</strong> {ADMIN_TEXT.menuAutopublishHelp}
        </InfoBox>
      )}
      <ActionNotice message={notice} />
      {loading && <AdminLoading label="Cargando los menús…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && data && data.menus.length === 0 && <AdminEmpty>No hay menús. Los prepara una persona (banco editorial) y llegan aquí como borrador para que los revises.</AdminEmpty>}
      {data && data.menus.length > 0 && (
        <ul className="cadm-list">
          {data.menus.map((m) => (
            <li key={m.id}>
              <MenuCard
                menu={m}
                topics={topics}
                focus={focus && focus.id === m.id ? focus.seq : null}
                onDone={(text) => {
                  setNotice(text)
                  reload()
                  onChanged()
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function proposalOf(d: MenuDetail): Proposal {
  return toProposals([{ id: d.id, kind: 'menu', section: d.section, topicId: d.topicId, title: d.title, body: d.body, status: 'proposed', version: d.version, payload: {} }])[0]
}

export function MenuCard({ menu: m, topics, onDone, focus = null }: { menu: MenuRow; topics: CommunityTopic[]; onDone: (message: string) => void; focus?: number | null }) {
  const [mode, setMode] = useState<'view' | 'review' | 'edit' | 'reject' | 'reschedule' | 'revise'>('view')
  const cardRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (focus == null) return
    cardRef.current?.scrollIntoView?.({ block: 'start' })
    cardRef.current?.focus({ preventScroll: true })
  }, [focus])
  const [detail, setDetail] = useState<MenuDetail | null>(null)
  const [confirmText, setConfirmText] = useState(false)
  const [when, setWhen] = useState('')
  const action = useAdminAction()
  const id = useId()
  const saturdays = useMemo(() => nextMenuSaturdays(new Date(), 8), [])
  const approval = approvalLine({ status: m.state === 'draft' ? 'proposed' : 'approved', approvedAt: m.approvedAt, approvedByName: m.approvedByName, approvedVersion: m.version, version: m.version })
  const blocked = (detail?.check ?? []).some((c) => c.severity === 'error') || (m.checkErrors ?? 0) > 0

  // El detalle (menú + revisión de calidad) se pide una vez, al abrir la revisión o la edición (nunca al pintar la lista).
  const revisable = m.state === 'draft' || m.state === 'scheduled' || m.state === 'error'
  const loadDetail = async (next: 'review' | 'edit' | 'revise') => {
    if (detail) {
      setMode(next)
      return
    }
    const r = await action.run(async () => toMenuDetail(await adminGetMenu(m.id)))
    if (r.ok && r.result) {
      setDetail(r.result)
      setMode(next)
    }
  }

  return (
    <article ref={cardRef} tabIndex={focus != null ? -1 : undefined} className={`cadm-card${focus != null ? ' cadm-card-focus' : ''}`} aria-label={`Menú semanal de Pepa: ${m.title}`} data-proposal-id={m.id}>
      <header className="cadm-card-head">
        <h4>
          <span aria-hidden="true">🍽️ </span>
          {m.title}
        </h4>
        <span className={`cadm-chip ${m.state === 'error' || m.state === 'rejected' ? 'cadm-chip-warn' : m.state === 'draft' ? '' : 'cadm-chip-ok'}`}>{MENU_STATE_TEXT[m.state]}</span>
      </header>
      <p className="muted cadm-small">
        Versión {m.version}
        {m.source ? ` · Fuente: ${m.source}` : ''}
        {!m.weekly ? ' · Publicación puntual (no semanal)' : ''}
      </p>
      <p className="cadm-small">{menuStateLine(m)}</p>
      {approval && m.state !== 'draft' && <p className="cadm-small cadm-approval">{approval}</p>}
      {m.state === 'draft' && m.textStale && (
        <p className="cadm-notice cadm-notice-error" role="note">
          Has cambiado el texto sin tocar los datos del menú: comprueba que dicen lo mismo antes de aprobar.
        </p>
      )}
      {m.state === 'draft' && (m.checkErrors ?? 0) > 0 && (
        <p className="cadm-notice cadm-notice-error" role="note">
          El menú no es válido y no se puede aprobar. Abre «Revisar el menú» para ver el motivo.
        </p>
      )}
      {m.state === 'draft' && m.checkErrors === 0 && (m.checkWarnings ?? 0) > 0 && (
        <p className="muted cadm-small">
          La revisión de calidad tiene {m.checkWarnings} {m.checkWarnings === 1 ? 'aviso' : 'avisos'} (no bloquean la aprobación).
        </p>
      )}
      {m.publishError && m.state !== 'published' && (
        <p className="cadm-notice cadm-notice-error" role="alert">
          Error al publicar (intento {Math.min(m.publishAttempts, MENU_MAX_ATTEMPTS)} de {MENU_MAX_ATTEMPTS}): {m.publishError}
        </p>
      )}
      {m.state === 'rejected' && m.reviewNote && <p className="cadm-small">Motivo del rechazo: {m.reviewNote}</p>}
      {m.state === 'published' && m.publishedPostId && (
        <Link className="link-button cadm-linkbtn" to={paths.post(m.publishedPostId)}>
          Ver el menú en Comunidad
        </Link>
      )}

      <ActionNotice error={mode === 'view' || mode === 'review' || mode === 'revise' ? action.error : null} />

      {mode === 'review' && detail && <MenuReview detail={detail} />}
      {mode === 'revise' && detail && (
        <MenuReview
          detail={detail}
          revise={{
            itemId: m.id,
            onClose: () => setMode('view'),
            onChanged: (message) => {
              setDetail(null)
              setMode('view')
              onDone(message)
            },
          }}
        />
      )}

      {(m.state === 'draft' || m.state === 'scheduled' || m.state === 'error') && mode !== 'edit' && mode !== 'reject' && mode !== 'reschedule' && mode !== 'revise' && (
        <div className="cadm-actions" role="group" aria-label="Qué hacer con este menú">
          {mode === 'review' ? (
            <button type="button" className="cadm-btn cadm-btn-ghost" onClick={() => setMode('view')}>
              Ocultar la revisión
            </button>
          ) : (
            <button type="button" className="cadm-btn cadm-btn-secondary" disabled={action.busy} onClick={() => void loadDetail('review')}>
              Revisar el menú
            </button>
          )}
          {revisable && (
            <button type="button" className="cadm-btn cadm-btn-secondary" disabled={action.busy} onClick={() => void loadDetail('revise')} data-help-id="comunidad.revise-open">
              Rectificar con Pepa
            </button>
          )}
          {m.state === 'draft' && (
            <>
              <button type="button" className="cadm-btn cadm-btn-secondary" disabled={action.busy} onClick={() => void loadDetail('edit')}>
                Editar el texto
              </button>
              <TwoTapButton
                label="Aprobar"
                armedLabel={m.weekly ? 'Toca otra vez: aprobar y programar' : 'Toca otra vez: aprobar y publicar ya'}
                disabled={action.busy || blocked || (m.textStale && !confirmText)}
                onConfirm={() => {
                  void (async () => {
                    const r = await action.run(() => adminApproveProposal(m.id, m.textStale && confirmText))
                    if (r.ok) onDone(menuApproveText(r.result))
                  })()
                }}
              />
            </>
          )}
          {m.state === 'error' && (
            <TwoTapButton
              label="Reintentar ahora"
              armedLabel="Toca otra vez: publicar ahora"
              disabled={action.busy}
              onConfirm={() => {
                void (async () => {
                  const r = await action.run(() => adminRetryPublish(m.id))
                  // Si sigue fallando también se recarga la lista (para ver el nuevo error) y se avisa con el texto.
                  if (r.ok) onDone(menuRetryText(r.result).text)
                })()
              }}
            />
          )}
          {(m.state === 'scheduled' || m.state === 'error') && m.weekly && (
            <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setMode('reschedule')}>
              Reprogramar
            </button>
          )}
          {m.state === 'scheduled' && m.weekly && (
            <TwoTapButton
              label="Cancelar la programación"
              armedLabel="Toca otra vez: volver a borrador"
              variant="secondary"
              disabled={action.busy}
              onConfirm={() => {
                void (async () => {
                  const r = await action.run(() => adminRescheduleMenu(m.id, null))
                  if (r.ok) onDone(menuRescheduleText(r.result))
                })()
              }}
            />
          )}
          <button type="button" className="cadm-btn cadm-btn-danger" onClick={() => setMode('reject')}>
            Rechazar
          </button>
        </div>
      )}
      {m.state === 'draft' && m.textStale && mode !== 'edit' && mode !== 'reject' && (
        <label className="cadm-check" htmlFor={`${id}-stale`}>
          <input id={`${id}-stale`} type="checkbox" checked={confirmText} onChange={(e) => setConfirmText(e.target.checked)} /> He revisado que el texto y los datos del menú dicen lo mismo
        </label>
      )}
      {m.state === 'draft' && mode === 'view' && (
        <p className="muted cadm-small">
          {m.weekly
            ? 'Al aprobar, el menú NO se publica al momento: se programa y sale el próximo sábado a las 10:00 (hora peninsular) para la semana siguiente. Aprobarlo el mismo sábado a las 10:00 o más tarde lo deja para el sábado siguiente.'
            : 'Al aprobar, este menú se publica al momento (no es semanal).'}
        </p>
      )}

      {mode === 'edit' && detail && (
        <ProposalEditForm
          proposal={proposalOf(detail)}
          topics={topics.filter((t) => t.section === detail.section)}
          busy={action.busy}
          error={action.error}
          onCancel={() => {
            setMode('view')
            action.clear()
          }}
          onSave={(form) => {
            void (async () => {
              const r = await action.run(() => adminEditProposal(m.id, form.title.trim(), form.body, null, form.topicId || null))
              if (r.ok) {
                setMode('view')
                setDetail(null)
                setConfirmText(false)
                onDone(`Texto guardado como versión ${r.result}. Los datos del menú no se han tocado: revisa que coinciden con el texto y confírmalo al aprobar.`)
              }
            })()
          }}
        />
      )}

      {mode === 'reschedule' && (
        <form
          className="cadm-noteform"
          onSubmit={(e) => {
            e.preventDefault()
            if (!when) return
            void (async () => {
              const r = await action.run(() => adminRescheduleMenu(m.id, when))
              if (r.ok) {
                setMode('view')
                onDone(menuRescheduleText(r.result))
              }
            })()
          }}
        >
          <p className="cadm-noteform-title">Reprogramar el menú</p>
          <p className="muted cadm-small">Solo se puede elegir un sábado a las 10:00 (hora peninsular). El menú cubrirá la semana siguiente a ese sábado. Si esa semana ya tiene otro menú, no se podrá.</p>
          <label htmlFor={`${id}-when`}>Sábado de publicación</label>
          <select id={`${id}-when`} value={when} onChange={(e) => setWhen(e.target.value)}>
            <option value="">Elige un sábado…</option>
            {saturdays.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {action.error && (
            <p className="error cadm-small" role="alert">
              {action.error}
            </p>
          )}
          <div className="cadm-actions">
            <button type="submit" className="cadm-btn cadm-btn-primary" disabled={action.busy || !when}>
              {action.busy ? 'Guardando…' : 'Reprogramar'}
            </button>
            <button
              type="button"
              className="cadm-btn cadm-btn-ghost"
              onClick={() => {
                setMode('view')
                action.clear()
              }}
              disabled={action.busy}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {mode === 'reject' && (
        <NoteForm
          title="Rechazar este menú"
          help="No se publicará y la semana queda libre para otro menú. Queda en «Rechazado» con tu motivo."
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
              const r = await action.run(() => adminRejectProposal(m.id, note))
              if (r.ok) onDone('Menú rechazado.')
            })()
          }}
        />
      )}
    </article>
  )
}

// Revisión antes de aprobar: avisos de calidad (los de «error» bloquean) y un resumen del menú: lo que se publicaría es el texto de abajo, y los datos son los que
// se podrán guardar en la Cocina.
export function MenuReview({
  detail,
  revise,
}: {
  detail: MenuDetail
  /** Si se pasa, cada plato lleva «Cambiar este plato con Pepa» y hay «Pedir cambios generales del menú» (los demás platos no cambian). */
  revise?: { itemId: string; onClose: () => void; onChanged: (message: string) => void }
}) {
  const [target, setTarget] = useState<DishTarget | 'general' | null>(null)
  const errors = detail.check.filter((c) => c.severity === 'error')
  const warnings = detail.check.filter((c) => c.severity === 'warning')
  return (
    <div className="cadm-proposal">
      <h5>Revisión de calidad</h5>
      {errors.map((c, i) => (
        <p key={i} className="cadm-notice cadm-notice-error" role="alert">
          {c.message}
        </p>
      ))}
      {errors.length === 0 && warnings.length === 0 && <p className="cadm-small">Sin avisos: el menú es válido y no hay nada raro que señalar.</p>}
      {warnings.length > 0 && (
        <ul className="cadm-options">
          {warnings.map((c, i) => (
            <li key={i}>
              {[c.day, c.meal, c.recipe].filter(Boolean).join(' · ')}
              {c.day || c.meal || c.recipe ? ': ' : ''}
              {c.message}
            </li>
          ))}
        </ul>
      )}
      <p className="muted cadm-small">
        La revisión es automática y limitada: no comprueba seguridad alimentaria, alérgenos ni valores nutricionales. La decisión es de la persona que aprueba.
      </p>
      {detail.menu && (
        <>
          <h5>Datos del menú ({detail.menu.servings} raciones)</h5>
          <ul className="cadm-options">
            {detail.menu.days.map((d, dayIndex) => (
              <li key={d.day}>
                <strong>{d.day}</strong> — comida: {d.comida?.title ?? '—'}
                {d.comida?.side ? ` (+ ${d.comida.side})` : ''}; cena: {d.cena?.title ?? '—'}
                {d.cena?.side ? ` (+ ${d.cena.side})` : ''}
                {revise && (
                  <span className="cadm-dish-actions">
                    {(['comida', 'cena'] as MealKind[]).map(
                      (meal) =>
                        d[meal] && (
                          <button
                            key={meal}
                            type="button"
                            className="cadm-btn cadm-btn-secondary cadm-btn-small"
                            aria-label={`Cambiar este plato con Pepa: ${d.day}, ${meal}, ${d[meal]?.title}`}
                            data-help-id="comunidad.revise-dish"
                            onClick={() => setTarget({ day: dayIndex, meal, label: `${d.day} · ${MEAL_TEXT[meal]}` })}
                          >
                            Cambiar este plato con Pepa ({MEAL_TEXT[meal].toLowerCase()})
                          </button>
                        ),
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {revise && (
            <div className="cadm-actions">
              <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setTarget('general')} data-help-id="comunidad.revise-menu-general">
                Pedir cambios generales del menú
              </button>
              <button type="button" className="cadm-btn cadm-btn-ghost" onClick={revise.onClose}>
                Cerrar
              </button>
            </div>
          )}
          {revise && target && (
            <RevisePanel
              key={target === 'general' ? 'general' : `${target.day}-${target.meal}`}
              itemId={revise.itemId}
              kind="menu"
              target={target === 'general' ? null : target}
              onClose={() => setTarget(null)}
              onChanged={revise.onChanged}
            />
          )}
        </>
      )}
      {detail.body && (
        <>
          <h5>Texto que se publicará</h5>
          <CommunityRichText text={detail.body} className="cadm-body" />
        </>
      )}
    </div>
  )
}
