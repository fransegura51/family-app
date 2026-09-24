-- Rollback de 0165 — restaura las políticas simples y elimina las
-- columnas nuevas. No borra ningún detalle/regalo (solo la columna
-- member_id, que es la única parte nueva del esquema).

drop policy "event_special_details: family crud" on event_special_details;
create policy "event_special_details: family crud" on event_special_details for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

drop policy "event_gifts_received: family crud" on event_gifts_received;
create policy "event_gifts_received: family crud" on event_gifts_received for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

drop index if exists idx_event_special_details_member;
drop index if exists idx_event_gifts_received_member;
alter table event_special_details drop column if exists member_id;
alter table event_gifts_received drop column if exists member_id;
