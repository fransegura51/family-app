// Invitaciones a PEPA y vínculo «Es mi hijo/a»: piezas puras (qué se enseña, qué se comparte, cómo se recuerda una invitación).
import { describe, expect, it } from 'vitest'
import {
  amGuardianOf,
  canDeclareGuardianship,
  canGiveAccess,
  guardianNamesOf,
  guardianshipDeclarationText,
  guardianshipErrorMessage,
  isMinorMember,
  myMember,
  type GuardianLink,
} from '@/domain/guardianship'
import {
  buildInvitationMessage,
  formatInvitationExpiry,
  invitationErrorMessage,
  invitationLink,
  looksLikeInvitationCode,
  normalizeInvitationCode,
  parseInvitationCheck,
  whatsappShareUrl,
} from '@/domain/invitations'
import { forgetPendingInvitation, invitationCodeFromSearch, recallPendingInvitation, rememberPendingInvitation } from '@/domain/pendingInvitation'
import type { FamilyMember, MemberType } from '@/domain/types'

const NOW = new Date(2026, 9, 21, 12, 0, 0) // 21/10/2026

function member(over: Partial<FamilyMember> & { id: string; memberType: MemberType }): FamilyMember {
  return { familyId: 'f1', name: over.id, avatar: '', color: '#000', birthDate: null, sex: null, weightGoalKg: null, birthdayFavorite: false, permissions: {}, linkedProfileId: null, photoPath: null, allowedSections: null, joinedAt: '', ...over }
}

describe('respuesta de check_invitation', () => {
  it('válida: tipo, caducidad y si hay que pedir la fecha de nacimiento', () => {
    expect(parseInvitationCheck({ valid: true, kind: 'member', expires_at: '2026-10-22T10:00:00Z', needs_birth_date: false })).toEqual({ valid: true, kind: 'member', expiresAt: '2026-10-22T10:00:00Z', needsBirthDate: false })
    expect(parseInvitationCheck({ valid: true, kind: 'family' })).toEqual({ valid: true, kind: 'family', expiresAt: null, needsBirthDate: true })
  })
  it('cualquier cosa rara, o sin tipo conocido, o con valid distinto de true, es NO válida (fallar cerrado)', () => {
    for (const bad of [null, undefined, 'x', 3, [], {}, { valid: false }, { valid: 'true', kind: 'family' }, { valid: true }, { valid: true, kind: 'otro' }]) expect(parseInvitationCheck(bad)).toEqual({ valid: false })
  })
  it('demasiados intentos se distingue de «no válida»', () => {
    expect(parseInvitationCheck({ valid: false, throttled: true })).toEqual({ valid: false, throttled: true })
  })
})

describe('código de invitación', () => {
  it('quita espacios y saltos, pero no cambia mayúsculas ni signos (el servidor ya ignora las mayúsculas de las invitaciones y el código maestro las distingue)', () => {
    expect(normalizeInvitationCode(' K7M2 QX9P\nTD ')).toBe('K7M2QX9PTD')
    expect(normalizeInvitationCode('Maestro-X')).toBe('Maestro-X')
  })
  it('longitud razonable antes de preguntar al servidor', () => {
    expect(looksLikeInvitationCode('ABC')).toBe(false)
    expect(looksLikeInvitationCode('ABCD1234')).toBe(true)
    expect(looksLikeInvitationCode('A'.repeat(41))).toBe(false)
  })
  it('el enlace de invitación rellena el código; se reconoce solo si tiene forma de código', () => {
    expect(invitationLink('https://app.example/family-app', 'K7M2QX9PTD')).toBe('https://app.example/family-app/?invitacion=K7M2QX9PTD')
    expect(invitationLink('https://app.example/family-app/', 'A B')).toBe('https://app.example/family-app/?invitacion=A%20B')
    expect(invitationCodeFromSearch('?invitacion=K7M2QX9PTD&x=1')).toBe('K7M2QX9PTD')
    expect(invitationCodeFromSearch('?invitacion=<script>')).toBeNull()
    expect(invitationCodeFromSearch('?invitacion=abc')).toBeNull()
    expect(invitationCodeFromSearch('')).toBeNull()
  })
})

