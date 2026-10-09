-- PEPA Eventos — prompt maestro, Fase 6 (Parte B2 + B4): servicios estructurados dentro de una oferta, y
-- versionado (una oferta puede ser una revisión de precio de otra anterior, sin fusionarlas ni perder el
-- histórico). Aditiva: event_task_group_offers sigue significando lo mismo (amount sigue siendo el total
-- TAL CUAL lo dio el proveedor, nunca recalculado); esta tabla es solo el desglose opcional.
--
-- B2: name/description/quantity/unit/unit_price/subtotal por línea. subtotal es SIEMPRE el dato
-- autoritativo de esa línea (nunca se recalcula solo en el servidor) — para un paquete indivisible
-- (is_package) quantity/unit_price pueden no tener relación matemática con subtotal (p. ej. "Pack básico
-- de flores" a 300€ sin que haya un "precio por unidad" real). "selected" distingue, al comparar, qué
-- líneas de ESTA oferta os interesan de verdad frente a cuáles no — información para comparar, igual que
-- el resto del módulo de ofertas: NUNCA crea ni completa nada por sí sola.
create table event_task_group_offer_items (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references event_task_group_offers(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null check (char_length(name) <= 160),
  description text null check (description is null or char_length(description) <= 2000),
  quantity numeric(10, 2) null check (quantity is null or quantity >= 0),
  unit text null check (unit is null or char_length(unit) <= 40),
  unit_price numeric(10, 2) null check (unit_price is null or unit_price >= 0),
  subtotal numeric(10, 2) null check (subtotal is null or subtotal >= 0),
  is_package boolean not null default false,
  selected boolean not null default true,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_task_group_offer_items_offer on event_task_group_offer_items(offer_id);

alter table event_task_group_offer_items enable row level security;
create policy "event_task_group_offer_items: family crud" on event_task_group_offer_items for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from event_task_group_offers o where o.id = offer_id and o.family_id = private.current_family_id())
  );

-- B4: versionado — "nueva versión" de una oferta anterior (misma idea del proveedor, precio/alcance
-- actualizado). Puramente informativo y OPCIONAL: nunca se fija solo, nunca oculta ni borra la oferta
-- anterior (sigue comparándose igual, con su propio estado); es la familia quien decide marcarlo al crear
-- la revisión. on delete set null: borrar la oferta anterior nunca bloquea ni borra la que la revisaba.
alter table event_task_group_offers add column supersedes_offer_id uuid null references event_task_group_offers(id) on delete set null;
