import { describe, expect, it } from 'vitest'
import { toMenuList, toProposals } from '@/domain/communityAdmin'
import type { EditorialItemRow } from '@/domain/communityEditorial'
import { madridDay } from '@/domain/communityEditorial'
import {
  NO_FILTER,
  PAGE_SIZE,
  countCenter,
  filterCenter,
  fromMenu,
  fromProposal,
  pageOf,
  parseCenterSection,
  sectionOfKind,
  sortCenter,
  syncProgramRows,
  type CenterItem,
} from '@/domain/communityEditorialCenter'

const prop = (over: Record<string, unknown> = {}) =>
  toProposals([{ id: 'a1', kind: 'article', section: 'hogar', topicId: 'ahorro', title: 'Trucos para ahorrar luz', body: 'Texto', status: 'proposed', version: 2, payload: { sources: [] }, slotDate: '2026-11-02', ...over }])[0]
const menu = (over: Record<string, unknown> = {}) =>
  toMenuList({ autopublish: false, menus: [{ id: 'm1', title: 'Menú semanal de Pepa: semana del 2 al 8 de noviembre', state: 'draft', version: 4, scheduledWeekly: true, weekStart: '2026-11-02', ...over }] }).menus[0]

describe('Centro Editorial: filas compactas', () => {
  it('una propuesta pendiente enseña su hueco previsto, versión y estado, sin contenido', () => {
    const i = fromProposal(prop(), 'Ahorro', madridDay)
    expect(i).toMatchObject({ id: 'a1', kind: 'article', status: 'proposed', version: 2, topicLabel: 'Ahorro', date: '2026-11-02', dateText: 'Previsto: 2 de noviembre', stateText: 'Pendiente de revisar', hasError: false })
    expect(Object.keys(i)).not.toContain('body')
    expect(Object.keys(i)).not.toContain('payload')
  })
  it('una aprobada y programada enseña el día de Madrid de su publicación', () => {
    const i = fromProposal(prop({ status: 'approved', publishAt: '2026-11-02T09:00:00Z' }), null, madridDay)
    expect(i.dateText).toBe('Se publica el 2 de noviembre')
    expect(i.stateText).toBe('Aprobado')
  })
  it('un error de publicación se marca aparte y no cuenta como publicado', () => {
    const i = fromProposal(prop({ status: 'approved', publishAt: '2026-11-02T09:00:00Z', publishError: 'fallo' }), null, madridDay)
    expect(i).toMatchObject({ hasError: true, errorText: 'fallo', stateText: 'Error de publicación' })
  })
  it('los estados del menú se traducen a los cuatro de siempre', () => {
    expect(fromMenu(menu(), madridDay)).toMatchObject({ status: 'proposed', stateText: 'Pendiente de revisar', dateText: 'Semana del 2 de noviembre' })
    expect(fromMenu(menu({ state: 'scheduled', publishAt: '2026-11-07T09:00:00Z' }), madridDay)).toMatchObject({ status: 'approved', stateText: 'Programado', dateText: 'Sale el 7 de noviembre' })
    expect(fromMenu(menu({ state: 'error', publishAt: '2026-11-07T09:00:00Z', publishError: 'x' }), madridDay)).toMatchObject({ status: 'approved', hasError: true, stateText: 'Con error' })
    expect(fromMenu(menu({ state: 'published' }), madridDay).status).toBe('published')
    expect(fromMenu(menu({ state: 'rejected' }), madridDay).status).toBe('rejected')
  })
})