describe('mensajes de error de invitación', () => {
  it('no dan pistas de si un código existe: caducado, usado o inventado dicen lo mismo', () => {
    const same = invitationErrorMessage({ message: 'Código no válido o caducado' })
    expect(same).toContain('no es válida o ha caducado')
    expect(invitationErrorMessage({ message: 'Código de acceso incorrecto' })).toBe(same)
    expect(invitationErrorMessage({ message: 'INVITATION_INVALID: La invitación no es válida' })).toBe(same)
    expect(invitationErrorMessage({ message: 'INVITATION_REQUIRED: x' })).toBe(same)
  })
  it('explica el resto en español y deja pasar lo que no es de invitaciones', () => {
    expect(invitationErrorMessage({ message: 'INVITATION_IN_USE: x' })).toContain('otra persona')
    expect(invitationErrorMessage({ message: 'NOT_AUTHORIZED' })).toContain('No tienes permiso')
    expect(invitationErrorMessage({ message: 'BIRTH_DATE_REQUIRED_ON_PROFILE: x' })).toContain('fecha de nacimiento')
    expect(invitationErrorMessage({ message: 'ADULT_REQUIRED: x' })).toContain('menor de edad')
    expect(invitationErrorMessage({ message: 'MEMBER_NOT_INVITABLE' })).toContain('bebé')
    expect(invitationErrorMessage({ message: 'otra cosa' })).toBeNull()
    expect(invitationErrorMessage(null)).toBeNull()
  })
})

describe('texto de la invitación para copiar o compartir', () => {
  it('lleva código, caducidad, enlace con el código, los pasos (incluido que el código de 6 cifras es otro) y a quién pedir ayuda', () => {
    const exp = new Date(2026, 9, 22, 14, 30, 0)
    const text = buildInvitationMessage({ kind: 'member', code: 'K7M2QX9PTD', expiresAt: exp, appUrl: 'https://app.example/family-app/', inviterName: 'Jennifer', recipientName: 'Eric', now: NOW })
    expect(text).toContain('Hola Eric.')
    expect(text).toContain('Jennifer te invita a unirte a tu familia en PEPA')
    expect(text).toContain('Tu código de invitación: K7M2QX9PTD')
    expect(text).toContain('válido hasta mañana a las 14:30, un solo uso')
    expect(text).toContain('https://app.example/family-app/?invitacion=K7M2QX9PTD')
    expect(text).toContain('Tengo una invitación')
    expect(text).toContain('código de 6 cifras')
    expect(text).toContain('es distinto del código de invitación')
    expect(text).toContain('info@pepafamilyapp.es')
  })
  it('la de familia nueva habla de crear el espacio familiar, y sin nombres ni caducidad sigue siendo correcta', () => {
    const text = buildInvitationMessage({ kind: 'family', code: 'ABCD1234', expiresAt: null, appUrl: 'https://app.example/' })
    expect(text).toContain('a crear tu espacio familiar en PEPA')
    expect(text).toContain('Pon el nombre de tu familia')
    expect(text).toContain('Te invitan')
    expect(text).toContain('(un solo uso)')
    expect(text.startsWith('Hola. ')).toBe(true)
  })
  it('caducidad en palabras: hoy, mañana o con fecha', () => {
    expect(formatInvitationExpiry(new Date(2026, 9, 21, 20, 5), NOW)).toBe('hoy a las 20:05')
    expect(formatInvitationExpiry(new Date(2026, 9, 22, 9, 0), NOW)).toBe('mañana a las 09:00')
    expect(formatInvitationExpiry(new Date(2026, 9, 25, 9, 0), NOW)).toBe('el 25/10/2026 a las 09:00')
    expect(formatInvitationExpiry('no es fecha', NOW)).toBe('')
  })
  it('el enlace de WhatsApp lleva el texto codificado', () => {
    const url = whatsappShareUrl('Hola ñ\n1. Abre')
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe('Hola ñ\n1. Abre')
  })
})

