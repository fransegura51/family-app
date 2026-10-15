-- Centro de avisos: historial de avisos dentro de la app (campana de Inicio), ajustes de avisos por persona (zona horaria, resumen diario,
-- franja de avisos personales) y envío de avisos dirigidos a UNA persona.
--
-- Hasta ahora los avisos solo existían como notificaciones del móvil: no había historial, ni contador de no leídos, ni ajustes por
-- usuario (el único ajuste vivía en localStorage de cada dispositivo). Esta migración añade solo cosas NUEVAS; no cambia ninguna tabla
-- ni función existente.
--
--  · user_notifications: un aviso por persona (profile_id). `bucket` separa «personal» de «other» (la campana los muestra en dos bloques
--    fijos). Leído/no leído (read_at) y borrado son de cada persona y se sincronizan entre sus dispositivos porque viven aquí.
--    Se conserva 30 días desde su creación y luego se borra solo, también los no leídos (purga diaria).
--  · notification_dedupe: memoria de qué avisos ya se crearon, SEPARADA del historial: si alguien borra un aviso, editar la tarea no lo
--    vuelve a crear. Se conserva 45 días.
--  · user_notification_prefs: zona horaria propia (por defecto Europe/Madrid para quien ya existe), resumen diario (hora y si está activo) y
--    franja de avisos personales de Comunidad. Una fila por persona, creada la primera vez que la guarda.
--  · user_push_outbox + private.notify_user: crear un aviso para una persona Y mandarle el push solo a ella. Mismo patrón que el buzón de
--    avisos de ubicación (0243): se apunta antes de enviarse y un trabajo de pg_cron reenvía los que fallan. El envío lo hace una función de
--    servidor NUEVA (send-user-push): mientras no esté desplegada, el push falla y se reintenta, pero NUNCA se manda a otras personas.
--
-- Seguridad: user_notifications solo se puede LEER, marcar como leída (únicamente read_at) y BORRAR por su dueño; nadie crea avisos desde la app:
-- solo las funciones SECURITY DEFINER de abajo (y record_notifications, solo service_role). Ninguna política permite ver avisos de otra persona.

-- ---------------------------------------------------------------------------------------------
-- Historial de avisos.
-- ---------------------------------------------------------------------------------------------
create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  bucket text not null check (bucket in ('personal', 'other')),
  category text not null check (char_length(category) between 1 and 60),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  -- Ruta de la app a la que lleva el aviso (siempre dentro de PEPA).
  url text check (url is null or (url like '/%' and url not like '//%' and char_length(url) <= 300)),
  -- Avisos agrupados («18 comentarios nuevos en 3 conversaciones»): mismo group_key = misma conversación/objeto.
  group_key text check (group_key is null or char_length(group_key) <= 120),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index idx_user_notifications_profile_created on public.user_notifications (profile_id, created_at desc);
create index idx_user_notifications_unread on public.user_notifications (profile_id) where read_at is null;
create index idx_user_notifications_created on public.user_notifications (created_at);

alter table public.user_notifications enable row level security;

create policy "user_notifications: select own" on public.user_notifications
  for select using (profile_id = (select auth.uid()));
create policy "user_notifications: update own" on public.user_notifications
  for update using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "user_notifications: delete own" on public.user_notifications
  for delete using (profile_id = (select auth.uid()));

-- Solo se puede cambiar read_at; el resto del aviso es inmutable para la app.
revoke all on public.user_notifications from anon, authenticated;
grant select, delete on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Memoria anti-repeticiones (independiente del historial). RLS activo SIN políticas.
-- ---------------------------------------------------------------------------------------------
create table public.notification_dedupe (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (profile_id, dedupe_key)
);
create index idx_notification_dedupe_created on public.notification_dedupe (created_at);
alter table public.notification_dedupe enable row level security;
revoke all on public.notification_dedupe from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ajustes de avisos por persona.
-- ---------------------------------------------------------------------------------------------
create table public.user_notification_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  timezone text not null default 'Europe/Madrid',
  daily_summary_enabled boolean not null default true,
  daily_summary_time time not null default '08:00',
  -- Avisos PERSONALES de Comunidad: a cualquier hora o solo dentro de una franja (COM-144). Las sugerencias generales de Pepa usan siempre 08:00-21:00.
  personal_community_mode text not null default 'any' check (personal_community_mode in ('any', 'window')),
  personal_window_start time not null default '08:00',
  personal_window_end time not null default '21:00',
  updated_at timestamptz not null default now()
);

