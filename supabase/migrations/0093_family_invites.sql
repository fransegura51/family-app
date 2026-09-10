-- Petición real: "vamos a hacer todo lo que falta para que sea la mejor
-- del mercado" — dar entrada a las primeras familias de prueba sin
-- tocar código ni compartir el código maestro.
--
-- Hasta ahora crear una familia exigía UN código global (Vault:
-- family_signup_code) — vale para uso propio, pero si se filtra
-- cualquiera puede crear familias, no se sabe quién usó qué código y no
-- se puede caducar. Ahora la dueña de la app genera códigos de
-- invitación de UN solo uso desde "Uso de la app": con nota ("Familia
-- López, amigos de Paco"), caducidad (30 días) y registro de qué
-- familia lo consumió. El código maestro sigue valiendo (compatibilidad).
create table family_invites (
  code text primary key,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  note text,
  used_by_family uuid references families(id) on delete set null,
  used_at timestamptz
);

create index idx_family_invites_used_by_family on family_invites(used_by_family);

alter table family_invites enable row level security;

-- Solo la dueña de la app los ve, crea y borra (mismo criterio que
-- list_app_usage / client_errors).
create policy "family_invites: owner all" on family_invites
  for all to authenticated
  using (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner))
  with check (exists (select 1 from profiles me where me.id = (select auth.uid()) and me.is_app_owner));

create or replace function public.generate_family_invite(p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_app_owner) then
    raise exception 'Solo la dueña de la app puede generar códigos';
  end if;
  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into family_invites (code, created_by, note) values (v_code, auth.uid(), p_note);
  return v_code;
end;
$$;

revoke all on function public.generate_family_invite(text) from public, anon;
grant execute on function public.generate_family_invite(text) to authenticated;

-- create_family acepta el código maestro (Vault) O un código de
-- invitación vigente y sin usar; este último queda marcado como usado
-- por la familia recién creada.
create or replace function public.create_family(p_family_name text, p_display_name text, p_access_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_user_id uuid := auth.uid();
  v_expected_code text;
  v_invite_code text := upper(trim(coalesce(p_access_code, '')));
  v_used_invite text := null;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select decrypted_secret into v_expected_code from vault.decrypted_secrets where name = 'family_signup_code';
  if v_expected_code is not null and p_access_code = v_expected_code then
    null; -- código maestro
  elsif exists (
    select 1 from family_invites
    where code = v_invite_code and used_at is null and expires_at > now()
  ) then
    v_used_invite := v_invite_code;
  else
    raise exception 'Código de acceso incorrecto';
  end if;

  if exists (select 1 from profiles where id = v_user_id) then
    raise exception 'El usuario ya pertenece a una familia';
  end if;

  insert into families (name) values (p_family_name) returning id into v_family_id;

  insert into profiles (id, family_id, role, display_name)
    values (v_user_id, v_family_id, 'admin', p_display_name);

  insert into family_members (family_id, name, member_type, linked_profile_id)
    values (v_family_id, p_display_name, 'admin', v_user_id);

  if v_used_invite is not null then
    update family_invites set used_by_family = v_family_id, used_at = now() where code = v_used_invite;
  end if;

  return v_family_id;
end;
$$;
