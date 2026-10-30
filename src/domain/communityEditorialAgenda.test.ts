import { describe, expect, it } from 'vitest'
import type { EditorialItemRow } from '@/domain/communityEditorial'
import { agendaDayLabel, agendaRow, agendaState, buildAgenda, defaultAgendaWeek, pollCloseDay } from '@/domain/communityEditorialAgenda'

const row = (over: Partial<EditorialItemRow> & { id: string }): EditorialItemRow => ({
  kind: 'article', title: over.id, status: 'proposed', version: 1, slotDate: '2026-11-02', topicLabel: null, publishAt: null, publishError: null, tier: null, ...over,
})

// El programa real: 7 artículos (lunes 2 a domingo 8), la encuesta del sábado 7 y el menú de la semana (se publica el sábado anterior, 31 de octubre).
const PROGRAM: EditorialItemRow[] = [
  ...['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map((d, n) =>
    row({ id: `art${n}`, slotDate: d, status: 'approved', publishAt: `${d}T09:00:00Z` }),
  ),
  row({ id: 'poll', kind: 'poll', title: 'Encuesta familiar', slotDate: '2026-11-07', status: 'approved', publishAt: '2026-11-07T09:00:00Z' }),
  row({ id: 'menu', kind: 'menu', title: 'Menú semanal de Pepa', slotDate: '2026-11-02', status: 'approved', publishAt: '2026-10-31T09:00:00Z' }),
]

describe('agenda editorial: orden cronológico real', () => {
  const [week] = buildAgenda(PROGRAM)
  it('el menú del sábado anterior va ANTES de los artículos de la semana que anuncia, en la misma semana (sin duplicarse)', () => {
    expect(buildAgenda(PROGRAM)).toHaveLength(1)
    expect(week.title).toBe('Semana del 2 al 8 de noviembre')
    expect(week.days[0]).toMatchObject({ date: '2026-10-31', label: 'Sáb 31 oct' })
    expect(week.days[0].rows.map((r) => [r.item.id, r.time])).toEqual([['menu', '10:00']])
    expect(week.days.map((d) => d.date)).toEqual(['2026-10-31', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(week.count).toBe(9)
  })
  it('los siete artículos quedan en sus fechas y el sábado 7 agrupa artículo y encuesta bajo un solo día', () => {
    const arts = week.days.flatMap((d) => d.rows).filter((r) => r.item.kind === 'article')
    expect(arts.map((r) => r.day)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    const sat = week.days.find((d) => d.date === '2026-11-07')!
    expect(sat.rows.map((r) => r.item.id).sort()).toEqual(['art5', 'poll'])
    expect(week.days.filter((d) => d.date === '2026-11-07')).toHaveLength(1)
  })
  it('la encuesta enseña su cierre: domingo 8 a las 17:00', () => {
    const poll = week.days.flatMap((d) => d.rows).find((r) => r.item.id === 'poll')!
    expect(poll.time).toBe('10:00')
    expect(poll.closesText).toBe('dom 8 nov, 17:00')
    expect(pollCloseDay('2026-11-07')).toBe('2026-11-08')
  })
  it('mismo día y misma hora: orden estable y neutro (no depende del orden de entrada)', () => {
    const a = buildAgenda([...PROGRAM].reverse())[0].days.map((d) => d.rows.map((r) => r.item.id))
    const b = buildAgenda(PROGRAM)[0].days.map((d) => d.rows.map((r) => r.item.id))
    expect(a).toEqual(b)
  })
})

describe('agenda editorial: hora prevista, estados y semanas', () => {
  it('sin programar, el artículo sale su día a las 10:00 y el menú el sábado anterior (previsto)', () => {
    expect(agendaRow(row({ id: 'a', slotDate: '2026-11-04' }))).toMatchObject({ day: '2026-11-04', time: '10:00', planned: true })
    expect(agendaRow(row({ id: 'm', kind: 'menu', slotDate: '2026-11-02' }))).toMatchObject({ day: '2026-10-31', time: '10:00', planned: true })
  })
  it('programado, usa la fecha y hora reales de Madrid (también con el cambio de hora)', () => {
    expect(agendaRow(row({ id: 'a', status: 'approved', publishAt: '2026-11-03T09:00:00Z' }))).toMatchObject({ day: '2026-11-03', time: '10:00', planned: false })
    expect(agendaRow(row({ id: 'a', status: 'approved', publishAt: '2026-10-24T09:00:00Z', slotDate: '2026-10-24' }))).toMatchObject({ day: '2026-10-24', time: '11:00' })
  })
  it('usa los estados reales del sistema; el error de publicación no cuenta como publicado', () => {
    expect(agendaState({ status: 'proposed', publishError: null })).toBe('proposed')
    expect(agendaState({ status: 'approved', publishError: null })).toBe('approved')
    expect(agendaState({ status: 'approved', publishError: 'x' })).toBe('error')
    expect(agendaState({ status: 'published', publishError: 'x' })).toBe('published')
  })
  it('lo rechazado no ocupa hueco; cambiar de semana separa las publicaciones y cada una aparece una sola vez', () => {
    const next = [row({ id: 'n1', slotDate: '2026-11-09' }), row({ id: 'n2', slotDate: '2026-11-10', status: 'rejected' })]
    const weeks = buildAgenda([...PROGRAM, ...next])
    expect(weeks.map((w) => w.monday)).toEqual(['2026-11-02', '2026-11-09'])
    expect(weeks[1].count).toBe(1)
    expect(weeks.flatMap((w) => w.days.flatMap((d) => d.rows)).filter((r) => r.item.id === 'menu')).toHaveLength(1)
  })
  it('avisa de los días sin artículo y elige la semana actual (o la siguiente con contenido)', () => {
    const weeks = buildAgenda([row({ id: 'a', slotDate: '2026-11-02' }), row({ id: 'b', slotDate: '2026-11-04' }), row({ id: 'c', slotDate: '2026-11-17' })])
    expect(weeks[0].missingArticles).toEqual(['Mar 3 nov', 'Jue 5 nov', 'Vie 6 nov', 'Sáb 7 nov', 'Dom 8 nov'])
    expect(defaultAgendaWeek(weeks, '2026-11-02')).toBe('2026-11-02')
    expect(defaultAgendaWeek(weeks, '2026-11-09')).toBe('2026-11-16')
    expect(defaultAgendaWeek(weeks, '2026-12-07')).toBe('2026-11-16')
    expect(defaultAgendaWeek([], '2026-11-02')).toBeNull()
  })
  it('la fecha se escribe corta y sin partirse', () => {
    expect(agendaDayLabel('2026-11-02')).toBe('Lun 2 nov')
    expect(agendaDayLabel('2026-11-04')).toBe('Mié 4 nov')
  })
})
