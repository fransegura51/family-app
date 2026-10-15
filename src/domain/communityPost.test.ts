// Lógica pura de la página de una publicación: contadores, fechas, encuesta con hora de Madrid, fuentes de un artículo.
import { describe, expect, it } from 'vitest'
import { isBlockedLayer, isHiddenNotice, formatMadridMoment, formatSourceDate, parseArticleSources, pollPercents, pollPhase, pollTimeMessage, relativeTimeEs, sortPhotos, toggleCount } from '@/domain/communityPost'

describe('contadores optimistas', () => {
  it('suben y bajan de uno en uno sin pasar de cero', () => {
    expect(toggleCount(false, 3)).toEqual({ active: true, count: 4 })
    expect(toggleCount(true, 4)).toEqual({ active: false, count: 3 })
    expect(toggleCount(true, 0)).toEqual({ active: false, count: 0 })
  })
  it('las fotos se ordenan por posición', () => {
    expect(sortPhotos([{ path: 'b', position: 2 }, { path: 'a', position: 0 }]).map((p) => p.path)).toEqual(['a', 'b'])
    expect(sortPhotos(null)).toEqual([])
  })
})

describe('qué devuelve el servidor al pedir una publicación', () => {
  it('distingue la capa de bloqueado y el aviso de oculta', () => {
    expect(isBlockedLayer({ id: 'p', blockedByMe: true, authorId: 'u' })).toBe(true)
    expect(isBlockedLayer({ id: 'p', blockedByMe: true } as never)).toBe(false)
    expect(isBlockedLayer(null)).toBe(false)
    expect(isHiddenNotice({ id: 'p', status: 'hidden', isMine: true, title: 'T' })).toBe(true)
    expect(isHiddenNotice(null)).toBe(false)
  })
})

describe('fechas', () => {
  const now = new Date('2026-10-15T12:00:00Z').getTime()
  it('tiempo relativo', () => {
    expect(relativeTimeEs('2026-10-15T11:59:40Z', now)).toBe('ahora mismo')
    expect(relativeTimeEs('2026-10-15T11:30:00Z', now)).toBe('hace 30 min')
    expect(relativeTimeEs('2026-10-15T09:00:00Z', now)).toBe('hace 3 h')
    expect(relativeTimeEs('2026-10-14T09:00:00Z', now)).toBe('hace 1 día')
    expect(relativeTimeEs('2026-10-12T09:00:00Z', now)).toBe('hace 3 días')
    expect(relativeTimeEs('2026-09-01T09:00:00Z', now)).toMatch(/sept|1/)
    expect(relativeTimeEs('basura', now)).toBe('')
  })
  it('un momento en hora de Madrid, con el cambio de horario bien aplicado', () => {
    // Sábado 17 de octubre de 2026: Madrid está en horario de verano (UTC+2), así que las 10:00 son las 08:00 UTC.
    expect(formatMadridMoment('2026-10-17T08:00:00Z')).toBe('el sábado 17 de octubre a las 10:00 (hora de Madrid)')
    // Sábado 7 de noviembre de 2026: ya es horario de invierno (UTC+1): las 10:00 son las 09:00 UTC.
    expect(formatMadridMoment('2026-11-07T09:00:00Z')).toBe('el sábado 7 de noviembre a las 10:00 (hora de Madrid)')
    expect(formatMadridMoment('2026-10-18T15:00:00Z')).toBe('el domingo 18 de octubre a las 17:00 (hora de Madrid)')
  })
})

