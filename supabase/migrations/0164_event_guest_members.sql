-- Eventos Fase 14A — personas individuales OPCIONALES dentro de una
-- unidad invitada (auditoria Fase 13/13B, read-only, aprobada como
-- Opcion B: event_guests sigue siendo la "unidad invitada" -- para
-- invitacion/RSVP/token publico/recuentos -- nunca se convierte en
-- personas; event_guest_members es un segundo nivel opcional, solo
-- para quien quiera mas detalle (nombre individual + mesa individual).
--
-- Nunca se infiere ni se crea contenido: nombre y tipo se escriben a
-- mano, nunca se deducen de recipient_name/guest_name de Detalles o
-- Regalos (esos datos reales -- "Mama", "Primo Raul", "Pepa" -- ya se
-- demostro en la Fase 13 que no coinciden textualmente con ninguna
-- unidad invitada real).
create table event_guest_members (
  id uuid primary key default gen_random_uuid(),
  -- La persona pertenece EXCLUSIVAMENTE a su unidad invitada: sin
  -- sentido como entidad independiente si esa unidad desaparece.
  guest_id uuid not null references event_guests(id) on delete cascade,
  -- Redundante respecto a guest_id a proposito (auditoria, punto 4):
  -- permite que la RLS de mas abajo compruebe "misma familia Y mismo
  -- evento" con un solo EXISTS contra event_guests, y que la FK de
  -- table_id (mas abajo) pueda exigir tambien "misma mesa del mismo
  -- evento" sin un JOIN adicional.
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  -- TEXT + CHECK, no un enum de Postgres -- mismo patron que ya usan
  -- event_guests.rsvp_status/event_favor_items.status en este mismo
  -- modulo.
  person_type text not null check (person_type in ('adulto', 'nino')),
  -- Nullable: una persona puede quedar sin mesa (Fase 14C). No hay
  -- ON DELETE CASCADE aqui -- borrar una mesa no debe borrar personas,
  -- solo dejarlas sin asignar (mismo patron que ya usa
  -- event_guests.table_id).
  table_id uuid references event_tables(id) on delete set null,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_guest_members_guest on event_guest_members(guest_id);
create index idx_event_guest_members_event on event_guest_members(event_id);
create index idx_event_guest_members_table on event_guest_members(table_id);
create index idx_event_guest_members_family on event_guest_members(family_id);

alter table event_guest_members enable row level security;

-- RLS "hardened" (auditoria, punto 7): family_id no basta por si solo
-- -- guest_id debe pertenecer a la MISMA familia Y al MISMO evento que
-- esta fila (nunca "persona del evento A colgada de un guest del
-- evento B", aunque sean de la misma familia), y lo mismo para
-- table_id cuando existe. Mismo patron ya certificado en
-- calendar_event_members (0012_harden_foreign_key_ownership.sql), NO
-- el patron simple (sin comprobacion) que tenia hasta ahora
-- event_guests.table_id -- ver el ALTER de mas abajo para corregir
-- tambien ese hueco antiguo.
create policy "event_guest_members: family crud" on event_guest_members for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (
      select 1 from event_guests g
      where g.id = guest_id and g.family_id = private.current_family_id() and g.event_id = event_guest_members.event_id
    )
    and (
      table_id is null
      or exists (
        select 1 from event_tables t
        where t.id = table_id and t.family_id = private.current_family_id() and t.event_id = event_guest_members.event_id
      )
    )
  );

-- Endurece el hueco ya detectado en la auditoria (Fase 13, punto 16):
-- event_guests.table_id era una FK simple, sin comprobar que la mesa
-- perteneciera al mismo evento/familia. Confirmado por consulta
-- read-only antes de este cambio: ninguna fila real de produccion
-- tiene hoy una asignacion cruzada, asi que no hace falta corregir
-- ningun dato -- solo cerrar el hueco para escrituras futuras. Se
-- mantiene "using" igual (la lectura no cambia), solo se añade la
-- comprobacion de table_id al "with check".
drop policy "event_guests: family crud" on event_guests;
create policy "event_guests: family crud" on event_guests for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and (
      table_id is null
      or exists (
        select 1 from event_tables t
        where t.id = table_id and t.family_id = private.current_family_id() and t.event_id = event_guests.event_id
      )
    )
  );
