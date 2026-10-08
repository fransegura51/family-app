-- Rollback de 0221_event_payments_provider_name.sql.
alter table event_payments drop column if exists provider_name;
