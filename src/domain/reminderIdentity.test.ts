// Candado de los recordatorios de Calendario (auditoría de notificaciones): hora en Madrid (verano e invierno),
// identidad/etiqueta estable, un único productor por dispositivo, y texto de los eventos de todo el día.
import { describe, expect, it } from 'vitest'
import { daysBetweenDates, localReminderAction, madridParts, PUSH_GRACE_MS, reminderBody, reminderTag } from '@/domain/reminderIdentity'

const FILES = import.meta.glob(['/src/domain/reminderIdentity.ts', '/supabase/functions/send-due-reminders/index.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const DOMAIN = FILES['/src/domain/reminderIdentity.ts']
const EDGE = FILES['/supabase/functions/send-due-reminders/index.ts']

function block(source: string): string {
  const m = source.match(/\/\/ <reminder-body>[\s\S]*?\/\/ <\/reminder-body>/)
  // Se ignoran las dos líneas de comentario de cabecera (cada archivo explica de dónde viene), solo se compara el código.
  return (m?.[0] ?? '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
}

describe('1. La hora del aviso es la de Madrid, nunca la de UTC', () => {
  it('verano (CEST, UTC+2): un evento a las 16:30 de Madrid se guarda como 14:30Z y se dice «16:30»', () => {
    expect(madridParts('2026-10-05T14:30:00Z')).toEqual({ date: '2026-10-05', time: '16:30' })
    expect(madridParts('2026-07-15T14:30:00Z').time).toBe('16:30')
  })
  it('invierno (CET, UTC+1): el mismo 16:30 de Madrid es 15:30Z y también se dice «16:30»', () => {
    expect(madridParts('2026-12-15T15:30:00Z')).toEqual({ date: '2026-12-15', time: '16:30' })
  })
  it('el ejemplo pedido: evento 16:30, aviso 1 h antes (15:30 Madrid) → «Empieza a las 16:30», nunca «14:30»', () => {
    const start = '2026-10-05T14:30:00Z'
    const sentAt = new Date(new Date(start).getTime() - 60 * 60_000)
    expect(madridParts(sentAt).time).toBe('15:30') // el aviso sale a las 15:30 de Madrid
    const local = madridParts(start)
    const body = reminderBody({ anchor: 'start', allDay: false, localDate: local.date, localTime: local.time, dayOffset: 0 })
    expect(body).toBe('Empieza a las 16:30')
    expect(body).not.toContain('14:30')
  })
  it('los dos cambios de hora del año: 29-mar-2026 (se adelanta) y 25-oct-2026 (se atrasa)', () => {
    expect(madridParts('2026-03-29T00:30:00Z').time).toBe('01:30') // aún CET
    expect(madridParts('2026-03-29T01:30:00Z').time).toBe('03:30') // ya CEST (la 02:xx no existe)
    expect(madridParts('2026-10-25T00:30:00Z').time).toBe('02:30') // aún CEST
    expect(madridParts('2026-10-25T01:30:00Z').time).toBe('02:30') // ya CET (la 02:30 se repite)
  })
  it('la fecha también es la de Madrid: 23:30Z de verano ya es el día siguiente en Madrid', () => {
    expect(madridParts('2026-10-05T22:30:00Z')).toEqual({ date: '2026-10-06', time: '00:30' })
  })
  it('un recordatorio «desde el final» dice «Termina»', () => {
    expect(reminderBody({ anchor: 'end', allDay: false, localDate: '2026-10-05', localTime: '17:15', dayOffset: 0 })).toBe('Termina a las 17:15')
  })
  it('la Edge Function ya no formatea la hora con la zona del servidor: usa el texto compartido y la hora que calcula la base', () => {
    const fn = EDGE.slice(EDGE.indexOf('async function sendDueCalendarReminders'), EDGE.indexOf('return { checked: reminders?.length'))
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    expect(fn).not.toContain('toLocaleTimeString')
    expect(fn).toContain('reminderBody({')
    expect(fn).toContain('localTime: r.out_local_time')
  })
  it('el bloque de texto de la Edge Function es idéntico al de src/domain (no pueden decir cosas distintas)', () => {
    expect(block(EDGE)).toBe(block(DOMAIN))
    expect(block(DOMAIN)).toContain('function reminderBody')
  })
})

describe('2. Identidad (etiqueta) estable del recordatorio', () => {
  const base = { event: 'e1', date: '2026-10-05', anchor: 'start' as 'start' | 'end', minutes: 60 }
  const tag = (o: Partial<typeof base> = {}) => {
    const v = { ...base, ...o }
    return reminderTag(v.event, v.date, v.anchor, v.minutes)
  }
  it('es la misma para el mismo recordatorio (servidor y app generan la misma)', () => {
    expect(tag()).toBe('reminder:e1:2026-10-05:start:60')
    expect(tag()).toBe(tag())
  })
  it('distingue evento, ocurrencia, ancla y minutos: varios recordatorios legítimos de un evento no se funden', () => {
    const all = [tag(), tag({ event: 'e2' }), tag({ date: '2026-10-12' }), tag({ anchor: 'end' }), tag({ minutes: 1440 })]
    expect(new Set(all).size).toBe(all.length)
  })
  it('la Edge Function construye exactamente el mismo formato', () => {
    expect(EDGE).toContain('`reminder:${r.out_event_id}:${r.out_occurrence_date}:${r.out_anchor}:${r.out_minutes_before}`')
    expect(EDGE).toContain('{ title: r.out_event_title, body, tag },')
  })
})

describe('2b. Un único productor efectivo por recordatorio y dispositivo (iOS no reemplaza por etiqueta)', () => {
  const T = 1_000_000_000_000
  const anchorMs = T + 60 * 60_000
  const dueAtMs = T
  const act = (o: Partial<Parameters<typeof localReminderAction>[0]>) =>
    localReminderAction({ nowMs: T + 1000, dueAtMs, anchorMs, alreadyHandled: false, hasPushSubscription: false, pushReceived: false, ...o })

  it('sin alta de Web Push, la app abierta es el único productor: avisa', () => {
    expect(act({})).toBe('show')
  })
  it('con alta de Web Push y el aviso del servidor ya recibido: la app NO muestra nada (solo lo anota)', () => {
    expect(act({ hasPushSubscription: true, pushReceived: true })).toBe('mark')
  })
  it('con alta y aún sin recibo, espera el margen en vez de duplicar', () => {
    expect(act({ hasPushSubscription: true, nowMs: T + PUSH_GRACE_MS - 1 })).toBe('wait')
  })
  it('con alta pero sin que llegue el aviso del servidor en el margen (suscripción caducada, no es destinatario…): la app avisa para no perderlo', () => {
    expect(act({ hasPushSubscription: true, nowMs: T + PUSH_GRACE_MS })).toBe('show')
  })
  it('no avisa antes de hora, ni cuando el evento ya empezó, ni lo ya atendido', () => {
    expect(act({ nowMs: T - 1 })).toBe('skip')
    expect(act({ nowMs: anchorMs })).toBe('skip')
    expect(act({ alreadyHandled: true })).toBe('skip')
  })
})

describe('3. Todo el día: texto coherente sin inventar hora', () => {
  const allDay = (dayOffset: number, localDate = '2026-10-06') => reminderBody({ anchor: 'start', allDay: true, localDate, localTime: '02:00', dayOffset })
  it('el día mismo: «Hoy, todo el día» — nunca «Empieza a las 02:00»', () => {
    expect(allDay(0)).toBe('Hoy, todo el día')
    expect(allDay(0)).not.toMatch(/02:00|a las|Empieza/)
  })
  it('la víspera y avisos más largos nombran el día, sin hora', () => {
    expect(allDay(1)).toBe('Mañana, todo el día')
    expect(allDay(3, '2026-10-08')).toBe('El jueves 8 de octubre, todo el día')
  })
})

describe('Avisos largos: el texto nombra el día cuando no es hoy', () => {
  it('«1 día antes» de un evento a las 16:30: «Empieza mañana a las 16:30»', () => {
    expect(reminderBody({ anchor: 'start', allDay: false, localDate: '2026-10-05', localTime: '16:30', dayOffset: 1 })).toBe('Empieza mañana a las 16:30')
  })
  it('1 semana antes nombra día y mes', () => {
    expect(reminderBody({ anchor: 'start', allDay: false, localDate: '2026-10-12', localTime: '16:30', dayOffset: 7 })).toBe('Empieza el lunes 12 de octubre a las 16:30')
  })
  it('desfase de días entre fechas', () => {
    expect(daysBetweenDates('2026-10-04', '2026-10-05')).toBe(1)
    expect(daysBetweenDates('2026-10-25', '2026-10-25')).toBe(0)
    expect(daysBetweenDates('2026-03-28', '2026-03-30')).toBe(2) // atraviesa el cambio de hora: sigue siendo por fechas
  })
})