describe('invitación pendiente (solo para rellenar; el servidor la vuelve a comprobar)', () => {
  function fakeStorage() {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
  }
  it('se recuerda, se lee y se olvida', () => {
    const st = fakeStorage()
    expect(recallPendingInvitation(st)).toBeNull()
    rememberPendingInvitation({ code: 'K7M2QX9PTD', kind: 'member', needsBirthDate: false }, st)
    expect(recallPendingInvitation(st)).toEqual({ code: 'K7M2QX9PTD', kind: 'member', needsBirthDate: false })
    forgetPendingInvitation(st)
    expect(recallPendingInvitation(st)).toBeNull()
  })
  it('lo manipulado o roto no vale (código raro, tipo desconocido, JSON roto)', () => {
    const st = fakeStorage()
    st.setItem('pepa_pending_invitation', '{"code":"x","kind":"family"}')
    expect(recallPendingInvitation(st)).toBeNull()
    st.setItem('pepa_pending_invitation', '{"code":"ABCD1234","kind":"admin"}')
    expect(recallPendingInvitation(st)).toBeNull()
    st.setItem('pepa_pending_invitation', 'no es json')
    expect(recallPendingInvitation(st)).toBeNull()
  })
  it('sin almacenamiento no falla', () => {
    expect(recallPendingInvitation(null)).toBeNull()
    expect(() => rememberPendingInvitation({ code: 'ABCD1234', kind: 'family', needsBirthDate: true }, null)).not.toThrow()
  })
})

describe('vínculo «Es mi hijo/a»: menores', () => {
  it('niño o bebé menor de 18, o sin fecha (lo prudente), es menor; a los 18 deja de serlo; un adulto nunca', () => {
    expect(isMinorMember({ memberType: 'child', birthDate: '2016-03-03' }, NOW)).toBe(true)
    expect(isMinorMember({ memberType: 'baby', birthDate: null }, NOW)).toBe(true)
    expect(isMinorMember({ memberType: 'child', birthDate: null }, NOW)).toBe(true)
    expect(isMinorMember({ memberType: 'child', birthDate: '2008-10-22' }, NOW)).toBe(true) // cumple 18 mañana
    expect(isMinorMember({ memberType: 'child', birthDate: '2008-10-21' }, NOW)).toBe(false) // hoy cumple 18: ya no
    expect(isMinorMember({ memberType: 'child', birthDate: '2000-01-01' }, NOW)).toBe(false)
    expect(isMinorMember({ memberType: 'adult', birthDate: '2020-01-01' }, NOW)).toBe(false)
    expect(isMinorMember({ memberType: 'admin', birthDate: null }, NOW)).toBe(false)
    expect(isMinorMember({ memberType: 'guest', birthDate: '2020-01-01' }, NOW)).toBe(false)
  })
})

