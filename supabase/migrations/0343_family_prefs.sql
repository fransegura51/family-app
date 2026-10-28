-- 0343 · Preferencias de la FAMILIA (ampliación mínima del sistema de preferencias de 0305): modo y orden del Comparador de precios, compartidos por todos los miembros.
--
-- Qué NO cambia: `user_prefs` (preferencias personales), `set_user_pref`, la secuencia de revisiones, el motor de cliente (comparar y cambiar, conflictos, cola, Realtime).
-- Qué se añade:
--  · Tabla `family_prefs`: una fila por (familia, clave), con la misma forma que `user_prefs` y la MISMA secuencia de revisiones (`public.user_prefs_rev_seq`), de modo que
--    el cursor de descarga del cliente sirve para las dos tablas sin tocar el motor.
--  · `public.set_family_pref(clave, valor, rev_base)`: igual que `set_user_pref` pero la dueña es la familia de quien llama (profiles.family_id) y exige acceso a Compras
--    (private.has_section_access('compras')). Cualquier miembro con acceso puede cambiarla; el cambio llega a los demás por Realtime.
--  · Lista cerrada de claves familiares (`private.family_pref_key_allowed`). Las claves del Comparador salen de `private.user_pref_key_allowed` (vuelve a la lista de 0305):
--    a partir de ahora una clave es personal O familiar, nunca las dos.
--  · RLS: solo se LEE la de la propia familia. Sin políticas de escritura (solo la función).
--
-- Migración de lo existente (criterio determinista): por cada familia y clave, si hay valores personales guardados en `user_prefs`, se toma el de `updated_at` más reciente
-- (empate: el `user_id` menor). NO se borra ni se modifica ninguna fila de `user_prefs` (los valores personales se conservan intactos; quedan inertes porque el cliente deja de
-- leerlos). A fecha de aplicación no había ninguna fila personal con estas claves. Valores que solo existan en un aparato (sin subir) los sube el primer aparato que llegue y
-- los demás adoptan ese valor (el motor ya lo hace así).
-- Deshacer: supabase/rollbacks/0343_family_prefs_down.sql (devuelve el valor familiar a cada miembro antes de borrar nada).

create table if not exists public.family_prefs (
  family_id  uuid        not null references public.families (id) on delete cascade,
  key        text        not null check (length(key) between 1 and 120),
  value      jsonb       not null check (jsonb_typeof(value) in ('string', 'null') and pg_column_size(value) <= 8192),
  rev        bigint      not null default nextval('public.user_prefs_rev_seq'),
  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users (id) on delete set null,
  primary key (family_id, key)
);
create index if not exists family_prefs_family_rev_idx on public.family_prefs (family_id, rev);

alter table public.family_prefs enable row level security;

drop policy if exists family_prefs_select_own_family on public.family_prefs;
create policy family_prefs_select_own_family on public.family_prefs
  for select to authenticated
  using (family_id = (select private.current_family_id()));

revoke all on public.family_prefs from anon, authenticated;
grant select on public.family_prefs to authenticated;

-- Claves familiares aceptadas (debe coincidir con FAMILY_PREF_PATTERN_SOURCES de src/state/prefs/prefsRegistry.ts).
create or replace function private.family_pref_key_allowed(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_key is not null
     and length(p_key) between 1 and 120
     and p_key ~ any (array[
       '^familyapp:compras-compare-(mode|sort)$'
     ])
$function$;
revoke all on function private.family_pref_key_allowed(text) from public, anon, authenticated;

-- Las claves del Comparador dejan de ser personales (vuelve la lista de 0305).
create or replace function private.user_pref_key_allowed(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_key is not null
     and length(p_key) between 1 and 120
     and p_key ~ any (array[
       '^familyapp:(alimentacion|calendario|compras|economia|ubicacion)-menu-layout$',
       '^familyapp:(alimentacion|calendario|community|compras|economia|ubicacion)-pinned-tabs$',
       '^familyapp:community-menu-order$',
       '^familyapp:(color-theme|chart-color-theme|home-card-order|home-carousel|movement-color-mode|voice-response-mode)$',
       '^familyapp:tab-order:[A-Za-z0-9_-]+$',
       '^pepa:(auto-confirm|show-classic-buttons)$',
       '^familyapp:calendar-onboarding-seen:[A-Za-z0-9_-]+$',
       '^familyapp:kids-(theme|sprite):[A-Za-z0-9_-]+$',
       '^pepa\.eventMenuView$',
       '^pepa\.reviewInvite\.until$'
     ])
$function$;
revoke all on function private.user_pref_key_allowed(text) from public, anon, authenticated;

-- Comparar y cambiar, por familia. Devuelve (applied, rev, value): con applied = false, rev/value son los del cambio que ya estaba confirmado.
create or replace function public.set_family_pref(p_key text, p_value jsonb, p_base_rev bigint)
returns table (applied boolean, rev bigint, value jsonb)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_value jsonb := coalesce(p_value, 'null'::jsonb);
  v_row public.family_prefs%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  v_family := private.current_family_id();
  if v_family is null or not private.has_section_access('compras') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if not private.family_pref_key_allowed(p_key) then
    raise exception 'INVALID_KEY' using errcode = '22023';
  end if;
  if jsonb_typeof(v_value) not in ('string', 'null') or pg_column_size(v_value) > 8192 or p_base_rev is null or p_base_rev < 0 then
    raise exception 'INVALID_VALUE' using errcode = '22023';
  end if;

  if p_base_rev = 0 then
    if not exists (select 1 from public.family_prefs f where f.family_id = v_family and f.key = p_key)
       and (select count(*) from public.family_prefs f where f.family_id = v_family) >= 50 then
      raise exception 'TOO_MANY_PREFS' using errcode = '22023';
    end if;
    insert into public.family_prefs (family_id, key, value, updated_by) values (v_family, p_key, v_value, v_uid)
      on conflict (family_id, key) do nothing
      returning * into v_row;
  else
    update public.family_prefs f
       set value = v_value, rev = nextval('public.user_prefs_rev_seq'), updated_at = now(), updated_by = v_uid
     where f.family_id = v_family and f.key = p_key and f.rev = p_base_rev
     returning * into v_row;
  end if;

  if found then
    return query select true, v_row.rev, v_row.value;
    return;
  end if;
  select * into v_row from public.family_prefs f where f.family_id = v_family and f.key = p_key;
  return query select false, coalesce(v_row.rev, 0::bigint), coalesce(v_row.value, 'null'::jsonb);
end;
$function$;

revoke all on function public.set_family_pref(text, jsonb, bigint) from public, anon;
grant execute on function public.set_family_pref(text, jsonb, bigint) to authenticated;

-- BACKFILL START · valor personal más reciente por familia y clave (no se toca user_prefs).
insert into public.family_prefs (family_id, key, value)
select distinct on (pr.family_id, up.key) pr.family_id, up.key, up.value
  from public.user_prefs up
  join public.profiles pr on pr.id = up.user_id
 where pr.family_id is not null
   and private.family_pref_key_allowed(up.key)
   and jsonb_typeof(up.value) = 'string'
 order by pr.family_id, up.key, up.updated_at desc, up.user_id asc
on conflict (family_id, key) do nothing;
-- BACKFILL END

-- Tiempo real (Postgres Changes; respeta la RLS). El cliente filtra por family_id.
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'family_prefs') then
    alter publication supabase_realtime add table public.family_prefs;
  end if;
end
$realtime$;
