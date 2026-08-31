-- Skill 25: historial y trazabilidad — quién hizo qué y cuándo. Registro
-- genérico vía trigger en las entidades más "críticas" (miembros,
-- eventos, tareas, compras, gastos, automatizaciones) en vez de tocar
-- cada función de src/data — más fiable, no se puede olvidar en un sitio.

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  table_name text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  record_id uuid,
  created_at timestamptz not null default now()
);

alter table activity_log enable row level security;

-- Sin políticas de insert/update/delete: solo la función SECURITY
-- DEFINER (el trigger) escribe aquí. Igual que reminder_deliveries.
create policy "activity_log: family select" on activity_log for select
  using (family_id = private.current_family_id());

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_record_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_family_id := OLD.family_id;
    v_record_id := OLD.id;
  else
    v_family_id := NEW.family_id;
    v_record_id := NEW.id;
  end if;

  insert into activity_log (family_id, actor_id, table_name, action, record_id)
  values (v_family_id, auth.uid(), TG_TABLE_NAME, lower(TG_OP), v_record_id);

  return coalesce(NEW, OLD);
end;
$$;

-- Las funciones trigger no necesitan EXECUTE explícito para dispararse —
-- solo lo necesitaban para ser llamables como RPC directo, justo lo que
-- queremos evitar.
revoke all on function public.log_activity() from public, anon, authenticated;

create trigger trg_log_family_members
  after insert or update or delete on family_members
  for each row execute function public.log_activity();

create trigger trg_log_calendar_events
  after insert or update or delete on calendar_events
  for each row execute function public.log_activity();

create trigger trg_log_tasks
  after insert or update or delete on tasks
  for each row execute function public.log_activity();

create trigger trg_log_shopping_items
  after insert or update or delete on shopping_items
  for each row execute function public.log_activity();

create trigger trg_log_expenses
  after insert or update or delete on expenses
  for each row execute function public.log_activity();

create trigger trg_log_automation_rules
  after insert or update or delete on automation_rules
  for each row execute function public.log_activity();

create index idx_activity_log_family_created on activity_log(family_id, created_at desc);
