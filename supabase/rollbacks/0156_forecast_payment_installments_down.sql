-- Rollback de 0156_forecast_payment_installments.sql. Orden inverso: primero deshacer la ampliación de
-- forecast_occurrences (volver a su constraint original), después borrar la tabla nueva.

alter table forecast_occurrences drop constraint if exists forecast_occurrences_payment_occurrence_split_key;
alter table forecast_occurrences add constraint forecast_occurrences_forecast_payment_id_occurrence_date_key
  unique (forecast_payment_id, occurrence_date);
alter table forecast_occurrences drop column if exists installment_sequence_index;

drop table if exists forecast_payment_installments;
