-- Retira efectivo, pagos mixtos, devoluciones vinculadas y duplicados descartados (0311).
-- NO borra gastos ni compras: las filas de Economía que crearon las devoluciones (categoría «Devoluciones») se conservan como ingresos-devolución.
-- Los apuntes del banco que se marcaron como traspaso con una cartera SIGUEN en «Movimientos internos»: antes de revertir, deshacer cada vínculo
-- con cash_unlink_bank_expense (o aceptar que se queden como movimiento interno). Los apuntes del banco retirados al vincularlas a una compra
-- se pueden volver a generar desde bank_transactions.
-- Antes de borrar el registro de operaciones, deshacer (restore_economy_log) las que se quieran conservar: sin él ya no hay vuelta atrás.
drop function if exists public.restore_economy_log(uuid);
drop function if exists public.delete_purchase(uuid);
drop function if exists public.remove_duplicate_expense(uuid, uuid);
drop table if exists public.purchase_audit_log;
drop function if exists public.link_purchase_to_bank_expense(uuid, uuid, uuid);
drop function if exists public.register_purchase_refund(uuid, numeric, date, text, uuid, text);
drop function if exists public.set_purchase_payments(uuid, jsonb);
drop function if exists public.cash_unlink_bank_expense(uuid);
drop function if exists public.cash_link_bank_expense(uuid, uuid);
drop function if exists public.cash_transfer(uuid, uuid, numeric, date, text);
drop function if exists private.expense_touchable(uuid);
drop function if exists private.cash_wallet_writable(uuid);
drop table if exists public.purchase_duplicate_decisions;
drop table if exists public.purchase_refunds;
drop view if exists public.cash_wallet_balances;
alter table public.cash_movements drop constraint if exists cash_movements_payment_fk;
drop table if exists public.purchase_payments;
drop table if exists public.cash_movements;
drop table if exists public.cash_wallets;
drop function if exists public.purchase_payments_guard();
drop function if exists public.cash_movements_guard();
drop function if exists public.cash_wallets_guard();
alter table public.expenses drop constraint if exists expenses_payment_method_check;
alter table public.expenses drop column if exists payment_method;
alter table public.receipts drop constraint if exists receipts_payment_method_check;
alter table public.receipts add constraint receipts_payment_method_check
  check (payment_method is null or payment_method in ('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro'));
