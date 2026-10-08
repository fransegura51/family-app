-- Rollback de 0218_event_special_detail_role_person_link.sql.
drop policy "event_special_details: family crud" on event_special_details;
create policy "event_special_details: family crud" on event_special_details for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and (
      member_id is null
      or exists (
        select 1 from event_guest_members m
        where m.id = member_id and m.family_id = private.current_family_id() and m.event_id = event_special_details.event_id
      )
    )
  );

drop index if exists idx_event_special_details_role_person;
alter table event_special_details drop column if exists role_person_id;
