import { describe, expect, it } from 'vitest'
import {
  LIST_ITEM_STYLES,
  clampOptionCount,
  effectiveItemStyle,
  eventPeopleLabel,
  initialColumnTitles,
  isProsContras,
  itemMark,
  matchesEventQuery,
  nextOptionTitle,
  numberingMarks,
} from '@/domain/lists'

describe('personas de un evento (selector de Calendario)', () => {
  const members = [
    { id: 'm1', name: 'Jennifer' },
    { id: 'm2', name: 'Fernando' },
    { id: 'm3', name: 'Ana' },
    { id: 'm4', name: 'ana' },
  ]
  it('el propietario sale SOLO de los asignados reales, no del título', () => {
    expect(eventPeopleLabel(['m1'], members)).toBe('Jennifer')
    expect(eventPeopleLabel(['m2'], members)).toBe('Fernando')
    expect(eventPeopleLabel(['m1', 'm2'], members)).toBe('Jennifer, Fernando')
  })
  it('sin asignados = toda la familia (como entiende el Calendario)', () => {
    expect(eventPeopleLabel([], members)).toBe('Toda la familia')
  })
  it('homónimos: se numeran para distinguirlos', () => {
    expect(eventPeopleLabel(['m3'], members)).toBe('Ana (1)')
    expect(eventPeopleLabel(['m4'], members)).toBe('ana (2)')
  })
  it('un asignado desconocido no se inventa', () => {
    expect(eventPeopleLabel(['zzz'], members)).toBe('')
  })
  it('la búsqueda encuentra por título y por persona, sin tildes ni mayúsculas', () => {
    expect(matchesEventQuery('Fernando Cole', 'Jennifer', 'jennifer')).toBe(true)
    expect(matchesEventQuery('Fernando Cole', 'Jennifer', 'cole')).toBe(true)
    expect(matchesEventQuery('Dentista', 'Fernando', 'jenni')).toBe(false)
  })
})

describe('comparativas: modalidad y columnas', () => {
  it('pros y contras crea exactamente dos columnas y no ofrece añadir', () => {
    expect(initialColumnTitles('proscontras', 5)).toEqual(['Pros', 'Contras'])
    expect(isProsContras([{ title: 'Pros' }, { title: 'Contras' }])).toBe(true)
    expect(isProsContras([{ title: 'Pros' }, { title: 'Ventajas' }])).toBe(false)
    expect(isProsContras([{ title: 'Pros' }, { title: 'Contras' }, { title: 'Opción 3' }])).toBe(false)
  })
  it('varias opciones: de 2 a 5 columnas con nombre editable', () => {
    expect(initialColumnTitles('opciones', 2)).toEqual(['Opción 1', 'Opción 2'])
    expect(initialColumnTitles('opciones', 5)).toEqual(['Opción 1', 'Opción 2', 'Opción 3', 'Opción 4', 'Opción 5'])
    expect(initialColumnTitles('opciones', 9)).toHaveLength(5)
    expect(initialColumnTitles('opciones', 0)).toHaveLength(2)
    expect(clampOptionCount(3.4)).toBe(3)
  })
  it('la siguiente opción no repite un nombre en uso', () => {
    expect(nextOptionTitle([{ title: 'Opción 1' }, { title: 'Opción 2' }])).toBe('Opción 3')
    expect(nextOptionTitle([{ title: 'Madrid' }, { title: 'Opción 3' }])).toBe('Opción 4')
  })
})

describe('estilo de lista (Ideas)', () => {
  it('Tareas y Comparativa no cambian: siempre casillas; Ideas: bombillas por defecto', () => {
    expect(effectiveItemStyle('tareas', null)).toBe('casillas')
    expect(effectiveItemStyle('tareas', 'estrellas')).toBe('casillas')
    expect(effectiveItemStyle('comparativa', 'puntos')).toBe('casillas')
    expect(effectiveItemStyle('ideas', null)).toBe('bombillas')
    expect(effectiveItemStyle('ideas', 'guiones')).toBe('guiones')
  })
  it('hay siete estilos y sus marcas', () => {
    expect(LIST_ITEM_STYLES.map((s) => s.value)).toEqual(['bombillas', 'puntos', 'numeracion', 'guiones', 'estrellas', 'casillas', 'ninguno'])
    expect(itemMark('bombillas', undefined)).toBe('💡')
    expect(itemMark('puntos', undefined)).toBe('•')
    expect(itemMark('guiones', undefined)).toBe('—')
    expect(itemMark('estrellas', undefined)).toBe('⭐')
    expect(itemMark('ninguno', undefined)).toBe('')
    expect(itemMark('numeracion', '3.')).toBe('3.')
  })
  it('la numeración se recalcula con el orden, y los subelementos cuelgan de su elemento', () => {
    expect(numberingMarks([{ depth: 0 }, { depth: 0 }, { depth: 0 }])).toEqual(['1.', '2.', '3.'])
    expect(numberingMarks([{ depth: 0 }, { depth: 1 }, { depth: 1 }, { depth: 0 }, { depth: 1 }])).toEqual(['1.', '1.1', '1.2', '2.', '2.1'])
    expect(numberingMarks([{ depth: 0 }, { depth: 0 }])).toEqual(['1.', '2.'])
  })
})
