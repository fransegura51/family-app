-- Historial de SITIOS visitados (Skill 23/28) — a diferencia de
-- member_location_history (rastro GPS exacto, purgado a las 24h por
-- privacidad), aquí solo se guarda "estuvo en X desde tal hora hasta
-- tal hora", una fila por parada real (hace falta quedarse quieto un
-- rato para que cuente, ver services/locationSharing.ts) — mucho menos
-- sensible que guardar coordenadas cada pocos segundos, así que se
-- puede conservar más tiempo (90 días) para ver el historial por
-- semana o por mes. Petición real: "un desplegable con los sitios en
-- los que ha estado cada día... que lo reconozca según las tiendas que
-- haya en los mapas... el historial por día, semana o mes".
create table member_place_visits (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  place_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  arrived_at timestamptz not null,
  left_at timestamptz
);

alter table member_place_visits enable row level security;

create policy "member_place_visits: family crud" on member_place_visits for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id() and private.member_in_current_family(member_id));

create index idx_member_place_visits_member on member_place_visits(member_id, arrived_at);

create or replace function private.purge_old_place_visits() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  delete from member_place_visits where arrived_at < now() - interval '90 days';
  return new;
end;
$$;

create trigger trg_purge_old_place_visits
  after insert on member_place_visits
  execute function private.purge_old_place_visits();
