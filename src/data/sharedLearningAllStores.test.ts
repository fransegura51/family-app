import { describe, expect, it } from 'vitest'

// Contrato de la migración 0308 (aprendizaje compartido para todos los establecimientos, tres niveles). Las pruebas en vivo
// (dos familias reales de prueba, revertidas) están en docs/PEPA_CONTROL_REQUISITOS.md, requisito CAT-1.
const FILES = import.meta.glob(['/supabase/migrations/0308_shared_learning_all_stores.sql', '/supabase/rollbacks/0308_shared_learning_all_stores_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const UP = FILES['/supabase/migrations/0308_shared_learning_all_stores.sql']
const DOWN = FILES['/supabase/rollbacks/0308_shared_learning_all_stores_down.sql']

describe('0308 — aprendizaje compartido general', () => {
  it('existe la migración y su reversión', () => {
    expect(UP).toBeTruthy()
    expect(DOWN).toContain('drop table if exists public.shared_product_confirmations')
  })

  it('privacidad: la tabla compartida solo guarda texto, hash de familia y clase; sin RLS abierta ni permisos de usuario', () => {
    const table = UP.slice(UP.indexOf('create table public.shared_product_confirmations'), UP.indexOf('create index shared_product_confirmations_class_idx'))
    expect(table).toContain('family_hash text not null')
    expect(table).not.toMatch(/family_id|price|store|quantity|receipt|user_id|recorded_date/i)
    expect(UP).toContain('alter table public.shared_product_confirmations enable row level security')
    expect(UP).toContain('revoke all on public.shared_product_confirmations, public.shared_product_general_review from public, anon, authenticated')
    expect(UP).not.toMatch(/create policy/i)
    expect(UP).not.toMatch(/grant (select|insert|update|delete)[^;]*shared_product_(confirmations|general_review)/i)
  })

  it('tres niveles: provisional (1 familia), validada (2+ sin discrepancia), conflicto → ambiguo', () => {
    expect(UP).toContain("case when v_top.n >= 2 then 'validated' else 'provisional' end")
    expect(UP).toContain("if v_classes > 1 then return query select 'conflict'")
    expect(UP).toContain("'general_provisional'")
    expect(UP).toContain("'general_validated'")
  })

  it('sin borrado de datos de las familias: el disparador solo escribe en la tabla de votos', () => {
    expect(UP).not.toMatch(/(delete from|update|truncate)\s+public\.(products|product_prices|receipts|expenses|family_food_types)\b/i)
    expect(UP).not.toMatch(/drop table(?! if exists public\.shared)/i)
  })

  it('el aprendizaje por cadena aprobado por PEPA sigue teniendo prioridad sobre el general', () => {
    expect(UP.indexOf('shared_product_learning l')).toBeLessThan(UP.indexOf('shared_general_level(v_key)'))
  })

  it('solo cuentan clasificaciones confirmadas con clase estándar del catálogo', () => {
    expect(UP).toContain('p.class_confirmed_at is not null')
    expect(UP).toContain('ft.catalog_key is not null')
  })

  it('la RPC mantiene su firma y sus permisos', () => {
    expect(UP).toContain('create or replace function public.resolve_shared_product_class(p_store text, p_text text)')
    expect(UP).toContain('grant execute on function public.resolve_shared_product_class(text, text) to authenticated, service_role')
  })
})
