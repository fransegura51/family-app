import { describe, expect, it } from 'vitest'
import { firstCalendarioView, type CalendarioMenuGroup } from './calendarioMenu'

const group = (keys: string[]): CalendarioMenuGroup => ({
  id: 'g',
  name: null,
  items: keys.map((key) => ({ key: key as never })),
})

describe('firstCalendarioView', () => {
  it('opens on the first view of the menu', () => {
    expect(firstCalendarioView([group(['Semana', 'Mes'])])).toBe('Semana')
  })

  it('skips custom shortcuts, which are not a view', () => {
    expect(firstCalendarioView([group(['custom:abc', 'Agenda'])])).toBe('Agenda')
  })

  it('looks across groups in order and falls back to Inicio', () => {
    expect(firstCalendarioView([group([]), group(['Día'])])).toBe('Día')
    expect(firstCalendarioView([])).toBe('Vista general')
  })
})
