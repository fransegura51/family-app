// «Menú del evento» → 👥 Comensales: lo que PEPA YA sabe de Invitados/RSVP/cuestionarios, resumido y consultable
// («¿quiénes son?» a un toque). Nada se vuelve a preguntar aquí y nada se copia: se lee de las mismas fuentes.
// Las necesidades alimentarias siguen la filosofía de siempre: el texto original se conserva SIEMPRE tal cual, la
// clasificación («Sin gluten») es solo operativa, no un diagnóstico, y PEPA nunca afirma que un menú sea seguro.
import { useMemo, useState, type FormEvent } from 'react'
import { addEventDietaryNeed, addEventDietarySuggestionDismissal, deleteEventDietaryNeed, updateEventGuestQuestion } from '@/data/events'
import { saveNecesidadesReview, type MenuHubData } from '@/data/eventMenuHub'
import { errorMessage } from '@/domain/errorMessage'
import {
  DIETARY_CATEGORIES,
  DIETARY_CATEGORY_KEYS,
  DIETARY_KIND_LABELS,
  FOOD_SAFETY_DISCLAIMER,
  needsReviewApplies,
  suggestDietaryNeeds,
  suggestFromGuestNotes,
  type FoodNeedsState,
} from '@/domain/eventDietaryNeeds'
import { FOOD_MENU_INFANTIL_KEY, guestsChooseMenu, ninosNeedMenuInfantil, type MenuInfantilAnswer, type NecesidadesAnswer, type NecesidadesChoice } from '@/domain/eventFood'
import { countMenuChoices } from '@/domain/eventFoodMenu'
import { computeDiners, foodQuestionResults, groupNeeds, unclassifiedQuestions } from '@/domain/eventMenuHub'
import { describeEffects } from '@/domain/eventPairDecisions'
import type { EventDietaryCategory, EventDietaryKind, EventDietarySource, FamilyEvent } from '@/domain/types'
import { ChoiceRow } from '@/ui/ChoiceRow'
import { ConfirmIconButton } from '@/ui/ConfirmButton'
import { showToast } from '@/state/toast'

export const FOOD_NECESIDADES_OPTIONS: { value: NecesidadesChoice; label: string }[] = [
  { value: 'si', label: 'Sí, están contempladas' },
  { value: 'revisar', label: 'Tenemos que revisarlo' },
  { value: 'todavia_no_lo_sabemos', label: 'Todavía no lo sabemos' },
]

const INFANTIL_STATUS: Record<string, string> = {
  incluido: 'incluido en el menú del lugar o proveedor',
  pedir: 'lo pediremos al proveedor',
  nosotros: 'lo preparamos nosotros',
  todavia_no_lo_sabemos: 'todavía sin resolver',
  otro: 'resuelto de otra forma',
}

// Un renglón con detalle «¿quiénes?» desplegable.
function ExpandableLine({ title, details }: { title: string; details: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ textAlign: 'left' }}>
        {open ? '▾' : '▸'} {title}
      </button>
      {open && (
        <ul className="muted" style={{ fontSize: 12, margin: '0 0 4px 18px', paddingLeft: 14 }}>
          {details.length === 0 ? <li>Nadie todavía.</li> : details.map((d, i) => <li key={`${d}-${i}`}>{d}</li>)}
        </ul>
      )}
    </div>
  )
}

