import { describe, expect, it } from 'vitest'

// Eventos Fase 10 — recordatorios de tarea: reutiliza el mismo
// almacén que ya usa Calendario (calendar_event_reminders vía
// replaceReminders/listEventReminders, ambas ya existentes en
// data/calendar.ts) en vez de crear un sistema de recordatorios propio
// de Eventos. No debe haber ninguna llamada directa a
// calendar_event_reminders fuera de esas dos funciones reutilizadas.
const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const CALENDAR_SRC = (import.meta.glob('/src/data/calendar.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/calendar.ts']

describe('Fase 10 — reutiliza el almacén de recordatorios de Calendario, no crea uno propio', () => {
  it('EventosScreen importa replaceReminders/listEventReminders de @/data/calendar', () => {
    expect(SRC).toContain("import { listEventReminders, replaceReminders } from '@/data/calendar'")
  })

  it('EventosScreen nunca llama directamente a la tabla calendar_event_reminders', () => {
    expect(SRC).not.toContain("from('calendar_event_reminders')")
  })

  it('replaceReminders/listEventReminders viven en data/calendar.ts (el mismo módulo que ya usa Calendario), exportadas para reutilizar', () => {
    expect(CALENDAR_SRC).toContain('export async function replaceReminders')
    expect(CALENDAR_SRC).toContain('export async function listEventReminders')
  })
})

describe('Fase 10 — no toca push/cron/service worker/send-due-reminders', () => {
  it('EventosScreen no importa ni menciona send-due-reminders, VAPID ni el service worker', () => {
    expect(SRC).not.toMatch(/send-due-reminders|VAPID|serviceWorker|navigator\.serviceWorker/i)
  })
})

describe('Fase 10 — opciones de recordatorio (sin aviso/mismo día/1 día/1 semana/personalizado)', () => {
  it('mapea a los mismos minutos ya usados por el plazo de RSVP (1 día=1440, 1 semana=10080)', () => {
    const fnStart = SRC.indexOf('function remindersForChoice')
    const fnBody = SRC.slice(fnStart, SRC.indexOf('\n  async function handleSubmit', fnStart))
    expect(fnBody).toContain('minutesBefore: 0')
    expect(fnBody).toContain('minutesBefore: 1440')
    expect(fnBody).toContain('minutesBefore: 10080')
  })

  it('el selector solo se muestra si la tarea está enlazada al Calendario (showInCalendar)', () => {
    const idx = SRC.indexOf('🔔 Sin aviso')
    const before = SRC.slice(Math.max(0, idx - 300), idx)
    expect(before).toContain('showInCalendar &&')
  })
})
