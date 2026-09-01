-- Asignar una compra programada a un miembro, con enlace al evento de
-- calendario que se crea para avisarle (Skill 08: "voy a comprar el
-- sábado" + recordatorio real, no solo un campo suelto).
alter table shopping_trips add column member_id uuid references family_members(id) on delete set null;
alter table shopping_trips add column calendar_event_id uuid references calendar_events(id) on delete set null;

drop policy "shopping_trips: family crud" on shopping_trips;
create policy "shopping_trips: family crud" on shopping_trips for all
  using (family_id = private.current_family_id())
  with check (
    family_id = private.current_family_id()
    and (member_id is null or private.member_in_current_family(member_id))
  );
