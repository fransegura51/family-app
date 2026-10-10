-- Orden de recuperación de requisitos (Parte A6, prompt maestro consolidado de Eventos) — "conservar la
-- imagen o documento original" al importar los datos de un proveedor (tarjeta de visita, captura de
-- Google Maps, etc.): hasta ahora providerContactDocument.ts solo PROPONÍA los datos leídos y el archivo
-- se descartaba después de leerlo. Mismo patrón, probado y en producción, que ya usa
-- event_task_group_offers (migración 0223): tres columnas aditivas + bucket privado con RLS por familia.
alter table providers_global add column attachment_storage_path text null;
alter table providers_global add column attachment_original_name text null;
alter table providers_global add column attachment_mime_type text null;

alter policy "providers_global: family crud" on providers_global
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and (attachment_storage_path is null or (storage.foldername(attachment_storage_path))[1] = private.current_family_id()::text)
  );

insert into storage.buckets (id, name, public)
values ('providers_global', 'providers_global', false)
on conflict (id) do nothing;

create policy "providers_global storage: family select" on storage.objects for select
  using (bucket_id = 'providers_global' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "providers_global storage: family insert" on storage.objects for insert
  with check (bucket_id = 'providers_global' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "providers_global storage: family delete" on storage.objects for delete
  using (bucket_id = 'providers_global' and (storage.foldername(name))[1] = private.current_family_id()::text);
