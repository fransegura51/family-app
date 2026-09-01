-- Skill 10 (parte sin IA): subir la foto/archivo del ticket y guardar
-- sus datos a mano (establecimiento, fecha, importe), vinculado a un
-- gasto. La extracción automática (OCR) queda pendiente de un proveedor
-- de IA de pago — aquí solo se guarda y organiza lo que ya se sabe.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Convención de ruta: <family_id>/<archivo> — aísla el storage por
-- familia igual que el resto de tablas.
create policy "receipts storage: family select" on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "receipts storage: family insert" on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "receipts storage: family delete" on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = private.current_family_id()::text);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  storage_path text not null,
  store text,
  receipt_date date not null default current_date,
  total_amount numeric(10, 2),
  expense_id uuid references expenses(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

alter table receipts enable row level security;

create policy "receipts: family crud" on receipts for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create index idx_receipts_family on receipts(family_id);
