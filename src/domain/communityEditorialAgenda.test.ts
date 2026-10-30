import { describe, expect, it } from 'vitest'
import type { EditorialItemRow } from '@/domain/communityEditorial'
import { type AgendaRow, agendaDayLabel, agendaRow, agendaState, buildAgenda, defaultAgendaWeek, pollCloseDay } from '@/domain/communityEditorialAgenda'

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

describe('agenda editorial: semana por fecha efectiva (reprogramaciones)', () => {
  const polled = (publishAt: string, slotDate = '2026-10-31') =>
    row({ id: 'poll', kind: 'poll', title: 'Encuesta familiar', slotDate, status: 'approved', publishAt })
  const find = (items: EditorialItemRow[], monday: string) => buildAgenda(items).find((w) => w.monday === monday)
  const idsOf = (w?: { days: { rows: AgendaRow[] }[] }) => (w?.days ?? []).flatMap((d) => d.rows.map((r) => r.item.id))

  it('encuesta trasladada del sáb 31 oct al sáb 7 nov (el hueco original queda en la semana anterior): sale en la semana del 2 al 8, no en la anterior', () => {
    const items = [...PROGRAM.filter((i) => i.id !== 'poll'), polled('2026-11-07T09:00:00Z')]
    const weeks = buildAgenda(items)
    expect(weeks.map((w) => w.monday)).toEqual(['2026-11-02'])
    const w = find(items, '2026-11-02')!
    expect(w.count).toBe(9)
    expect(idsOf(w)).toContain('poll')
    expect(find(items, '2026-10-26')).toBeUndefined()
    const sat = w.days.find((d) => d.date === '2026-11-07')!
    expect(sat.rows.map((r) => r.item.id).sort()).toEqual(['art5', 'poll'])
    const p = sat.rows.find((r) => r.item.id === 'poll')!
    expect(p.time).toBe('10:00')
    expect(p.closesText).toBe('dom 8 nov, 17:00')
  })
  it('con un artículo de la semana anterior, la anterior NO se queda con la encuesta y cada una cuenta lo suyo', () => {
    const prev = row({ id: 'prev', slotDate: '2026-10-27', publishAt: '2026-10-27T09:00:00Z', status: 'approved' })
    const items = [prev, ...PROGRAM.filter((i) => i.id !== 'poll'), polled('2026-11-07T09:00:00Z')]
    expect(idsOf(find(items, '2026-10-26'))).toEqual(['prev'])
    expect(find(items, '2026-10-26')!.count).toBe(1)
    expect(find(items, '2026-11-02')!.count).toBe(9)
  })
  it('reprogramada varias veces: siempre manda la última fecha, sin duplicados', () => {
    const chain = ['2026-10-31T09:00:00Z', '2026-11-07T09:00:00Z', '2026-11-14T09:00:00Z', '2026-11-07T09:00:00Z']
    const sem = chain.map((at) => {
      const items = [polled(at)]
      const weeks = buildAgenda(items)
      return weeks.filter((w) => idsOf(w).includes('poll')).map((w) => w.monday)
    })
    expect(sem).toEqual([['2026-10-26'], ['2026-11-02'], ['2026-11-09'], ['2026-11-02']])
  })
  it('artículo reprogramado a otra semana: cambia de semana y contadores en ambas; no aparece en las dos', () => {
    const a = row({ id: 'a', slotDate: '2026-11-03', status: 'approved', publishAt: '2026-11-03T09:00:00Z' })
    const b = row({ id: 'b', slotDate: '2026-11-04', status: 'proposed', publishAt: null })
    const before = buildAgenda([a, b])
    expect(before.map((w) => [w.monday, w.count, w.pending])).toEqual([['2026-11-02', 2, 1]])
    const moved = buildAgenda([{ ...a, publishAt: '2026-11-11T09:00:00Z' }, b])
    expect(moved.map((w) => [w.monday, w.count, w.pending])).toEqual([['2026-11-02', 1, 1], ['2026-11-09', 1, 0]])
    expect(moved.flatMap((w) => idsOf(w)).filter((id) => id === 'a')).toHaveLength(1)
    expect(moved[0].missingArticles).toContain('Mar 3 nov')
  })
  it('artículo y encuesta el mismo día quedan como dos filas independientes bajo una sola fecha', () => {
    const items = [row({ id: 'art', slotDate: '2026-11-07', status: 'approved', publishAt: '2026-11-07T09:00:00Z' }), polled('2026-11-07T09:00:00Z')]
    const w = buildAgenda(items)[0]
    expect(w.days).toHaveLength(1)
    expect(w.days[0].rows).toHaveLength(2)
    expect(w.count).toBe(2)
  })
  it('el menú anticipado sigue con su semana de contenido aunque se publique el sábado anterior (y también si se reprograma)', () => {
    const items = [row({ id: 'm', kind: 'menu', slotDate: '2026-11-02', status: 'approved', publishAt: '2026-10-31T09:00:00Z' })]
    expect(buildAgenda(items).map((w) => w.monday)).toEqual(['2026-11-02'])
    expect(buildAgenda([{ ...items[0], publishAt: '2026-11-01T09:00:00Z' }]).map((w) => w.monday)).toEqual(['2026-11-02'])
  })
  it('cambio de hora de Madrid: 23:30 UTC del sábado 24 oct ya es domingo 25 en Madrid; el 25 oct a las 23:30 UTC (CET) ya es lunes 26 y cambia de semana', () => {
    const sat = buildAgenda([row({ id: 'x', slotDate: '2026-10-24', status: 'approved', publishAt: '2026-10-24T22:30:00Z' })])
    expect(sat[0].monday).toBe('2026-10-19')
    const sun = buildAgenda([row({ id: 'x', slotDate: '2026-10-24', status: 'approved', publishAt: '2026-10-25T22:59:00Z' })])
    expect(sun[0].monday).toBe('2026-10-19')
    const mon = buildAgenda([row({ id: 'x', slotDate: '2026-10-24', status: 'approved', publishAt: '2026-10-25T23:01:00Z' })])
    expect(mon[0].monday).toBe('2026-10-26')
    expect(mon[0].days[0].date).toBe('2026-10-26')
  })
})

const prev0 = row({ id: 'prev0', slotDate: '2026-10-27', publishAt: '2026-10-27T09:00:00Z', status: 'approved' })
