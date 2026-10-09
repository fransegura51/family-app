-- Rollback de 0224_providers_global_registry.sql.
drop table if exists event_provider_links;
alter table event_providers drop column if exists global_provider_id;
drop table if exists providers_global;