export function DinersPanel({ event, data, state, onChanged, onDerivedDataChanged }: { event: FamilyEvent; data: MenuHubData; state: FoodNeedsState; onChanged: () => void; onDerivedDataChanged: () => void }) {
  const { guests, members, needs, items, decisions, dismissals } = data
  const diners = useMemo(() => computeDiners(guests), [guests])
  const groups = useMemo(() => groupNeeds(needs, guests, members), [needs, guests, members])
  const pendingSuggestions = useMemo(() => suggestFromGuestNotes(guests, needs, dismissals).length, [guests, needs, dismissals])
  const choices = useMemo(() => countMenuChoices(data.options, members, guests), [data.options, members, guests])
  const questionResults = useMemo(() => foodQuestionResults(data.questions, data.questionOptions, data.answers, guests, members), [data.questions, data.questionOptions, data.answers, guests, members])
  const unclassified = useMemo(() => unclassifiedQuestions(data.questions), [data.questions])
  const [error, setError] = useState<string | null>(null)
  const [savingReview, setSavingReview] = useState(false)

  const infantilNeeded = ninosNeedMenuInfantil(decisions)
  const infantil = decisions.find((d) => d.questionKey === FOOD_MENU_INFANTIL_KEY)?.answer as unknown as MenuInfantilAnswer | undefined
  const reviewAnswer = decisions.find((d) => d.questionKey === 'comida.necesidades_revisadas')?.answer as unknown as NecesidadesAnswer | undefined

  async function reviewNeeds(answer: NecesidadesAnswer) {
    setSavingReview(true)
    setError(null)
    try {
      const result = await saveNecesidadesReview(event, data, answer)
      const message = describeEffects(result.actions)
      if (message) showToast(message)
      onDerivedDataChanged()
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingReview(false)
    }
  }

  async function classify(questionId: string, topic: 'comida' | null) {
    setError(null)
    try {
      await updateEventGuestQuestion(questionId, { topic })
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    }
  }

  return (
    <div className="card" style={{ padding: 8, marginTop: 8 }}>
      <strong style={{ fontSize: 14 }}>👥 Comensales</strong>
      {error && <p className="error">{error}</p>}

      {diners.totalGuests === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
          Todavía no hay invitados. Los comensales saldrán de la lista de Invitados.
        </p>
      ) : (
        <div style={{ marginTop: 4 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {diners.confirmedPeople} confirmado{diners.confirmedPeople === 1 ? '' : 's'}
          </p>
          {diners.confirmedPeople > 0 && (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {diners.confirmedAdults} adulto{diners.confirmedAdults === 1 ? '' : 's'} · {diners.confirmedChildren} niño{diners.confirmedChildren === 1 ? '' : 's'}
            </p>
          )}
          {diners.allResponded ? (
            <p style={{ fontSize: 13, margin: '4px 0 0' }}>✓ Todos han respondido sobre comida</p>
          ) : (
            diners.openPeople > 0 && (
              <p style={{ fontSize: 13, margin: '4px 0 0' }}>
                ℹ️ {diners.openPeople} invitado{diners.openPeople === 1 ? '' : 's'} todavía no {diners.openPeople === 1 ? 'ha' : 'han'} respondido: la información es provisional.
              </p>
            )
          )}
        </div>
      )}

      {/* Menú infantil: se hereda de Invitados / Comida y bebida; aquí solo se refleja. */}
      {infantilNeeded && (
        <p style={{ fontSize: 13, margin: '6px 0 0' }}>
          👧🧒 Menú infantil: {diners.confirmedChildren} niño{diners.confirmedChildren === 1 ? '' : 's'} confirmado{diners.confirmedChildren === 1 ? '' : 's'} ·{' '}
          <span className="muted">{infantil ? INFANTIL_STATUS[infantil.choice] : 'todavía sin resolver (se decide en «Comida y bebida»)'}</span>
        </p>
      )}

      {/* Necesidades */}
      <div style={{ marginTop: 8 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
          NECESIDADES ALIMENTARIAS
        </div>
        {groups.length === 0 ? (
          <p style={{ fontSize: 13, margin: '2px 0 0' }}>
            {pendingSuggestions > 0
              ? `Ninguna confirmada todavía · ${pendingSuggestions} pendiente${pendingSuggestions === 1 ? '' : 's'} de revisar (en «Añadir o revisar necesidades»).`
              : 'No se han indicado alergias ni necesidades alimentarias.'}
          </p>
        ) : (
          groups.map((g) => <ExpandableLine key={g.key} title={g.line} details={g.people.map((p) => `${p.name}: «${p.originalText}»`)} />)
        )}
        {groups.length > 0 && items.length > 0 && (
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            {FOOD_SAFETY_DISCLAIMER}
          </p>
        )}
      </div>

      {/* Elecciones de menú de los invitados */}
      {guestsChooseMenu(decisions) && data.options.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
            ELECCIONES DE MENÚ
          </div>
          {[...choices.counts, choices.unchosen].map((c) => (
            <ExpandableLine key={c.optionId ?? 'sin-elegir'} title={`${c.name} · ${c.count}`} details={c.people.map((p) => `${p.name}${p.guestName && p.guestName !== p.name ? ` (${p.guestName})` : ''}`)} />
          ))}
        </div>
      )}

      {/* Respuestas a preguntas de los invitados que la familia marcó como de comida */}
      {questionResults.map((r) => (
        <div key={r.question.id} style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
            {r.question.prompt.toUpperCase()}
          </div>
          {r.options.map((o) => (
            <ExpandableLine key={o.id} title={`${o.label} · ${o.people.length}`} details={o.people} />
          ))}
          <button type="button" className="link-button" style={{ fontSize: 12 }} onClick={() => void classify(r.question.id, null)}>
            Quitar de «comida»
          </button>
        </div>
      ))}
      {unclassified.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ fontSize: 12 }}>
            Otras preguntas a los invitados ({unclassified.length}): ¿alguna es sobre comida?
          </summary>
          {unclassified.map((q) => (
            <div key={q.id} className="inline-fields" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1, fontSize: 13 }}>{q.prompt}</span>
              <button type="button" className="link-button" onClick={() => void classify(q.id, 'comida')}>
                Es de comida
              </button>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
            PEPA no lo adivina por el texto: lo marcas tú y sus respuestas aparecen aquí.
          </p>
        </details>
      )}

      {/* ¿Se han tenido en cuenta las necesidades? (la decisión sigue siendo la de Comida y bebida) */}
      {needsReviewApplies(state) && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            ¿Habéis tenido en cuenta estas necesidades en el menú?
          </div>
          <ChoiceRow options={FOOD_NECESIDADES_OPTIONS} value={reviewAnswer?.choice} disabled={savingReview} onSelect={(choice) => void reviewNeeds({ choice })} />
        </div>
      )}

      <NeedsEditor event={event} data={data} onChanged={onChanged} />
    </div>
  )
}

