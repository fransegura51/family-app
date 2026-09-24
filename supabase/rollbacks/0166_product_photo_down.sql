-- Rollback de 0166 — quita la columna y las políticas de storage. NO
-- borra el bucket en sí ni los archivos ya subidos (storage.buckets no
-- se toca aquí): si hiciera falta borrarlo de verdad, hacerlo aparte
-- una vez confirmado que no queda ninguna foto real subida.
drop policy if exists "product-photos storage: family select" on storage.objects;
drop policy if exists "product-photos storage: family insert" on storage.objects;
drop policy if exists "product-photos storage: family delete" on storage.objects;

alter table products drop column if exists photo_path;
