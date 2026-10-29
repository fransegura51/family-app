-- 0349 · Gestión de grupos (núcleo): carpetas personales, grupos, responsables, participantes, vínculos con Mis listas y Eventos, y registro de operaciones.
--
-- Principios (encargo «Gestión de grupos y Botes compartidos»):
--  · Un grupo pertenece a un espacio PEPA (families) pero SOLO lo ven y lo gestionan sus RESPONSABLES (`group_managers`), que son personas con cuenta PEPA de ese espacio.
--    Ser participante de un grupo no da ningún acceso. Ser miembro del espacio tampoco, salvo que sea responsable.
--  · Sección `grupos` (como las demás: `profiles.allowed_sections`). Los menores (rol `child`) solo la tienen si su tutor la marcó explícitamente (la autorización parental ya existente).
--  · Las carpetas son de cada persona (organización, no permisos): máximo dos niveles (carpeta → grupo).
--  · Los participantes no se borran si tienen historial económico (clave foránea restrictiva en 0350): se dan de baja.
--  · Todo cambio relevante queda en `group_audit` (sin datos personales: solo qué campos cambiaron).
-- Deshacer: supabase/rollbacks/0349_groups_core_down.sql

-- ---------------------------------------------------------------------------------------------------------- acceso
-- ¿Esta cuenta puede usar Gestión de grupos? Adultos con la sección; menores solo si se les marcó expresamente.
create or replace function private.groups_user_ok()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.family_id is not null
      and (
        (p.role in ('admin', 'adult') and (p.allowed_sections is null or 'grupos' = any (p.allowed_sections)))
        or (p.role = 'child' and 'grupos' = any (coalesce(p.allowed_sections, '{}'::text[])))
      )
  )
$$;
revoke execute on function private.groups_user_ok() from public, anon;
grant execute on function private.groups_user_ok() to authenticated;

