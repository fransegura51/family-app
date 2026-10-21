// Avisos de llegada/salida con confirmación (migración 0297): una lectura suelta del GPS ya no avisa. Se lee la migración como texto;
// el comportamiento con datos se probó en un PostgreSQL local (rebote real del 21/10/2026: 4 avisos antes, 0 ahora).
import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/0297_location_alert_confirmation.sql?raw'
import rollback from '../../supabase/rollbacks/0297_location_alert_confirmation_down.sql?raw'
import previous from '../../supabase/migrations/0243_location_alerts_reliability.sql?raw'

const code = (text: string) => text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('0297: confirmar el cambio de lado antes de avisar', () => {
  it('añade solo dos columnas opcionales a la tabla de estado que ya existe (sin tablas ni llamadas nuevas)', () => {
    expect(sql).toContain('add column if not exists pending_near boolean')
    expect(sql).toContain('add column if not exists pending_since timestamptz')
    expect(code(sql)).not.toMatch(/create table|create policy|net\.http_post|cron\./i)
  })

  it('la primera lectura que contradice el estado solo queda pendiente; avisar exige una segunda lectura pasados 60 s', () => {
    expect(sql).toContain('c_confirm_seconds constant integer := 60')
    expect(sql).toContain('pending_near = v_near, pending_since = v_at')
    expect(sql).toContain('v_at < v_pending_since + make_interval(secs => c_confirm_seconds)')
    // El aviso (send_family_push) solo se alcanza después de confirmar y limpiar el pendiente.
    expect(sql.indexOf('pending_near = null, pending_since = null\n      where rule_id = r.id and member_id = new.member_id;\n\n      if (r.trigger_type'))
      .toBeGreaterThan(sql.indexOf('v_at < v_pending_since'))
    expect(sql.lastIndexOf('perform private.send_family_push(')).toBeGreaterThan(sql.indexOf('v_at < v_pending_since'))
  })

  it('una lectura que vuelve al lado de antes descarta el pendiente (era un rebote)', () => {
    const back = sql.slice(sql.indexOf('if v_near = v_prev then'), sql.indexOf('-- La lectura contradice'))
    expect(back).toContain('pending_near = null, pending_since = null')
    expect(back).toContain('continue;')
  })

  it('conserva la histéresis de distancia, la primera lectura silenciosa, el aviso y los permisos de 0243', () => {
    expect(sql).toContain('v_near := v_dist <= (r.radius_m * 1.25 + 20);')
    expect(sql).toContain('v_near := v_dist <= r.radius_m;')
    expect(sql).toContain('on conflict (rule_id, member_id) do nothing;')
    expect(sql).toContain("replace(replace(r.name, '{miembro}', coalesce(v_member_name, 'Alguien')), '{lugar}', r.place_name)")
    expect(sql).toContain('security definer')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('revoke execute on function private.evaluate_location_rules() from public, anon, authenticated;')
    expect(sql).toContain("and ar.trigger_type in ('llegada', 'salida')")
  })

  it('la marcha atrás devuelve la función exacta de 0243 y quita las dos columnas', () => {
    const a = previous.indexOf('create or replace function private.evaluate_location_rules()')
    const b = previous.indexOf('revoke execute on function private.evaluate_location_rules()')
    expect(rollback).toContain(previous.slice(a, b))
    expect(rollback).toContain('drop column if exists pending_near')
    expect(rollback).toContain('drop column if exists pending_since')
  })
})
