// Candado de la migración 0196 (orden del menú): mínima, aditiva y segura entre familias. Lee el SQL real como texto; el
// comportamiento real (disparador, reordenación atómica, aislamiento) se comprobó además contra la base de producción
// con una transacción que se deshace (ver el informe de la fase).
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SQL = Object.entries(MIGRATIONS).find(([f]) => f.includes('0196_event_menu_sequence'))?.[1] ?? ''
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('0196 — mínima y aditiva (25)', () => {
  it('añade UNA columna: kind (plato | encabezado | nota), por defecto plato, así que todo lo anterior sigue siendo un plato', () => {
    expect(CODE).toContain("add column kind text not null default 'dish' check (kind in ('dish', 'heading', 'note'))")
    expect((CODE.match(/add column/g) ?? []).length).toBe(1)
  })
  it('reutiliza sort_order como posición explícita: lo normaliza respetando el orden actual y no borra ni reescribe nada más', () => {
    expect(CODE).toContain('order by sort_order, created_at, id')
    expect(CODE).toContain('set sort_order = o.rn * 1000')
    expect(CODE).not.toMatch(/\b(delete\s+from|truncate|drop\s+(table|column|policy)|alter\s+column)\b/i)
    expect(CODE).not.toMatch(/set\s+(name|category|notes|recipe_id|kind)\s*=/i)
  })
  it('los nuevos van al final por un disparador de la base (sin depender de created_at ni del cliente)', () => {
    expect(CODE).toContain('create trigger trg_event_menu_items_sort_order')
    expect(CODE).toContain('before insert on event_menu_items')
    expect(CODE).toContain('coalesce((select max(sort_order) from public.event_menu_items where event_id = new.event_id), 0) + 1000')
  })
  it('no toca otras tablas: ni opciones de menú (event_menu_options), ni invitados, ni decisiones, ni Plan del día', () => {
    expect(CODE).not.toMatch(/alter table (?!event_menu_items)/i)
    expect(CODE).not.toMatch(/event_menu_options|event_guests|event_decisions|event_day_plan_items|event_menu_settings/)
  })
})

describe('0196 — reordenación atómica y segura entre familias', () => {
  const fn = CODE.slice(CODE.indexOf('create or replace function public.reorder_event_menu_items'))
  it('SECURITY INVOKER: el RLS de event_menu_items sigue mandando', () => {
    expect(fn).toContain('security invoker')
    expect(fn).not.toContain('security definer')
    expect(fn).toContain('set search_path = public')
  })
  it('exige que TODOS los ids sean visibles y de un único evento, y que sean TODOS los del evento (nunca una orden a medias)', () => {
    expect(fn).toContain('v_visible <> v_total or v_events <> 1')
    expect(fn).toContain("raise exception 'not found'")
    expect(fn).toContain('select count(*) from event_menu_items where event_id = v_event) <> v_total')
    expect(fn).toContain("raise exception 'incomplete order'")
  })
  it('asigna posiciones consecutivas en el orden recibido (1000, 2000…)', () => {
    expect(fn).toContain('set sort_order = o.ord * 1000')
  })
  it('solo usuarios autenticados la ejecutan (no anon, no public); las políticas de la tabla no se tocan', () => {
    expect(CODE).toContain('revoke execute on function public.reorder_event_menu_items(uuid[]) from public, anon;')
    expect(CODE).toContain('grant execute on function public.reorder_event_menu_items(uuid[]) to authenticated;')
    expect(CODE).not.toMatch(/create policy|drop policy|alter policy/i)
  })
})
