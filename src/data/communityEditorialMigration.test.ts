import { describe, expect, it } from 'vitest'

// Pruebas de «forma» de la migración 0325 (programa editorial semanal con IA): lo que NO se puede romper sin que alguien lo note. Su comportamiento real se probó en la base
// de producción con una transacción deshecha (privacidad de permisos, hueco único, duplicados, programación, rectificación, versión obsoleta, restauración).
const files = import.meta.glob('/supabase/migrations/0325*_*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const down = import.meta.glob('/supabase/rollbacks/0325_community_editorial_automation_down.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sql = Object.entries(files).find(([f]) => f.endsWith('0325_community_editorial_automation.sql'))![1]
const plan = Object.entries(files).find(([f]) => f.endsWith('0325b_editorial_plan_topics.sql'))![1]
const rollback = Object.values(down)[0]
const noComments = (s: string) => s.replace(/--.*$/gm, '')
const code = noComments(sql)

describe('0325 — programa editorial semanal: seguridad', () => {
  it('los tres interruptores nacen en PAUSA y se guardan de verdad en los ajustes de Comunidad', () => {
    for (const k of ['editorial_articles_enabled', 'editorial_polls_enabled', 'editorial_menu_enabled']) expect(code).toMatch(new RegExp(`'${k}', '0'`))
    expect(code).toMatch(/update public\.community_settings set value = to_jsonb\(case when p_enabled then 1 else 0 end\)/)
  })
  it('las tablas nuevas tienen RLS y nadie (ni anon ni authenticated) las toca directamente', () => {
    for (const t of ['community_editorial_runs', 'community_editorial_revisions']) {
      expect(code).toMatch(new RegExp(`alter table public\\.${t} enable row level security`))
      expect(code).toMatch(new RegExp(`revoke all on public\\.${t} from anon, authenticated`))
    }
  })
  it('las funciones de servicio solo las ejecuta service_role; las de administración exigen administrador', () => {
    const service = [...code.matchAll(/create or replace function public\.(community_service_[a-z_]+)\(/g)].map((m) => m[1])
    expect(service.length).toBeGreaterThanOrEqual(9)
    for (const f of service) {
      expect(code, f).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated`))
      expect(code, f).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role`))
    }
    const admin = [...code.matchAll(/create or replace function public\.(community_admin_[a-z_]+)\(/g)].map((m) => m[1])
    for (const f of admin) {
      const body = code.slice(code.indexOf(`function public.${f}(`), code.indexOf('$$;', code.indexOf(`function public.${f}(`) + 20))
      expect(body, f).toContain('private.community_require_admin()')
      expect(code, f).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated`))
    }
  })
  it('generar NO publica: ninguna función de servicio aprueba ni publica', () => {
    const svcCode = code.slice(code.indexOf('create or replace function public.community_service_editorial_config'), code.indexOf('create or replace function public.community_admin_can_generate'))
    expect(svcCode).not.toMatch(/community_publish_item|community_admin_approve_proposal|set[^;]*status = '(approved|published)'|set[^;]*published_post_id =/)
    expect(code).toMatch(/insert into public\.community_official_items \(kind, section, topic_id, title, body, payload, batch_week, proposed_by, slot_date, generated_run_id, generation\)/)
  })
  it('aceptar una rectificación pasa por la edición editorial normal (versión nueva, vuelve a borrador, NO publica) y detecta cambios intermedios', () => {
    expect(code).toContain('public.community_admin_edit_proposal(r.item_id')
    expect(code).toContain("raise exception 'STALE'")
    expect(code).toContain('i.version <> r.base_version')
    const decide = code.slice(code.indexOf('function public.community_admin_editorial_decide_revision'), code.indexOf('function public.community_admin_item_versions'))
    expect(decide).not.toMatch(/community_publish_item/)
  })
  it('un artículo del programa se PROGRAMA para su día a las 10:00 (Madrid) y el trabajo lo publica; no se publica al aprobar', () => {
    expect(code).toContain("(i.slot_date + time '10:00') at time zone 'Europe/Madrid'")
    expect(code).toContain('private.community_run_articles()')
    const approve = code.slice(code.indexOf('function public.community_admin_approve_proposal'), code.indexOf('function public.community_admin_list_proposals'))
    expect(approve.indexOf("i.kind = 'article' and i.slot_date is not null")).toBeLessThan(approve.indexOf('v_post := private.community_publish_item(p_id)'))
  })
  it('la exigencia de fuentes se mantiene salvo en los artículos prácticos marcados como editoriales', () => {
    expect(code).toContain("raise exception 'NO_SOURCES'")
    expect(code).toMatch(/coalesce\(i\.payload ->> 'editorial', 'false'\) <> 'true'/)
  })
  it('un hueco por día (artículos), por sábado (encuesta) y por semana (menú): índices únicos que impiden duplicados', () => {
    for (const k of ['article', 'poll', 'menu']) expect(code).toMatch(new RegExp(`uq_community_official_slot_${k} on public\\.community_official_items \\(slot_date\\) where kind = '${k}'`))
    expect(code).toMatch(/uq_community_editorial_run_schedule on public\.community_editorial_runs \(kind, week_start\) where trigger = 'schedule' and status in \('running', 'ok', 'partial'\)/)
  })
  it('reintentos limitados (3) y separados al menos 50 minutos; ejecuciones colgadas se cierran', () => {
    expect(code).toContain('v_failed >= 3')
    expect(code).toContain("interval '50 minutes'")
    expect(code).toContain("interval '20 minutes'")
  })
  it('el ciclo usa la hora de Madrid con el cambio de hora (no UTC fijo)', () => {
    expect(code).toMatch(/at time zone 'Europe\/Madrid'/)
    expect(code).not.toMatch(/at time zone 'UTC'/)
  })
  it('el trabajo programado es horario y la función decide; no se programa nada distinto', () => {
    expect(code).toContain("'community-editorial'")
    expect(code).toContain("'7 * * * *'")
    expect(code).toContain('"action":"cron"')
  })
  it('límites de consumo de IA en las rectificaciones', () => {
    expect(code).toContain("interval '1 day'") // 30 por elemento y 100 por persona al día
    expect(code).toContain("raise exception 'RATE_LIMIT'")
  })
})

describe('0325 — compatibilidad y deshacer', () => {
  it('es aditiva: no borra tablas existentes ni cambia datos de contenido', () => {
    expect(code).not.toMatch(/drop table|delete from public\.community_(posts|official_items|polls|comments)|truncate/i)
  })
  it('el plan de temas sigue la prioridad: vacíos → ideas de familias → pocas publicaciones → resto', () => {
    const c = noComments(plan)
    const i1 = c.indexOf("'tier', 1")
    const i2 = c.indexOf("'tier', 2")
    const i3 = c.indexOf("'tier', 3")
    const i4 = c.indexOf("'tier', 4")
    expect(i1).toBeGreaterThan(0)
    expect(i1).toBeLessThan(i2)
    expect(i2).toBeLessThan(i3)
    expect(i3).toBeLessThan(i4)
    expect(c).toContain('v_used_topics := v_used_topics || g.topic_id') // una idea no repite subtema en otro hueco
  })
  it('el deshacer retira lo añadido y restaura las funciones anteriores', () => {
    for (const t of ['community_editorial_runs', 'community_editorial_revisions']) expect(rollback).toContain(`drop table if exists public.${t}`)
    expect(rollback).toContain("cron.unschedule('community-editorial')")
    expect(rollback).toContain('create or replace function public.community_admin_approve_proposal')
    expect(rollback).toContain('create or replace function private.community_run_official')
    expect(rollback).toContain('drop column if exists slot_date')
  })
})
