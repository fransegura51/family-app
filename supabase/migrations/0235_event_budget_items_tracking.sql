-- Orden de recuperación de requisitos (Parte D, autorización directa del usuario 2026-10-10) — rediseño
-- de Presupuesto: por partida (no solo agregado de TODO el evento) poder enlazar proveedor/encargo/
-- categoría, fijar un "Comprometido" (si no, se calcula sumando lo que corresponda del encargo
-- enlazado), desglosar conceptos dentro de una partida si hace falta, e historial de cambios. Aditiva:
-- ninguna columna ni fila existente se borra ni se sobrescribe; las 3 columnas nuevas son NULLABLE y
-- empiezan vacías en toda partida ya creada — "Planeado" (planned_amount) sigue significando exactamente
-- lo mismo que hasta ahora.
alter table event_budget_items add column provider_id uuid null references event_providers(id) on delete set null;
alter table event_budget_items add column group_id uuid null references event_task_groups(id) on delete set null;
-- Enlace opcional a budget_categories (categorías ya usadas en Economía) — solo para quien quiera
-- reutilizarlas como sugerencia; "category" (texto libre) sigue siendo la fuente de verdad de siempre.
alter table event_budget_items add column category_id uuid null references budget_categories(id) on delete set null;
-- "Comprometido" manual: null = se calcula (sumando ofertas aceptadas/pagos del encargo enlazado);
-- nunca 0 como "no lo sé" (mismo criterio que planned_amount, ver event_budget_item_amount_optional).
alter table event_budget_items add column committed_amount numeric(10, 2) null check (committed_amount is null or committed_amount >= 0);

create index if not exists idx_event_budget_items_provider on event_budget_items(provider_id);
create index if not exists idx_event_budget_items_group on event_budget_items(group_id);
create index if not exists idx_event_budget_items_category_id on event_budget_items(category_id);

-- Desglose de conceptos dentro de una partida (EVT-D3: "desgloses si existen, totales simples si no") —
-- mismo papel que event_task_group_offer_items para una oferta: opcional, nunca sustituye planned_amount,
-- la familia decide si lo rellena.
create table event_budget_item_concepts (
  id uuid primary key default gen_random_uuid(),
  budget_item_id uuid not null references event_budget_items(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  amount numeric(10, 2) null,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);
create index idx_event_budget_item_concepts_item on event_budget_item_concepts(budget_item_id);

alter table event_budget_item_concepts enable row level security;
create policy "event_budget_item_concepts: family crud" on event_budget_item_concepts
  for all
  using ((family_id = (select private.current_family_id())) and (select private.has_section_access('eventos')))
  with check (
    (family_id = (select private.current_family_id()))
    and (select private.has_section_access('eventos'))
    and exists (select 1 from event_budget_items b where b.id = event_budget_item_concepts.budget_item_id and b.family_id = (select private.current_family_id()))
  );

-- Historial de cambios de una partida (EVT-D7: "preservar... historial de cambios") — fila APARTE,
-- append-only (nunca se edita ni se borra), igual que event_task_group_resolutions con los encargos.
create table event_budget_item_history (
  id uuid primary key default gen_random_uuid(),
  budget_item_id uuid not null references event_budget_items(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid null references profiles(id) on delete set null,
  field text not null,
  old_value text null,
  new_value text null
);
create index idx_event_budget_item_history_item on event_budget_item_history(budget_item_id, changed_at);

alter table event_budget_item_history enable row level security;
-- Append-only de verdad: solo select + insert, ningún update/delete permitido ni para la propia familia.
create policy "event_budget_item_history: family select" on event_budget_item_history
  for select
  using (family_id = (select private.current_family_id()) and (select private.has_section_access('eventos')));
create policy "event_budget_item_history: family insert" on event_budget_item_history
  for insert
  with check (
    (family_id = (select private.current_family_id()))
    and (select private.has_section_access('eventos'))
    and exists (select 1 from event_budget_items b where b.id = event_budget_item_history.budget_item_id and b.family_id = (select private.current_family_id()))
  );
