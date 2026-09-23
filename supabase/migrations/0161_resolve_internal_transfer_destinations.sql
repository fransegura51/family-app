-- Fase 1F — Parte B: "Dinero destinado a cuentas de ahorro" (Resumen). Auditoría previa (sin cambios de
-- código) confirmó que bank_transactions.raw (jsonb, guardado desde 0066_bank_linking_schema.sql,
-- cobertura 100% en el historial real de Familia Hepburn) trae SIEMPRE creditor_account.iban/
-- debtor_account.iban — el IBAN de la cuenta destino de cada traspaso, provisto por el propio banco
-- (Enable Banking, formato Berlin Group/PSD2). Hasta ahora nadie lo leía: computeSavingsDestinedByMember
-- solo miraba la pata de ENTRADA (is_income=true + owner_member_id), que puede faltar si la cuenta
-- receptora todavía no ha sincronizado (caso real auditado: los traspasos a Eric del 11/09/2026 y a
-- Fernando del 18/09/2026 — la salida ya estaba desde el primer día, la entrada nunca llegó a sincronizar).
--
-- Esta función resuelve la pata de SALIDA (siempre la primera en sincronizarse, desde la cuenta común)
-- cruzando raw->creditor_account->>iban contra las bank_accounts de la MISMA familia — nunca texto de
-- tienda/etiqueta/nombre, nunca IA: solo el IBAN que ya trae el banco.
--
-- SECURITY INVOKER a propósito (nunca DEFINER): así la RLS ya certificada de bank_transactions/
-- bank_accounts/bank_connections/expenses se aplica tal cual, sin reimplementar aquí ninguna condición
-- de familia/sección/modo de cuentas — la misma clase de fallo que ya se corrigió una vez en 0159 (una
-- condición mal escrita dentro de una función de seguridad) se evita del todo no volviendo a escribir
-- ninguna. Bajo RLS, un bank_accounts de otra familia ni siquiera es visible para el JOIN de abajo — la
-- comprobación explícita "dst_conn.family_id = src_conn.family_id" es un cinturón y tirantes adicional,
-- no la única barrera. (Comprobado contra datos reales: el mismo IBAN puede existir en más de una
-- familia — cuentas de prueba que comparten banco real con Familia Hepburn a propósito, para probar
-- precisamente este aislamiento — así que el filtro de familia no es un caso hipotético.)
--
-- Nunca se devuelve ningún IBAN al cliente — solo expense_id/destination_member_id/amount/expense_date,
-- lo mínimo que necesita el cálculo (computeSavingsDestinedByMember, domain/finance.ts).
--
-- distinct on (bt.id): defensa adicional por si alguna vez existieran dos bank_accounts de la MISMA
-- familia con el mismo IBAN (no se ha visto en producción, pero evita que un dato así duplique el
-- importe destinado a un miembro en vez de limitarse a no resolverlo con precisión).
create or replace function resolve_internal_transfer_destinations()
returns table (
  expense_id uuid,
  destination_member_id uuid,
  amount numeric,
  expense_date date
)
language sql
security invoker
stable
set search_path = public
as $$
  select distinct on (bt.id)
    e.id as expense_id,
    dst.owner_member_id as destination_member_id,
    bt.amount,
    bt.transaction_date as expense_date
  from bank_transactions bt
  join bank_accounts src on src.id = bt.account_id
  join bank_connections src_conn on src_conn.id = src.connection_id
  join expenses e on e.id = bt.matched_expense_id
  join bank_accounts dst on dst.iban = (bt.raw -> 'creditor_account' ->> 'iban')
  join bank_connections dst_conn on dst_conn.id = dst.connection_id
  where bt.credit_debit = 'DBIT'
    and (bt.raw -> 'creditor_account' ->> 'iban') is not null
    and dst.owner_member_id is not null
    and dst_conn.family_id = src_conn.family_id
  order by bt.id, dst.id
$$;

revoke execute on function resolve_internal_transfer_destinations() from public, anon, authenticated;
grant execute on function resolve_internal_transfer_destinations() to authenticated;
