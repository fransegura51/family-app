import { describe, expect, it } from 'vitest'
import {
  DATE_CHOICES,
  DATE_FIELD_LABEL,
  DATE_STATUS_QUESTION,
  dateDraftFromSaved,
  dateDraftToPatch,
  isDateDraftDirty,
  MISSING_DATE_MESSAGE,
  MISSING_STATUS_MESSAGE,
  TIME_FIELD_LABEL,
  validateDateDraft,
  type DateDraft,
} from '@/domain/eventDateForm'
import { celebrationDateStatus, dateWithStatusLabel, deriveOperationalDate } from '@/domain/eventCelebration'
import { makeDecision } from '@/domain/eventFoodFixtures'

const empty: DateDraft = { date: '', time: '', status: null }

describe('Etiquetas y orden de la UX de fecha (A/B/C)', () => {
  it('A. cada campo tiene etiqueta visible y permanente', () => {
    expect(DATE_FIELD_LABEL).toBe('📅 Fecha')
    expect(TIME_FIELD_LABEL).toBe('🕐 Hora (opcional)')
    expect(DATE_STATUS_QUESTION).toBe('¿Esta fecha es provisional o confirmada?')
  })
  it('B. Provisional / Confirmada son las únicas dos opciones de estado ("Todavía no lo sabemos" NO es un estado de la fecha)', () => {
    expect(DATE_CHOICES.map((c) => c.value)).toEqual(['provisional', 'confirmada'])
    expect(DATE_CHOICES.map((c) => c.label)).toEqual(['◷ Provisional', '✓ Confirmada'])
  })
  it('C. la hora es opcional: guardar sin hora es válido', () => {
    expect(validateDateDraft({ date: '2026-10-25', status: 'confirmada' })).toBeNull()
  })
})

describe('Validación (D/E)', () => {
  it('D/E. sin fecha no se puede guardar ni Provisional ni Confirmada', () => {
    expect(validateDateDraft({ date: '', status: 'provisional' })).toBe(MISSING_DATE_MESSAGE)
    expect(validateDateDraft({ date: '', status: 'confirmada' })).toBe(MISSING_DATE_MESSAGE)
    expect(validateDateDraft({ date: '', status: null })).toBe(MISSING_DATE_MESSAGE)
  })
  it('con fecha pero sin decidir el estado, se pide el estado (nunca se inventa)', () => {
    expect(validateDateDraft({ date: '2026-10-25', status: null })).toBe(MISSING_STATUS_MESSAGE)
  })
  it('una fecha nueva no llega con estado preseleccionado', () => {
    expect(dateDraftFromSaved({ eventDate: null, eventTime: null, dateStatus: 'pendiente' })).toEqual(empty)
    expect(dateDraftFromSaved({ eventDate: null, eventTime: null, dateStatus: 'confirmada' })).toEqual(empty)
  })
})

describe('Qué se guarda (F/G/H, 6)', () => {
  it('F. fecha + Confirmada + sin hora → hora null (nunca 00:00, 12:00 ni la hora actual)', () => {
    expect(dateDraftToPatch({ date: '2026-10-25', time: '', status: 'confirmada' })).toEqual({ dateStatus: 'confirmada', eventDate: '2026-10-25', eventTime: null })
  })
  it('G. fecha + hora + Confirmada, todo junto', () => {
    expect(dateDraftToPatch({ date: '2026-10-25', time: '12:00', status: 'confirmada' })).toEqual({ dateStatus: 'confirmada', eventDate: '2026-10-25', eventTime: '12:00' })
  })
  it('H. fecha + Provisional', () => {
    expect(dateDraftToPatch({ date: '2026-10-25', time: '', status: 'provisional' })).toEqual({ dateStatus: 'provisional', eventDate: '2026-10-25', eventTime: null })
  })
  it('resultado visible: «25 octubre 2026 · ✓ Confirmada» (con o sin hora, sin inventarla)', () => {
    expect(dateWithStatusLabel('2026-10-25', 'confirmada')).toBe('25 octubre 2026 · ✓ Confirmada')
  })
})

