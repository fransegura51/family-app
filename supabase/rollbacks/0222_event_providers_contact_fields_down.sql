-- Rollback de 0222_event_providers_contact_fields.sql.
alter table event_providers
  drop column if exists contact_person,
  drop column if exists phone,
  drop column if exists email,
  drop column if exists website,
  drop column if exists address,
  drop column if exists archived;
