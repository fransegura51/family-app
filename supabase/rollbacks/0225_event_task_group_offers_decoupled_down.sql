-- Rollback de 0225_event_task_group_offers_decoupled.sql.
-- ADVERTENCIA: solo aplicable si no se ha creado ninguna oferta sin encargo desde que se desplegó esta
-- migración (si la hay, "group_id set not null" fallará — hay que resolverlas o borrarlas antes).
alter policy "event_task_group_offers: family crud" on event_task_group_offers
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from event_task_groups g where g.id = event_task_group_offers.group_id and g.family_id = private.current_family_id())
    and (attachment_storage_path is null or (storage.foldername(attachment_storage_path))[1] = private.current_family_id()::text)
  );

alter table event_task_group_offers drop column if exists global_provider_id;
alter table event_task_group_offers drop column if exists event_id;
alter table event_task_group_offers alter column group_id set not null;