describe('Editar una fecha ya guardada (I/J/K/L, 9–11)', () => {
  const saved = { eventDate: '2026-10-25', eventTime: '12:00:00', dateStatus: 'provisional' as const }
  it('el borrador parte de lo guardado (hora recortada a HH:MM) y sin cambios no hay nada que guardar', () => {
    const draft = dateDraftFromSaved(saved)
    expect(draft).toEqual({ date: '2026-10-25', time: '12:00', status: 'provisional' })
    expect(isDateDraftDirty(saved, draft)).toBe(false)
  })
  it('I. Provisional → Confirmada cambia SOLO el estado: misma fecha, misma hora', () => {
    const next = { ...dateDraftFromSaved(saved), status: 'confirmada' as const }
    expect(isDateDraftDirty(saved, next)).toBe(true)
    expect(dateDraftToPatch(next)).toEqual({ dateStatus: 'confirmada', eventDate: '2026-10-25', eventTime: '12:00' })
  })
  it('J. Confirmada → Provisional también', () => {
    const confirmed = { eventDate: '2026-10-25', eventTime: null, dateStatus: 'confirmada' as const }
    const next = { ...dateDraftFromSaved(confirmed), status: 'provisional' as const }
    expect(dateDraftToPatch(next)).toEqual({ dateStatus: 'provisional', eventDate: '2026-10-25', eventTime: null })
  })
  it('K. cambiar el día actualiza la misma fecha (un único patch; el estado se mantiene)', () => {
    const next = { ...dateDraftFromSaved(saved), date: '2026-10-26' }
    expect(dateDraftToPatch(next)).toEqual({ dateStatus: 'provisional', eventDate: '2026-10-26', eventTime: '12:00' })
  })
  it('L. borrar la hora la ELIMINA de verdad (eventTime null en el patch)', () => {
    const next = { ...dateDraftFromSaved(saved), time: '' }
    expect(isDateDraftDirty(saved, next)).toBe(true)
    expect(dateDraftToPatch(next).eventTime).toBeNull()
  })
  it('añadir una hora a una fecha sin hora es un cambio', () => {
    const noTime = { eventDate: '2026-10-25', eventTime: null, dateStatus: 'confirmada' as const }
    expect(isDateDraftDirty(noTime, { ...dateDraftFromSaved(noTime), time: '12:00' })).toBe(true)
  })
  it('sin fecha guardada cualquier borrador con algo escrito es nuevo; vacío no hay nada que guardar', () => {
    const none = { eventDate: null, eventTime: null, dateStatus: 'pendiente' as const }
    expect(isDateDraftDirty(none, empty)).toBe(false)
    expect(isDateDraftDirty(none, { ...empty, date: '2026-10-25' })).toBe(true)
  })
})

describe('Contador del configurador (M/N)', () => {
  it('N. tocar «Confirmada» sin guardar NO decide nada: el contador solo mira lo GUARDADO', () => {
    // El borrador no es parte de lo guardado: el evento sigue sin fecha
    expect(celebrationDateStatus({ dateStatus: 'pendiente', eventDate: null }, [])).toBe('sin_empezar')
  })
  it('M. «Todavía no lo sabemos» respondido = respondida pero pendiente; una fecha guardada manda sobre esa respuesta', () => {
    const todavia = [makeDecision('celebracion.fecha', { choice: 'todavia_no_lo_sabemos' })]
    expect(celebrationDateStatus({ dateStatus: 'pendiente', eventDate: null }, todavia)).toBe('por_decidir')
    expect(celebrationDateStatus({ dateStatus: 'confirmada', eventDate: '2026-10-25' }, todavia)).toBe('decidida')
    expect(celebrationDateStatus({ dateStatus: 'provisional', eventDate: '2026-10-25' }, todavia)).toBe('por_decidir')
  })
})

describe('Quitar fecha — el contador del configurador queda coherente (15)', () => {
  it('con fecha confirmada cuenta como decidida; al quitarla vuelve a «Todavía no lo sabemos» = respondida pero pendiente (no «sin empezar», no «decidida»)', () => {
    const conFecha = { dateStatus: 'confirmada' as const, eventDate: '2027-02-20' }
    expect(celebrationDateStatus(conFecha, [])).toBe('decidida')
    // Tras quitarla: el evento queda pendiente/sin fecha y se anota la respuesta «Todavía no lo sabemos»
    const quitada = { dateStatus: 'pendiente' as const, eventDate: null }
    const todavia = [makeDecision('celebracion.fecha', { choice: 'todavia_no_lo_sabemos' })]
    expect(celebrationDateStatus(quitada, todavia)).toBe('por_decidir')
  })
  it('con fecha provisional cuenta como por decidir; fecha + hora + estado siguen siendo UNA sola pregunta', () => {
    expect(celebrationDateStatus({ dateStatus: 'provisional', eventDate: '2027-02-20' }, [])).toBe('por_decidir')
  })
  it('una fecha puesta de nuevo después de quitarla vuelve a contar como decidida (la respuesta «Todavía no» anterior no manda)', () => {
    const todavia = [makeDecision('celebracion.fecha', { choice: 'todavia_no_lo_sabemos' })]
    expect(celebrationDateStatus({ dateStatus: 'confirmada', eventDate: '2027-03-05' }, todavia)).toBe('decidida')
  })
})

describe('Varios momentos (Q/S)', () => {
  const m = (id: string, momentDate: string | null, dateStatus: 'provisional' | 'confirmada' | null, sortOrder: number) => ({ id, momentDate, dateStatus, sortOrder, isLegacy: false })
  it('Q. cada momento conserva su fecha y estado independientes', () => {
    const moments = [m('a', '2026-10-25', 'confirmada', 1), m('b', '2026-10-26', 'provisional', 2)]
    expect(moments.map((x) => [x.momentDate, x.dateStatus])).toEqual([
      ['2026-10-25', 'confirmada'],
      ['2026-10-26', 'provisional'],
    ])
  })
  it('S. la fecha principal sigue derivándose del primer día con fecha, con el estado de ESE momento', () => {
    expect(deriveOperationalDate([m('a', '2026-10-26', 'confirmada', 1), m('b', '2026-10-25', 'provisional', 2)], 'confirmada')).toEqual({ eventDate: '2026-10-25', dateStatus: 'provisional' })
  })
})