describe('encuesta', () => {
  const poll = { status: 'open' as const, opensAt: '2026-10-17T08:00:00Z', closesAt: '2026-10-18T15:00:00Z' }
  it('fase según la hora, aunque el servidor aún no haya actualizado el estado', () => {
    expect(pollPhase(poll, Date.parse('2026-10-17T07:00:00Z'))).toBe('scheduled')
    expect(pollPhase(poll, Date.parse('2026-10-17T12:00:00Z'))).toBe('open')
    expect(pollPhase(poll, Date.parse('2026-10-18T15:00:00Z'))).toBe('closed')
    expect(pollPhase({ ...poll, status: 'closed' }, Date.parse('2026-10-17T12:00:00Z'))).toBe('closed')
  })
  it('mensajes claros de apertura y cierre con hora de Madrid', () => {
    expect(pollTimeMessage(poll, Date.parse('2026-10-17T07:00:00Z'))).toBe('La encuesta se abrirá el sábado 17 de octubre a las 10:00 (hora de Madrid).')
    expect(pollTimeMessage(poll, Date.parse('2026-10-17T12:00:00Z'))).toBe('Encuesta abierta. Se cierra el domingo 18 de octubre a las 17:00 (hora de Madrid).')
    expect(pollTimeMessage(poll, Date.parse('2026-10-19T12:00:00Z'))).toContain('resultados finales')
  })
  it('los porcentajes siempre suman 100', () => {
    expect(pollPercents([1, 1, 1], 3)).toEqual([34, 33, 33])
    expect(pollPercents([2, 1], 3).reduce((a, b) => a + b, 0)).toBe(100)
    expect(pollPercents([0, 0], 0)).toEqual([0, 0])
    expect(pollPercents(null, null)).toEqual([])
    expect(pollPercents([5, 5], 10)).toEqual([50, 50])
  })
})

describe('fuentes de un artículo oficial', () => {
  it('lee título, editorial, fecha y enlace seguro; ignora lo raro', () => {
    const info = parseArticleSources({
      sources: [
        { title: 'Encuesta de Presupuestos Familiares', publisher: 'INE', url: 'https://www.ine.es/epf', date: '2026-03-14' },
        { title: 'Sin enlace válido', publisher: 'X', url: 'javascript:alert(1)', date: '2025' },
        { publisher: 'sin título' },
        'basura',
      ],
      methodology: 'Datos anuales.',
      comparison: 'Comparación con la UE.',
    })
    expect(info.sources).toHaveLength(2)
    expect(info.sources[0]).toMatchObject({ title: 'Encuesta de Presupuestos Familiares', publisher: 'INE', host: 'ine.es', href: 'https://www.ine.es/epf', date: '14 de marzo de 2026' })
    expect(info.sources[1]).toMatchObject({ href: null, host: null, date: '2025' })
    expect(info.methodology).toBe('Datos anuales.')
    expect(info.comparison).toBe('Comparación con la UE.')
  })
  it('un valor vacío o inesperado no rompe nada', () => {
    expect(parseArticleSources(null)).toEqual({ sources: [], methodology: null, comparison: null })
    expect(parseArticleSources([1, 2])).toEqual({ sources: [], methodology: null, comparison: null })
    expect(parseArticleSources({ sources: 'x' }).sources).toEqual([])
  })
  it('fechas de fuente', () => {
    expect(formatSourceDate('2026-03')).toBe('marzo de 2026')
    expect(formatSourceDate('primavera 2026')).toBe('primavera 2026')
    expect(formatSourceDate(null)).toBeNull()
  })
})

describe('tabla del artículo', () => {
  it('lee columnas y filas de texto y números, recortadas', () => {
    const info = parseArticleSources({ sources: [], table: { unit: '%', columns: ['Año', 'España', 'UE'], rows: [['2024', 10.5, 9], ['2023', '11,2', null, 'sobra']] } })
    expect(info.table).toEqual({ unit: '%', columns: ['Año', 'España', 'UE'], rows: [['2024', '10,5', '9'], ['2023', '11,2', '']] })
  })
  it('sin tabla válida no hay tabla', () => {
    expect(parseArticleSources({ table: 'x' }).table).toBeUndefined()
    expect(parseArticleSources({ table: { columns: [], rows: [[1]] } }).table).toBeUndefined()
    expect(parseArticleSources({ table: { columns: ['a'], rows: [] } }).table).toBeUndefined()
  })
})
