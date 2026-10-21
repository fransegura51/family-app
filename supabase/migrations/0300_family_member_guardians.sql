-- 0300 · Vínculo parental («Es mi hijo/a») — FASE A. Tabla NUEVA y funciones nuevas; no cambia nada existente. SIN APLICAR en producción (necesita autorización).
--
-- Qué registra: que una persona adulta o administradora, con cuenta, declara ser madre/padre/tutor de la FICHA de un menor. Es una DECLARACIÓN: no es una verificación
-- documental de la filiación ni de la tutela, y la app no debe presentarla como tal.
--
-- Diseño (decisiones 20/10/2026):
--  · Se apoya en las fichas (family_members), no en cuentas: el menor puede no tener cuenta. La madre/padre sí la necesita para declarar (se identifica con ella).
--  · SIN límite de tutores por menor: cada vínculo se declara y se registra por separado (familias reconstituidas, tutelas…).
--  · Solo se declara UNO MISMO como madre/padre/tutor (nadie puede declarar a otra persona), y solo sobre fichas de niño/bebé que sean menores de 18 años. Imposible sobre
--    otra persona adulta: por eso este vínculo nunca da permisos sobre cuentas de adultos.
--  · Exige una identificación RECIENTE (contraseña o código del correo, menos de 5 minutos: private.has_recent_strong_auth, de 0299) y la declaración expresa.
--  · Nada se escribe desde el cliente: solo funciones SECURITY DEFINER. La lectura sigue la regla de la familia.
--  · Los poderes derivados (p. ej. invitar a su hijo menor, 0301) se comprueban SIEMPRE al actuar: dejan de valer solos cuando el menor cumple 18 años, sin borrar el historial.
--  · Revocación: la función de retirar el PROPIO vínculo se crea pero NO se habilita (sin permiso de ejecución) hasta que se revise el mecanismo. Los vínculos incorrectos o
--    disputados se diseñan aparte (ver docs/CUENTAS_PADRES_HIJOS_E_INVITACIONES.md): ninguna administradora de familia puede borrar el vínculo de otra persona.
-- Deshacer: supabase/rollbacks/0300_family_member_guardians_down.sql. Requiere 0299 (identificación reciente).

create table public.family_member_guardians (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_member_id uuid not null references public.family_members(id) on delete cascade,
  guardian_member_id uuid not null references public.family_members(id) on delete cascade,
  relationship text not null check (relationship in ('parent', 'legal_guardian')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  declared_by uuid references public.profiles(id) on delete set null,
  declared_at timestamptz not null default now(),
  declaration_version text not null check (length(declaration_version) between 1 and 40),
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason is null or length(revoke_reason) <= 500),
  check (child_member_id <> guardian_member_id),
  check ((status = 'revoked') = (revoked_at is not null))
);

-- Un mismo vínculo vigente no se repite (el historial de revocados sí se conserva).
create unique index family_member_guardians_active_unique on public.family_member_guardians (child_member_id, guardian_member_id) where status = 'active';
create index family_member_guardians_family_idx on public.family_member_guardians (family_id);
create index family_member_guardians_guardian_idx on public.family_member_guardians (guardian_member_id) where status = 'active';

alter table public.family_member_guardians enable row level security;

-- Se ve dentro de la propia familia y solo por quien es adulta o administradora (un niño o un invitado con cuenta no ve los vínculos).
create policy "family_member_guardians: family adults read" on public.family_member_guardians
  for select to authenticated
  using (family_id = (select private.current_family_id()) and (select private.current_role_in_family()) in ('admin', 'adult'));

revoke all on public.family_member_guardians from anon, authenticated;
grant select on public.family_member_guardians to authenticated;

-- Registro de cambios (declaración, retirada…). Sin acceso desde la app: solo lo escriben las funciones de abajo; se conserva aunque cambie el vínculo.
create table public.family_guardian_events (
  id bigserial primary key,
  family_id uuid not null,
  link_id uuid,
  event text not null check (event in ('declared', 'revoked')),
  actor_profile uuid,
  at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb
);
create index family_guardian_events_link_idx on public.family_guardian_events (link_id, at desc);
alter table public.family_guardian_events enable row level security;
revoke all on public.family_guardian_events from anon, authenticated;

-- ¿Es menor de 18 años? Un niño/bebé sin fecha de nacimiento se considera menor (lo más prudente); una ficha con cuenta de adulta/administradora nunca lo es.
create or replace function private.member_is_minor(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from family_members m
    where m.id = p_member
      and m.member_type in ('child', 'baby')
      and (m.birth_date is null or m.birth_date > (current_date - interval '18 years')::date)
      -- Si la ficha ya tiene una cuenta con rol de persona adulta o administradora, es una cuenta adulta, diga lo que diga el tipo de la ficha.
      and not exists (select 1 from profiles p where p.id = m.linked_profile_id and p.role in ('admin', 'adult'))
  )
