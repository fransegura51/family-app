-- PEPA Eventos — prompt maestro, Parte B1: ofertas INDEPENDIENTES de los encargos. Hasta ahora una oferta
-- exigía un encargo (event_task_group_offers.group_id not null, migración 0223). Petición real: "permitir
-- registrar ofertas desde el registro global de Proveedores y ofertas, desde Proveedores y ofertas de un
-- evento, o desde un encargo concreto — una oferta puede existir sin evento o sin encargo".
--
-- Decisión explícita del usuario (consultada antes de tocar producción): migración ADITIVA sobre la
-- tabla ya existente (no una tabla paralela) — group_id pasa a nullable, se añaden family_id/event_id
-- propios de la oferta (event_id ya existía de forma indirecta vía group_id; ahora puede ir solo) y
-- provider_id pasa a poder referenciar también el proveedor global, SIN cambiar el significado de la
-- columna provider_id ya existente (sigue siendo event_providers tal cual, migración 0223) — se añade una
-- referencia NUEVA (global_provider_id) en su lugar, igual que ya se hizo con event_providers en 0224.
alter table event_task_group_offers alter column group_id drop not null;

alter table event_task_group_offers add column event_id uuid null references events(id) on delete cascade;
alter table event_task_group_offers add column global_provider_id uuid null references providers_global(id) on delete set null;

-- Backfill SEGURO: toda oferta ya existente tenía un encargo (group_id), y por tanto un evento real — se
-- copia esa relación ya conocida a la columna nueva, nunca se inventa nada.
update event_task_group_offers o
set event_id = g.event_id
from event_task_groups g
where o.group_id = g.id and o.event_id is null;

-- Backfill SEGURO: si el proveedor de la oferta ya estaba vinculado al registro global (migración 0224),
-- se copia esa relación ya conocida — nunca se fusiona ni se adivina un proveedor global nuevo.
update event_task_group_offers o
set global_provider_id = ep.global_provider_id
from event_providers ep
where o.provider_id = ep.id and ep.global_provider_id is not null and o.global_provider_id is null;

-- RLS: con group_id ahora nullable, la comprobación "existe un encargo de mi familia con ese id" dejaría
-- de cumplirse para una oferta SIN encargo (NULL nunca es igual a nada) y bloquearía justo el caso nuevo
-- que esta migración quiere permitir. Regla ampliada, misma seguridad de siempre:
--   - con encargo: se comprueba a través del encargo (como ya era).
--   - sin encargo pero con evento: se comprueba a través del evento.
--   - sin encargo y sin evento (oferta suelta en el registro global): ya la cubre family_id = mi familia,
--     comprobado al principio de la propia condición.
alter policy "event_task_group_offers: family crud" on event_task_group_offers
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and (
      (group_id is not null and exists (select 1 from event_task_groups g where g.id = group_id and g.family_id = private.current_family_id()))
      or (group_id is null and event_id is not null and exists (select 1 from events e where e.id = event_id and e.family_id = private.current_family_id()))
      or (group_id is null and event_id is null)
    )
    and (attachment_storage_path is null or (storage.foldername(attachment_storage_path))[1] = private.current_family_id()::text)
  );
