-- Previsión de pagos — conciliación: heredar automáticamente la categoría de la previsión al confirmar.
--
-- Auditoría real (2026-09-30): Hipoteca Casa e Préstamo Moto ya tenían su categoría correcta
-- ("Préstamos e intereses") desde antes de conciliar, pero el movimiento bancario entró como "Otros"
-- (el adivinador de MERCHANT_CATEGORY_RULES no reconoce "PRESTAMOS ADEUDO CUOTA..."). El paso "Gestionar
-- movimiento" ya proponía la categoría correcta (resolveManagedExpenseCategory, ya testeado), pero era un
-- paso SEPARADO y fácil de perder — dejando el estado "conciliado = sí / categoría conocida pero todavía
-- no aplicada". Se cierra ese hueco aplicándolo DENTRO de la misma transacción atómica que confirma la
-- conciliación, nunca en una segunda llamada desde el cliente (que podría fallar/perderse por su cuenta).
--
-- Reutiliza classify_purchase (0150) tal cual — MISMA RPC que ya usa "Gestionar movimiento" y Movimientos,
-- nunca un UPDATE directo a expenses.category ni un segundo camino de escritura. classify_purchase ya es
-- SECURITY INVOKER, ya valida que la categoría exista de verdad entre las de la familia (RLS incluida), y
-- ya no hace nada si la categoría es NULL/vacía/inexistente — no hace falta duplicar ninguna de esas
-- comprobaciones aquí. Genérico por diseño: no hay ningún nombre de categoría hardcodeado, sale siempre
-- de forecast_payments.category_id → budget_categories.name, cualquiera que sea.
--
-- Si la previsión no tiene category_id (o no resuelve a una categoría real), v_category_name queda NULL y
-- classify_purchase no se llama — el movimiento conserva la categoría que ya tuviera, tal como se pedía.
create or replace function match_forecast_occurrence(
  p_forecast_payment_id uuid,
  p_occurrence_date date,
  p_installment_sequence_index int,
  p_expense_id uuid,
  p_amount_status text,
  p_amount numeric,
  p_amount_estimated_basis text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result uuid;
  v_current uuid;
  v_category_name text;
begin
  if p_expense_id is null then
    raise exception 'expense_id_required';
  end if;

  insert into forecast_occurrences (
    forecast_payment_id, occurrence_date, installment_sequence_index,
    amount_status, amount, amount_estimated_basis, matched_expense_id
  )
  values (
    p_forecast_payment_id, p_occurrence_date, coalesce(p_installment_sequence_index, 0),
    p_amount_status, p_amount, p_amount_estimated_basis, p_expense_id
  )
  on conflict (forecast_payment_id, occurrence_date, installment_sequence_index)
  do update set
    matched_expense_id = excluded.matched_expense_id,
    amount_status = coalesce(forecast_occurrences.amount_status, excluded.amount_status),
    amount = case when forecast_occurrences.amount_status is null then excluded.amount else forecast_occurrences.amount end,
    amount_estimated_basis = case when forecast_occurrences.amount_status is null then excluded.amount_estimated_basis else forecast_occurrences.amount_estimated_basis end,
    updated_at = now()
  where forecast_occurrences.matched_expense_id is null or forecast_occurrences.matched_expense_id = excluded.matched_expense_id
  returning matched_expense_id into v_result;

  if v_result is null then
    select matched_expense_id into v_current from forecast_occurrences
      where forecast_payment_id = p_forecast_payment_id
        and occurrence_date = p_occurrence_date
        and installment_sequence_index = coalesce(p_installment_sequence_index, 0);
    if v_current is distinct from p_expense_id then
      raise exception 'forecast_occurrence_already_matched' using errcode = 'P0001';
    end if;
  end if;

  -- Heredar la categoría de la previsión — solo si tiene una categoría real asignada. classify_purchase
  -- ya es idempotente/atómica y no hace nada si v_category_name es NULL o no existe para esta familia.
  select bc.name into v_category_name
  from forecast_payments fp
  join budget_categories bc on bc.id = fp.category_id
  where fp.id = p_forecast_payment_id;

  if v_category_name is not null then
    perform classify_purchase(p_expense_id := p_expense_id, p_category := v_category_name);
  end if;
end;
$$;

-- SECURITY INVOKER: mismo criterio que la versión anterior (0157) — la RLS existente ya deniega a un
-- llamador anon/de otra familia; se restringe igual el EXECUTE explícitamente.
revoke all on function match_forecast_occurrence(uuid, date, int, uuid, text, numeric, text) from public;
grant execute on function match_forecast_occurrence(uuid, date, int, uuid, text, numeric, text) to authenticated;
