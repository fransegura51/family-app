// Contactos — dominio puro: nombre a mostrar, teléfonos y correos múltiples, y cómo se incorpora un dato NUEVO a un contacto que ya existe.
// REGLA: nunca se sobrescribe un dato existente sin preguntar. Un dato nuevo sobre un campo vacío se añade solo SI la identidad está confirmada; si choca con uno que ya hay,
// se pregunta (añadir como adicional / sustituir / conservar el anterior). Lo mismo para cualquier otro dato contradictorio.
import { foldText } from '@/domain/groups'
import { parsePhone } from '@/domain/participantImport'
import type { Contact } from '@/domain/types'

export const RELATIONS = ['madre', 'padre', 'tutor', 'familiar', 'otro'] as const
export type Relation = (typeof RELATIONS)[number]
export const RELATION_LABEL: Record<Relation, string> = { madre: 'Madre', padre: 'Padre', tutor: 'Tutor/a', familiar: 'Familiar', otro: 'Otro' }

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Nombre completo de la ficha: «Nombre Apellidos» (el nombre habitual/apodo se muestra aparte, no sustituye). */
export function contactFullName(c: Pick<Contact, 'name' | 'surname'>): string {
  return [clean(c.name), clean(c.surname)].filter(Boolean).join(' ')
}

export function allPhones(c: Pick<Contact, 'phone' | 'extraPhones'>): string[] {
  return [c.phone, ...(c.extraPhones ?? [])].map((p) => clean(p)).filter(Boolean)
}
export function allEmails(c: Pick<Contact, 'email' | 'extraEmails'>): string[] {
  return [c.email, ...(c.extraEmails ?? [])].map((p) => clean(p)).filter(Boolean)
}
export function allCategories(c: Pick<Contact, 'category' | 'extraCategories'>): string[] {
  return [c.category, ...(c.extraCategories ?? [])].map((p) => clean(p)).filter(Boolean)
}

/** Teléfono comparable: 9 dígitos sin prefijo para los españoles, «+…» para los internacionales; null si no hay dígitos suficientes. */
export function phoneKey(raw: string | null | undefined): string | null {
  const p = parsePhone(raw ?? '').phone
  return p ? p.replace(/\D/g, '') : null
}
export const samePhone = (a: string | null | undefined, b: string | null | undefined) => {
  const ka = phoneKey(a)
  return !!ka && ka === phoneKey(b)
}
export const sameEmail = (a: string | null | undefined, b: string | null | undefined) => !!clean(a) && clean(a).toLowerCase() === clean(b).toLowerCase()

export function contactMatchesPhone(c: Pick<Contact, 'phone' | 'extraPhones'>, phone: string): boolean {
  return allPhones(c).some((p) => samePhone(p, phone))
}

// ---------------------------------------------------------------------------------------------- incorporar datos nuevos a un contacto existente
export type Resolution = 'anadir' | 'sustituir' | 'conservar'

export interface Conflict {
  /** Identificador estable para guardar la decisión. */
  key: string
  field: 'phone' | 'email' | 'surname' | 'nickname' | 'whatsappName' | 'address' | 'birthDate'
  label: string
  existing: string
  incoming: string
  /** Opciones válidas. Teléfono y correo admiten «Añadir como adicional»; el resto solo sustituir o conservar. */
  options: Resolution[]
}

export interface ContactPatch {
  phone?: string | null
  email?: string | null
  extraPhones?: string[]
  extraEmails?: string[]
  surname?: string | null
  nickname?: string | null
  whatsappName?: string | null
  address?: string | null
  birthDate?: string | null
}

export interface IncomingContactData {
  phone?: string | null
  email?: string | null
  surname?: string | null
  nickname?: string | null
  whatsappName?: string | null
  address?: string | null
  birthDate?: string | null
}

export interface ContactMergePlan {
  /** Lo que se puede aplicar ya (campos vacíos con identidad confirmada). */
  auto: ContactPatch
  /** Lo que choca con datos ya existentes: hay que preguntar. */
  conflicts: Conflict[]
  /** Datos que se han ignorado por ser iguales a los que ya hay. */
  same: string[]
  /** Identidad NO confirmada: no se aplica nada automáticamente (todo queda pendiente de confirmar). */
  identityUnconfirmed: boolean
}

const TEXT_FIELDS: { field: 'surname' | 'nickname' | 'whatsappName' | 'address'; label: string }[] = [
  { field: 'surname', label: 'Apellidos' },
  { field: 'nickname', label: 'Apodo o nombre habitual' },
  { field: 'whatsappName', label: 'Nombre de WhatsApp' },
  { field: 'address', label: 'Dirección' },
]

