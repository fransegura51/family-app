drop policy if exists "documents storage: visible select" on storage.objects;
create policy "documents storage: family select" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = private.current_family_id()::text);
drop policy if exists "member_documents: select visible" on public.member_documents;
drop policy if exists "member_documents: insert" on public.member_documents;
drop policy if exists "member_documents: update own or family-wide" on public.member_documents;
drop policy if exists "member_documents: delete own or family-wide" on public.member_documents;
create policy "member_documents: family crud" on public.member_documents for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id() and (member_id is null or private.member_in_current_family(member_id)));
drop function if exists private.document_visible_ids_ok(uuid[]);
alter table public.member_documents drop column if exists visible_to_member_ids;
alter table public.member_documents drop column if exists uploaded_by;
