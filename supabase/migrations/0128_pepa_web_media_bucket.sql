-- Bucket de imágenes para el panel /admin de pepa-web (miniaturas,
-- imágenes de promociones/novedades, banners). Primer bucket PÚBLICO
-- del proyecto (todos los demás son privados por family_id) — aquí es
-- justo lo contrario: contenido de marketing pensado para que
-- cualquiera lo vea sin sesión, pero solo la dueña de la app puede
-- subir o borrar.
insert into storage.buckets (id, name, public)
values ('pepa-web-media', 'pepa-web-media', true);

create policy "pepa-web-media storage: public select" on storage.objects
  for select
  using (bucket_id = 'pepa-web-media');

create policy "pepa-web-media storage: owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pepa-web-media'
    and exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner)
  );

create policy "pepa-web-media storage: owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pepa-web-media'
    and exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner)
  )
  with check (
    bucket_id = 'pepa-web-media'
    and exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner)
  );

create policy "pepa-web-media storage: owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pepa-web-media'
    and exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner)
  );
