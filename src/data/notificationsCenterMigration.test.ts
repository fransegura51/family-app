// Migraciones 0260-0262 (centro de avisos, destinatarios familiares, resumen diario): se leen los textos para fijar lo que protege los datos.
// La lógica se prueba además con una base de datos de verdad (PostgreSQL) fuera de este conjunto; aquí se cuida que nadie quite estas garantías.
import { describe, expect, it } from 'vitest'
import m260 from '../../supabase/migrations/0260_notifications_center.sql?raw'
import m261 from '../../supabase/migrations/0261_family_notification_recipients.sql?raw'
import m262 from '../../supabase/migrations/0262_daily_task_summary.sql?raw'
import down260 from '../../supabase/rollbacks/0260_notifications_center_down.sql?raw'
import down261 from '../../supabase/rollbacks/0261_family_notification_recipients_down.sql?raw'
import down262 from '../../supabase/rollbacks/0262_daily_task_summary_down.sql?raw'

describe('0260: historial de avisos', () => {
  it('cada persona solo ve, marca y borra lo suyo; nadie crea avisos desde la app', () => {
    expect(m260).toContain('alter table public.user_notifications enable row level security;')
    for (const policy of ['select own', 'update own', 'delete own']) expect(m260).toContain(`"user_notifications: ${policy}"`)
    expect(m260).not.toMatch(/"user_notifications: insert/)
    expect(m260).toContain('revoke all on public.user_notifications from anon, authenticated;')
    expect(m260).toContain('grant select, delete on public.user_notifications to authenticated;')
    // Solo se puede cambiar «leído», nunca el texto.
    expect(m260).toContain('grant update (read_at) on public.user_notifications to authenticated;')
  })

  it('la memoria anti-repeticiones y los buzones no tienen políticas (solo funciones del servidor)', () => {
    for (const table of ['notification_dedupe', 'user_push_outbox']) {
      expect(m260).toContain(`alter table public.${table} enable row level security;`)
      expect(m260).toContain(`revoke all on public.${table} from anon, authenticated;`)
    }
    expect(m260).not.toMatch(/create policy "(notification_dedupe|user_push_outbox)/)
  })

  it('las funciones que crean avisos son SECURITY DEFINER sin ruta de búsqueda abierta y no las puede llamar la app', () => {
    expect((m260.match(/security definer/g) ?? []).length).toBeGreaterThanOrEqual(5)
    expect(m260).not.toMatch(/security definer\s*\n\s*set search_path = 'public'/)
    expect(m260).toContain('revoke execute on function private.notify_user(uuid, text, text, text, text, text, text, text, boolean, jsonb) from public, anon, authenticated;')
    expect(m260).toContain('revoke all on function public.record_notifications(jsonb) from public, anon, authenticated;')
    expect(m260).toContain('grant execute on function public.record_notifications(jsonb) to service_role;')
  })

  it('el push dirigido va solo a la función nueva send-user-push (nunca a la de toda la familia)', () => {
    expect(m260).toContain('/functions/v1/send-user-push')
    expect(m260).not.toContain('/functions/v1/send-family-push')
  })

  it('se borra solo a los 30 días y los ajustes validan la zona horaria', () => {
    expect(m260).toContain("created_at < now() - interval '30 days'")
    expect(m260).toContain('pg_timezone_names')
  })

  it('el avance no deja que un aviso lleve a otra web: url solo de rutas internas', () => {
    expect(m260).toContain("url like '/%' and url not like '//%'")
  })

  it('tiene su deshacer', () => {
    for (const obj of ['user_notifications', 'notification_dedupe', 'user_notification_prefs', 'user_push_outbox']) expect(down260).toContain(`drop table if exists public.${obj};`)
  })
})

describe('0261: destinatarios', () => {
  it('el ajuste familiar solo admite los dos modos aprobados y por defecto no cambia nada (null)', () => {
    expect(m261).toContain("task_notify_mode text check (task_notify_mode in ('all', 'assigned'))")
    expect(m261).not.toMatch(/task_notify_mode[^;]*default/)
  })

  it('una sola función decide los destinatarios, y no es ejecutable por la app', () => {
    expect(m261).toContain('create or replace function private.event_notification_recipients')
    expect(m261).toContain('revoke execute on function private.event_notification_recipients(uuid, boolean) from public, anon, authenticated;')
    expect(m261).toContain('private.event_notification_recipients(dr.event_id)')
  })

  it('la excepción del menor sin cuenta avisa a los adultos con cuenta (admin y adult, varios administradores)', () => {
    expect(m261).toContain("fm.linked_profile_id is null and fm.member_type in ('child', 'baby')")
    expect(m261).toContain("p.role in ('admin', 'adult')")
  })

  it('claim_due_reminders sigue siendo solo del servidor y conserva su dedupe', () => {
    expect(m261).toContain('revoke all on function public.claim_due_reminders() from public, anon, authenticated;')
    expect(m261).toContain('grant execute on function public.claim_due_reminders() to service_role;')
    expect(m261).toContain('on conflict (reminder_id, subscription_id, occurrence_date, anchor_at) do nothing')
  })

  it('el aviso de asignación nunca impide asignar (atrapa errores) y solo es para tareas compartidas', () => {
    expect(m261).toContain("e.kind <> 'task' or e.visibility = 'private'")
    expect(m261).toContain("raise warning 'notify_task_assignment")
  })

  it('no se avisa al creador al completar una tarea: no hay ningún trigger sobre las completadas', () => {
    for (const sql of [m260, m261, m262]) expect(sql).not.toMatch(/on public\.calendar_event_completions\s+for each row/)
  })

  it('tiene su deshacer', () => {
    expect(down261).toContain('drop column if exists task_notify_mode')
    expect(down262).toContain('drop function if exists private.run_daily_task_summaries();')
    expect(down262).toContain('drop function if exists private.run_daily_task_summaries_at(timestamptz);')
  })
})

describe('0262: resumen diario', () => {
  it('cada persona recibe como mucho un resumen al día (clave por persona y fecha local)', () => {
    expect(m262).toContain('primary key (profile_id, local_date)')
    expect(m262).toContain("'daily:' || v_date::text")
  })

  it('usa la zona horaria PROPIA de cada persona y una ventana de 60 minutos (cambios de hora)', () => {
    expect(m262).toContain('p_now at time zone r.tz')
    expect(m262).toContain("interval '60 minutes'")
  })

  it('excluye lo completado y mira las repeticiones por ocurrencia', () => {
    expect(m262).toContain('calendar_event_completions cc where cc.event_id = o.id and cc.occurrence_date = o.occ_date')
    expect(m262).toContain('private.event_occurs_on_date')
  })

  it('el resumen se programa cada 5 minutos y no es ejecutable por la app', () => {
    expect(m262).toContain("'*/5 * * * *'")
    expect(m262).toContain('revoke execute on function private.run_daily_task_summaries() from public, anon, authenticated;')
  })
})
