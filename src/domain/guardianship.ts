import type { FamilyMember, Profile } from '@/domain/types'

// Vínculo parental («Es mi hijo/a») — FASE A. Es una DECLARACIÓN de la propia persona adulta, no una verificación documental de la filiación ni de la tutela, y la app
// no debe presentarla como tal. El servidor (0293) lo comprueba todo; estas funciones solo deciden qué se enseña. Ocultar un botón NUNCA es la seguridad.
export const GUARDIANSHIP_DECLARATION_VERSION = '2026-10-v1'

export type GuardianRelationship = 'parent' | 'legal_guardian'

export const GUARDIAN_RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  parent: 'Madre/padre',
  legal_guardian: 'Tutor/a legal',
}

/** Texto que la persona lee y acepta. Honesto sobre lo que es y lo que no. */
export function guardianshipDeclarationText(childName: string, relationship: GuardianRelationship): string {
  const who = relationship === 'parent' ? 'madre o padre' : 'tutor o tutora legal'
  return (
    `Declaro que soy ${who} de ${childName} y que me hago responsable de esta declaración. ` +
    'Entiendo que PEPA no comprueba este vínculo con documentos: se basa en lo que declaro, queda registrado con mi nombre y la fecha, ' +
    'y me permite gestionar el acceso a PEPA de esta ficha mientras sea menor de 18 años.'
  )
}

export interface GuardianLink {
  id: string
  childMemberId: string
  guardianMemberId: string
  relationship: GuardianRelationship
  declaredAt: string
}

/** ¿Es menor de 18 años? Un niño o bebé sin fecha de nacimiento cuenta como menor (lo más prudente), igual que en la base de datos. */
export function isMinorMember(m: Pick<FamilyMember, 'memberType' | 'birthDate'>, now: Date = new Date()): boolean {
  if (m.memberType !== 'child' && m.memberType !== 'baby') return false
  if (!m.birthDate) return true
  const limit = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate())
  const limitIso = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`
  return m.birthDate > limitIso
}

/** Mis fichas (la de mi cuenta) dentro de la lista de la familia. */
export function myMember(members: FamilyMember[], profile: Pick<Profile, 'id'>): FamilyMember | null {
  return members.find((m) => m.linkedProfileId === profile.id) ?? null
}

export function amGuardianOf(child: FamilyMember, me: FamilyMember | null, links: GuardianLink[]): boolean {
  return me !== null && links.some((l) => l.childMemberId === child.id && l.guardianMemberId === me.id)
}

/** «Es mi hijo/a»: personas adultas o administradoras con cuenta, sobre fichas de menores que no son la suya y de las que aún no son tutoras. */
export function canDeclareGuardianship(child: FamilyMember, profile: Pick<Profile, 'role'>, me: FamilyMember | null, links: GuardianLink[], now: Date = new Date()): boolean {
  if (profile.role !== 'admin' && profile.role !== 'adult') return false
  if (me === null || child.id === me.id) return false
  if (!isMinorMember(child, now)) return false
  return !amGuardianOf(child, me, links)
}

/**
 * «Dar acceso a PEPA»: fichas sin cuenta (los bebés no tienen). La administradora de la familia, en cualquiera; una madre/padre vinculado, SOLO en la ficha de su hijo menor
 * (nunca una persona adulta ni un invitado). El servidor lo vuelve a comprobar.
 */
export function canGiveAccess(child: FamilyMember, profile: Pick<Profile, 'role'>, me: FamilyMember | null, links: GuardianLink[], now: Date = new Date()): boolean {
  if (child.linkedProfileId) return false
  if (child.memberType === 'baby') return false
  if (profile.role === 'admin') return true
  return profile.role === 'adult' && child.memberType === 'child' && isMinorMember(child, now) && amGuardianOf(child, me, links)
}

/** Nombres de las personas vinculadas a una ficha, para enseñarlos en ella. */
export function guardianNamesOf(child: FamilyMember, members: FamilyMember[], links: GuardianLink[]): { name: string; relationship: GuardianRelationship }[] {
  return links
    .filter((l) => l.childMemberId === child.id)
    .map((l) => ({ name: members.find((m) => m.id === l.guardianMemberId)?.name ?? '', relationship: l.relationship }))
    .filter((g) => g.name !== '')
}

/** Frase para los errores del servidor del vínculo. */
export function guardianshipErrorMessage(err: unknown): string | null {
  const raw = typeof err === 'object' && err !== null ? String((err as { message?: unknown }).message ?? '') : String(err ?? '')
  if (/RECENT_AUTH_REQUIRED/.test(raw)) return 'Por seguridad, confirma primero que eres tú.'
  if (/DECLARATION_REQUIRED/.test(raw)) return 'Hay que aceptar la declaración para continuar.'
  if (/ALREADY_LINKED/.test(raw)) return 'Ya figuras como madre, padre o tutor de esta persona.'
  if (/CHILD_MUST_BE_MINOR/.test(raw)) return 'Solo se puede indicar este vínculo para menores de 18 años.'
  if (/CANNOT_DECLARE_SELF/.test(raw)) return 'No puedes indicar este vínculo contigo mismo.'
  if (/NOT_AUTHORIZED|NO_MEMBER_PROFILE|CHILD_NOT_FOUND/.test(raw)) return 'No se puede registrar este vínculo.'
  return null
}
