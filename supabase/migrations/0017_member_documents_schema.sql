-- Documentos por miembro (DNI, cartilla médica, colegio...). Storage
-- privado, ruta <family_id>/<member_id>/<archivo> para poder aislar
-- también por miembro si hiciera falta más adelante, aunque de momento
-- el acceso es a nivel de familia (igual que el resto de la app).
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents storage: family select" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "documents storage: family insert" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "documents storage: family delete" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = private.current_family_id()::text);

-- member_id es opcional: los documentos de "Casa" o "Familia" no son de
-- una persona en concreto, solo "Privada"/"Educación" suelen estarlo.
create table member_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid references family_members(id) on delete cascade,
  storage_path text not null,
  title text not null,
  category text,
  created_at timestamptz not null default now()
);

alter table member_documents enable row level security;

create policy "member_documents: family crud" on member_documents for all
  using (family_id = private.current_family_id())
  with check (
    family_id = private.current_family_id()
    and (member_id is null or private.member_in_current_family(member_id))
  );

create index idx_member_documents_family on member_documents(family_id);
create index idx_member_documents_member on member_documents(member_id);
