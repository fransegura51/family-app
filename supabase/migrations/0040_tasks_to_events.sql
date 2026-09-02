-- Fusiona Tareas dentro de Eventos (petición real: "vamos a quitar la
-- sección de tareas y lo vamos a convertir todo en eventos... porque a
-- veces Pepa se confunde las tareas con los eventos"). Al ser todo lo
-- mismo (un evento del calendario), esa ambigüedad desaparece de raíz
-- en vez de seguir parcheando el reconocimiento de Pepa. Los puntos y
-- recompensas se mantienen: ahora es el propio evento el que puede
-- llevar puntos, que se otorgan al marcarlo "Hecho" — para niños, y
-- también para adultos si se quiere ("o a los adultos también, podemos
-- hacerlo también para los adultos").

alter table calendar_events add column points int not null default 0;

alter table calendar_event_completions add column member_id uuid references family_members(id) on delete set null;
alter table calendar_event_completions add column points_awarded int not null default 0;

-- Migra cada tarea activa a un evento equivalente: con hora de día, se
-- convierte en un evento con esa hora (interpretada en la zona horaria
-- de la familia, no UTC, para que el día/hora mostrados no cambien);
-- sin hora, en un evento de "todo el día". Cada finalización de tarea
-- (task_completions) se convierte en la finalización de esa misma
-- ocurrencia del evento nuevo, con quién la hizo y los puntos que ganó.
do $$
declare
  t record;
  new_event_id uuid;
begin
  for t in select * from tasks where active = true loop
    insert into calendar_events (family_id, title, start_at, all_day, recurrence_rule, points, created_at)
    values (
      t.family_id,
      t.title,
      (t.start_date + coalesce(t.time_of_day, '00:00:00'::time)) at time zone 'Europe/Madrid',
      t.time_of_day is null,
      t.recurrence_rule,
      t.points,
      t.created_at
    )
    returning id into new_event_id;

    if t.member_id is not null then
      insert into calendar_event_members (event_id, member_id) values (new_event_id, t.member_id);
    end if;

    insert into calendar_event_completions (event_id, occurrence_date, member_id, points_awarded, completed_at)
    select new_event_id, tc.completed_date, tc.member_id, tc.points_awarded, tc.created_at
    from task_completions tc
    where tc.task_id = t.id;
  end loop;
end $$;

drop table task_completions;
drop table tasks;
