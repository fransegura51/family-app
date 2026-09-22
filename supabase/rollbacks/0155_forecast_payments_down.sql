-- Rollback de 0155_forecast_payments.sql. Orden inverso al de creación (hijas antes que padres);
-- ninguna tabla preexistente se toca salvo quitar la columna sync_to_google de calendar_events.

drop table if exists forecast_reminder_deliveries;
drop function if exists public.claim_due_forecast_reminders(jsonb);

drop table if exists forecast_occurrences;
drop table if exists forecast_reminders;
drop table if exists forecast_payments;

alter table calendar_events drop column if exists sync_to_google;
