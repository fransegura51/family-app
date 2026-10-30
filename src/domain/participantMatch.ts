// Reconocer participantes que ya existen en OTROS grupos a los que tienes acceso. Dominio puro.
// REGLA: jamás se fusionan personas por el nombre solamente. Siempre se muestra la coincidencia (grupos de origen, datos y diferencias) y la persona decide:
// reutilizar (compartir identidad y datos personales confirmados), crear una ficha nueva, o revisar. Reutilizar NO traslada botes, pagos, deudas, saldos, permisos
// del grupo original ni sus observaciones: solo la identidad y los datos personales; las observaciones de cada grupo son de ese grupo.
import { foldText, type Participant } from '@/domain/groups'
import { samePhone } from '@/domain/contactsModel'

export interface KnownPerson {
  /** Clave de identidad: person_id si lo tiene; si no, el id de la primera ficha. */
  personKey: string
  /** Ficha que se toma como referencia (la más completa). */
  reference: Participant
  /** Todas las fichas de esa misma identidad, con el nombre del grupo de cada una. */
  sheets: { participant: Participant; groupName: string }[]
  /** Contactos familiares vinculados a alguna de esas fichas (nombre y relación), para enseñarlos. */
  linkedContacts: { name: string; relation: string }[]
}

export interface QueryPerson {
  name: string
  surname?: string | null
  phone?: string | null
  email?: string | null
  guardianName?: string | null
}

export interface PersonMatch {
  person: KnownPerson
  /** Por qué es candidata: nombre completo igual, o nombre igual + mismo teléfono. */
  reason: 'nombre' | 'nombre y teléfono'
  /** Datos que la ficha existente tiene y el nuevo no (se heredarían) y datos distintos (a revisar). */
  inherits: string[]
  differences: string[]
}

const score = (p: Participant) => [p.surname, p.guardianName, p.phone, p.email].filter(Boolean).length

/** Une las fichas de todos tus grupos por identidad (misma `personId`), para no enseñar dos veces a la misma persona. Las dadas de baja también cuentan. */
export function groupKnownPeople(sheets: { participant: Participant; groupName: string }[], links: { participantId: string; name: string; relation: string }[] = []): KnownPerson[] {
  const byKey = new Map<string, { participant: Participant; groupName: string }[]>()
  for (const s of sheets) {
    const key = s.participant.personId || s.participant.id
    byKey.set(key, [...(byKey.get(key) ?? []), s])
  }
  const out: KnownPerson[] = []
  for (const [personKey, list] of byKey) {
    const reference = [...list].sort((a, b) => score(b.participant) - score(a.participant))[0].participant
    const ids = new Set(list.map((s) => s.participant.id))
    const linked = new Map<string, string>()
    for (const l of links) if (ids.has(l.participantId)) linked.set(`${l.name}|${l.relation}`, l.relation)
    out.push({
      personKey,
      reference,
      sheets: list,
      linkedContacts: [...linked.keys()].map((k) => ({ name: k.split('|')[0], relation: linked.get(k) ?? '' })),
    })
  }
  return out
}

function fullKey(name: string, surname?: string | null): string {
  return foldText([name, surname].filter(Boolean).join(' '))
}

export function findPersonMatches(q: QueryPerson, known: KnownPerson[], excludeGroupId?: string): PersonMatch[] {
  const key = fullKey(q.name, q.surname)
  if (!key) return []
  const out: PersonMatch[] = []
  for (const person of known) {
    // Ya está en el grupo destino: no se ofrece reutilizarla ahí (la importación ya avisa de duplicados dentro del propio grupo).
    if (excludeGroupId && person.sheets.every((s) => s.participant.groupId === excludeGroupId)) continue
    const sameName = person.sheets.some((s) => fullKey(s.participant.name, s.participant.surname) === key)
    if (!sameName) continue
    const phoneToo = !!q.phone && person.sheets.some((s) => samePhone(s.participant.phone, q.phone))
    const ref = person.reference
    const inherits: string[] = []
    const differences: string[] = []
    const cmp = (label: string, mine: string | null | undefined, theirs: string | null | undefined, same: (a: string, b: string) => boolean) => {
      const m = (mine ?? '').trim()
      const t = (theirs ?? '').trim()
      if (!t) return
      if (!m) inherits.push(`${label}: ${t}`)
      else if (!same(m, t)) differences.push(`${label}: aquí «${m}», en la otra ficha «${t}»`)
    }
    const fold = (a: string, b: string) => foldText(a) === foldText(b)
    cmp('Apellidos', q.surname, ref.surname, fold)
    cmp('Madre/padre', q.guardianName, ref.guardianName, fold)
    cmp('Teléfono', q.phone, ref.phone, (a, b) => samePhone(a, b))
    cmp('Correo', q.email, ref.email, (a, b) => a.toLowerCase() === b.toLowerCase())
    out.push({ person, reason: phoneToo ? 'nombre y teléfono' : 'nombre', inherits, differences })
  }
  return out.sort((a, b) => (a.reason === b.reason ? a.differences.length - b.differences.length : a.reason === 'nombre y teléfono' ? -1 : 1))
}

/**
 * Qué datos lleva la ficha NUEVA al reutilizar a una persona: los de la fila y, donde la fila no trae nada, los de la ficha de referencia. Nunca viajan las
 * observaciones, el alias de pago ni nada económico. `personId` es la identidad compartida.
 */
export function reusedParticipantData(row: QueryPerson, match: PersonMatch): { name: string; surname: string | null; guardianName: string | null; phone: string | null; email: string | null; personId: string } {
  const ref = match.person.reference
  return {
    name: ref.name,
    surname: row.surname || ref.surname,
    guardianName: row.guardianName || ref.guardianName,
    phone: row.phone || ref.phone,
    email: row.email || ref.email,
    personId: ref.personId || ref.id,
  }
}
