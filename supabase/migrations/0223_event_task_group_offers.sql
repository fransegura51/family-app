-- Revisión Proveedores/Presupuesto/Pagos (Parte B, Fase 6) — "ofertas" recibidas para un encargo, antes
-- de contratar nada. Petición real: "una oferta de 150€, un contrato de 100€ y un pago parcial de 40€NO
-- son 290€ de gasto" — por eso esto es deliberadamente una tabla NUEVA, nunca event_payments ni
-- event_budget_items: una oferta es solo información para comparar, no un compromiso económico. Varias
-- ofertas por encargo (incluso revisiones del mismo proveedor, sin unique constraint sobre provider_id).
--
-- "status" distingue recibida/seleccionada/descartada — SOLO marca cuál os gusta más, nunca implica pago:
-- elegir una oferta no crea ningún event_payment ni toca event_budget_items; eso sigue pasando
-- EXCLUSIVAMENTE al "Resolver encargo" de siempre (event_task_groups/event_task_group_resolutions,
-- migraciones 0215/0220), que puede usar el proveedor/importe de la oferta seleccionada como punto de
-- partida pero nunca registra el pago en automático.
create table event_task_group_offers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references event_task_groups(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  -- Proveedor YA existente (enlace real) — el mismo sistema de 📇 Proveedores de siempre, nunca un
  -- directorio paralelo. provider_name es un snapshot (mismo criterio que event_payments.provider_name,
  -- migración 0221): sobrevive a que el proveedor se edite, archive o borre más adelante.
  provider_id uuid null references event_providers(id) on delete set null,
  provider_name text not null check (char_length(provider_name) <= 120),
  amount numeric(10, 2) not null check (amount >= 0),
  scope_included text null check (scope_included is null or char_length(scope_included) <= 2000),
  scope_excluded text null check (scope_excluded is null or char_length(scope_excluded) <= 2000),
  offer_date date null,
  valid_until date null,
  conditions text null check (conditions is null or char_length(conditions) <= 2000),
  notes text null check (notes is null or char_length(notes) <= 2000),
  status text not null default 'recibida' check (status in ('recibida', 'seleccionada', 'descartada')),
  attachment_storage_path text null,
  attachment_original_name text null,
  attachment_mime_type text null,
  created_at timestamptz not null default now()
);

create index idx_event_task_group_offers_group on event_task_group_offers(group_id);

alter table event_task_group_offers enable row level security;
create policy "event_task_group_offers: family crud" on event_task_group_offers for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from event_task_groups g where g.id = group_id and g.family_id = private.current_family_id())
    and (attachment_storage_path is null or (storage.foldername(attachment_storage_path))[1] = private.current_family_id()::text)
  );

insert into storage.buckets (id, name, public)
values ('event_task_group_offers', 'event_task_group_offers', false)
on conflict (id) do nothing;

create policy "event_task_group_offers storage: family select" on storage.objects for select
  using (bucket_id = 'event_task_group_offers' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "event_task_group_offers storage: family insert" on storage.objects for insert
  with check (bucket_id = 'event_task_group_offers' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "event_task_group_offers storage: family delete" on storage.objects for delete
  using (bucket_id = 'event_task_group_offers' and (storage.foldername(name))[1] = private.current_family_id()::text);
