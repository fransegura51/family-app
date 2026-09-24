-- Eventos Fase 14D — vínculo OPCIONAL a una persona concreta
-- (event_guest_members, Fase 14A/14B) desde Detalles para personas
-- (event_special_details) y Regalos recibidos (event_gifts_received).
--
-- Sin guest_id redundante: member_id ya basta para que la RLS
-- "hardened" compruebe pertenencia (familia + evento), y guest_id se
-- puede derivar vía member_id -> event_guest_members.guest_id si algún
-- día hiciera falta (mismo criterio de "sin redundancia salvo que la
-- RLS la necesite" que domina 0164 con guest_id/event_id/family_id).
--
-- Sin backfill: recipient_name/guest_name (texto libre) se conservan
-- tal cual, tanto en filas existentes como en nuevas — member_id es
-- puramente informativo y opcional, nunca se sincroniza solo.
--
-- on delete set null: borrar una persona (event_guest_members) NUNCA
-- borra el detalle/regalo histórico, solo desvincula el member_id.

alter table event_special_details add column member_id uuid references event_guest_members(id) on delete set null;
alter table event_gifts_received add column member_id uuid references event_guest_members(id) on delete set null;

create index idx_event_special_details_member on event_special_details(member_id);
create index idx_event_gifts_received_member on event_gifts_received(member_id);

-- Mismo patrón "hardened" que 0012/0164: cuando member_id no es null,
-- debe pertenecer a la misma familia Y al mismo evento que la propia
-- fila (nunca a una persona de otro evento o de otra familia).
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

drop policy "event_gifts_received: family crud" on event_gifts_received;
create policy "event_gifts_received: family crud" on event_gifts_received for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and (
      member_id is null
      or exists (
        select 1 from event_guest_members m
        where m.id = member_id and m.family_id = private.current_family_id() and m.event_id = event_gifts_received.event_id
      )
    )
  );