// Alta/baja de necesidades y sugerencias a partir de las notas de los invitados (flujo de siempre, movido aquí).
function NeedsEditor({ event, data, onChanged }: { event: FamilyEvent; data: MenuHubData; onChanged: () => void }) {
  const { guests, members, needs } = data
  const [guestId, setGuestId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [text, setText] = useState('')
  const [category, setCategory] = useState<EventDietaryCategory | ''>('')
  const [kind, setKind] = useState<EventDietaryKind | ''>('')
  const [error, setError] = useState<string | null>(null)
  // Corregir una sugerencia: el formulario se rellena con ella; al guardar cuenta como confirmada (origen nota)
  // y, si la categoría cambia, la sugerencia original se descarta para que no vuelva a aparecer.
  const [correcting, setCorrecting] = useState<{ guestId: string; originalCategory: EventDietaryCategory; text: string } | null>(null)
  const suggestions = useMemo(() => suggestFromGuestNotes(guests, needs, data.dismissals), [guests, needs, data.dismissals])
  const guestMembers = members.filter((m) => m.guestId === guestId)
  const nameOf = (need: (typeof needs)[number]): string => {
    const guest = guests.find((g) => g.id === need.guestId)
    const member = need.memberId ? members.find((m) => m.id === need.memberId) : undefined
    return member ? `${member.name}${guest ? ` (${guest.displayName})` : ''}` : (guest?.displayName ?? 'Invitado')
  }

  function onTextChange(value: string) {
    setText(value)
    const first = suggestDietaryNeeds(value)[0]
    // Solo una SUGERENCIA para rellenar la clasificación; quien organiza puede cambiarla siempre.
    if (first && !category) {
      setCategory(first.category)
      setKind(first.kind ?? '')
    }
  }

  async function add(input: { guestId: string; memberId: string | null; originalText: string; category: EventDietaryCategory; kind: EventDietaryKind | null; source: EventDietarySource }) {
    setError(null)
    try {
      await addEventDietaryNeed(event.id, input)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la necesidad'))
    }
  }

  async function dismiss(guestIdToDismiss: string, cat: EventDietaryCategory) {
    setError(null)
    try {
      await addEventDietarySuggestionDismissal(event.id, guestIdToDismiss, cat)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo descartar la sugerencia'))
    }
  }

  function startCorrecting(s: { guestId: string; category: EventDietaryCategory; kind: EventDietaryKind | null; text: string }) {
    setCorrecting({ guestId: s.guestId, originalCategory: s.category, text: s.text })
    setGuestId(s.guestId)
    setMemberId('')
    setText(s.text)
    setCategory(s.category)
    setKind(s.kind ?? '')
  }

  function cancelCorrecting() {
    setCorrecting(null)
    setText('')
    setCategory('')
    setKind('')
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!guestId || !text.trim() || !category) return
    if (correcting && correcting.guestId === guestId) {
      await add({ guestId, memberId: memberId || null, originalText: correcting.text, category, kind: kind || null, source: 'invitado_nota' })
      if (category !== correcting.originalCategory) await dismiss(correcting.guestId, correcting.originalCategory)
      setCorrecting(null)
    } else {
      await add({ guestId, memberId: memberId || null, originalText: text, category, kind: kind || null, source: 'organizador' })
    }
    setText('')
    setCategory('')
    setKind('')
    setMemberId('')
  }

  if (guests.length === 0 && needs.length === 0) return null

  const summaryText =
    needs.length === 0 && suggestions.length === 0
      ? 'No se han indicado alergias ni necesidades alimentarias.'
      : `Necesidades alimentarias · ${needs.length} confirmada${needs.length === 1 ? '' : 's'} · ${suggestions.length} pendiente${suggestions.length === 1 ? '' : 's'} de revisar`

  return (
    <details style={{ marginTop: 8 }}>
      <summary className="muted" style={{ fontSize: 12 }}>
        {summaryText}
      </summary>
      {error && <p className="error">{error}</p>}
      {needs.map((n) => (
        <div key={n.id} className="inline-fields" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: 13 }}>
            {nameOf(n)}: «{n.originalText}» → <strong>{DIETARY_CATEGORIES[n.category].label}</strong>
            {n.kind ? ` · ${DIETARY_KIND_LABELS[n.kind]}` : ''}
          </span>
          <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Quitar necesidad" onConfirm={() => deleteEventDietaryNeed(n.id).then(onChanged)} />
        </div>
      ))}

      {suggestions.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
            PEPA ha visto esto en las notas de los invitados (confírmalo para que cuente)
          </div>
          {suggestions.map((s) => (
            <div key={`${s.guestId}:${s.category}`} style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>
                {s.guestName}: «{s.text}» → {DIETARY_CATEGORIES[s.category].label}
                <span className="muted"> · detectado en la nota, sin confirmar</span>
              </span>
              <div className="filter-row" style={{ marginTop: 2 }}>
                <button type="button" className="link-button" onClick={() => add({ guestId: s.guestId, memberId: null, originalText: s.text, category: s.category, kind: s.kind, source: 'invitado_nota' })}>
                  Confirmar
                </button>
                <button type="button" className="link-button" onClick={() => startCorrecting(s)}>
                  Corregir
                </button>
                <button type="button" className="link-button" onClick={() => void dismiss(s.guestId, s.category)}>
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="member-form" style={{ marginTop: 6 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Añadir una necesidad
        </div>
        <select
          value={guestId}
          onChange={(e) => {
            setGuestId(e.target.value)
            setMemberId('')
          }}
          aria-label="Invitado"
        >
          <option value="">¿De quién?</option>
          {guests
            .filter((g) => g.rsvpStatus !== 'no_asiste')
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.displayName}
              </option>
            ))}
        </select>
        {guestMembers.length > 0 && (
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Persona">
            <option value="">Toda la invitación</option>
            {guestMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <input type="text" value={text} placeholder="Lo que han indicado (p. ej. alergia a las nueces)" onChange={(e) => onTextChange(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value as EventDietaryCategory | '')} aria-label="Clasificación">
          <option value="">Clasificación para organizar</option>
          {DIETARY_CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>
              {DIETARY_CATEGORIES[k].label}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as EventDietaryKind | '')} aria-label="Tipo">
          <option value="">Tipo (si se sabe)</option>
          {(Object.keys(DIETARY_KIND_LABELS) as EventDietaryKind[]).map((k) => (
            <option key={k} value={k}>
              {DIETARY_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <div className="filter-row">
          <button type="submit" disabled={!guestId || !text.trim() || !category}>
            {correcting ? 'Confirmar corrección' : 'Añadir'}
          </button>
          {correcting && (
            <button type="button" className="link-button" onClick={cancelCorrecting}>
              Cancelar corrección
            </button>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Se conserva lo que escribieron tal cual. La clasificación solo sirve para organizar el menú; no es un diagnóstico.
        </p>
      </form>
    </details>
  )
}

