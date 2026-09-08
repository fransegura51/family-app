-- Adjuntos sueltos por día del calendario (no ligados a un evento
-- concreto) — petición real: "un botón con un + añadir o foto o
-- archivo adjunto o ubicación" dentro de cada día. label/latitude/
-- longitude conviven porque la ubicación admite las dos formas: texto
-- libre y/o coordenadas reales (navegador → getCurrentPosition, sin
-- mapa de pago).
create table calendar_day_attachments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('foto', 'archivo', 'ubicacion')),
  storage_path text,
  original_name text,
  label text,
  latitude double precision,
  longitude double precision,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_calendar_day_attachments_family_day on calendar_day_attachments(family_id, day);

alter table calendar_day_attachments enable row level security;
create policy "calendar_day_attachments: family crud" on calendar_day_attachments for all
  using (family_id = private.current_family_id() and private.has_section_access('calendario'))
  with check (family_id = private.current_family_id() and private.has_section_access('calendario'));

insert into storage.buckets (id, name, public)
values ('calendar-attachments', 'calendar-attachments', false)
on conflict (id) do nothing;

create policy "calendar attachments storage: family select" on storage.objects for select
  using (
    bucket_id = 'calendar-attachments'
    and (storage.foldername(name))[1] = private.current_family_id()::text
    and private.has_section_access('calendario')
  );

create policy "calendar attachments storage: family insert" on storage.objects for insert
  with check (
    bucket_id = 'calendar-attachments'
    and (storage.foldername(name))[1] = private.current_family_id()::text
    and private.has_section_access('calendario')
  );

create policy "calendar attachments storage: family delete" on storage.objects for delete
  using (
    bucket_id = 'calendar-attachments'
    and (storage.foldername(name))[1] = private.current_family_id()::text
    and private.has_section_access('calendario')
  );
