// Reparto de avisos locales: debe dar lo mismo que el servidor (supabase/migrations/0261, probado con una base de datos real).
import { describe, expect, it } from 'vitest'
import { isEventRecipient, type RecipientEvent, type RecipientMember, type RecipientProfile } from '@/domain/eventRecipients'

const A: RecipientProfile = { id: 'uA', role: 'admin', allowedSections: null }
const B: RecipientProfile = { id: 'uB', role: 'adult', allowedSections: null }
const C: RecipientProfile = { id: 'uC', role: 'admin', allowedSections: null }
const D: RecipientProfile = { id: 'uD', role: 'adult', allowedSections: ['compras'] }
const members: RecipientMember[] = [
  { id: 'mA', linkedProfileId: 'uA', memberType: 'admin' },
  { id: 'mB', linkedProfileId: 'uB', memberType: 'adult' },
  { id: 'mC', linkedProfileId: 'uC', memberType: 'admin' },
  { id: 'mD', linkedProfileId: 'uD', memberType: 'adult' },
  { id: 'mKid', linkedProfileId: null, memberType: 'child' },
]
const who = (ev: RecipientEvent, mode: 'all' | 'assigned' | null) =>
  [A, B, C, D].filter((p) => isEventRecipient(ev, p, members, mode)).map((p) => p.id.slice(1)).join('')

const taskB: RecipientEvent = { visibility: 'shared', memberIds: ['mB'] }
const taskKid: RecipientEvent = { visibility: 'shared', memberIds: ['mKid'] }

describe('sin ajuste elegido: no se filtra nada (como siempre)', () => {
  it('todos los avisos locales siguen como estaban', () => {
    expect(who(taskB, null)).toBe('ABCD')
  })
})

describe("modo 'assigned'", () => {
  it('solo la persona asignada: los administradores no asignados no reciben', () => {
    expect(who(taskB, 'assigned')).toBe('B')
  })
  it('menor sin cuenta asignado: todos los adultos con cuenta', () => {
    expect(who(taskKid, 'assigned')).toBe('ABCD')
  })
  it('«Aviso a toda la familia»: todos con acceso al calendario (D no lo tiene)', () => {
    expect(who({ ...taskB, notifyFamily: true }, 'assigned')).toBe('ABC')
  })
  it('un invitado sin acceso al calendario no recibe aunque sea asignado a un menor... pero un adulto sí', () => {
    const guest: RecipientProfile = { id: 'uG', role: 'guest', allowedSections: ['galeria'] }
    expect(isEventRecipient(taskKid, guest, members, 'assigned')).toBe(false)
  })
})

describe("modo 'all'", () => {
  it('todas las cuentas con calendario', () => {
    expect(who(taskB, 'all')).toBe('ABC')
  })
})

describe('eventos privados', () => {
  it('siempre se evalúan como propios (el servidor solo deja verlos a quien los creó)', () => {
    expect(isEventRecipient({ visibility: 'private', memberIds: [] }, A, members, 'assigned')).toBe(true)
  })
})
