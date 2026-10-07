import { describe, expect, it } from 'vitest'

// BUG real (iPhone): "El mismo día" guardaba minutesBefore=0, rechazado por la constraint original
// (minutes_before > 0, migración 0021). Migración 0211 la amplía a >= 0 — nunca se elimina la
// validación, solo se corrige para admitir el único valor legítimo que rechazaba de más.
const MIG = (import.meta.glob('/supabase/migrations/0211_calendar_event_reminders_allow_zero_minutes.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0211_calendar_event_reminders_allow_zero_minutes.sql'
]

describe('migración 0211 — amplía la constraint sin eliminarla, sin tocar datos', () => {
  it('sigue existiendo una validación: nunca se borra la constraint sin reemplazarla', () => {
    expect(MIG).toContain('drop constraint calendar_event_reminders_minutes_before_check')
    expect(MIG).toContain('add constraint calendar_event_reminders_minutes_before_check check (minutes_before >= 0)')
  })
  it('sigue rechazando negativos: la nueva condición es >= 0, no "sin condición"', () => {
    expect(MIG).not.toMatch(/check\s*\(\s*true\s*\)/)
    expect(MIG).toContain('>= 0')
  })
  it('no borra ni actualiza ninguna fila existente (aditiva de verdad)', () => {
    const code = MIG.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(code).not.toMatch(/\bupdate\s+calendar_event_reminders\b|\bdelete\s+from\b|\bdrop\s+table\b/i)
  })
})
