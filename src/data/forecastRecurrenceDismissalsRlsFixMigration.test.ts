import { describe, expect, it } from 'vitest'

// Fase 1E.0 — corrige un bug real de RLS en forecast_recurrence_dismissals (0158): el `family_id` sin
// cualificar dentro del EXISTS se resolvía a bank_connections.family_id (sombreado de nombre en un
// subquery correlacionado), no al family_id de la fila — quedaba "c.family_id = c.family_id", una
// tautología. Verificado con datos reales en rehearsal (BEGIN/ROLLBACK) antes de aplicar: con la
// fórmula antigua, account_id real de una familia + family_id de OTRA familia distinta pasaba el EXISTS
// (bug demostrado); con la fórmula corregida, el mismo caso se rechaza y el caso de la misma familia se
// sigue aceptando (ver informe de la fase para el detalle exacto de esa comprobación).
//
// "cuenta de la familia actual → permitido" / "family_id incorrecto → rechazado" / "sin acceso dinero →
// rechazado": ninguno de los tres depende de esta migración — son el primer AND de la policy
// (family_id = current_family_id() AND has_section_access('dinero')), que nunca tuvo el bug y no cambia
// aquí; se mantienen intactos porque el texto de esa parte de la policy es idéntico al de 0158.
const FILES = import.meta.glob(['/supabase/migrations/0159_fix_forecast_recurrence_dismissals_rls.sql', '/supabase/rollbacks/0159_fix_forecast_recurrence_dismissals_rls_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0159_fix_forecast_recurrence_dismissals_rls.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0159_fix_forecast_recurrence_dismissals_rls_down.sql']
const SQL = MIGRATION.replace(/--[^\n]*/g, '')

describe('0159 — corrección del RLS de forecast_recurrence_dismissals (cuenta de otra familia → rechazado)', () => {
  it('reemplaza la policy existente (drop + create), nunca dos policies activas a la vez', () => {
    expect(SQL).toContain('drop policy "forecast_recurrence_dismissals: family crud" on forecast_recurrence_dismissals')
    expect(SQL).toContain('create policy "forecast_recurrence_dismissals: family crud" on forecast_recurrence_dismissals for all')
  })

  it('el EXISTS ahora cualifica AMBOS lados del join con la tabla real — nunca más un `family_id` ambiguo que un subquery correlacionado pueda sombrear', () => {
    const usingIdx = SQL.indexOf('using (')
    const checkIdx = SQL.indexOf('with check (')
    const usingBody = SQL.slice(usingIdx, checkIdx)
    const checkBody = SQL.slice(checkIdx)
    for (const body of [usingBody, checkBody]) {
      expect(body).toContain('a.id = forecast_recurrence_dismissals.account_id')
      expect(body).toContain('c.family_id = forecast_recurrence_dismissals.family_id')
      // Nunca la forma ambigua antigua (bare family_id) dentro de este EXISTS.
      expect(body).not.toMatch(/where a\.id = account_id and c\.family_id = family_id/)
    }
  })

  it('sigue exigiendo family_id = current_family_id() y acceso a "dinero" — la parte que nunca tuvo el bug no cambia', () => {
    expect(SQL).toContain('family_id = private.current_family_id()')
    expect(SQL).toContain("private.has_section_access('dinero')")
  })

  it('using y with_check son idénticos — ninguna asimetría entre lo que se puede leer y lo que se puede escribir', () => {
    const usingIdx = SQL.indexOf('using (')
    const checkIdx = SQL.indexOf('with check (')
    const usingBody = SQL.slice(usingIdx + 'using ('.length, checkIdx).trim()
    const checkBody = SQL.slice(checkIdx + 'with check ('.length).trim()
    expect(checkBody.startsWith(usingBody.slice(0, -3))).toBe(true) // mismo cuerpo salvo el paréntesis de cierre final
  })

  it('nunca borra ni modifica filas existentes de forecast_recurrence_dismissals — solo cambia la policy', () => {
    expect(SQL).not.toMatch(/delete from|update forecast_recurrence_dismissals|truncate/i)
  })

  it('el rollback restaura exactamente la policy original de 0158 (con el bug) — solo para poder deshacer ESTA migración concreta', () => {
    expect(ROLLBACK).toContain('drop policy "forecast_recurrence_dismissals: family crud" on forecast_recurrence_dismissals')
    expect(ROLLBACK).toContain('where a.id = account_id and c.family_id = family_id')
  })
})
