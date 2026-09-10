-- Petición real: "quiero que las notas se puedan poner con una
-- etiqueta de personal y que se vean solo en el calendario del
-- usuario de la persona que las pone, que los demás usuarios aunque
-- sean de la familia no lo puedan ver" — a diferencia de la pestaña
-- Personal (tabla aparte, migración 0088), esto es un evento normal
-- del calendario compartido al que se le puede marcar "Solo yo":
-- convive con los demás eventos de la familia en Mes/Semana/Día/
-- Agenda/Familiar, pero solo lo ve quien lo creó.
alter table calendar_events add column visibility text not null default 'shared'
  check (visibility in ('shared', 'private'));

-- Reemplaza la política única "family crud" por cuatro (select/insert/
-- update/delete) con la misma condición de visibilidad en todas: un
-- evento privado de otra persona no debe ni siquiera poder LEERSE
-- (created_by ya existía desde el principio, se reutiliza como dueño).
drop policy "calendar_events: family crud" on calendar_events;

create policy "calendar_events: family select" on calendar_events for select
  using (
    family_id = private.current_family_id()
    and private.has_section_access('calendario')
    and (visibility = 'shared' or created_by = auth.uid())
  );

create policy "calendar_events: family insert" on calendar_events for insert
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('calendario')
    and (visibility = 'shared' or created_by = auth.uid())
  );

create policy "calendar_events: family update" on calendar_events for update
  using (
    family_id = private.current_family_id()
    and private.has_section_access('calendario')
    and (visibility = 'shared' or created_by = auth.uid())
  )
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('calendario')
    and (visibility = 'shared' or created_by = auth.uid())
  );

create policy "calendar_events: family delete" on calendar_events for delete
  using (
    family_id = private.current_family_id()
    and private.has_section_access('calendario')
    and (visibility = 'shared' or created_by = auth.uid())
  );

-- Las tablas hijas (miembros/recordatorios/completados de un evento)
-- tienen que respetar la misma regla — si no, se podría leer/tocar el
-- "quién"/recordatorios/marcado-hecho de un evento privado ajeno sin
-- pasar por la fila del propio evento.
drop policy "calendar_event_members: family crud" on calendar_event_members;
create policy "calendar_event_members: family crud" on calendar_event_members for all
  using (
    exists (
      select 1 from calendar_events e
      where e.id = calendar_event_members.event_id
        and e.family_id = private.current_family_id()
        and (e.visibility = 'shared' or e.created_by = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from calendar_events e
      where e.id = calendar_event_members.event_id
        and e.family_id = private.current_family_id()
        and (e.visibility = 'shared' or e.created_by = auth.uid())
    )
    and private.member_in_current_family(member_id)
  );

drop policy "calendar_event_reminders: family crud" on calendar_event_reminders;
create policy "calendar_event_reminders: family crud" on calendar_event_reminders for all
  using (
    exists (
      select 1 from calendar_events e
      where e.id = calendar_event_reminders.event_id
        and e.family_id = private.current_family_id()
        and (e.visibility = 'shared' or e.created_by = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from calendar_events e
      where e.id = calendar_event_reminders.event_id
        and e.family_id = private.current_family_id()
        and (e.visibility = 'shared' or e.created_by = auth.uid())
    )
  );

drop policy "calendar_event_completions: family crud" on calendar_event_completions;
create policy "calendar_event_completions: family crud" on calendar_event_completions for all
  using (
    exists (
      select 1 from calendar_events e
      where e.id = calendar_event_completions.event_id
        and e.family_id = private.current_family_id()
        and (e.visibility = 'shared' or e.created_by = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from calendar_events e
      where e.id = calendar_event_completions.event_id
        and e.family_id = private.current_family_id()
        and (e.visibility = 'shared' or e.created_by = auth.uid())
    )
  );
