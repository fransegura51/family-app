-- Rollback de 0157_forecast_reconciliation.sql.

drop function if exists match_forecast_occurrence(uuid, date, int, uuid, text, numeric, text);
drop index if exists forecast_occurrences_matched_expense_unique;
