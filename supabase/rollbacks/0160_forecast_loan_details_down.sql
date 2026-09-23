-- Rollback de 0160_forecast_loan_details.sql.
drop table if exists forecast_loan_details;
alter table forecast_payments drop constraint if exists forecast_payments_id_family_id_key;
