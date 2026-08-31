-- Family App — esquema inicial (Fase 1: auth, familia, miembros, calendario)
-- Aislamiento multi-familia estricto vía family_id + RLS. Nunca confiar en
-- filtros del frontend para separar datos entre familias (Skill 26/27).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- families
-- ---------------------------------------------------------------------
create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table families enable row level security;

-- ---------------------------------------------------------------------
-- profiles: vincula un usuario de Supabase Auth a una familia y un rol
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  role text not null check (role in ('admin', 'adult')),
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Funciones SECURITY DEFINER: la familia/rol del usuario autenticado. Se
-- usan en todas las políticas RLS en vez de confiar en parámetros del
-- cliente. Viven en `private` (no expuesto por PostgREST) para que no
-- sean invocables como RPC público — RLS las sigue usando igual, ya que
-- eso es un chequeo a nivel de Postgres, no de la API HTTP.
create schema if not exists private;

create or replace function private.current_family_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select family_id from profiles where id = auth.uid()
$$;

create or replace function private.current_role_in_family()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

revoke execute on function private.current_family_id() from public, anon, authenticated;
revoke execute on function private.current_role_in_family() from public, anon, authenticated;
grant execute on function private.current_family_id() to authenticated;
grant execute on function private.current_role_in_family() to authenticated;

create policy "profiles: select own family"
  on profiles for select
  using (family_id = private.current_family_id());

create policy "profiles: update own row"
  on profiles for update
  using (id = auth.uid());

create policy "families: select own"
  on families for select
  using (id = private.current_family_id());

create policy "families: admin update"
  on families for update
  using (id = private.current_family_id() and private.current_role_in_family() = 'admin');

-- ---------------------------------------------------------------------
-- family_members: perfiles mostrables en UI (adultos y niños/bebés)
-- ---------------------------------------------------------------------
create table family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  avatar text not null default 'default',
  color text not null default '#4C6EF5',
  member_type text not null check (member_type in ('admin', 'adult', 'child', 'baby')),
  birth_date date,
  permissions jsonb not null default '{}'::jsonb,
  linked_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table family_members enable row level security;

create policy "family_members: select own family"
  on family_members for select
  using (family_id = private.current_family_id());

create policy "family_members: admin write"
  on family_members for insert
  with check (family_id = private.current_family_id() and private.current_role_in_family() = 'admin');

create policy "family_members: admin update"
  on family_members for update
  using (family_id = private.current_family_id() and private.current_role_in_family() = 'admin');

create policy "family_members: admin delete"
  on family_members for delete
  using (family_id = private.current_family_id() and private.current_role_in_family() = 'admin');

-- ---------------------------------------------------------------------
-- calendar_events + calendar_event_members
-- ---------------------------------------------------------------------
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  color text,
  recurrence_rule text, -- RFC 5545 RRULE, null = evento único
  reminder_minutes int,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table calendar_event_members (
  event_id uuid not null references calendar_events(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  primary key (event_id, member_id)
);

alter table calendar_events enable row level security;
alter table calendar_event_members enable row level security;

create policy "calendar_events: family crud"
  on calendar_events for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

create policy "calendar_event_members: family crud"
  on calendar_event_members for all
  using (
    exists (
      select 1 from calendar_events e
      where e.id = event_id and e.family_id = private.current_family_id()
    )
  )
  with check (
    exists (
      select 1 from calendar_events e
      where e.id = event_id and e.family_id = private.current_family_id()
    )
  );

create index idx_family_members_family on family_members(family_id);
create index idx_calendar_events_family on calendar_events(family_id);
create index idx_calendar_events_start on calendar_events(start_at);
