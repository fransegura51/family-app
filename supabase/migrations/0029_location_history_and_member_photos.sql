-- Historial de ubicación acotado a 24h (Skill 23/28) — la app nunca
-- guardaba historial, solo la última posición. Ahora se pide poder ver
-- la ruta del día, así que se añade una tabla aparte, con purga
-- automática: nunca queda más de 24h de rastro guardado, ni si alguien
-- se deja "compartiendo" el dispositivo abierto varios días.
create table member_location_history (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  recorded_at timestamptz not null default now()
);

alter table member_location_history enable row level security;

create policy "member_location_history: family crud" on member_location_history for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id() and private.member_in_current_family(member_id));

create index idx_member_location_history_member on member_location_history(member_id, recorded_at);

create or replace function private.purge_old_location_history() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  delete from member_location_history where recorded_at < now() - interval '24 hours';
  return new;
end;
$$;

create trigger trg_purge_old_location_history
  after insert on member_location_history
  execute function private.purge_old_location_history();

-- Autoservicio: hasta ahora solo el admin podía activar/desactivar el
-- compartir ubicación de cualquiera. Se añade que cada persona pueda
-- activar/desactivar la SUYA propia (los menores sin cuenta propia
-- siguen dependiendo del admin, que es quien gestiona sus perfiles).
create or replace function private.current_member_id() returns uuid
language sql stable security definer set search_path = public, private as $$
  select id from family_members
  where linked_profile_id = auth.uid()
  and family_id = private.current_family_id()
  limit 1;
$$;

create policy "location_sharing_consent: self upsert" on location_sharing_consent for insert
  with check (family_id = private.current_family_id() and member_id = private.current_member_id());

create policy "location_sharing_consent: self update" on location_sharing_consent for update
  using (family_id = private.current_family_id() and member_id = private.current_member_id())
  with check (family_id = private.current_family_id() and member_id = private.current_member_id());

-- Fotos de perfil de cada miembro, para identificarlos visualmente en
-- toda la app (chips, mapa de ubicación...) en vez de solo el emoji.
alter table family_members add column photo_path text;

insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', false)
on conflict (id) do nothing;

create policy "member-photos storage: family select" on storage.objects for select
  using (bucket_id = 'member-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "member-photos storage: family insert" on storage.objects for insert
  with check (bucket_id = 'member-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "member-photos storage: family delete" on storage.objects for delete
  using (bucket_id = 'member-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);
