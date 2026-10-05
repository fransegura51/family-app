// Cableado del cierre del sistema de recordatorios: service worker, app abierta, datos y migración 0197.
// Lee el código real como texto; el comportamiento del SQL se comprobó además contra producción en una
// transacción que se deshace (ver el informe).
import { describe, expect, it } from 'vitest'

const FILES = import.meta.glob(['/src/sw.ts', '/src/services/notifications.ts', '/src/services/reminderReceipts.ts', '/src/ui/ReminderWatcher.tsx', '/src/data/calendar.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SQL = Object.entries(MIGRATIONS).find(([f]) => f.includes('0197_reminders_future_occurrences_and_stable_identity'))?.[1] ?? ''
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const SW = FILES['/src/sw.ts']
const WATCHER = FILES['/src/ui/ReminderWatcher.tsx']
const NOTIF = FILES['/src/services/notifications.ts']
const CAL = FILES['/src/data/calendar.ts']
const RECEIPTS = FILES['/src/services/reminderReceipts.ts']

describe('2. Service worker y app abierta comparten identidad y no se duplican', () => {
  it('el service worker usa la etiqueta del servidor y cierra solo las notificaciones de ESA etiqueta (nunca todas)', () => {
    expect(SW).toContain('getNotifications({ tag })')
    expect(SW).toContain('...(tag ? { tag } : {})')
    expect(SW).not.toMatch(/getNotifications\(\s*\)/)
  })
  it('deja un recibo del aviso recibido para que la app abierta sepa que el servidor ya avisó en este dispositivo', () => {
    expect(SW).toContain('await recordReminderReceipt(tag)')
    expect(RECEIPTS).toContain("caches.open(CACHE_NAME)")
  })
  it('los avisos que no son recordatorios (pagos, lugares) siguen sin etiqueta', () => {
    expect(SW).toContain('...(tag ? { tag } : {})')
    expect(SW).toContain('data: payload.url ?? null')
  })
  it('ReminderWatcher decide con localReminderAction (alta de Web Push + recibo) y usa la misma etiqueta que el servidor', () => {
    expect(WATCHER).toContain('localReminderAction({')
    expect(WATCHER).toContain('await hasPushSubscription()')
    expect(WATCHER).toContain('hasReminderReceipt(tag)')
    expect(WATCHER).toContain('reminderTag(r.id, madridParts(r.startAt).date, r.anchor, r.reminderMinutes)')
    expect(WATCHER).toContain('showNotification(r.title, body, tag)')
  })
  it('reconoce el formato de clave anterior para no repetir un aviso ya mostrado antes de esta versión', () => {
    expect(WATCHER).toContain('shownRef.current.has(legacyKey)')
  })
  it('el aviso local ya no formatea con la zona del dispositivo: texto compartido y hora de Madrid', () => {
    const check = WATCHER.slice(WATCHER.indexOf('async function checkReminders'), WATCHER.indexOf('async function checkOverdueUndone'))
    expect(check).not.toContain('toLocaleTimeString')
    expect(check).toContain('reminderBody({')
  })
  it('showNotification admite etiqueta y no muestra otra si ya hay una con ESA etiqueta', () => {
    expect(NOTIF).toContain('export function showNotification(title: string, body: string, tag?: string)')
    expect(NOTIF).toContain('getNotifications({ tag })')
  })
})

describe('4. Editar un evento conserva los recordatorios que no cambian', () => {
  const fn = CAL.slice(CAL.indexOf('export async function replaceReminders'), CAL.indexOf('export async function listEventReminders'))
  it('ya no borra todo el evento y lo recrea: calcula el cambio y toca solo lo que difiere', () => {
    expect(fn).toContain('planReminderChanges(')
    expect(fn).not.toContain(".delete().eq('event_id', eventId)")
    expect(fn).toContain(".in('id', plan.deleteIds)")
  })
  it('inserta lo nuevo ANTES de borrar lo que sobra (un fallo no deja al evento sin recordatorios)', () => {
    expect(fn.indexOf('.insert(')).toBeGreaterThan(-1)
    expect(fn.indexOf('.insert(')).toBeLessThan(fn.indexOf('.delete()'))
  })
})

describe('0197 — migración', () => {
  it('3. evalúa ocurrencias de los próximos días hasta cubrir el intervalo y avisa en anchor_at - minutes_before', () => {
    expect(CODE).toContain('ceil(b.minutes_before / 1440.0)::int + 2')
    expect(CODE).toContain("now() >= anchor_at - (minutes_before || ' minutes')::interval")
    expect(CODE).not.toMatch(/event_occurs_on_date\([^)]*v_today\)/) // ya no solo la ocurrencia de HOY
  })
  it('la hora de la ocurrencia se coloca en Madrid (sin desfases de UTC) y se devuelven fecha/hora locales de Madrid', () => {
    expect(CODE).toContain("(d.occ_date + b.start_time) at time zone 'Europe/Madrid'")
    expect(CODE).toContain("to_char(c.anchor_at at time zone 'Europe/Madrid', 'HH24:MI')")
    expect(CODE).not.toMatch(/at time zone 'UTC'/i)
  })
  it('4. la entrega recuerda el instante avisado: la clave incluye anchor_at, así que un cambio real de horario es un aviso nuevo y uno ya entregado no se repite', () => {
    expect(CODE).toContain('add primary key (reminder_id, subscription_id, occurrence_date, anchor_at)')
    expect(CODE).toContain('on conflict (reminder_id, subscription_id, occurrence_date, anchor_at) do nothing')
  })
  it('las entregas ya existentes se rellenan con la misma fórmula (no se reenvía nada ya enviado al desplegar)', () => {
    expect(CODE).toContain('update public.reminder_deliveries rd')
    expect(CODE).toContain('alter column anchor_at set not null')
  })
  it('5. devuelve si el evento es de todo el día y NO cambia cuándo se avisa (sin filtro por all_day)', () => {
    expect(CODE).toContain('out_all_day boolean')
    expect(CODE).not.toMatch(/where[^;]*all_day\s*(=|is)/i)
  })
  it('sigue siendo SECURITY DEFINER y solo ejecutable por service_role (no anon, no authenticated)', () => {
    expect(CODE).toContain('security definer')
    expect(CODE).toContain("set search_path to 'public'")
    expect(CODE).toContain('revoke all on function public.claim_due_reminders() from public, anon, authenticated;')
    expect(CODE).toContain('grant execute on function public.claim_due_reminders() to service_role;')
    expect(CODE).not.toMatch(/to (anon|authenticated|public)\b/)
  })
  it('conserva a quién se avisa: miembros del evento + admins; privados solo a quien los creó', () => {
    expect(CODE).toContain("where dr.visibility = 'shared'")
    expect(CODE).toContain("where dr.visibility = 'private'")
    expect(CODE).toContain('join push_subscriptions ps on ps.profile_id = dr.created_by')
  })
  it('no toca otras tablas ni los pipelines de pagos/nags', () => {
    expect(CODE).not.toMatch(/forecast_|overdue_nag|create policy|drop policy/i)
    expect(CODE).not.toMatch(/alter table (?!public\.reminder_deliveries)/i)
  })
})
