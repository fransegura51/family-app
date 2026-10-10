// Avisos de llegada/salida fiables (migración 0243): buzón con reintentos, nombre claro del lugar y modo prueba. Se lee la migración como texto.
import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/0243_location_alerts_reliability.sql?raw'
import rollback from '../../supabase/rollbacks/0243_location_alerts_reliability_down.sql?raw'
import edge from '../../supabase/functions/send-family-push/index.ts?raw'

describe('0243: el buzón de avisos', () => {
  it('es una tabla privada: RLS activo, sin políticas y sin acceso para anon/authenticated', () => {
    expect(sql).toContain('create table public.location_alert_outbox')
    expect(sql).toContain('alter table public.location_alert_outbox enable row level security;')
    expect(sql).toContain('revoke all on public.location_alert_outbox from anon, authenticated;')
    expect(sql).not.toMatch(/create policy/i)
  })

  it('las funciones nuevas son SECURITY DEFINER con search_path vacío y nadie las puede llamar desde la API', () => {
    for (const fn of ['private.dispatch_location_alert(uuid)', 'private.send_family_push(uuid, uuid, text, text, text)', 'private.retry_location_alerts()', 'private.evaluate_location_rules()']) {
      expect(sql, fn).toContain(`revoke execute on function ${fn} from public, anon, authenticated;`)
    }
    expect((sql.match(/security definer/g) ?? []).length).toBe(4)
    expect((sql.match(/set search_path = ''/g) ?? []).length).toBe(4)
  })

  it('cada aviso se apunta ANTES de enviarse, se envía con 15 s de margen y se reintenta cada minuto', () => {
    expect(sql.indexOf('insert into public.location_alert_outbox')).toBeLessThan(sql.indexOf('perform private.dispatch_location_alert(v_id)'))
    expect(sql).toContain('timeout_milliseconds := 15000')
    expect(sql).toContain("cron.schedule('retry-location-alerts', '* * * * *'")
    expect(sql).toContain('a.attempts < 4')
    expect(sql).toContain("created_at > now() - interval '30 minutes'")
  })

  it('el aviso usa el nombre que se le puso al lugar (categoría) y, si no, el del lugar', () => {
    expect(sql).toContain("coalesce(nullif(btrim(lp.category), ''), lp.name) as place_name")
  })

  it('el modo prueba solo existe si el secreto del Vault vale «on»', () => {
    expect(sql).toContain("get_app_secret('location_alert_test_mode')")
    expect(sql).toContain("= 'on'")
  })

  it('la lógica de llegada/salida no cambia: histéresis, primera observación sin aviso y filtro por familia', () => {
    expect(sql).toContain('r.radius_m * 1.25 + 20')
    expect(sql).toContain('where s.rule_id = r.id and s.member_id = new.member_id')
    expect(sql).toContain('where ar.family_id = new.family_id')
    expect(sql).toContain("raise warning 'evaluate_location_rules: %', sqlerrm;")
  })

  it('tiene su marcha atrás', () => {
    expect(rollback).toContain('drop table if exists public.location_alert_outbox')
    expect(rollback).toContain("cron.unschedule('retry-location-alerts')")
  })
})

describe('0243: la función del servidor avisa de los fallos de entrega para que el buzón reintente', () => {
  it('si había a quién avisar y no llegó a nadie por un fallo, responde 502 (no 200)', () => {
    expect(edge).toContain('if (failed > 0 && sent === 0)')
    expect(edge).toContain('{ status: 502 }')
  })
})
