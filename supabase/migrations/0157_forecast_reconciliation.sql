-- Previsión de pagos — Fase 1D-e: conciliación bancaria. forecast_occurrences.matched_expense_id ya
-- existía desde 0155_forecast_payments.sql ("preparado para conciliación futura") y el dominio
-- (domain/forecast.ts: resolveOccurrence/resolveInstallmentOccurrence/remainingInstallments/
-- remainingPlanAmount) ya lo lee y lo respeta — pero NINGÚN código de aplicación lo escribía todavía
-- (auditoría de esta fase, confirmado por grep completo del repo). Esta migración NO crea ninguna tabla
-- nueva: añade solo lo que falta para escribir ese vínculo de forma segura.
--
-- 1) Índice único parcial: un mismo expense no puede conciliar dos forecast_occurrences distintas (antes
--    de esta migración no había NADA que lo impidiera — solo existía la FK a expenses, sin unicidad).
--
-- 2) match_forecast_occurrence(...): RPC atómica, SECURITY INVOKER (la RLS de "forecast_occurrences:
--    family crud" ya existente se sigue aplicando tal cual — esta función no concede ningún permiso
--    nuevo, solo empaqueta en una única sentencia lo que un INSERT ... ON CONFLICT normal ya podría
--    hacer). Necesaria para que doble clic / dos pestañas / reintento de sincronización nunca puedan:
--      a) pisar en silencio una conciliación previa de esa misma ocurrencia con OTRO expense (lanza
--         una excepción clara en vez de sobrescribir), ni
--      b) dejar dos filas de forecast_occurrences con el mismo matched_expense_id (lo impide el índice
--         único del punto 1, que Postgres comprueba dentro de la misma transacción).
--    Vuelve a confirmar la MISMA pareja (ocurrencia, expense) sin error — operación idempotente.
--    Nunca toca due_date_override/expected_payment_date_override (la conciliación no reescribe fechas).
--    Si la fila ya tenía su propio amount_status/amount (p. ej. una cuota real del IBI con importe
--    corregido a mano), los conserva tal cual — el snapshot que pasa el llamador solo se usa cuando la
--    fila se crea de cero, nunca sobrescribe uno ya existente (requisito explícito: "el gasto real sigue
--    siendo 146,20€, la previsión original debe permitir saber que esperábamos 144,54€").

create unique index forecast_occurrences_matched_expense_unique
  on forecast_occurrences (matched_expense_id)
  where matched_expense_id is not null;

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
end;
$$;

-- SECURITY INVOKER: la RLS existente ya deniega a un llamador anon/de otra familia (private.current_family_id()
-- no resuelve nada útil sin sesión), pero se restringe igual el EXECUTE explícitamente, mismo criterio que
-- el resto de RPCs de la app (ver restrict_invite_code_functions_to_authenticated y similares).
revoke all on function match_forecast_occurrence(uuid, date, int, uuid, text, numeric, text) from public;
grant execute on function match_forecast_occurrence(uuid, date, int, uuid, text, numeric, text) to authenticated;