describe('Centro Editorial: contadores del Resumen', () => {
  it('salen de las filas reales (pendientes por tipo, aprobado/programado y errores)', () => {
    const items: CenterItem[] = [
      fromProposal(prop({ id: 'a1' }), null, madridDay),
      fromProposal(prop({ id: 'a2', kind: 'tip' }), null, madridDay),
      fromProposal(prop({ id: 'p1', kind: 'poll' }), null, madridDay),
      fromProposal(prop({ id: 'a3', status: 'approved', publishAt: '2026-11-02T09:00:00Z' }), null, madridDay),
      fromProposal(prop({ id: 'a4', status: 'approved', publishAt: '2026-11-03T09:00:00Z', publishError: 'x' }), null, madridDay),
      fromMenu(menu(), madridDay),
      fromMenu(menu({ id: 'm2', state: 'scheduled', publishAt: '2026-11-07T09:00:00Z' }), madridDay),
    ]
    expect(countCenter(items)).toEqual({ articlesPending: 2, pollsPending: 1, menusPending: 1, approvedScheduled: 3, errors: 1 })
  })
  it('al cambiar un estado, los contadores cambian a la vez (misma fuente)', () => {
    const before = [fromProposal(prop(), null, madridDay)]
    const after = [fromProposal(prop({ status: 'approved', publishAt: '2026-11-02T09:00:00Z' }), null, madridDay)]
    expect(countCenter(before).articlesPending).toBe(1)
    expect(countCenter(after)).toMatchObject({ articlesPending: 0, approvedScheduled: 1 })
  })
})

describe('Centro Editorial: filtros, orden y paginación', () => {
  const mk = (id: string, title: string, date: string | null, hasError = false): CenterItem => ({ id, kind: 'article', title, topicLabel: null, status: 'proposed', version: 1, date, dateText: '', stateText: '', hasError, errorText: null })
  const items = [mk('1', 'Cómo ahorrar luz', '2026-11-03'), mk('2', 'Menú de otoño', '2026-11-05'), mk('3', 'Plato de ducha', '2026-11-01'), mk('4', 'Sin fecha', null)]
  it('busca por título sin importar tildes ni mayúsculas', () => {
    expect(filterCenter(items, { ...NO_FILTER, query: 'COMO ahorrar' }).map((i) => i.id)).toEqual(['1'])
  })
  it('filtra por fechas (los que no tienen fecha quedan fuera al filtrar por fecha)', () => {
    expect(filterCenter(items, { ...NO_FILTER, from: '2026-11-02', to: '2026-11-04' }).map((i) => i.id)).toEqual(['1'])
    expect(filterCenter(items, { ...NO_FILTER, from: '2026-11-04' }).map((i) => i.id)).toEqual(['2'])
    expect(filterCenter(items, NO_FILTER)).toHaveLength(4)
  })
  it('lo pendiente se ordena por fecha próxima y lo que tiene error va primero', () => {
    expect(sortCenter([...items, mk('5', 'Error', '2026-12-01', true)], 'proposed').map((i) => i.id)).toEqual(['5', '3', '1', '2', '4'])
    expect(sortCenter(items, 'published').map((i) => i.id)).toEqual(['2', '1', '3', '4'])
  })
  it('carga progresiva: enseña un bloque y dice cuántos quedan', () => {
    const many = Array.from({ length: 45 }, (_, n) => mk(String(n), `T${n}`, null))
    expect(pageOf(many, PAGE_SIZE)).toMatchObject({ remaining: 25 })
    expect(pageOf(many, PAGE_SIZE).visible).toHaveLength(PAGE_SIZE)
    expect(pageOf(many, 100).remaining).toBe(0)
  })
})

describe('Centro Editorial: secciones y programa', () => {
  it('las secciones son las seis y un valor raro cae en el Resumen', () => {
    expect(parseCenterSection('menus')).toBe('menus')
    expect(parseCenterSection('xx')).toBe('resumen')
    expect(parseCenterSection(null)).toBe('resumen')
    expect(sectionOfKind('poll')).toBe('encuestas')
    expect(sectionOfKind('menu')).toBe('menus')
    expect(sectionOfKind('tip')).toBe('articulos')
  })
  it('el programa semanal toma el estado del registro compartido cuando está más al día', () => {
    const row: EditorialItemRow = { id: 'a1', kind: 'article', title: 'Viejo', status: 'proposed', version: 1, slotDate: '2026-11-02', topicLabel: null, publishAt: null, publishError: null, tier: 1 }
    const live = fromProposal(prop({ status: 'approved', version: 3, title: 'Nuevo', publishAt: '2026-11-02T09:00:00Z' }), null, madridDay)
    const out = syncProgramRows([row, { ...row, id: 'otro' }], new Map([[live.id, live]]))
    expect(out[0]).toMatchObject({ status: 'approved', version: 3, title: 'Nuevo' })
    expect(out[1]).toEqual({ ...row, id: 'otro' })
  })
})