alter table public.user_notification_prefs enable row level security;
create policy "user_notification_prefs: select own" on public.user_notification_prefs
  for select using (profile_id = (select auth.uid()));
create policy "user_notification_prefs: insert own" on public.user_notification_prefs
  for insert with check (profile_id = (select auth.uid()));
create policy "user_notification_prefs: update own" on public.user_notification_prefs
  for update using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
revoke all on public.user_notification_prefs from anon, authenticated;
grant select, insert, update on public.user_notification_prefs to authenticated;

-- Una zona horaria inventada rompería el cálculo de «las 08:00 de esta persona»: solo se aceptan nombres que conoce la base de datos.
create or replace function private.validate_notification_prefs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'zona horaria no válida: %', new.timezone using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.validate_notification_prefs() from public, anon, authenticated;

create trigger user_notification_prefs_validate
  before insert or update on public.user_notification_prefs
  for each row execute function private.validate_notification_prefs();

-- ---------------------------------------------------------------------------------------------
-- Buzón de push dirigido a UNA persona (mismo patrón que location_alert_outbox, 0243). RLS activo SIN políticas.
-- ---------------------------------------------------------------------------------------------
create table public.user_push_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  url text,
  tag text,
  -- Id del aviso del historial (user_notifications.id) al que corresponde este push. Viaja en la carga útil del push (clave «n») para que, al tocarlo, la
  -- app marque ESE aviso como leído (INC-06). Sin clave foránea a propósito: si la persona borra el aviso, el push pendiente se envía igual.
  notification_id uuid,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  request_id bigint,
  status_code integer,
  last_error text,
  delivered boolean not null default false
);
alter table public.user_push_outbox enable row level security;
revoke all on public.user_push_outbox from anon, authenticated;
create index idx_user_push_outbox_pending on public.user_push_outbox (created_at) where not delivered;

create or replace function private.dispatch_user_push(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.user_push_outbox%rowtype;
  v_request bigint;
begin
  select * into a from public.user_push_outbox where id = p_id;
  if not found or a.delivered then
    return;
  end if;

  v_request := net.http_post(
    url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/send-user-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
    ),
    body := jsonb_build_object('profile_id', a.profile_id, 'title', a.title, 'body', a.body, 'url', a.url, 'tag', a.tag, 'n', a.notification_id),
    timeout_milliseconds := 15000
  );

  update public.user_push_outbox
  set attempts = attempts + 1, last_attempt_at = now(), request_id = v_request
  where id = p_id;
end;
$$;
revoke execute on function private.dispatch_user_push(uuid) from public, anon, authenticated;

create or replace function private.retry_user_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  r record;
begin
  for a in
    select * from public.user_push_outbox
    where not delivered
      and last_attempt_at is not null
      and created_at > now() - interval '30 minutes'
    order by created_at
    limit 50
  loop
    select h.status_code, h.error_msg into r from net._http_response h where h.id = a.request_id;
    if found then
      if r.status_code between 200 and 299 then
        update public.user_push_outbox set delivered = true, status_code = r.status_code, last_error = null where id = a.id;
      else
        update public.user_push_outbox
        set status_code = r.status_code, last_error = left(coalesce(r.error_msg, 'respuesta ' || coalesce(r.status_code::text, 'sin código')), 300)
        where id = a.id;
        if a.attempts < 4 then
          perform private.dispatch_user_push(a.id);
        end if;
      end if;
    elsif a.last_attempt_at < now() - interval '2 minutes' and a.attempts < 4 then
      update public.user_push_outbox set last_error = 'sin respuesta' where id = a.id;
      perform private.dispatch_user_push(a.id);
    end if;
  end loop;

  delete from public.user_push_outbox where created_at < now() - interval '3 days';
exception when others then
  raise warning 'retry_user_push: %', sqlerrm;
