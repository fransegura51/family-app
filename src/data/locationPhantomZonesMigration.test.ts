// Zonas fantasma (migración 0298): posiciones falsas de red repetidas que el servidor descarta antes de guardarlas. Se lee la migración como texto.
import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/0298_location_phantom_zones.sql?raw'
import rollback from '../../supabase/rollbacks/0298_location_phantom_zones_down.sql?raw'

const code = (text: string) => text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('0298: zonas fantasma', () => {
  it('crea la tabla de zonas por familia, con RLS y sin acceso para la app (solo funciones de servidor)', () => {
    expect(sql).toContain('create table if not exists public.location_phantom_zones')
    expect(sql).toContain('family_id uuid not null references public.families(id) on delete cascade')
    expect(sql).toContain('alter table public.location_phantom_zones enable row level security')
    expect(sql).toContain('revoke all on public.location_phantom_zones from anon, authenticated')
    expect(code(sql)).not.toMatch(/create policy/i)
  })

  it('el disparador descarta la posición ANTES de guardarla (la evaluación de avisos es un disparador posterior) y cubre las dos tablas', () => {
    expect(sql).toContain('return null; -- la fila no se guarda')
    expect(sql).toMatch(/create trigger trg_drop_phantom_positions\s+before insert or update on public\.member_locations/)
    expect(sql).toMatch(/create trigger trg_drop_phantom_positions\s+before insert on public\.member_location_history/)
    expect(sql).toContain('private.distance_m(new.latitude, new.longitude, z.latitude, z.longitude) <= z.radius_m')
    expect(sql).toContain('security definer')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('revoke execute on function private.drop_phantom_positions() from public, anon, authenticated')
  })

  it('solo mira las zonas de la familia de la fila y no toca ningún otro dato', () => {
    expect(sql).toContain('where z.family_id = new.family_id')
    expect(code(sql)).not.toMatch(/\bdelete from\b|\btruncate\b|\bupdate public\./i)
  })

  it('la única zona sembrada es la medida con datos reales (21/10/2026), para las dos familias de esa casa, sin duplicarse si se repite', () => {
    expect(sql).toContain('38.10328, -0.85342, 70')
    expect(sql).toContain('011429a4-4fd8-4341-9c04-ec6b2f585196')
    expect(sql).toContain('223ea7b0-bd93-4e6d-9acb-46d4aa60817b')
    expect(sql).toContain('and not exists (select 1 from public.location_phantom_zones z where z.family_id = f.family_id')
    // La zona a ~245 m al oeste se descartó: Paco y Jenny pasan por ahí andando.
    expect(code(sql)).not.toContain('38.10336')
  })

  it('la zona no contiene ningún lugar guardado de las dos familias (distancia al centro > su radio + 150 m)', () => {
    const places = [
      ['Casa Hepburn', 38.1054162, -0.8500718],
      ['Casa Fran/Jenny', 38.1053281, -0.8500065],
      ['C. Felix Rodriguez de la Fuente 2', 38.1031624839969, -0.849013854619238],
      ['C. Oscar Espla 12', 38.1011157, -0.8513086],
      ['Av. Rafael Alberti 30', 38.1015841, -0.8489758],
    ] as const
    const metres = (lat1: number, lng1: number, lat2: number, lng2: number) => 111320 * Math.sqrt((lat1 - lat2) ** 2 + ((lng1 - lng2) * Math.cos((38.1 * Math.PI) / 180)) ** 2)
    for (const [name, lat, lng] of places) expect(metres(38.10328, -0.85342, lat, lng), name).toBeGreaterThan(70 + 150)
  })

  it('el deshacer quita los disparadores, la función y la tabla', () => {
    expect(rollback).toContain('drop trigger if exists trg_drop_phantom_positions on public.member_locations')
    expect(rollback).toContain('drop trigger if exists trg_drop_phantom_positions on public.member_location_history')
    expect(rollback).toContain('drop function if exists private.drop_phantom_positions()')
    expect(rollback).toContain('drop table if exists public.location_phantom_zones')
  })
})