describe('qué se enseña: «Dar acceso a PEPA» y «Es mi hijo/a» (el servidor lo vuelve a comprobar todo)', () => {
  const mama = member({ id: 'mama', memberType: 'admin', linkedProfileId: 'p-mama' })
  const papa = member({ id: 'papa', memberType: 'adult', linkedProfileId: 'p-papa' })
  const tio = member({ id: 'tio', memberType: 'adult', linkedProfileId: 'p-tio' })
  const eric = member({ id: 'eric', memberType: 'child', birthDate: '2016-03-03' })
  const fer = member({ id: 'fer', memberType: 'baby', birthDate: '2025-01-01' })
  const abuela = member({ id: 'abuela', memberType: 'adult', birthDate: '1950-01-01' })
  const amiga = member({ id: 'amiga', memberType: 'guest' })
  const mayor = member({ id: 'mayor', memberType: 'child', birthDate: '2000-01-01' })
  const links: GuardianLink[] = [{ id: 'l1', childMemberId: 'eric', guardianMemberId: 'papa', relationship: 'parent', declaredAt: '2026-10-21T10:00:00Z' }]
  const roleOf = (r: 'admin' | 'adult' | 'guest' | 'child') => ({ role: r })

  it('la administradora de la familia puede dar acceso a cualquier ficha sin cuenta, salvo bebés', () => {
    for (const f of [eric, abuela, amiga, mayor]) expect(canGiveAccess(f, roleOf('admin'), mama, [], NOW), f.id).toBe(true)
    expect(canGiveAccess(fer, roleOf('admin'), mama, [], NOW)).toBe(false)
    expect(canGiveAccess(papa, roleOf('admin'), mama, [], NOW)).toBe(false) // ya tiene cuenta
  })
  it('una madre/padre vinculado puede dar acceso SOLO a la ficha de su hijo menor, aunque no sea administrador', () => {
    expect(canGiveAccess(eric, roleOf('adult'), papa, links, NOW)).toBe(true)
    expect(canGiveAccess(abuela, roleOf('adult'), papa, links, NOW)).toBe(false) // no es un menor
    expect(canGiveAccess(amiga, roleOf('adult'), papa, links, NOW)).toBe(false)
    expect(canGiveAccess(mayor, roleOf('adult'), papa, links, NOW)).toBe(false) // ya cumplió 18
    expect(canGiveAccess(fer, roleOf('adult'), papa, links, NOW)).toBe(false)
  })
  it('quien no está vinculado, un invitado o un niño con cuenta no pueden dar acceso', () => {
    expect(canGiveAccess(eric, roleOf('adult'), tio, links, NOW)).toBe(false)
    expect(canGiveAccess(eric, roleOf('adult'), tio, [], NOW)).toBe(false)
    expect(canGiveAccess(eric, roleOf('guest'), papa, links, NOW)).toBe(false)
    expect(canGiveAccess(eric, roleOf('child'), papa, links, NOW)).toBe(false)
    expect(canGiveAccess(eric, roleOf('adult'), null, links, NOW)).toBe(false)
  })
  it('«Es mi hijo/a» solo en fichas de menores, de personas adultas o administradoras, que no sean la suya ni de las que ya son tutoras', () => {
    expect(canDeclareGuardianship(eric, roleOf('adult'), tio, links, NOW)).toBe(true) // un segundo/tercer tutor: sin límite
    expect(canDeclareGuardianship(eric, roleOf('admin'), mama, links, NOW)).toBe(true)
    expect(canDeclareGuardianship(fer, roleOf('adult'), papa, links, NOW)).toBe(true)
    expect(canDeclareGuardianship(eric, roleOf('adult'), papa, links, NOW)).toBe(false) // ya es tutor
    expect(canDeclareGuardianship(abuela, roleOf('adult'), papa, links, NOW)).toBe(false) // una persona adulta nunca es «el hijo»
    expect(canDeclareGuardianship(amiga, roleOf('adult'), papa, links, NOW)).toBe(false)
    expect(canDeclareGuardianship(mayor, roleOf('adult'), papa, links, NOW)).toBe(false)
    expect(canDeclareGuardianship(papa, roleOf('adult'), papa, links, NOW)).toBe(false) // uno mismo
    expect(canDeclareGuardianship(eric, roleOf('guest'), tio, links, NOW)).toBe(false)
    expect(canDeclareGuardianship(eric, roleOf('child'), tio, links, NOW)).toBe(false)
    expect(canDeclareGuardianship(eric, roleOf('adult'), null, links, NOW)).toBe(false) // sin ficha propia
  })
  it('se reconoce quién es tutor y se muestran los nombres vinculados', () => {
    expect(amGuardianOf(eric, papa, links)).toBe(true)
    expect(amGuardianOf(eric, tio, links)).toBe(false)
    expect(amGuardianOf(eric, null, links)).toBe(false)
    expect(guardianNamesOf(eric, [mama, papa, tio, eric], links)).toEqual([{ name: 'papa', relationship: 'parent' }])
    expect(guardianNamesOf(fer, [mama, papa, fer], links)).toEqual([])
    expect(myMember([mama, papa], { id: 'p-papa' })?.id).toBe('papa')
    expect(myMember([mama, papa], { id: 'otro' })).toBeNull()
  })
  it('la declaración es honesta: dice que PEPA no la comprueba con documentos', () => {
    const t = guardianshipDeclarationText('Eric', 'parent')
    expect(t).toContain('Declaro que soy madre o padre de Eric')
    expect(t).toContain('no comprueba este vínculo con documentos')
    expect(t).toContain('menor de 18 años')
    expect(guardianshipDeclarationText('Eric', 'legal_guardian')).toContain('tutor o tutora legal')
    expect(t).not.toMatch(/verificad|certificad|acreditad/i)
  })
  it('errores del servidor del vínculo, en español', () => {
    expect(guardianshipErrorMessage({ message: 'RECENT_AUTH_REQUIRED' })).toContain('confirma primero que eres tú')
    expect(guardianshipErrorMessage({ message: 'DECLARATION_REQUIRED' })).toContain('aceptar la declaración')
    expect(guardianshipErrorMessage({ message: 'CHILD_MUST_BE_MINOR' })).toContain('menores de 18')
    expect(guardianshipErrorMessage({ message: 'ALREADY_LINKED' })).toContain('Ya figuras')
    expect(guardianshipErrorMessage({ message: 'raro' })).toBeNull()
  })
})
