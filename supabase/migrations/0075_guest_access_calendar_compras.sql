-- Extiende el mismo mecanismo de usuarios invitados (ya aplicado a
-- Galería) a Calendario y Compras — petición real: "ver posibilidades
-- de usuarios invitados para otras secciones como calendario, compras".
drop policy "calendar_events: family crud" on calendar_events;
create policy "calendar_events: family crud" on calendar_events for all
  using (family_id = private.current_family_id() and private.has_section_access('calendario'))
  with check (family_id = private.current_family_id() and private.has_section_access('calendario'));

drop policy "shopping_items: family crud" on shopping_items;
create policy "shopping_items: family crud" on shopping_items for all
  using (family_id = private.current_family_id() and private.has_section_access('compras'))
  with check (family_id = private.current_family_id() and private.has_section_access('compras'));

drop policy "shopping_trips: family crud" on shopping_trips;
create policy "shopping_trips: family crud" on shopping_trips for all
  using (family_id = private.current_family_id() and private.has_section_access('compras'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('compras')
    and (member_id is null or private.member_in_current_family(member_id))
  );