end;
$$;
revoke execute on function private.retry_user_push() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Crear un aviso para una persona (y mandarle el push solo a ella). Devuelve el id, o null si ya se creó antes (dedupe_key) o la persona no existe.
-- Nunca lanza error por el push: quien la llama (un trigger, un trabajo programado) no debe fallar por no poder avisar.
-- ---------------------------------------------------------------------------------------------
create or replace function private.notify_user(
  p_profile uuid,
  p_bucket text,
  p_category text,
  p_title text,
  p_body text,
  p_url text default null,
  p_group_key text default null,
  p_dedupe_key text default null,
  p_push boolean default true,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_id uuid;
  v_inserted integer;
  v_outbox uuid;
begin
  select p.family_id into v_family from public.profiles p where p.id = p_profile;
  if not found then
    return null;
  end if;

  if p_dedupe_key is not null then
    insert into public.notification_dedupe (profile_id, dedupe_key) values (p_profile, p_dedupe_key) on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      return null;
    end if;
  end if;

  insert into public.user_notifications (profile_id, family_id, bucket, category, title, body, url, group_key, payload)
  values (p_profile, v_family, p_bucket, p_category, left(p_title, 200), left(coalesce(p_body, ''), 1000), p_url, p_group_key, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  if p_push then
    begin
      insert into public.user_push_outbox (profile_id, title, body, url, tag, notification_id)
      values (p_profile, left(p_title, 120), left(coalesce(p_body, ''), 300), p_url, p_dedupe_key, v_id)
      returning id into v_outbox;
      perform private.dispatch_user_push(v_outbox);
    exception when others then
      raise warning 'notify_user push: %', sqlerrm;
    end;
  end if;

  return v_id;
end;
$$;
revoke execute on function private.notify_user(uuid, text, text, text, text, text, text, text, boolean, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Para las funciones de servidor que ya mandan el push por su cuenta (recordatorios, previsión de pagos): solo anotan el aviso en el
-- historial de cada persona. Solo service_role. Items: [{profile_id, bucket, category, title, body, url, group_key, dedupe_key}].
-- Devuelve los avisos CREADOS: [{profile_id, dedupe_key, id}] (los repetidos, por su dedupe_key, no aparecen). La función de servidor usa ese id como
-- clave «n» del push, para que al tocarlo la app marque el aviso como leído (INC-06).
-- ---------------------------------------------------------------------------------------------
create or replace function public.record_notifications(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  v_created jsonb := '[]'::jsonb;
  v_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return v_created;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    begin
      v_id := private.notify_user(
        (it ->> 'profile_id')::uuid,
        coalesce(it ->> 'bucket', 'other'),
        it ->> 'category',
        it ->> 'title',
        coalesce(it ->> 'body', ''),
        it ->> 'url',
        it ->> 'group_key',
        it ->> 'dedupe_key',
        false,
        coalesce(it -> 'payload', '{}'::jsonb)
      );
      if v_id is not null then
        v_created := v_created || jsonb_build_array(jsonb_build_object('profile_id', it ->> 'profile_id', 'dedupe_key', it ->> 'dedupe_key', 'id', v_id));
      end if;
    exception when others then
      raise warning 'record_notifications: %', sqlerrm;
    end;
  end loop;
  return v_created;
end;
$$;
revoke all on function public.record_notifications(jsonb) from public, anon, authenticated;
grant execute on function public.record_notifications(jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Limpieza diaria: avisos de más de 30 días (también los no leídos) y memoria anti-repeticiones de más de 45.
-- Es independiente de cualquier historial de moderación o administración: aquí solo se tocan estas dos tablas.
-- ---------------------------------------------------------------------------------------------
create or replace function private.purge_old_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_notifications where created_at < now() - interval '30 days';
  delete from public.notification_dedupe where created_at < now() - interval '45 days';
exception when others then
  raise warning 'purge_old_notifications: %', sqlerrm;
end;
$$;
revoke execute on function private.purge_old_notifications() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-old-notifications') then
    perform cron.unschedule('purge-old-notifications');
  end if;
  perform cron.schedule('purge-old-notifications', '40 3 * * *', 'select private.purge_old_notifications()');

  if exists (select 1 from cron.job where jobname = 'retry-user-push') then
    perform cron.unschedule('retry-user-push');
  end if;
  perform cron.schedule('retry-user-push', '* * * * *', 'select private.retry_user_push()');
end $$;
