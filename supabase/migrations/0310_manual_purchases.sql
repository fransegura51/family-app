-- COMPRAS MANUALES (sin ticket) — aditiva; no toca ningún dato existente.
--
-- Una compra manual es un `receipts` más (mismo histórico, mismas estadísticas, mismo gasto de Economía enlazado por expense_id):
--   * is_manual = true  → se apuntó a mano, sin ticket; el justificante (foto) se puede añadir DESPUÉS sobre la misma fila
--                          (storage_path pasa de NULL a la ruta): nunca se crea otra compra ni otro gasto;
--   * payment_method    → forma de pago (efectivo, tarjeta, bizum, transferencia, otro); NULL = no indicada;
--   * purchased_by_member_id (ya existía) = QUIÉN PAGÓ; no es el autor del registro.
-- Su gasto de Economía nace con source = 'manual', que el banco (enable-banking-sync-transactions) y el alta de tickets ya concilian
-- sin duplicar (→ 'ticket_banco' / 'ticket').
-- Además: quien pagó debe ser miembro de LA MISMA familia que la compra (antes solo había una clave foránea sin comprobar la familia).
--
-- ROLLBACK: supabase/rollbacks/0310_manual_purchases_down.sql

alter table public.receipts add column is_manual boolean not null default false;
alter table public.receipts add column payment_method text;
alter table public.receipts add constraint receipts_payment_method_check
  check (payment_method is null or payment_method in ('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro'));

create or replace function public.receipts_check_purchaser_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.purchased_by_member_id is not null
     and not exists (select 1 from public.family_members m where m.id = new.purchased_by_member_id and m.family_id = new.family_id) then
    raise exception 'receipts: quien pagó debe ser un miembro de la misma familia' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger receipts_check_purchaser_family
  before insert or update of purchased_by_member_id, family_id on public.receipts
  for each row execute function public.receipts_check_purchaser_family();

revoke all on function public.receipts_check_purchaser_family() from public, anon, authenticated;
