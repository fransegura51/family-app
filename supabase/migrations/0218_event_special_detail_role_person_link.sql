-- Tanda integrada "Personas especiales, complementos, regalos, preparativos y encargos" — vínculo OPCIONAL
-- y DURADERO a una persona especial (event_role_people, migración 0216) desde Detalles para personas
-- (event_special_details). Hasta ahora fillFromRolePerson() solo copiaba nombre/papel/member_id al abrir
-- el formulario — una foto fija, sin relación real guardada (ver src/ui/eventSpecialPeopleUi.test.ts). Sin
-- esta columna no hay forma de saber qué personas especiales marcadas como destinatarias de regalo
-- TODAVÍA no tienen ningún registro — role_person_id lo hace posible.
--
-- Mismo patrón "hardened" que 0165 (member_id): on delete set null — borrar una persona especial NUNCA
-- borra el detalle/regalo histórico (comprado/preparado incluido), solo desvincula role_person_id.
-- recipient_name sigue siendo el dato que manda siempre; role_person_id es puramente informativo/opcional,
-- nunca se sincroniza solo tras el alta (igual que member_id).
alter table event_special_details add column role_person_id uuid references event_role_people(id) on delete set null;

create index idx_event_special_details_role_person on event_special_details(role_person_id);

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
    and (
      role_person_id is null
      or exists (
        select 1 from event_role_people rp
        where rp.id = role_person_id and rp.family_id = private.current_family_id() and rp.event_id = event_special_details.event_id
      )
    )
  );
