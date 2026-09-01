-- Contactos: agenda familiar (colegio, médico, emergencias...).
create table contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  category text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

alter table contacts enable row level security;

create policy "contacts: family crud" on contacts for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create index idx_contacts_family on contacts(family_id);

-- Galería: fotos de familia, Storage privado igual que los tickets.
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', false)
on conflict (id) do nothing;

create policy "gallery storage: family select" on storage.objects for select
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "gallery storage: family insert" on storage.objects for insert
  with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "gallery storage: family delete" on storage.objects for delete
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = private.current_family_id()::text);

create table gallery_photos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table gallery_photos enable row level security;

create policy "gallery_photos: family crud" on gallery_photos for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create index idx_gallery_photos_family on gallery_photos(family_id);