-- ---------------------------------------------------------------------------------------------------------- tablas
create table public.group_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);
create index idx_group_folders_owner on public.group_folders (owner_id);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default private.current_family_id() references public.families (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  period_label text check (period_label is null or length(period_label) <= 40),
  created_by uuid not null default auth.uid() references public.profiles (id),
  archived_at timestamptz,
  -- Si el grupo es una copia recibida: de dónde viene (responsable, grupo, fecha, modo). Solo lo escribe la función de aceptación.
  copied_from jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_groups_family on public.groups (family_id);

create table public.group_managers (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index idx_group_managers_user on public.group_managers (user_id);

-- Dónde coloca cada persona cada grupo (carpeta propia). Sin fila = grupo suelto en la pantalla principal.
create table public.group_placements (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  folder_id uuid references public.group_folders (id) on delete set null, -- borrar una carpeta deja los grupos fuera de ella, nunca los borra
  primary key (user_id, group_id)
);

create table public.group_participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  surname text check (surname is null or length(surname) <= 120),
  guardian_name text check (guardian_name is null or length(guardian_name) <= 120),
  phone text check (phone is null or length(phone) <= 30),
  email text check (email is null or length(email) <= 160),
  payer_alias text check (payer_alias is null or length(payer_alias) <= 200),
  notes text check (notes is null or length(notes) <= 500),
  left_at timestamptz, -- baja: deja de salir en los botes nuevos, el historial se conserva
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_group_participants_group on public.group_participants (group_id);

-- Vínculos (sin copias): la lista y el evento son los reales de Mis listas y Eventos.
create table public.group_list_links (
  group_id uuid not null references public.groups (id) on delete cascade,
  list_id uuid not null references public.user_lists (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, list_id)
);
create index idx_group_list_links_list on public.group_list_links (list_id);

create table public.group_event_links (
  group_id uuid not null references public.groups (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, event_id)
);
create index idx_group_event_links_event on public.group_event_links (event_id);

-- Invitados de Eventos importados desde un grupo: se conserva el origen para «Actualizar invitados» (manual).
alter table public.event_guests add column if not exists group_id uuid references public.groups (id) on delete set null;
alter table public.event_guests add column if not exists group_participant_id uuid references public.group_participants (id) on delete set null;
create index if not exists idx_event_guests_group_participant on public.event_guests (group_participant_id) where group_participant_id is not null;

create table public.group_audit (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  actor_id uuid default auth.uid(),
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb,
  at timestamptz not null default now()
);
create index idx_group_audit_group on public.group_audit (group_id, at desc);

-- ---------------------------------------------------------------------------------------------------------- funciones de acceso
create or replace function private.group_can(p_group uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select private.groups_user_ok()
     and exists (select 1 from group_managers m where m.group_id = p_group and m.user_id = auth.uid())
$$;
revoke execute on function private.group_can(uuid) from public, anon;
grant execute on function private.group_can(uuid) to authenticated;

create or replace function private.folder_is_mine_g(p_folder uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_folder is null or exists (select 1 from group_folders f where f.id = p_folder and f.owner_id = auth.uid())
$$;
revoke execute on function private.folder_is_mine_g(uuid) from public, anon;
grant execute on function private.folder_is_mine_g(uuid) to authenticated;

-- ¿Esta persona tiene cuenta en el mismo espacio que el grupo? (los responsables deben ser personas PEPA del espacio.)
create or replace function private.group_candidate_ok(p_group uuid, p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from groups g join profiles p on p.family_id = g.family_id
    where g.id = p_group and p.id = p_user and p.role in ('admin', 'adult', 'child')
  )
$$;
revoke execute on function private.group_candidate_ok(uuid, uuid) from public, anon;
grant execute on function private.group_candidate_ok(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------- RLS
alter table public.group_folders enable row level security;
alter table public.groups enable row level security;
alter table public.group_managers enable row level security;
alter table public.group_placements enable row level security;
alter table public.group_participants enable row level security;
alter table public.group_list_links enable row level security;
alter table public.group_event_links enable row level security;
alter table public.group_audit enable row level security;

create policy "group_folders: mine" on public.group_folders for all
  using (owner_id = (select auth.uid()) and (select private.groups_user_ok()))
  with check (owner_id = (select auth.uid()) and (select private.groups_user_ok()));

create policy "groups: select" on public.groups for select
  using ((select private.groups_user_ok()) and (created_by = (select auth.uid()) or private.group_can(id)));
create policy "groups: insert" on public.groups for insert
  with check ((select private.groups_user_ok()) and created_by = (select auth.uid()) and family_id = (select private.current_family_id()) and copied_from is null);
create policy "groups: update" on public.groups for update
  using (private.group_can(id)) with check (private.group_can(id) and family_id = (select private.current_family_id()));
-- Solo se borra un grupo sin botes (la clave foránea de group_funds lo impide en cuanto hay uno) y solo quien lo creó.
create policy "groups: delete" on public.groups for delete
  using (created_by = (select auth.uid()) and private.group_can(id));

create policy "group_managers: select" on public.group_managers for select
  using (private.group_can(group_id));
create policy "group_managers: add" on public.group_managers for insert
  with check (private.group_can(group_id) and private.group_candidate_ok(group_id, user_id) and added_by = (select auth.uid()));
-- Se puede quitar a otro responsable solo quien creó el grupo; cada cual puede dejar de serlo. El creador no puede quedarse sin responsables.
create policy "group_managers: remove" on public.group_managers for delete
  using (private.group_can(group_id) and (user_id = (select auth.uid()) or exists (select 1 from public.groups g where g.id = group_id and g.created_by = (select auth.uid()))));

create policy "group_placements: mine" on public.group_placements for all
  using (user_id = (select auth.uid()) and (select private.groups_user_ok()))
  with check (user_id = (select auth.uid()) and (select private.groups_user_ok()) and private.group_can(group_id) and private.folder_is_mine_g(folder_id));

create policy "group_participants: access" on public.group_participants for all
  using (private.group_can(group_id)) with check (private.group_can(group_id));

create policy "group_list_links: select" on public.group_list_links for select
  using (private.group_can(group_id) and private.list_accessible(list_id));
create policy "group_list_links: insert" on public.group_list_links for insert
  with check (private.group_can(group_id) and private.list_accessible(list_id) and created_by = (select auth.uid()));
create policy "group_list_links: delete" on public.group_list_links for delete
  using (private.group_can(group_id));

create policy "group_event_links: select" on public.group_event_links for select
  using (private.group_can(group_id) and exists (select 1 from public.events e where e.id = event_id));
create policy "group_event_links: insert" on public.group_event_links for insert
  with check (private.group_can(group_id) and created_by = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and e.family_id = (select private.current_family_id())));
create policy "group_event_links: delete" on public.group_event_links for delete
  using (private.group_can(group_id));

-- El registro solo se lee (lo escriben los disparadores).
create policy "group_audit: select" on public.group_audit for select
  using (private.group_can(group_id));

revoke all on public.group_folders, public.groups, public.group_managers, public.group_placements, public.group_participants,
  public.group_list_links, public.group_event_links, public.group_audit from anon;
revoke insert, update, delete, truncate on public.group_audit from authenticated;
-- La procedencia de una copia solo la escribe la función de aceptación.
revoke update (copied_from) on public.groups from authenticated;

-- ---------------------------------------------------------------------------------------------------------- disparadores
create or replace function private.groups_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_groups_touch before update on public.groups for each row execute function private.groups_touch();
create trigger trg_group_participants_touch before update on public.group_participants for each row execute function private.groups_touch();

-- Quien crea un grupo es su primer responsable.
create or replace function private.groups_add_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into group_managers (group_id, user_id, added_by) values (new.id, new.created_by, new.created_by) on conflict do nothing;
  return new;
end;
$$;
create trigger trg_groups_add_creator after insert on public.groups for each row execute function private.groups_add_creator();

-- Un participante pertenece al grupo para siempre; no se puede mover a otro grupo editándolo.
create or replace function private.group_participants_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.group_id <> old.group_id then
    raise exception 'GROUP_PARTICIPANT_MOVE' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger trg_group_participants_guard before update on public.group_participants for each row execute function private.group_participants_guard();

-- Registro de operaciones: qué se hizo, quién y cuándo. Los datos personales NO se copian al registro (solo el nombre de los campos que cambiaron).
create or replace function private.group_audit_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_group uuid;
  v_detail jsonb := '{}'::jsonb;
  k text;
  v_pii text[] := array['name', 'surname', 'guardian_name', 'phone', 'email', 'payer_alias', 'notes', 'payer_label', 'concept', 'updated_at'];
  v_changed text[] := '{}';
  v_id text;
begin
  v_group := (v_new ->> 'group_id')::uuid;
  if tg_table_name = 'groups' then v_group := (v_new ->> 'id')::uuid; end if;
  if v_group is null and v_new ? 'fund_id' then
    select f.group_id into v_group from group_funds f where f.id = (v_new ->> 'fund_id')::uuid;
  end if;
  if v_group is null then return coalesce(new, old); end if;
  if not exists (select 1 from groups g where g.id = v_group) then return coalesce(new, old); end if;
  v_id := coalesce(v_new ->> 'id', (v_new ->> 'fund_id') || ':' || coalesce(v_new ->> 'participant_id', v_new ->> 'user_id', ''));
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if v_old -> k is distinct from v_new -> k and k <> 'updated_at' then
        v_changed := v_changed || k;
        if not (k = any (v_pii)) and k in ('amount', 'state', 'required_amount', 'status', 'kind', 'voided_at', 'default_amount', 'archived_at', 'left_at', 'entry_date') then
          v_detail := v_detail || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
        end if;
      end if;
    end loop;
    if array_length(v_changed, 1) is null then return new; end if;
    v_detail := v_detail || jsonb_build_object('fields', to_jsonb(v_changed));
  elsif tg_op = 'INSERT' then
    if v_new ? 'amount' then v_detail := jsonb_build_object('amount', v_new -> 'amount', 'kind', v_new -> 'kind'); end if;
  end if;
  insert into group_audit (group_id, actor_id, action, entity, entity_id, detail)
  values (v_group, auth.uid(), lower(tg_op), tg_argv[0], v_id, nullif(v_detail, '{}'::jsonb));
  return coalesce(new, old);
end;
$$;
revoke execute on function private.group_audit_trg() from public, anon, authenticated;
create trigger trg_audit_groups after insert or update on public.groups for each row execute function private.group_audit_trg('group');
create trigger trg_audit_group_managers after insert or delete on public.group_managers for each row execute function private.group_audit_trg('manager');
create trigger trg_audit_group_participants after insert or update or delete on public.group_participants for each row execute function private.group_audit_trg('participant');
create trigger trg_audit_group_list_links after insert or delete on public.group_list_links for each row execute function private.group_audit_trg('list_link');
create trigger trg_audit_group_event_links after insert or delete on public.group_event_links for each row execute function private.group_audit_trg('event_link');

-- ---------------------------------------------------------------------------------------------------------- tiempo real
do $realtime$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['groups', 'group_managers', 'group_placements', 'group_folders', 'group_participants', 'group_list_links', 'group_event_links'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$realtime$;
