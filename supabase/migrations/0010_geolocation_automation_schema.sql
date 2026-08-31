-- Fase 8 (Skills 23/24): geolocalización opcional y automatizaciones.
--
-- Diseño de privacidad deliberado (Skill 23 "mínima recopilación y
-- retención"): member_locations usa member_id como PRIMARY KEY, así que
-- cada actualización SUSTITUYE la posición anterior — nunca se guarda un
-- historial de ubicaciones, solo la última conocida. Desactivar el
-- consentimiento borra la fila (ver delete_member_location en el cliente).

create table location_places (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_m int not null default 150,
  created_at timestamptz not null default now()
);

-- Consentimiento explícito por miembro, desactivado por defecto (Skill
-- 23). Solo el admin puede activarlo/desactivarlo — control reforzado
-- para menores (Skill 28), aplicado también a adultos por simplicidad y
-- porque es la única cuenta de Auth de la familia (dispositivo compartido).
create table location_sharing_consent (
  member_id uuid primary key references family_members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table member_locations (
  member_id uuid primary key references family_members(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  recorded_at timestamptz not null default now()
);

create table automation_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  trigger_type text not null check (trigger_type in ('llegada', 'salida', 'hora_diaria')),
  member_id uuid references family_members(id) on delete cascade, -- null = cualquier miembro
  place_id uuid references location_places(id) on delete cascade,
  time_of_day time,
  message text not null,
  active boolean not null default true,
  muted_until timestamptz,
  created_at timestamptz not null default now()
);

alter table location_places enable row level security;
alter table location_sharing_consent enable row level security;
alter table member_locations enable row level security;
alter table automation_rules enable row level security;

create policy "location_places: family crud" on location_places for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "location_sharing_consent: family select" on location_sharing_consent for select
  using (family_id = private.current_family_id());

create policy "location_sharing_consent: admin write" on location_sharing_consent for insert
  with check (family_id = private.current_family_id() and private.current_role_in_family() = 'admin');

create policy "location_sharing_consent: admin update" on location_sharing_consent for update
  using (family_id = private.current_family_id() and private.current_role_in_family() = 'admin');

create policy "location_sharing_consent: admin delete" on location_sharing_consent for delete
  using (family_id = private.current_family_id() and private.current_role_in_family() = 'admin');

create policy "member_locations: family select" on member_locations for select
  using (family_id = private.current_family_id());

create policy "member_locations: write if consented" on member_locations for insert
  with check (
    family_id = private.current_family_id()
    and exists (
      select 1 from location_sharing_consent c
      where c.member_id = member_locations.member_id and c.enabled = true
    )
  );

create policy "member_locations: update if consented" on member_locations for update
  using (family_id = private.current_family_id())
  with check (
    family_id = private.current_family_id()
    and exists (
      select 1 from location_sharing_consent c
      where c.member_id = member_locations.member_id and c.enabled = true
    )
  );

create policy "member_locations: delete own family" on member_locations for delete
  using (family_id = private.current_family_id());

create policy "automation_rules: family crud" on automation_rules for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create index idx_location_places_family on location_places(family_id);
create index idx_automation_rules_family on automation_rules(family_id);
