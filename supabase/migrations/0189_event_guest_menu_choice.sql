-- Eventos — "Invitados e invitaciones": nueva decisión "¿Queréis que los invitados elijan su menú en la
-- invitación?" (event_decisions, infraestructura ya existente desde 0176 — ninguna tabla nueva hace falta
-- para la pregunta en sí). Esta migración solo añade la pieza que de verdad faltaba (auditada antes de
-- escribir nada): un lugar donde vivan las OPCIONES de menú seleccionables por invitado (Carne/Pescado/
-- Vegetariano/Infantil...) y dónde guardar la elección de cada persona.
--
-- event_menu_options es DISTINTA de event_menu_items (0106, ya existente): event_menu_items es la lista
-- de platos/ingredientes a preparar o comprar (la rellena "Organízamelo Pepa" o se añade a mano, y se
-- puede transferir a la Lista de la compra) — nunca algo que un invitado "elija". event_menu_options es
-- justo lo contrario: opciones discretas, una por invitado, sin relación con comprar ni preparar nada por
-- sí solas. Mezclar ambos conceptos en la misma tabla habría contaminado el flujo de transferencia a
-- Compras con filas que no son ingredientes.
--
-- La definición real de las opciones (crear/editar/borrar "Carne", "Pescado"...) es tarea de la fase
-- "Comida y celebración" (todavía no construida — petición explícita: no adelantarla aquí). Por eso esta
-- fase solo dej a lista la tabla, vacía, sin ninguna UI que la rellene todavía: el RSVP público comprueba
-- "si hay opciones" y, mientras no las haya, no inventa nada ni bloquea la invitación (igual criterio que
-- el resto del módulo).
create table event_menu_options (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_menu_options_event on event_menu_options(event_id);
create index idx_event_menu_options_family on event_menu_options(family_id);

alter table event_menu_options enable row level security;
create policy "event_menu_options: family crud" on event_menu_options for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

-- Elección por PERSONA (no por unidad invitada): event_guest_members ya modela "individuo con nombre
-- propio dentro de una unidad invitada" (0164) — es la pieza correcta para "Paco: viene, menú Carne" /
-- "Eric: viene, menú Infantil" sin inventar un segundo concepto de "persona". rsvp_attending nullable
-- (null = todavía sin responder, nunca se asume "no viene" por defecto); menu_option_id nullable y
-- ON DELETE SET NULL (borrar una opción de menú nunca borra la elección de nadie de golpe, solo la deja
-- sin esa opción concreta — mismo patrón que decision_id en 0176).
alter table event_guest_members add column rsvp_attending boolean;
alter table event_guest_members add column menu_option_id uuid references event_menu_options(id) on delete set null;

-- RLS "hardened" (mismo patrón que decision_id en 0176 y que el resto de event_guest_members en 0164):
-- menu_option_id, cuando no es null, tiene que pertenecer al MISMO evento y a la MISMA familia que esta
-- fila — nunca la opción de menú de otro evento de la misma familia. Solo se endurece el "with check"
-- (escritura); el "using" (lectura) se deja exactamente igual que hoy.
drop policy "event_guest_members: family crud" on event_guest_members;
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
    and (
      menu_option_id is null
      or exists (
        select 1 from event_menu_options o
        where o.id = menu_option_id and o.family_id = private.current_family_id() and o.event_id = event_guest_members.event_id
      )
    )
  );
