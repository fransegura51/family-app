-- Deshacer 0360: vuelve a 0261 (un solo modo de destinatarios para tareas y eventos) y quita lo nuevo. Los avisos ya enviados no se tocan.
drop function if exists public.notify_bank_import(uuid, text, integer, integer, uuid[]);

create or replace function private.run_daily_task_summaries()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.run_daily_task_summaries_at(now());
$$;
revoke execute on function private.run_daily_task_summaries() from public, anon, authenticated;
grant execute on function private.run_daily_task_summaries() to service_role;

drop function if exists private.run_overdue_repeats_at(timestamptz);
drop table if exists public.overdue_repeat_state;

create or replace function private.event_notification_recipients(p_event_id uuid, p_for_summary boolean default false)
returns table(profile_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
  v_mode text;
  v_minor boolean;
begin
  select ev.family_id, ev.visibility, ev.created_by, ev.notify_family into e from public.calendar_events ev where ev.id = p_event_id;
  if not found then
    return;
  end if;
  if e.visibility = 'private' then
    if e.created_by is not null then
      return query select e.created_by;
    end if;
    return;
  end if;
  select f.task_notify_mode into v_mode from public.families f where f.id = e.family_id;
  if v_mode = 'all' or (v_mode = 'assigned' and e.notify_family) then
    return query
      select p.id from public.profiles p
      where p.family_id = e.family_id and (p.allowed_sections is null or 'calendario' = any(p.allowed_sections));
    return;
  end if;
  return query
    select fm.linked_profile_id
    from public.calendar_event_members cem
    join public.family_members fm on fm.id = cem.member_id
    where cem.event_id = p_event_id and fm.family_id = e.family_id and fm.linked_profile_id is not null;
  select exists (
    select 1 from public.calendar_event_members cem
    join public.family_members fm on fm.id = cem.member_id
    where cem.event_id = p_event_id and fm.family_id = e.family_id and fm.linked_profile_id is null and fm.member_type in ('child', 'baby')
  ) into v_minor;
  if v_minor then
    return query select p.id from public.profiles p where p.family_id = e.family_id and p.role in ('admin', 'adult')
      and (p.allowed_sections is null or 'calendario' = any(p.allowed_sections));
  end if;
  if v_mode is null then
    if not p_for_summary then
      return query select p.id from public.profiles p where p.family_id = e.family_id and p.role = 'admin';
    end if;
    return;
  end if;
end;
$$;
revoke execute on function private.event_notification_recipients(uuid, boolean) from public, anon, authenticated;
grant execute on function private.event_notification_recipients(uuid, boolean) to service_role;

alter table public.families drop column if exists event_notify_mode;
alter table public.user_notification_prefs
  drop column if exists notification_view_mode,
  drop column if exists personal_categories,
  drop column if exists overdue_repeat_hours,
  drop column if exists bank_import_enabled;
