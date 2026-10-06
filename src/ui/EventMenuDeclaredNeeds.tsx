import { useEffect, useState } from 'react'
import { acceptEventDeclaredNeed, listEventDeclaredNeeds, rejectEventDeclaredNeed } from '@/data/eventDeclaredNeeds'
import { errorMessage } from '@/domain/errorMessage'
import { DIETARY_CATEGORIES, DIETARY_CATEGORY_KEYS, DIETARY_KIND_LABELS } from '@/domain/eventDietaryNeeds'
import type { EventDeclaredNeed, EventDietaryCategory, EventDietaryKind, EventGuest, EventGuestMember } from '@/domain/types'

const WHOLE_INVITATION = '__toda_la_invitacion__'

// Lo que declara un invitado por el RSVP. NO es una necesidad confirmada: hasta que la familia la acepta, no cuenta
// en avisos, recuentos ni en el menú. El texto original se muestra tal cual, sin diagnóstico.
export function DeclaredNeedsReview({
  eventId,
  guests,
  members,
  refreshKey,
  onChanged,
}: {
  eventId: string
  guests: EventGuest[]
  members: EventGuestMember[]
  refreshKey: unknown
  onChanged: () => void
}) {
  const [items, setItems] = useState<EventDeclaredNeed[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, { category: EventDietaryCategory; kind: EventDietaryKind | ''; memberId: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listEventDeclaredNeeds(eventId)
      .then((list) => {
        if (!cancelled) setItems(list.filter((d) => d.status === 'pendiente'))
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'No se pudieron cargar las declaraciones de los invitados'))
      })
    return () => {
      cancelled = true
    }
  }, [eventId, refreshKey])

  if (items.length === 0) return null

  const guestName = (id: string) => guests.find((g) => g.id === id)?.displayName ?? 'Invitado'
  const memberName = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? null : null)

  function draftFor(d: EventDeclaredNeed) {
    return draft[d.id] ?? { category: d.category, kind: d.kind ?? '', memberId: d.memberId ?? '' }
  }

  async function accept(d: EventDeclaredNeed) {
    const v = draftFor(d)
    setBusy(d.id)
    setError(null)
    try {
      await acceptEventDeclaredNeed(d, {
        category: v.category,
        kind: v.kind || null,
        memberId: v.memberId && v.memberId !== WHOLE_INVITATION ? v.memberId : null,
      })
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo aceptar la declaración. No se ha guardado nada.'))
    } finally {
      setBusy(null)
    }
  }

  async function reject(d: EventDeclaredNeed) {
    setBusy(d.id)
    setError(null)
    try {
      await rejectEventDeclaredNeed(d.id)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo rechazar la declaración.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
        Declarado por un invitado (sin confirmar): revisa cada caso antes de que cuente
      </div>
      {error && <p className="error">{error}</p>}
      {items.map((d) => {
        const v = draftFor(d)
        const person = memberName(d.memberId) ?? guestName(d.guestId)
        return (
          <div key={d.id} style={{ borderTop: '1px solid rgba(0,0,0,0.08)', padding: '6px 0' }}>
            <div style={{ fontSize: 13 }}>
              {person} · <strong>{DIETARY_CATEGORIES[d.category].label}</strong>
              {d.kind ? ` · ${DIETARY_KIND_LABELS[d.kind]}` : ''}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Texto del invitado: «{d.declaredText}»
            </div>
            <div className="inline-fields" style={{ marginTop: 4, flexWrap: 'wrap' }}>
              <select
                value={v.memberId}
                onChange={(e) => setDraft({ ...draft, [d.id]: { ...v, memberId: e.target.value } })}
                aria-label={`Persona de la declaración de ${guestName(d.guestId)}`}
                disabled={busy === d.id}
              >
                <option value="">¿A quién corresponde?</option>
                {members.filter((m) => m.guestId === d.guestId).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                <option value={WHOLE_INVITATION}>Toda la invitación</option>
              </select>
              <select
                value={v.category}
                onChange={(e) => setDraft({ ...draft, [d.id]: { ...v, category: e.target.value as EventDietaryCategory } })}
                aria-label="Clasificación para organizar"
                disabled={busy === d.id}
              >
                {DIETARY_CATEGORY_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {DIETARY_CATEGORIES[k].label}
                  </option>
                ))}
              </select>
              <select
                value={v.kind}
                onChange={(e) => setDraft({ ...draft, [d.id]: { ...v, kind: e.target.value as EventDietaryKind | '' } })}
                aria-label="Tipo"
                disabled={busy === d.id}
              >
                <option value="">Tipo (si se sabe)</option>
                {(Object.keys(DIETARY_KIND_LABELS) as EventDietaryKind[]).map((k) => (
                  <option key={k} value={k}>
                    {DIETARY_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-row" style={{ marginTop: 2 }}>
              <button type="button" className="link-button" onClick={() => void accept(d)} disabled={busy === d.id || !v.memberId}>
                Aceptar como necesidad
              </button>
              <button type="button" className="link-button" onClick={() => void reject(d)} disabled={busy === d.id}>
                Rechazar
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