$$;

-- ¿La persona que llama es madre/padre/tutor VIGENTE de este menor AHORA? (cuenta suya + vínculo activo + el menor sigue siendo menor + misma familia + rol adulta/administradora).
create or replace function private.is_active_guardian_of(p_child uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from family_member_guardians g
    join family_members gm on gm.id = g.guardian_member_id
    join family_members cm on cm.id = g.child_member_id
    where g.child_member_id = p_child
      and g.status = 'active'
      and gm.linked_profile_id = auth.uid()
      and cm.family_id = private.current_family_id()
      and gm.family_id = cm.family_id
      and g.family_id = cm.family_id
      and private.current_role_in_family() in ('admin', 'adult')
      and private.member_is_minor(p_child)
  )
$$;

revoke all on function private.member_is_minor(uuid) from public, anon, authenticated;
revoke all on function private.is_active_guardian_of(uuid) from public, anon, authenticated;

create or replace function public.declare_guardianship(
  p_child_member uuid,
  p_relationship text default 'parent',
  p_declaration_accepted boolean default false,
  p_declaration_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_family uuid := private.current_family_id();
  v_role text := private.current_role_in_family();
  v_me uuid := private.current_member_id();
  v_child_family uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  if v_role is null or v_role not in ('admin', 'adult') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_me is null then
    raise exception 'NO_MEMBER_PROFILE';
  end if;
  if p_relationship is null or p_relationship not in ('parent', 'legal_guardian') then
    raise exception 'INVALID_RELATIONSHIP';
  end if;
  if not coalesce(p_declaration_accepted, false) or coalesce(length(trim(p_declaration_version)), 0) = 0 then
    raise exception 'DECLARATION_REQUIRED';
  end if;
  if not private.has_recent_strong_auth(300) then
    raise exception 'RECENT_AUTH_REQUIRED';
  end if;

  select family_id into v_child_family from family_members where id = p_child_member;
  if v_child_family is null or v_child_family <> v_family then
    raise exception 'CHILD_NOT_FOUND';
  end if;
  if p_child_member = v_me then
    raise exception 'CANNOT_DECLARE_SELF';
  end if;
  -- Solo menores: una persona adulta nunca puede ser «el hijo» de un vínculo (así no se obtienen permisos sobre cuentas de otros adultos).
  if not private.member_is_minor(p_child_member) then
    raise exception 'CHILD_MUST_BE_MINOR';
  end if;
  if exists (select 1 from family_member_guardians where child_member_id = p_child_member and guardian_member_id = v_me and status = 'active') then
    raise exception 'ALREADY_LINKED';
  end if;

  insert into family_member_guardians (family_id, child_member_id, guardian_member_id, relationship, declared_by, declaration_version)
  values (v_family, p_child_member, v_me, p_relationship, v_user, trim(p_declaration_version))
  returning id into v_id;

  insert into family_guardian_events (family_id, link_id, event, actor_profile, detail)
  values (v_family, v_id, 'declared', v_user, jsonb_build_object('relationship', p_relationship, 'declaration_version', trim(p_declaration_version)));

  return v_id;
end;
$function$;

-- Retirar el PROPIO vínculo. NO HABILITADA (sin permiso de ejecución) hasta que se revise y apruebe el mecanismo de revocación.
create or replace function public.revoke_own_guardianship(p_link_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_family uuid;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  update family_member_guardians g
  set status = 'revoked', revoked_at = now(), revoked_by = v_user, revoke_reason = left(p_reason, 500)
  from family_members gm
  where g.id = p_link_id and g.status = 'active' and gm.id = g.guardian_member_id and gm.linked_profile_id = v_user
  returning g.family_id into v_family;
  if v_family is null then
    raise exception 'LINK_NOT_FOUND';
  end if;
  insert into family_guardian_events (family_id, link_id, event, actor_profile, detail)
  values (v_family, p_link_id, 'revoked', v_user, jsonb_build_object('reason', left(p_reason, 500), 'by', 'guardian'));
end;
$function$;

revoke all on function public.declare_guardianship(uuid, text, boolean, text) from public, anon;
grant execute on function public.declare_guardianship(uuid, text, boolean, text) to authenticated;
-- Retirar el PROPIO vínculo: la función solo actúa sobre vínculos cuya persona titular es quien llama (guardian_member_id enlazado a su cuenta). Nadie puede retirar el de otra persona,
-- tampoco una administradora de la familia. Queda registrado en family_guardian_events. Habilitada tras probarla con datos (supabase/local-sql-tests).
revoke all on function public.revoke_own_guardianship(uuid, text) from public, anon;
grant execute on function public.revoke_own_guardianship(uuid, text) to authenticated;
