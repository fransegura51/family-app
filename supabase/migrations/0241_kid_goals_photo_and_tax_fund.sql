-- Pequeños Grandes, Fase 10 (orden de recuperación de requisitos, autorización directa del usuario
-- 2026-10-10) — "objetivos de ahorro completos": emoji y foto por objetivo, ambos opcionales, para que
-- un niño que todavía no lee reconozca su objetivo de un vistazo. Aditiva: columnas nuevas, ningún
-- objetivo existente pierde ni cambia nada de lo que ya tenía.
alter table kid_goals add column emoji text null;
alter table kid_goals add column photo_storage_path text null;
alter table kid_goals add column photo_original_name text null;
alter table kid_goals add column photo_mime_type text null;

insert into storage.buckets (id, name, public)
values ('kid_goals', 'kid_goals', false)
on conflict (id) do nothing;

create policy "kid_goals storage: family select" on storage.objects for select
  using (bucket_id = 'kid_goals' and (storage.foldername(name))[1] = (select private.current_family_id())::text);

create policy "kid_goals storage: family insert" on storage.objects for insert
  with check (bucket_id = 'kid_goals' and (storage.foldername(name))[1] = (select private.current_family_id())::text);

create policy "kid_goals storage: family delete" on storage.objects for delete
  using (bucket_id = 'kid_goals' and (storage.foldername(name))[1] = (select private.current_family_id())::text);

-- Pequeños Grandes, Fase 11 — "fondo común de impuestos": hasta ahora solo había una frase explicativa
-- (WALLET_TABS, pestaña 'impuesto'), sin ninguna vista agregada. Las APORTACIONES ya existen (la suma de
-- las filas 'impuesto' de kid_wallet_transactions de TODOS los niños, aprobadas) — lo único que falta de
-- verdad es poder registrar GASTOS del fondo, que no son de ningún niño en particular (nunca se modela
-- como un movimiento de kid_wallet_transactions, que es inherentemente por niño).
create table family_tax_fund_expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  description text not null,
  created_by uuid null references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_family_tax_fund_expenses_family on family_tax_fund_expenses(family_id);

alter table family_tax_fund_expenses enable row level security;
-- Lectura para toda la familia (incluidos los niños — es dinero de todos, transparencia real); gastar
-- del fondo común es una decisión de adulto, igual que fijar el reparto 60/20/20 (kid_income_split_configs).
create policy "family_tax_fund_expenses: family select" on family_tax_fund_expenses
  for select
  using (family_id = (select private.current_family_id()));
create policy "family_tax_fund_expenses: adult write" on family_tax_fund_expenses
  for insert
  with check (family_id = (select private.current_family_id()) and (select private.current_role_in_family()) <> 'child');
create policy "family_tax_fund_expenses: adult delete" on family_tax_fund_expenses
  for delete
  using (family_id = (select private.current_family_id()) and (select private.current_role_in_family()) <> 'child');
