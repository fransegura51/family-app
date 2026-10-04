// Candado de la migración 0194 (Plan del día editable): aditiva, protege los datos que ya hay y no abre ningún
// agujero entre familias. Lee el SQL real como texto; el comportamiento real del SQL se comprobó además contra la
// base de producción con transacciones que se deshacen (ver el informe de la fase).
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SQL = Object.entries(MIGRATIONS).find(([f]) => f.includes('0194_event_day_plan_editable'))?.[1] ?? ''
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('0194 — columnas nuevas, aditivas', () => {
  it('añade source_key (nulable), show_on_share (SÍ por defecto, para nuevos y existentes) y coincide_ok_time (nulable)', () => {
    expect(CODE).toMatch(/add column source_key text,/)
    expect(CODE).toContain('add column show_on_share boolean not null default true')
    expect(CODE).toContain('add column coincide_ok_time time')
  })
  it('no borra ni reescribe títulos, horas ni notas; solo etiqueta y renumera', () => {
    expect(CODE).not.toMatch(/\b(drop table|truncate|delete from|drop column)\b/i)
    expect(CODE).not.toMatch(/set\s+(title|item_time|note)\s*=/i)
  })
  it('no toca event_decisions ni ninguna otra tabla (solo event_day_plan_items)', () => {
    expect(CODE).not.toMatch(/alter table (?!event_day_plan_items)/i)
    expect(CODE).not.toMatch(/update (?!event_day_plan_items)/i)
  })
  it('no decide nada sobre el día: sin columna de día/momento (limitación documentada, no cerrada)', () => {
    expect(CODE).not.toMatch(/moment_id|item_date|day_number/)
    expect(SQL).toContain('NO tiene concepto de día')
  })
})

describe('0194 — identidad estable sin duplicados', () => {
  it('adopta lo ya generado mapeando el título del catálogo a su clave, solo para la decisión comida.momentos', () => {
    expect(CODE).toContain("join event_decisions d on d.id = p.decision_id and d.question_key = 'comida.momentos'")
    for (const [title, key] of [
      ['Aperitivo / cóctel', 'aperitivo'],
      ['Comida / banquete', 'comida'],
      ['Cena / banquete', 'cena'],
      ['Recena', 'recena'],
      ['Merienda / café / dulces', 'merienda'],
    ]) expect(CODE).toContain(`when '${title}' then '${key}'`)
    expect(CODE).toContain("source_key = 'comida.momentos:' || r.k")
  })
  it('si hubiera un duplicado antiguo, solo el más antiguo recibe la clave (el índice único no puede fallar)', () => {
    expect(CODE).toContain('row_number() over (partition by event_id, decision_id, k order by created_at, id)')
    expect(CODE).toContain('r.rn = 1')
  })
  it('índice único PARCIAL: una decisión, una clave, una fila — y solo para elementos automáticos', () => {
    expect(CODE).toContain('create unique index uq_event_day_plan_items_source')
    expect(CODE).toContain('on event_day_plan_items (event_id, decision_id, source_key)')
    expect(CODE).toContain('where decision_id is not null and source_key is not null')
  })
  it('NO hay unicidad por título: dos momentos manuales pueden llamarse igual', () => {
    expect(CODE).not.toMatch(/unique[^;]*\btitle\b/i)
  })
})

describe('0194 — sort_order con significado propio', () => {
  it('se normaliza respetando exactamente el orden visible actual (con hora por hora y luego sort_order; sin hora al final)', () => {
    expect(CODE).toContain('order by (item_time is null), item_time, sort_order, created_at, id')
    expect(CODE).toContain('set sort_order = o.rn * 1000')
  })
  it('los nuevos van al final por un trigger de la base (sin Date.now() en el cliente)', () => {
    expect(CODE).toContain('create trigger trg_event_day_plan_items_sort_order')
    expect(CODE).toContain('before insert on event_day_plan_items')
    expect(CODE).toContain('coalesce((select max(sort_order) from public.event_day_plan_items where event_id = new.event_id), 0) + 1000')
  })
})

describe('0194 — reordenación atómica y segura', () => {
  const fn = CODE.slice(CODE.indexOf('create or replace function public.reorder_event_day_plan'))
  it('SECURITY INVOKER: el RLS de la tabla sigue mandando (no se puede reordenar lo de otra familia)', () => {
    expect(fn).toContain('security invoker')
    expect(fn).not.toContain('security definer')
    expect(fn).toContain('set search_path = public')
  })
  it('exige que TODOS los ids sean visibles y de un único evento; si no, no hace nada', () => {
    expect(fn).toContain('v_visible <> v_total or v_events <> 1')
    expect(fn).toContain("raise exception 'not found'")
  })
  it('reparte posiciones consecutivas desde la más baja del propio grupo (no mueve nada ajeno)', () => {
    expect(fn).toContain('min(sort_order)')
    expect(fn).toContain('set sort_order = v_base + (o.ord - 1)')
  })
  it('confirmar la coincidencia guarda la hora de cada elemento que la tiene', () => {
    expect(fn).toContain('set coincide_ok_time = item_time')
  })
  it('solo usuarios autenticados la ejecutan (no anon, no public)', () => {
    expect(CODE).toContain('revoke execute on function public.reorder_event_day_plan(uuid[], boolean) from public, anon;')
    expect(CODE).toContain('grant execute on function public.reorder_event_day_plan(uuid[], boolean) to authenticated;')
  })
  it('no se cambia la política de seguridad de la tabla: la de 0176 sigue vigente', () => {
    expect(CODE).not.toMatch(/create policy|drop policy|alter policy/i)
  })
})
