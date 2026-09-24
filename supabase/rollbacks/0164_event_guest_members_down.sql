-- Restaura la política original de event_guests (sin comprobación de table_id) y elimina event_guest_members.
drop policy if exists "event_guests: family crud" on event_guests;
create policy "event_guests: family crud" on event_guests for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

drop table if exists event_guest_members;
