import { describe, expect, it } from 'vitest'

// "👰🤵 La pareja" (Fase 3) — relación muchos-a-muchos decisión↔proveedor (migración 0179), para que un
// mismo proveedor real (p. ej. una floristería) pueda relacionarse con varias decisiones sin duplicarse.
// Mismo patrón de verificación por SQL crudo que eventDecisionsAndMomentsMigration.test.ts, y mismo
// esqueleto estructural que event_guest_moments (0176): on delete cascade en ambos lados, RLS "hardened".
const FILES = import.meta.glob('/supabase/migrations/0179_event_decision_providers.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0179_event_decision_providers.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')

describe('event_decision_providers — muchos-a-muchos real, nunca duplica event_providers', () => {
  it('existe con decision_id y provider_id, ambos on delete cascade (borrar uno borra solo la relación, nunca al otro lado)', () => {
    expect(SQL).toContain('create table event_decision_providers')
    expect(SQL).toContain('decision_id uuid not null references event_decisions(id) on delete cascade')
    expect(SQL).toContain('provider_id uuid not null references event_providers(id) on delete cascade')
  })

  it('unique(decision_id, provider_id) — no se puede relacionar el mismo proveedor dos veces con la misma decisión', () => {
    expect(SQL).toContain('unique (decision_id, provider_id)')
  })

  it('event_providers.decision_id (0176) no se toca — sigue siendo quién creó el proveedor la primera vez', () => {
    expect(SQL).not.toContain('alter table event_providers')
    expect(SQL).not.toMatch(/drop column decision_id/i)
  })

  it('RLS habilitada con policy family-scoped que exige que decisión y proveedor sean del MISMO evento/familia', () => {
    expect(SQL).toContain('alter table event_decision_providers enable row level security')
    const idx = SQL.indexOf('create policy "event_decision_providers: family crud"')
    expect(idx).toBeGreaterThan(-1)
    const body = SQL.slice(idx, SQL.indexOf(';', idx))
    expect(body).toContain('family_id = private.current_family_id()')
    expect(body).toContain("private.has_section_access('eventos')")
    expect(body).toContain('from event_decisions d where d.id = decision_id')
    expect(body).toContain('from event_providers p where p.id = provider_id')
    expect(body).toContain('d.event_id = event_decision_providers.event_id')
    expect(body).toContain('p.event_id = event_decision_providers.event_id')
  })

  it('índices por decision_id/provider_id/event_id/family_id (mismo patrón que event_guest_moments)', () => {
    expect(SQL).toContain('create index idx_event_decision_providers_decision on event_decision_providers(decision_id)')
    expect(SQL).toContain('create index idx_event_decision_providers_provider on event_decision_providers(provider_id)')
    expect(SQL).toContain('create index idx_event_decision_providers_event on event_decision_providers(event_id)')
    expect(SQL).toContain('create index idx_event_decision_providers_family on event_decision_providers(family_id)')
  })

  it('nunca SECURITY DEFINER — solo tabla y políticas normales, igual que el resto del módulo', () => {
    expect(SQL).not.toMatch(/security definer/i)
  })
})
