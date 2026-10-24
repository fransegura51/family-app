-- Documentos: quién puede ver cada documento. Hasta ahora todos los miembros de la familia veían todos los documentos (DNI, médicos, contratos...).
-- Ahora quien sube un documento elige: toda la familia (lo de siempre) o solo ciertas personas.
--   · visible_to_member_ids = NULL  → toda la familia (todos los documentos que ya existen quedan así, sin cambios).
--   · visible_to_member_ids = {ids} → solo las fichas de esa lista y quien lo subió (uploaded_by). «Solo yo» = lista vacía.
-- Lo hace cumplir el servidor (RLS), no la pantalla: una persona que no figura no recibe ni la fila ni el archivo (la política de lectura de los archivos mira la fila).
-- Quien puede cambiar o borrar un documento restringido es solo quien lo subió; los de toda la familia siguen editándolos todos, como antes.
-- La administración NO tiene acceso especial a un documento restringido ajeno (si no, la restricción no valdría). Aditiva: dos columnas nuevas con valor por defecto
-- seguro y políticas reemplazadas. Deshacer: supabase/rollbacks/0317_document_visibility_down.sql.

alter table public.member_documents add column uploaded_by uuid references public.profiles(id) on delete set null default auth.uid();
alter table public.member_documents add column visible_to_member_ids uuid[];

create or replace function private.document_visible_ids_ok(p_ids uuid[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_ids is null or not exists (select 1 from unnest(p_ids) x where not private.member_in_current_family(x))
$$;
revoke execute on function private.document_visible_ids_ok(uuid[]) from public, anon;
grant execute on function private.document_visible_ids_ok(uuid[]) to authenticated;

drop policy "member_documents: family crud" on public.member_documents;

create policy "member_documents: select visible" on public.member_documents for select
  using (
    family_id = private.current_family_id()
    and (visible_to_member_ids is null or uploaded_by = auth.uid() or private.current_member_id() = any (visible_to_member_ids))
  );

create policy "member_documents: insert" on public.member_documents for insert
  with check (
    family_id = private.current_family_id()
    and (member_id is null or private.member_in_current_family(member_id))
    and (uploaded_by is null or uploaded_by = auth.uid())
    and private.document_visible_ids_ok(visible_to_member_ids)
  );

create policy "member_documents: update own or family-wide" on public.member_documents for update
  using (family_id = private.current_family_id() and (visible_to_member_ids is null or uploaded_by = auth.uid()))
  with check (
    family_id = private.current_family_id()
    and (member_id is null or private.member_in_current_family(member_id))
    and (visible_to_member_ids is null or uploaded_by = auth.uid())
    and private.document_visible_ids_ok(visible_to_member_ids)
  );

create policy "member_documents: delete own or family-wide" on public.member_documents for delete
  using (family_id = private.current_family_id() and (visible_to_member_ids is null or uploaded_by = auth.uid()));

-- Archivos: solo se pueden leer los que pertenecen a un documento que esta persona puede ver (la subconsulta pasa por la RLS de arriba).
drop policy "documents storage: family select" on storage.objects;
create policy "documents storage: visible select" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = private.current_family_id()::text
    and exists (select 1 from public.member_documents d where d.storage_path = name)
  );
