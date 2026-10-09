-- Actividad de uso de cada cuenta (para el panel de la propietaria / centro de mando): cuántas veces se abre la app y qué pantallas se usan.
--
-- Petición real: «si regalamos la aplicación a 30 personas para que la prueben y no la utilizan, ¿para qué se la damos? Quiero ver las veces que
-- se abre y las pantallas que abre, aunque yo no vea los datos».
--
-- Privacidad: SOLO contadores. Se guarda, por cuenta y día, cuántas veces se abrió la app y cuántas veces se entró en cada pantalla (nombre de la
-- sección y número). NUNCA contenido, rutas con identificadores, textos ni datos de la familia. Sin IP ni navegador.
--
-- Escritura: cada cuenta solo escribe en SU fila (auth.uid()), a través de record_app_usage. Lectura: solo las propietarias de la app
-- (profiles.is_app_owner, ver 0085); a cualquier otra persona las funciones le devuelven 0 filas. La tabla no tiene acceso directo.
--
-- ROLLBACK: ver supabase/rollbacks/0226_app_usage_activity_down.sql
create table public.app_usage_daily (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  day date not null,
  -- '_abre' = veces que se abrió la app; el resto, el nombre de la pantalla (calendario, compras…).
  section text not null check (section ~ '^[a-z0-9_-]{1,40}$'),
  hits integer not null default 0 check (hits >= 0),
  primary key (profile_id, day, section)
);

create index idx_app_usage_daily_family on public.app_usage_daily(family_id);

alter table public.app_usage_daily enable row level security;
revoke all on public.app_usage_daily from public, anon, authenticated;
-- Sin políticas: nadie la toca directamente, solo las funciones SECURITY DEFINER de abajo.

-- Suma contadores de ESTA cuenta para hoy (hora de Madrid). p_counts: {"_abre": 1, "calendario": 3, ...}.
-- Defensas: máximo 40 claves, cada valor entre 1 y 500, claves con formato válido; lo inválido se ignora sin error.
create or replace function public.record_app_usage(p_counts jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile uuid := auth.uid();
  v_family uuid;
  v_day date := (now() at time zone 'Europe/Madrid')::date;
  v_key text;
  v_val jsonb;
  v_n int;
  v_seen int := 0;
begin
  if v_profile is null or p_counts is null or jsonb_typeof(p_counts) <> 'object' then
    return;
  end if;

  select p.family_id into v_family from public.profiles p where p.id = v_profile;
  if v_family is null then
    return;
  end if;

  for v_key, v_val in select * from jsonb_each(p_counts) loop
    v_seen := v_seen + 1;
    exit when v_seen > 40;
    if v_key !~ '^[a-z0-9_-]{1,40}$' or jsonb_typeof(v_val) <> 'number' then
      continue;
    end if;
    v_n := least(500, floor((v_val #>> '{}')::numeric))::int;
    if v_n < 1 then
      continue;
    end if;
    insert into public.app_usage_daily (profile_id, family_id, day, section, hits)
    values (v_profile, v_family, v_day, v_key, v_n)
    on conflict (profile_id, day, section) do update
      set hits = public.app_usage_daily.hits + excluded.hits;
  end loop;
end;
$function$;

-- Solo propietarias: actividad por cuenta y pantalla en los últimos p_days días (1-365).
-- Una fila por (cuenta, pantalla): total de entradas, días distintos en que se usó y último día.
create or replace function public.list_app_usage_activity(p_days integer default 30)
returns table (profile_id uuid, family_id uuid, section text, hits bigint, days_used integer, last_day date)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.profile_id, u.family_id, u.section, sum(u.hits)::bigint, count(distinct u.day)::int, max(u.day)
  from public.app_usage_daily u
  where exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_app_owner)
    and u.day >= (now() at time zone 'Europe/Madrid')::date - (greatest(1, least(coalesce(p_days, 30), 365)) - 1)
  group by u.profile_id, u.family_id, u.section
$function$;

-- Solo propietarias: cuántas personas hay apuntadas en cada familia (solo el número, no los nombres) y cuántas tienen cuenta propia.
create or replace function public.list_app_owner_families()
returns table (family_id uuid, family_name text, created_at timestamptz, members_total integer, members_with_account integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select f.id, f.name, f.created_at,
         (select count(*) from public.family_members m where m.family_id = f.id)::int,
         (select count(*) from public.family_members m where m.family_id = f.id and m.linked_profile_id is not null)::int
  from public.families f
  where exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_app_owner)
  order by f.created_at
$function$;

revoke all on function public.record_app_usage(jsonb) from public, anon, authenticated;
grant execute on function public.record_app_usage(jsonb) to authenticated;

revoke all on function public.list_app_usage_activity(integer) from public, anon, authenticated;
grant execute on function public.list_app_usage_activity(integer) to authenticated;

revoke all on function public.list_app_owner_families() from public, anon, authenticated;
grant execute on function public.list_app_owner_families() to authenticated;
