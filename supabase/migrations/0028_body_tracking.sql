-- Peso y medidas corporales (petición explícita: seguimiento de peso a
-- lo largo del tiempo, medidas de cintura/abdomen/brazo/pierna y fotos
-- de evolución). Vive dentro de Alimentación, por persona.
create table body_measurements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  measured_date date not null,
  weight_kg numeric,
  waist_cm numeric,
  abdomen_cm numeric,
  arm_cm numeric,
  leg_cm numeric,
  created_at timestamptz not null default now()
);

alter table body_measurements enable row level security;

create policy "body_measurements: family crud" on body_measurements for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id() and private.member_in_current_family(member_id));

create index idx_body_measurements_member on body_measurements(member_id, measured_date);

-- Fotos de evolución — Storage privado igual que gallery/receipts/documents.
insert into storage.buckets (id, name, public)
values ('body-photos', 'body-photos', false)
on conflict (id) do nothing;

create policy "body-photos storage: family select" on storage.objects for select
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "body-photos storage: family insert" on storage.objects for insert
  with check (bucket_id = 'body-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "body-photos storage: family delete" on storage.objects for delete
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create table body_photos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  photo_date date not null,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

alter table body_photos enable row level security;

create policy "body_photos: family crud" on body_photos for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id() and private.member_in_current_family(member_id));

create index idx_body_photos_member on body_photos(member_id, photo_date);
