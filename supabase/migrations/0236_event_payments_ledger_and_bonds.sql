-- Orden de recuperación de requisitos (Parte E, autorización directa del usuario 2026-10-10) — rediseño
-- de Pagos y fianzas: trazabilidad pago↔presupuesto (EVT-C2c), agrupar por categoría (EVT-E5), un
-- historial real de pagos parciales con fecha en vez de un único acumulado (EVT-E6/EVT-005), fianzas
-- como dato propio distinto de "lo pagado", y documentos adjuntos (mismo patrón que proveedores/ofertas).
-- Aditiva de verdad: "deposit_paid" NUNCA se toca ni se borra — sigue ahí tal cual estaba, congelada como
-- referencia histórica ("saldo anterior"); a partir de esta migración el importe pagado real se calcula
-- SUMANDO event_payment_entries, y se backfillea de tal forma que el resultado coincide exactamente con
-- el deposit_paid de siempre (nunca se duplica ni se pierde un euro).
alter table event_payments add column budget_item_id uuid null references event_budget_items(id) on delete set null;
alter table event_payments add column category text null;
-- Fianza: dato propio, distinto de "lo pagado" — null = no aplica/no se ha fijado ninguna.
alter table event_payments add column bond_amount numeric(10, 2) null check (bond_amount is null or bond_amount >= 0);
-- null = retenida (o sin fianza); fecha puesta = ya devuelta ese día. Nunca una fecha inventada: solo se
-- rellena cuando la familia confirma la devolución.
alter table event_payments add column bond_returned_at date null;
alter table event_payments add column attachment_storage_path text null;
alter table event_payments add column attachment_original_name text null;
alter table event_payments add column attachment_mime_type text null;

create index if not exists idx_event_payments_budget_item on event_payments(budget_item_id);

alter policy "event_payments: family crud" on event_payments
  using (
    (family_id = (select private.current_family_id()))
    and (select private.has_section_access('eventos'))
  )
  with check (
    (family_id = (select private.current_family_id()))
    and (select private.has_section_access('eventos'))
    and (budget_item_id is null or exists (
      select 1 from event_budget_items b
      where b.id = event_payments.budget_item_id and b.event_id = event_payments.event_id and b.family_id = (select private.current_family_id())
    ))
    and (attachment_storage_path is null or (storage.foldername(attachment_storage_path))[1] = (select private.current_family_id())::text)
  );

-- Historial real de pagos parciales (EVT-E6/EVT-005) — cada entrada es un pago fechado de verdad;
-- "lo pagado" de un event_payment es, desde ahora, la suma de sus entradas (nunca deposit_paid, que se
-- congela tal cual). paid_at nullable a propósito: el backfill de abajo NUNCA inventa una fecha.
create table event_payment_entries (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references event_payments(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0),
  paid_at date null,
  method text null,
  notes text null,
  created_at timestamptz not null default now()
);
create index idx_event_payment_entries_payment on event_payment_entries(payment_id);

alter table event_payment_entries enable row level security;
create policy "event_payment_entries: family crud" on event_payment_entries
  for all
  using ((family_id = (select private.current_family_id())) and (select private.has_section_access('eventos')))
  with check (
    (family_id = (select private.current_family_id()))
    and (select private.has_section_access('eventos'))
    and exists (select 1 from event_payments p where p.id = event_payment_entries.payment_id and p.family_id = (select private.current_family_id()))
  );

-- Backfill: condición explícita del usuario — "si hay un pago acumulado sin desglose histórico,
-- conservarlo como saldo anterior identificado; no inventar fechas ni movimientos individuales". Una
-- única entrada por pago existente con deposit_paid > 0, sin fecha, etiquetada como tal.
insert into event_payment_entries (payment_id, family_id, amount, paid_at, notes)
select id, family_id, deposit_paid, null, 'Saldo anterior (importado automáticamente al migrar; sin fecha ni desglose original)'
from event_payments
where deposit_paid > 0;

insert into storage.buckets (id, name, public)
values ('event_payments', 'event_payments', false)
on conflict (id) do nothing;

create policy "event_payments storage: family select" on storage.objects for select
  using (bucket_id = 'event_payments' and (storage.foldername(name))[1] = (select private.current_family_id())::text);

create policy "event_payments storage: family insert" on storage.objects for insert
  with check (bucket_id = 'event_payments' and (storage.foldername(name))[1] = (select private.current_family_id())::text);

create policy "event_payments storage: family delete" on storage.objects for delete
  using (bucket_id = 'event_payments' and (storage.foldername(name))[1] = (select private.current_family_id())::text);
