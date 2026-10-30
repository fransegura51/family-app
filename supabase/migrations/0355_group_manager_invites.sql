-- 0355 · Invitar a un responsable de un grupo mediante CÓDIGO (de un solo uso, con caducidad y revocable).
--
-- Funcionamiento: un responsable genera un código; la otra persona (con su propia cuenta PEPA ya iniciada) lo escribe en «Recibir un grupo», ve qué grupo es y qué podrá hacer, y lo
-- acepta. Se incorpora como responsable del MISMO grupo (no se crea ninguna copia): ve y edita lo mismo que el resto, con sincronización inmediata.
--  · No hay buscador de usuarios ni identificadores públicos: solo quien tiene el código y una sesión iniciada.
--  · Un solo uso: al aceptar se marca como aceptada (bloqueo de fila: dos aceptaciones simultáneas no pueden pasar las dos). Caduca a los 7 días. Se puede revocar.
--  · Mismo límite de intentos que las copias de grupos (10 por hora y cuenta).
--  · Quien crea el grupo conserva la titularidad (solo él puede quitar a otros responsables).
--  · Los responsables de otro espacio solo ven de la agenda los contactos vinculados a ESTE grupo (`group_linked_contacts`).
-- Deshacer: supabase/rollbacks/0355_group_manager_invites_down.sql

create table public.group_manager_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'revocada')),
  accepted_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_gmi_group on public.group_manager_invites (group_id);

alter table public.group_manager_invites enable row level security;
create policy "gmi: managers read" on public.group_manager_invites for select using (private.group_can(group_id));
revoke all on public.group_manager_invites from anon;
revoke insert, update, delete, truncate on public.group_manager_invites from authenticated;

create or replace function public.create_group_manager_invite(p_group uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := '';
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  i int;
begin
  if not private.group_can(p_group) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if (select count(*) from group_manager_invites where group_id = p_group and status = 'pendiente' and expires_at > now()) >= 5 then
    raise exception 'TOO_MANY_PENDING' using errcode = '22023';
  end if;
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
  end loop;
  insert into group_manager_invites (group_id, code) values (p_group, v_code);
  insert into group_audit (group_id, actor_id, action, entity, detail) values (p_group, auth.uid(), 'create', 'manager_invite', null);
  return v_code;
end;
$$;
revoke all on function public.create_group_manager_invite(uuid) from public, anon;
grant execute on function public.create_group_manager_invite(uuid) to authenticated;

create or replace function public.revoke_group_manager_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update group_manager_invites set status = 'revocada', resolved_at = now()
   where id = p_id and status = 'pendiente' and private.group_can(group_id);
end;
$$;
revoke all on function public.revoke_group_manager_invite(uuid) from public, anon;
grant execute on function public.revoke_group_manager_invite(uuid) to authenticated;

-- Busca un código vigente (con límite de intentos). `for update` evita que dos personas lo acepten a la vez.
create or replace function private.group_manager_invite_lookup(p_code text, p_lock boolean)
returns group_manager_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  t group_manager_invites%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not private.groups_user_ok() then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if (select count(*) from group_transfer_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'TOO_MANY_ATTEMPTS' using errcode = '22023';
  end if;
  if p_lock then
    select * into t from group_manager_invites where code = v_code and status = 'pendiente' and expires_at > now() for update;
  else
    select * into t from group_manager_invites where code = v_code and status = 'pendiente' and expires_at > now();
  end if;
  if not found then
    -- Los códigos de copia de grupo comparten la misma casilla de «Recibir un grupo»: solo cuenta como intento fallido si tampoco es de una copia.
    if not exists (select 1 from group_transfers where code = v_code and status = 'pendiente' and expires_at > now()) then
      insert into group_transfer_attempts (user_id) values (auth.uid());
    end if;
    raise exception 'INVALID_CODE' using errcode = '22023';
  end if;
  if t.created_by = auth.uid() then raise exception 'SELF_INVITE' using errcode = '22023'; end if;
  return t;
end;
$$;
revoke execute on function private.group_manager_invite_lookup(text, boolean) from public, anon, authenticated;

create or replace function public.preview_group_manager_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t group_manager_invites%rowtype;
  g groups%rowtype;
begin
  t := private.group_manager_invite_lookup(p_code, false);
  select * into g from groups where id = t.group_id;
  return jsonb_build_object(
    'groupName', g.name,
    'fromName', coalesce((select display_name from profiles where id = t.created_by), 'Otra persona'),
    'participants', (select count(*) from group_participants where group_id = t.group_id and left_at is null),
    'funds', (select count(*) from group_funds where group_id = t.group_id),
    'alreadyManager', exists (select 1 from group_managers m where m.group_id = t.group_id and m.user_id = auth.uid())
  );
end;
$$;
revoke all on function public.preview_group_manager_invite(text) from public, anon;
grant execute on function public.preview_group_manager_invite(text) to authenticated;

create or replace function public.accept_group_manager_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t group_manager_invites%rowtype;
begin
  t := private.group_manager_invite_lookup(p_code, true);
  if exists (select 1 from group_managers m where m.group_id = t.group_id and m.user_id = auth.uid()) then
    raise exception 'ALREADY_MANAGER' using errcode = '22023';
  end if;
  insert into group_managers (group_id, user_id, added_by) values (t.group_id, auth.uid(), t.created_by);
  update group_manager_invites set status = 'aceptada', accepted_by = auth.uid(), resolved_at = now() where id = t.id;
  return jsonb_build_object('groupId', t.group_id);
end;
$$;
revoke all on function public.accept_group_manager_invite(text) from public, anon;
grant execute on function public.accept_group_manager_invite(text) to authenticated;

-- Nombres de los responsables de un grupo aunque sean de otro espacio (la tabla de perfiles solo se ve dentro del propio espacio).
create or replace function public.group_manager_names(p_group uuid)
returns table (user_id uuid, display_name text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not private.group_can(p_group) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  return query select m.user_id, coalesce(nullif(p.display_name, ''), 'Sin nombre') from group_managers m join profiles p on p.id = m.user_id where m.group_id = p_group;
end;
$$;
revoke all on function public.group_manager_names(uuid) from public, anon;
grant execute on function public.group_manager_names(uuid) to authenticated;

do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_manager_invites') then
    alter publication supabase_realtime add table public.group_manager_invites;
  end if;
end
$realtime$;
