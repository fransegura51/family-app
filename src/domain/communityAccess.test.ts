// Acceso por edad y permisos de Comunidad (regla de 0277): lógica pura, textos y aviso de «el acceso ha cambiado» del manejador común de errores.
import { describe, expect, it, vi } from 'vitest'
import {
  accessErrorNotice,
  accessFromStatus,
  applyMinorToggle,
  canParticipateLevel,
  canReadLevel,
  FULL_ACCESS,
  groupMinors,
  isAccessErrorCode,
  minorPermissionErrorText,
  needsBirthdateText,
  participationBlockedText,
  READ_ONLY_HELP,
  under15Text,
  UNAVAILABLE_TITLE,
  unavailableReasonText,
  type MinorPermission,
} from '@/domain/communityAccess'
import { COMMUNITY_ERROR_MESSAGES, communityErrorText, onCommunityAccessError, toCommunityError } from '@/domain/communityErrors'

describe('niveles de acceso', () => {
  it('sin dato (cargando, sin red o servidor anterior) se considera acceso completo: decide siempre el servidor', () => {
    expect(accessFromStatus(null)).toEqual(FULL_ACCESS)
    expect(accessFromStatus(undefined)).toEqual(FULL_ACCESS)
    expect(accessFromStatus({})).toEqual(FULL_ACCESS)
  })

  it('lee el nivel y el motivo que manda community_status', () => {
    expect(accessFromStatus({ access: 'read', accessReason: 'read_only' })).toEqual({ level: 'read', reason: 'read_only' })
    expect(accessFromStatus({ access: 'none', accessReason: 'under_15' })).toEqual({ level: 'none', reason: 'under_15' })
    expect(accessFromStatus({ access: 'none' })).toEqual({ level: 'none', reason: null })
    expect(accessFromStatus({ access: 'participate', accessReason: null })).toEqual({ level: 'participate', reason: null })
  })

  it('leer: solo «none» no puede; participar: solo «participate» puede (participar exige leer)', () => {
    expect(canReadLevel('none')).toBe(false)
    expect(canReadLevel('read')).toBe(true)
    expect(canReadLevel('participate')).toBe(true)
    expect(canParticipateLevel('none')).toBe(false)
    expect(canParticipateLevel('read')).toBe(false)
    expect(canParticipateLevel('participate')).toBe(true)
  })
})

describe('textos de por qué no se puede entrar', () => {
  it('cada motivo tiene su frase amable y distinta', () => {
    const texts = (['under_15', 'age_unknown', 'not_authorized'] as const).map((r) => unavailableReasonText(r))
    expect(new Set(texts).size).toBe(3)
    expect(unavailableReasonText('under_15')).toContain('15 años')
    expect(unavailableReasonText('age_unknown')).toContain('fecha de nacimiento')
    expect(unavailableReasonText('not_authorized')).toContain('quien administra tu familia')
    expect(unavailableReasonText(null).length).toBeGreaterThan(10)
    expect(UNAVAILABLE_TITLE).toBe('Comunidad no está disponible para tu cuenta')
  })

  it('no culpa ni asusta: sin mayúsculas gritando ni jerga técnica', () => {
    for (const r of ['under_15', 'age_unknown', 'not_authorized', null] as const) {
      const t = unavailableReasonText(r)
      expect(t).not.toMatch(/error|DENIED|RLS|servidor/i)
    }
  })

  it('el aviso de acceso cambiado depende del nivel YA refrescado', () => {
    expect(accessErrorNotice('COMMUNITY_ACCESS_DENIED', 'none', 'not_authorized').title).toBe(UNAVAILABLE_TITLE)
    expect(accessErrorNotice('PARTICIPATION_NOT_ALLOWED', 'read').title).toBe('Tienes permiso solo de lectura')
    expect(accessErrorNotice('PARTICIPATION_NOT_ALLOWED', 'read').text).toContain('ahora puedes leer')
    const stale = accessErrorNotice('PARTICIPATION_NOT_ALLOWED', 'participate')
    expect(stale.title).toContain('permisos')
    expect(stale.text).toContain('Vuelve a intentarlo')
  })

  it('«Compartir en Comunidad» explica el motivo exacto del bloqueo (o ninguno si puede)', () => {
    expect(participationBlockedText({ visible: true, launched: true, access: 'participate' })).toBeNull()
    expect(participationBlockedText(null)).toBeNull()
    expect(participationBlockedText({ visible: false, launched: false, access: 'participate' })).toContain('todavía no está abierta')
    expect(participationBlockedText({ visible: false, launched: true, access: 'none', accessReason: 'under_15' })).toContain('15 años')
    expect(participationBlockedText({ visible: true, launched: true, access: 'read', accessReason: 'read_only' })).toContain(READ_ONLY_HELP)
  })
})

