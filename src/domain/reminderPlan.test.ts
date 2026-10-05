// 4. Editar un evento no debe reenviar avisos ya entregados: los recordatorios que no cambian conservan su fila (id).
import { describe, expect, it } from 'vitest'
import { planReminderChanges, type StoredReminder } from '@/domain/reminders'

const stored = (id: string, minutesBefore: number, anchor: 'start' | 'end' = 'start'): StoredReminder => ({ id, minutesBefore, anchor })

describe('planReminderChanges — identidad lógica (ancla, minutos)', () => {
  it('guardar sin tocar los recordatorios no borra ni crea nada (los ids se conservan)', () => {
    const plan = planReminderChanges([stored('a', 60), stored('b', 1440)], [{ minutesBefore: 1440, anchor: 'start' }, { minutesBefore: 60, anchor: 'start' }])
    expect(plan).toEqual({ toInsert: [], deleteIds: [] })
  })
  it('cambiar un intervalo es un recordatorio nuevo: se añade el nuevo y solo se quita el que sobra', () => {
    const plan = planReminderChanges([stored('a', 60), stored('b', 1440)], [{ minutesBefore: 30, anchor: 'start' }, { minutesBefore: 1440, anchor: 'start' }])
    expect(plan.toInsert).toEqual([{ minutesBefore: 30, anchor: 'start' }])
    expect(plan.deleteIds).toEqual(['a'])
  })
  it('el mismo número de minutos con otra ancla (empieza/termina) es OTRO recordatorio', () => {
    const plan = planReminderChanges([stored('a', 60, 'start')], [{ minutesBefore: 60, anchor: 'end' }])
    expect(plan.toInsert).toEqual([{ minutesBefore: 60, anchor: 'end' }])
    expect(plan.deleteIds).toEqual(['a'])
  })
  it('quitar todos borra todos; evento sin recordatorios no hace nada', () => {
    expect(planReminderChanges([stored('a', 60)], [])).toEqual({ toInsert: [], deleteIds: ['a'] })
    expect(planReminderChanges([], [])).toEqual({ toInsert: [], deleteIds: [] })
  })
  it('varios recordatorios legítimos de un evento se conservan todos', () => {
    const plan = planReminderChanges([stored('a', 10), stored('b', 60), stored('c', 1440, 'end')], [
      { minutesBefore: 10, anchor: 'start' },
      { minutesBefore: 60, anchor: 'start' },
      { minutesBefore: 1440, anchor: 'end' },
      { minutesBefore: 10080, anchor: 'start' },
    ])
    expect(plan.deleteIds).toEqual([])
    expect(plan.toInsert).toEqual([{ minutesBefore: 10080, anchor: 'start' }])
  })
  it('un duplicado ya existente en la base se limpia y uno repetido en la petición se añade una sola vez', () => {
    expect(planReminderChanges([stored('a', 60), stored('a2', 60)], [{ minutesBefore: 60, anchor: 'start' }]).deleteIds).toEqual(['a2'])
    expect(planReminderChanges([], [{ minutesBefore: 60, anchor: 'start' }, { minutesBefore: 60, anchor: 'start' }]).toInsert).toHaveLength(1)
  })
})
