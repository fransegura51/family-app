-- Petición real: "queremos que las recetas tengan una imagen en la
-- cabecera... y que se pueda poner etiquetas a las recetas para
-- organizarlas". image_path sigue el mismo patrón privado+signed-url
-- que member-photos/receipts; tags es un array simple (no una tabla
-- aparte) porque una receta puede llevar varias a la vez y no hace
-- falta más que eso — mismo espíritu que la categoría de Contactos,
-- pero multivaluada.
alter table recipes add column image_path text;
alter table recipes add column tags text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', false)
on conflict (id) do nothing;

create policy "recipe-photos storage: family select" on storage.objects for select
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "recipe-photos storage: family insert" on storage.objects for insert
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "recipe-photos storage: family delete" on storage.objects for delete
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);