export function planContactMerge(existing: Contact, incoming: IncomingContactData, identityConfirmed: boolean): ContactMergePlan {
  const plan: ContactMergePlan = { auto: {}, conflicts: [], same: [], identityUnconfirmed: !identityConfirmed }

  const phone = clean(incoming.phone)
  if (phone) {
    if (contactMatchesPhone(existing, phone)) plan.same.push(`Teléfono ${phone}`)
    else if (!clean(existing.phone) && identityConfirmed) plan.auto.phone = phone
    else plan.conflicts.push({ key: 'phone', field: 'phone', label: 'Teléfono', existing: allPhones(existing).join(' · ') || '(ninguno)', incoming: phone, options: ['anadir', 'sustituir', 'conservar'] })
  }
  const email = clean(incoming.email)
  if (email) {
    if (allEmails(existing).some((e) => sameEmail(e, email))) plan.same.push(`Correo ${email}`)
    else if (!clean(existing.email) && identityConfirmed) plan.auto.email = email
    else plan.conflicts.push({ key: 'email', field: 'email', label: 'Correo', existing: allEmails(existing).join(' · ') || '(ninguno)', incoming: email, options: ['anadir', 'sustituir', 'conservar'] })
  }
  for (const { field, label } of TEXT_FIELDS) {
    const value = clean(incoming[field])
    if (!value) continue
    const current = clean(existing[field])
    if (current && foldText(current) === foldText(value)) plan.same.push(`${label}: ${value}`)
    else if (!current && identityConfirmed) plan.auto[field] = value
    else plan.conflicts.push({ key: field, field, label, existing: current || '(vacío)', incoming: value, options: ['sustituir', 'conservar'] })
  }
  const birth = clean(incoming.birthDate)
  if (birth) {
    if (existing.birthDate === birth) plan.same.push('Cumpleaños')
    else if (!existing.birthDate && identityConfirmed) plan.auto.birthDate = birth
    else plan.conflicts.push({ key: 'birthDate', field: 'birthDate', label: 'Cumpleaños', existing: existing.birthDate ?? '(vacío)', incoming: birth, options: ['sustituir', 'conservar'] })
  }
  return plan
}

/**
 * Aplica el plan con las decisiones de la persona. Un conflicto SIN decisión se conserva tal cual (nunca se pisa nada por defecto).
 * «Sustituir» un teléfono mueve el anterior fuera del principal y NO lo pierde del todo: queda en los adicionales solo si la persona eligió «Añadir».
 */
export function applyContactMerge(existing: Contact, plan: ContactMergePlan, decisions: Record<string, Resolution | undefined>): ContactPatch {
  const patch: ContactPatch = { ...plan.auto }
  for (const c of plan.conflicts) {
    const d = decisions[c.key] ?? 'conservar'
    if (d === 'conservar') continue
    if (c.field === 'phone') {
      if (d === 'anadir') patch.extraPhones = [...(patch.extraPhones ?? existing.extraPhones ?? []), c.incoming]
      else patch.phone = c.incoming
    } else if (c.field === 'email') {
      if (d === 'anadir') patch.extraEmails = [...(patch.extraEmails ?? existing.extraEmails ?? []), c.incoming]
      else patch.email = c.incoming
    } else if (d === 'sustituir') {
      ;(patch as Record<string, unknown>)[c.field] = c.incoming
    }
  }
  // Si el principal estaba vacío y se añadió un adicional, ese pasa a principal (no se queda un contacto con adicionales y sin principal).
  if (!clean(existing.phone) && patch.phone === undefined && patch.extraPhones?.length) {
    patch.phone = patch.extraPhones[0]
    patch.extraPhones = patch.extraPhones.slice(1)
  }
  return patch
}

export const hasPatch = (p: ContactPatch) => Object.values(p).some((v) => v !== undefined && !(Array.isArray(v) && v.length === 0))

// ---------------------------------------------------------------------------------------------- buscar coincidencias
export interface ContactCandidate {
  contact: Contact
  by: 'telefono' | 'correo' | 'nombre'
}

/** Contactos de la agenda que pueden ser la misma persona. Teléfono o correo iguales = coincidencia fuerte; solo el nombre = posible (se pide confirmar). */
export function findContactCandidates(contacts: Contact[], q: { name?: string | null; phone?: string | null; email?: string | null; whatsappName?: string | null }): ContactCandidate[] {
  const out = new Map<string, ContactCandidate>()
  for (const c of contacts) {
    if (q.phone && contactMatchesPhone(c, q.phone)) out.set(c.id, { contact: c, by: 'telefono' })
    else if (q.email && allEmails(c).some((e) => sameEmail(e, q.email))) out.set(c.id, { contact: c, by: 'correo' })
  }
  const names = [q.name, q.whatsappName].map((n) => foldText(n)).filter(Boolean)
  if (names.length) {
    for (const c of contacts) {
      if (out.has(c.id)) continue
      const mine = [contactFullName(c), c.name, c.nickname, c.whatsappName].map((n) => foldText(n)).filter(Boolean)
      if (names.some((n) => mine.includes(n))) out.set(c.id, { contact: c, by: 'nombre' })
    }
  }
  const rank = { telefono: 0, correo: 1, nombre: 2 } as const
  return [...out.values()].sort((a, b) => rank[a.by] - rank[b.by] || a.contact.name.localeCompare(b.contact.name, 'es'))
}