describe('errores de acceso en el manejador común', () => {
  it('los dos códigos nuevos tienen mensaje amable; ADULT_REQUIRED ya no existe como código propio', () => {
    expect(COMMUNITY_ERROR_MESSAGES.COMMUNITY_ACCESS_DENIED).toContain('no tienes acceso')
    expect(COMMUNITY_ERROR_MESSAGES.PARTICIPATION_NOT_ALLOWED).toContain('solo de lectura')
    expect(Object.keys(COMMUNITY_ERROR_MESSAGES)).not.toContain('ADULT_REQUIRED')
    expect(isAccessErrorCode('COMMUNITY_ACCESS_DENIED')).toBe(true)
    expect(isAccessErrorCode('PARTICIPATION_NOT_ALLOWED')).toBe(true)
    expect(isAccessErrorCode('BANNED')).toBe(false)
  })

  it('reconoce los códigos dentro del mensaje de Supabase', () => {
    expect(toCommunityError({ message: 'COMMUNITY_ACCESS_DENIED' }).code).toBe('COMMUNITY_ACCESS_DENIED')
    expect(toCommunityError({ message: 'PARTICIPATION_NOT_ALLOWED' }).code).toBe('PARTICIPATION_NOT_ALLOWED')
    expect(communityErrorText({ message: 'PARTICIPATION_NOT_ALLOWED' })).toBe(COMMUNITY_ERROR_MESSAGES.PARTICIPATION_NOT_ALLOWED)
  })

  it('un servidor antiguo que aún diga ADULT_REQUIRED se trata como solo lectura, no como «algo ha fallado»', () => {
    expect(toCommunityError({ message: 'ADULT_REQUIRED' }).code).toBe('PARTICIPATION_NOT_ALLOWED')
  })

  it('avisa a quien se haya suscrito SOLO con estos dos errores, y se puede dejar de escuchar', () => {
    const seen = vi.fn()
    const off = onCommunityAccessError(seen)
    toCommunityError({ message: 'BANNED' })
    toCommunityError({ message: 'algo raro' })
    expect(seen).not.toHaveBeenCalled()
    toCommunityError({ message: 'COMMUNITY_ACCESS_DENIED' })
    toCommunityError({ message: 'PARTICIPATION_NOT_ALLOWED' })
    expect(seen.mock.calls).toEqual([['COMMUNITY_ACCESS_DENIED'], ['PARTICIPATION_NOT_ALLOWED']])
    off()
    toCommunityError({ message: 'COMMUNITY_ACCESS_DENIED' })
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('mostrar el texto de un error ya convertido no vuelve a avisar (un solo aviso por fallo)', () => {
    const seen = vi.fn()
    const off = onCommunityAccessError(seen)
    const e = toCommunityError({ message: 'COMMUNITY_ACCESS_DENIED' })
    communityErrorText(e)
    communityErrorText(e)
    off()
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

describe('permisos de las personas de 15 a 17 años: reglas de los interruptores', () => {
  it('activar «participar» activa también «leer»', () => {
    expect(applyMinorToggle({ canRead: false, canParticipate: false }, 'participate', true)).toEqual({ canRead: true, canParticipate: true })
  })

  it('desactivar «leer» desactiva también «participar»', () => {
    expect(applyMinorToggle({ canRead: true, canParticipate: true }, 'read', false)).toEqual({ canRead: false, canParticipate: false })
  })

  it('activar «leer» no activa «participar»; desactivar «participar» deja «leer» como estaba', () => {
    expect(applyMinorToggle({ canRead: false, canParticipate: false }, 'read', true)).toEqual({ canRead: true, canParticipate: false })
    expect(applyMinorToggle({ canRead: true, canParticipate: true }, 'participate', false)).toEqual({ canRead: true, canParticipate: false })
  })

  it('nunca produce «participar» sin «leer» (lo mismo que exige la base de datos)', () => {
    for (const read of [true, false]) {
      for (const part of [true, false]) {
        for (const field of ['read', 'participate'] as const) {
          for (const value of [true, false]) {
            const r = applyMinorToggle({ canRead: read, canParticipate: part && read }, field, value)
            expect(!r.canParticipate || r.canRead).toBe(true)
          }
        }
      }
    }
  })
})

describe('lista de personas', () => {
  const base = { updatedAt: null, canRead: false, canParticipate: false }
  const list: MinorPermission[] = [
    { ...base, profileId: 'a', name: 'Lucía', age: 16, status: 'configurable' },
    { ...base, profileId: 'b', name: 'Mateo', age: 11, status: 'under_15' },
    { ...base, profileId: 'c', name: 'Sofía', age: null, status: 'needs_birthdate' },
  ]

  it('se reparte en tres grupos', () => {
    const g = groupMinors(list)
    expect(g.configurable.map((m) => m.name)).toEqual(['Lucía'])
    expect(g.under15.map((m) => m.name)).toEqual(['Mateo'])
    expect(g.needsBirthdate.map((m) => m.name)).toEqual(['Sofía'])
    expect(groupMinors([])).toEqual({ configurable: [], under15: [], needsBirthdate: [] })
  })

  it('los textos informativos nombran a la persona', () => {
    expect(under15Text(list[1])).toContain('Mateo (11 años): aún no puede acceder')
    expect(needsBirthdateText(list[2])).toContain('Sofía')
    expect(needsBirthdateText(list[2])).toContain('Añade su fecha de nacimiento en su ficha de familia')
  })

  it('los errores del panel hablan de la familia, no de «la administración de Comunidad»', () => {
    expect(minorPermissionErrorText({ message: 'NOT_ADMIN' })).toContain('administra la familia')
    expect(minorPermissionErrorText({ message: 'NOT_AVAILABLE' })).toContain('ya no se puede cambiar')
    expect(minorPermissionErrorText({ message: 'AUTH_REQUIRED' })).toContain('Entra de nuevo')
    expect(minorPermissionErrorText(new Error('network'))).toContain('Inténtalo de nuevo')
  })
})
