-- 0305 · Preferencias por persona: UNA FILA POR PREFERENCIA (CONFIG-01 / CONFIG-01.1). SIN APLICAR en producción (necesita autorización).
--
-- Problema que resuelve (diagnóstico de la Fase A): las preferencias de pantalla (orden del menú, tema, orden de Inicio…) viajaban en UNA sola fila JSON por
-- persona (user_ui_prefs), se bajaban solo al abrir la app y se subían enteras, de modo que un dispositivo con datos antiguos podía borrar lo que otro cambió después,
-- y ningún dispositivo se enteraba de los cambios de otro hasta reabrir la app.
--
-- Diseño:
--  · Tabla `user_prefs`: una fila por (persona, clave). Valor de texto guardado como JSON string (igual que localStorage); JSON null = «volver al valor predeterminado».
--  · `rev`: número de revisión creciente asignado por la BASE DE DATOS (una secuencia). Es el orden de verdad entre dispositivos; nada depende de la hora del dispositivo.
--  · Se escribe SOLO con `set_user_pref(clave, valor, rev_base)`: comparar y cambiar. Aplica únicamente si la fila sigue en `rev_base` (0 = no existía). Si otro dispositivo
--    ya cambió esa preferencia, NO se aplica y devuelve el valor ganador (el cliente avisa y permite recuperar el suyo).
--  · Lista cerrada de claves (la misma que src/state/prefs/prefsRegistry.ts; una prueba comprueba que coinciden), límite de tamaño y de número de claves por persona.
--  · RLS «solo mis filas» (lectura). Sin políticas de escritura: nadie escribe directamente.
--  · Tiempo real: la tabla se añade a la publicación `supabase_realtime` (Postgres Changes respeta la RLS; el cliente filtra por su user_id).
--  · Compatibilidad: copia inicial desde `user_ui_prefs` (que NO se borra) y un disparador TEMPORAL que copia a `user_prefs` lo que suban versiones antiguas de la app
--    mientras sigan en la caché de algún dispositivo (retirar pasada una semana).
-- Deshacer: supabase/rollbacks/0305_user_prefs_down.sql (devuelve lo nuevo a user_ui_prefs antes de borrar nada).

create sequence if not exists public.user_prefs_rev_seq;

create table if not exists public.user_prefs (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  key        text        not null check (length(key) between 1 and 120),
  value      jsonb       not null check (jsonb_typeof(value) in ('string', 'null') and pg_column_size(value) <= 8192),
  rev        bigint      not null default nextval('public.user_prefs_rev_seq'),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index if not exists user_prefs_user_rev_idx on public.user_prefs (user_id, rev);

alter table public.user_prefs enable row level security;

drop policy if exists user_prefs_select_own on public.user_prefs;
create policy user_prefs_select_own on public.user_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Sin políticas de insertar/actualizar/borrar: solo se escribe con set_user_pref.
revoke all on public.user_prefs from anon, authenticated;
grant select on public.user_prefs to authenticated;
revoke all on sequence public.user_prefs_rev_seq from anon, authenticated;

-- Lista cerrada de claves aceptadas (debe coincidir con SYNCED_KEY_PATTERN_SOURCES de src/state/prefs/prefsRegistry.ts).
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

-- Comparar y cambiar. Devuelve (applied, rev, value): con applied = false, rev/value son los del cambio que ya estaba confirmado.
create or replace function public.set_user_pref(p_key text, p_value jsonb, p_base_rev bigint)
returns table (applied boolean, rev bigint, value jsonb)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_value jsonb := coalesce(p_value, 'null'::jsonb);
  v_row public.user_prefs%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if not private.user_pref_key_allowed(p_key) then
    raise exception 'INVALID_KEY' using errcode = '22023';
  end if;
  if jsonb_typeof(v_value) not in ('string', 'null') or pg_column_size(v_value) > 8192 or p_base_rev is null or p_base_rev < 0 then
    raise exception 'INVALID_VALUE' using errcode = '22023';
  end if;

  if p_base_rev = 0 then
    -- Primera vez que se guarda esta preferencia: límite de claves por persona.
    if not exists (select 1 from public.user_prefs u where u.user_id = v_uid and u.key = p_key)
       and (select count(*) from public.user_prefs u where u.user_id = v_uid) >= 200 then
      raise exception 'TOO_MANY_PREFS' using errcode = '22023';
    end if;
    insert into public.user_prefs (user_id, key, value) values (v_uid, p_key, v_value)
      on conflict (user_id, key) do nothing
      returning * into v_row;
  else
    update public.user_prefs u
       set value = v_value, rev = nextval('public.user_prefs_rev_seq'), updated_at = now()
     where u.user_id = v_uid and u.key = p_key and u.rev = p_base_rev
     returning * into v_row;
  end if;

  if found then
    return query select true, v_row.rev, v_row.value;
    return;
  end if;
  select * into v_row from public.user_prefs u where u.user_id = v_uid and u.key = p_key;
  return query select false, coalesce(v_row.rev, 0::bigint), coalesce(v_row.value, 'null'::jsonb);
end;
$function$;

revoke all on function public.set_user_pref(text, jsonb, bigint) from public, anon;
grant execute on function public.set_user_pref(text, jsonb, bigint) to authenticated;

-- BACKFILL START · copia inicial desde user_ui_prefs (no se borra nada; solo claves permitidas y de tamaño válido).
insert into public.user_prefs (user_id, key, value)
select u.user_id, e.key, to_jsonb(e.value)
  from public.user_ui_prefs u
 cross join lateral jsonb_each_text(coalesce(u.prefs, '{}'::jsonb)) as e(key, value)
 where private.user_pref_key_allowed(e.key) and e.value is not null and length(e.value) <= 8000
on conflict (user_id, key) do nothing;
-- BACKFILL END

-- TRANSICIÓN (temporal): lo que suban versiones antiguas de la app a user_ui_prefs se copia a user_prefs (solo las claves que CAMBIAN respecto a lo que
-- había en la fila antigua, para no reponer valores viejos). Retirar pasada una semana desde el despliegue.
create or replace function private.mirror_user_ui_prefs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  e record;
begin
  for e in select key, value from jsonb_each_text(coalesce(new.prefs, '{}'::jsonb)) loop
    if not private.user_pref_key_allowed(e.key) or e.value is null or length(e.value) > 8000 then
      continue;
    end if;
    if tg_op = 'UPDATE' and (old.prefs ->> e.key) is not distinct from e.value then
      continue;
    end if;
    insert into public.user_prefs (user_id, key, value) values (new.user_id, e.key, to_jsonb(e.value))
      on conflict (user_id, key) do update
        set value = excluded.value, rev = nextval('public.user_prefs_rev_seq'), updated_at = now()
        where public.user_prefs.value is distinct from excluded.value;
  end loop;
  return new;
end;
$function$;
revoke all on function private.mirror_user_ui_prefs() from public, anon, authenticated;

drop trigger if exists user_ui_prefs_mirror on public.user_ui_prefs;
create trigger user_ui_prefs_mirror
  after insert or update of prefs on public.user_ui_prefs
  for each row execute function private.mirror_user_ui_prefs();

-- Tiempo real (Postgres Changes). Solo si la publicación existe (en Supabase siempre existe).
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_prefs') then
    alter publication supabase_realtime add table public.user_prefs;
  end if;
end
$realtime$;
