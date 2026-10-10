-- Rollback de 0233_providers_global_attachment.sql.
drop policy if exists "providers_global storage: family delete" on storage.objects;
drop policy if exists "providers_global storage: family insert" on storage.objects;
drop policy if exists "providers_global storage: family select" on storage.objects;
delete from storage.buckets where id = 'providers_global';

alter policy "providers_global: family crud" on providers_global
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

alter table providers_global drop column if exists attachment_mime_type;
alter table providers_global drop column if exists attachment_original_name;
alter table providers_global drop column if exists attachment_storage_path;
