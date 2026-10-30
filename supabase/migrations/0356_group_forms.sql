-- 0356 · «Solicitar datos» (Gestión de grupos): formularios personalizables que se responden SIN cuenta PEPA, con datos delicados protegidos y con caducidad.
--
-- Principios:
--  · Quien solicita los datos (persona u organización, grupo, finalidad y contacto para consultas) es la identidad del formulario; PEPA solo aparece discretamente en el pie.
--  · Cada persona recibe su enlace personal (token secreto, revocable): así se sabe quién ha respondido y quién falta. Hay además un enlace general (la persona escribe el nombre del alumno
--    y la respuesta queda «por revisar»: nunca se aplica sola).
--  · Las respuestas ordinarias viven en `group_form_responses.answers`. Los DATOS DELICADOS (preguntas marcadas como tales: DNI, pasaporte, salud…) viven en `group_form_sensitive`, una tabla
--    SIN ninguna política de lectura: solo se leen con la función `read_form_sensitive`, que exige ser quien creó el formulario y deja constancia en `group_form_access_log`. Nunca van a las
--    notas ni a las exportaciones ordinarias.
--  · Caducidad: quien organiza fija la fecha MÁXIMA de conservación; quien responde puede elegir una anterior; ambos conocen la fecha exacta. Al vencer se eliminan los datos y sus archivos
--    (función `purge-group-form-data`, diaria). Se puede pedir la eliminación anticipada (queda pendiente de que quien organiza la ejecute o explique la excepción legal).
--  · Los cambios de la ficha de un participante que propone una respuesta (teléfono, correo, madre/padre, apellidos) solo se aplican solos si el campo estaba VACÍO; si había otro valor, queda
--    pendiente de confirmar. Las notas manuales nunca se sobrescriben.
-- Deshacer: supabase/rollbacks/0356_group_forms_down.sql

-- Las notas de una ficha admiten ahora más texto (respuestas organizadas de formularios, con referencia al origen).
alter table public.group_participants drop constraint if exists group_participants_notes_check;
alter table public.group_participants add constraint group_participants_notes_check check (notes is null or length(notes) <= 2000);

-- ---------------------------------------------------------------------------------------------------------- tablas
create table public.group_forms (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  requester_name text not null check (length(btrim(requester_name)) between 1 and 120),
  requester_contact text check (requester_contact is null or length(requester_contact) <= 200),
  purpose text not null check (length(btrim(purpose)) between 1 and 500),
  intro text check (intro is null or length(intro) <= 1000),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 40),
  status text not null default 'borrador' check (status in ('borrador', 'abierto', 'cerrado')),
  deadline date,
  retention_max date, -- fecha máxima de conservación de los datos delicados (obligatoria si hay preguntas delicadas al publicar)
  retention_history jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_group_forms_group on public.group_forms (group_id);

create table public.group_form_recipients (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.group_forms (id) on delete cascade,
  participant_id uuid references public.group_participants (id) on delete cascade, -- null = enlace general
  kind text not null check (kind in ('participante', 'general')),
  token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_gfr_form on public.group_form_recipients (form_id);
create unique index uq_gfr_participant on public.group_form_recipients (form_id, participant_id) where participant_id is not null;
create unique index uq_gfr_general on public.group_form_recipients (form_id) where kind = 'general';

create table public.group_form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.group_forms (id) on delete cascade,
  recipient_id uuid not null references public.group_form_recipients (id) on delete cascade,
  participant_id uuid references public.group_participants (id) on delete set null,
  claimed_name text check (claimed_name is null or length(claimed_name) <= 160), -- enlace general: nombre que escribió quien respondió
  status text not null default 'recibida' check (status in ('recibida', 'revisar')),
  answers jsonb not null default '{}'::jsonb,
  proposals jsonb not null default '[]'::jsonb, -- [{field, value, current, status: aplicado|igual|conflicto|ignorado}]
  retention_max_at_answer date, -- la fecha máxima vigente cuando respondió (para avisar si luego cambia)
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_gfresp_form on public.group_form_responses (form_id);
create index idx_gfresp_participant on public.group_form_responses (participant_id) where participant_id is not null;
create unique index uq_gfresp_personal on public.group_form_responses (recipient_id) where claimed_name is null;

-- DATOS DELICADOS: sin ninguna política (nadie los lee con la API normal); solo funciones concretas.
create table public.group_form_sensitive (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.group_form_responses (id) on delete cascade,
  form_id uuid not null references public.group_forms (id) on delete cascade,
  field_id text not null,
  value jsonb not null, -- texto, número, fecha… o lista de rutas de archivos del bucket privado
  expires_at date not null,
  chosen_date date, -- la fecha anterior que eligió quien respondió (si la eligió)
  created_at timestamptz not null default now(),
  unique (response_id, field_id)
);
create index idx_gfs_expiry on public.group_form_sensitive (expires_at);

create table public.group_form_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.group_form_responses (id) on delete cascade,
  form_id uuid not null references public.group_forms (id) on delete cascade,
  reason text check (reason is null or length(reason) <= 500),
  status text not null default 'pendiente' check (status in ('pendiente', 'eliminado', 'conservado')),
  legal_reason text check (legal_reason is null or length(legal_reason) <= 500), -- si se conserva: la excepción legal que se aplica (la ve quien lo pidió)
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
create index idx_gfdr_form on public.group_form_deletion_requests (form_id);

create table public.group_form_access_log (
  id bigint generated always as identity primary key,
  form_id uuid not null references public.group_forms (id) on delete cascade,
  response_id uuid references public.group_form_responses (id) on delete set null,
  actor_id uuid default auth.uid(),
  action text not null,
  at timestamptz not null default now()
);
create index idx_gfal_form on public.group_form_access_log (form_id, at desc);

create table public.group_form_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  definition jsonb not null, -- {title, purpose, intro, fields[]}; nunca datos de personas
  created_at timestamptz not null default now()
);
create index idx_gft_owner on public.group_form_templates (owner_id);

-- ---------------------------------------------------------------------------------------------------------- acceso
create or replace function private.form_can(p_form uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from group_forms f where f.id = p_form and private.group_can(f.group_id))
$$;
revoke execute on function private.form_can(uuid) from public, anon;
grant execute on function private.form_can(uuid) to authenticated;

create or replace function private.form_is_creator(p_form uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from group_forms f where f.id = p_form and f.created_by = auth.uid() and private.group_can(f.group_id))
$$;
revoke execute on function private.form_is_creator(uuid) from public, anon;
grant execute on function private.form_is_creator(uuid) to authenticated;

alter table public.group_forms enable row level security;
alter table public.group_form_recipients enable row level security;
alter table public.group_form_responses enable row level security;
alter table public.group_form_sensitive enable row level security;
alter table public.group_form_deletion_requests enable row level security;
alter table public.group_form_access_log enable row level security;
alter table public.group_form_templates enable row level security;

create policy "gforms: select" on public.group_forms for select using (private.group_can(group_id));
create policy "gforms: insert" on public.group_forms for insert with check (private.group_can(group_id) and created_by = (select auth.uid()) and status = 'borrador');
create policy "gforms: update" on public.group_forms for update using (private.group_can(group_id)) with check (private.group_can(group_id));
-- Un formulario con respuestas no se borra: se cierra. Sin respuestas, se puede borrar.
create policy "gforms: delete" on public.group_forms for delete using (private.group_can(group_id) and not exists (select 1 from group_form_responses r where r.form_id = group_forms.id));

create policy "gfr: select" on public.group_form_recipients for select using (private.form_can(form_id));
create policy "gfresp: select" on public.group_form_responses for select using (private.form_can(form_id));
create policy "gfdr: select" on public.group_form_deletion_requests for select using (private.form_can(form_id));
create policy "gfal: select" on public.group_form_access_log for select using (private.form_is_creator(form_id));
create policy "gft: mine" on public.group_form_templates for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- group_form_sensitive: SIN políticas a propósito.

revoke all on public.group_forms, public.group_form_recipients, public.group_form_responses, public.group_form_sensitive, public.group_form_deletion_requests,
  public.group_form_access_log, public.group_form_templates from anon;
revoke insert, update, delete, truncate on public.group_form_recipients, public.group_form_responses, public.group_form_deletion_requests, public.group_form_access_log from authenticated;
revoke all on public.group_form_sensitive from authenticated;
-- Solo estos campos del formulario se cambian directamente; el estado, las fechas de conservación y la autoría pasan por funciones.
revoke update on public.group_forms from authenticated;
grant update (title, requester_name, requester_contact, purpose, intro, fields, deadline) on public.group_forms to authenticated;

create or replace function private.group_forms_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_group_forms_touch before update on public.group_forms for each row execute function private.group_forms_touch();

-- ---------------------------------------------------------------------------------------------------------- funciones
create or replace function private.form_has_sensitive(p_fields jsonb)
returns boolean
language sql
immutable
as $$
  select exists (select 1 from jsonb_array_elements(p_fields) f where coalesce((f ->> 'sensitive')::boolean, false))
$$;

-- Publica el formulario: crea el enlace personal de cada persona elegida y el enlace general, y lo abre.
create or replace function public.publish_group_form(p_form uuid, p_participants uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f group_forms%rowtype;
  v_new int := 0;
  v_token text;
  r record;
begin
  select * into f from group_forms where id = p_form;
  if not found or not private.group_can(f.group_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if f.status = 'cerrado' then raise exception 'FORM_CLOSED' using errcode = '22023'; end if;
  if jsonb_array_length(f.fields) = 0 then raise exception 'FORM_EMPTY' using errcode = '22023'; end if;
  if private.form_has_sensitive(f.fields) and (f.retention_max is null or f.retention_max <= current_date or f.retention_max > current_date + 400) then
    raise exception 'RETENTION_REQUIRED' using errcode = '22023';
  end if;
  for r in select p.id from group_participants p where p.group_id = f.group_id and p.id = any (coalesce(p_participants, '{}')) and p.left_at is null
           and not exists (select 1 from group_form_recipients x where x.form_id = p_form and x.participant_id = p.id) loop
    v_token := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_');
    insert into group_form_recipients (form_id, participant_id, kind, token) values (p_form, r.id, 'participante', v_token);
    v_new := v_new + 1;
  end loop;
  if not exists (select 1 from group_form_recipients x where x.form_id = p_form and x.kind = 'general') then
    insert into group_form_recipients (form_id, kind, token) values (p_form, 'general', translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_'));
  end if;
  update group_forms set status = 'abierto', published_at = coalesce(published_at, now()) where id = p_form;
  insert into group_audit (group_id, actor_id, action, entity, entity_id, detail) values (f.group_id, auth.uid(), 'publish', 'form', p_form::text, jsonb_build_object('recipients', v_new));
  return jsonb_build_object('created', v_new);
end;
$$;
revoke all on function public.publish_group_form(uuid, uuid[]) from public, anon;
grant execute on function public.publish_group_form(uuid, uuid[]) to authenticated;

create or replace function public.set_group_form_status(p_form uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('abierto', 'cerrado') then raise exception 'INVALID_VALUE' using errcode = '22023'; end if;
  if not private.form_can(p_form) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  update group_forms set status = p_status, closed_at = case when p_status = 'cerrado' then now() else null end where id = p_form and status <> 'borrador';
end;
$$;
revoke all on function public.set_group_form_status(uuid, text) from public, anon;
grant execute on function public.set_group_form_status(uuid, text) to authenticated;

create or replace function public.set_form_recipient_active(p_recipient uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update group_form_recipients set active = coalesce(p_active, true) where id = p_recipient and private.form_can(form_id);
end;
$$;
revoke all on function public.set_form_recipient_active(uuid, boolean) from public, anon;
grant execute on function public.set_form_recipient_active(uuid, boolean) to authenticated;

-- Fecha máxima de conservación (solo quien creó el formulario). Acortar se aplica ya a los datos existentes; alargar NO se aplica a lo ya recogido (cada persona aceptó su fecha).
create or replace function public.set_form_retention(p_form uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f group_forms%rowtype;
  v_short int;
begin
  select * into f from group_forms where id = p_form;
  if not found or f.created_by <> auth.uid() or not private.group_can(f.group_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_date is null or p_date <= current_date or p_date > current_date + 400 then raise exception 'RETENTION_REQUIRED' using errcode = '22023'; end if;
  update group_forms set retention_max = p_date,
    retention_history = retention_history || jsonb_build_array(jsonb_build_object('at', now(), 'from', f.retention_max, 'to', p_date)) where id = p_form;
  update group_form_sensitive set expires_at = p_date where form_id = p_form and expires_at > p_date;
  get diagnostics v_short = row_count;
  insert into group_audit (group_id, actor_id, action, entity, entity_id, detail)
  values (f.group_id, auth.uid(), 'update', 'form_retention', p_form::text, jsonb_build_object('from', f.retention_max, 'to', p_date, 'shortened', v_short));
  return jsonb_build_object('shortened', v_short);
end;
$$;
revoke all on function public.set_form_retention(uuid, date) from public, anon;
grant execute on function public.set_form_retention(uuid, date) to authenticated;

-- Qué datos delicados hay y hasta cuándo (SIN el contenido): lo ven todos los responsables.
create or replace function public.form_sensitive_overview(p_form uuid)
returns table (response_id uuid, field_id text, expires_at date)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not private.form_can(p_form) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  return query select s.response_id, s.field_id, s.expires_at from group_form_sensitive s where s.form_id = p_form;
end;
$$;
revoke all on function public.form_sensitive_overview(uuid) from public, anon;
grant execute on function public.form_sensitive_overview(uuid) to authenticated;

-- El CONTENIDO de los datos delicados de una respuesta: solo quien creó el formulario, y queda registrado.
create or replace function public.read_form_sensitive(p_response uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form uuid;
  v_out jsonb;
begin
  select form_id into v_form from group_form_responses where id = p_response;
  if v_form is null or not private.form_is_creator(v_form) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('fieldId', field_id, 'value', value, 'expiresAt', expires_at) order by created_at), '[]'::jsonb) into v_out
    from group_form_sensitive where response_id = p_response and expires_at >= current_date;
  insert into group_form_access_log (form_id, response_id, action) values (v_form, p_response, 'read');
  return v_out;
end;
$$;
revoke all on function public.read_form_sensitive(uuid) from public, anon;
grant execute on function public.read_form_sensitive(uuid) to authenticated;

-- Quien creó el formulario atiende una petición de eliminación anticipada: la ejecuta, o la conserva explicando la excepción legal (que verá quien la pidió).
create or replace function public.resolve_form_deletion(p_request uuid, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  q group_form_deletion_requests%rowtype;
begin
  select * into q from group_form_deletion_requests where id = p_request and status = 'pendiente';
  if not found or not private.form_is_creator(q.form_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_action = 'eliminar' then
    -- Se marcan como caducados; la función de limpieza borra también los archivos (la app la lanza justo después).
    update group_form_sensitive set expires_at = current_date - 1 where response_id = q.response_id;
    update group_form_deletion_requests set status = 'eliminado', resolved_at = now(), resolved_by = auth.uid() where id = p_request;
  elsif p_action = 'conservar' then
    if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'LEGAL_REASON_REQUIRED' using errcode = '22023'; end if;
    update group_form_deletion_requests set status = 'conservado', legal_reason = left(btrim(p_reason), 500), resolved_at = now(), resolved_by = auth.uid() where id = p_request;
  else
    raise exception 'INVALID_VALUE' using errcode = '22023';
  end if;
  insert into group_form_access_log (form_id, response_id, action) values (q.form_id, q.response_id, 'deletion_' || p_action);
end;
$$;
revoke all on function public.resolve_form_deletion(uuid, text, text) from public, anon;
grant execute on function public.resolve_form_deletion(uuid, text, text) to authenticated;

-- Confirma (o descarta) un cambio propuesto para la ficha de la persona. Solo toca el campo propuesto.
create or replace function public.resolve_form_proposal(p_response uuid, p_field text, p_apply boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r group_form_responses%rowtype;
  prop jsonb;
  v_value text;
  v_new jsonb := '[]'::jsonb;
  item jsonb;
begin
  select * into r from group_form_responses where id = p_response;
  if not found or not private.form_can(r.form_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_field not in ('surname', 'guardianName', 'phone', 'email') then raise exception 'INVALID_VALUE' using errcode = '22023'; end if;
  for item in select * from jsonb_array_elements(r.proposals) loop
    if item ->> 'field' = p_field and item ->> 'status' = 'conflicto' then
      v_value := item ->> 'value';
      if coalesce(p_apply, false) then
        if r.participant_id is null then raise exception 'PARTICIPANT_REQUIRED' using errcode = '22023'; end if;
        update group_participants set
          surname = case when p_field = 'surname' then left(v_value, 120) else surname end,
          guardian_name = case when p_field = 'guardianName' then left(v_value, 120) else guardian_name end,
          phone = case when p_field = 'phone' then left(v_value, 30) else phone end,
          email = case when p_field = 'email' then left(v_value, 160) else email end
        where id = r.participant_id;
        item := jsonb_set(item, '{status}', '"aplicado"');
      else
        item := jsonb_set(item, '{status}', '"ignorado"');
      end if;
    end if;
    v_new := v_new || jsonb_build_array(item);
  end loop;
  update group_form_responses set proposals = v_new where id = p_response;
end;
$$;
revoke all on function public.resolve_form_proposal(uuid, text, boolean) from public, anon;
grant execute on function public.resolve_form_proposal(uuid, text, boolean) to authenticated;

-- Una respuesta del enlace general queda «por revisar» hasta que quien organiza dice a qué persona corresponde.
create or replace function public.assign_form_response(p_response uuid, p_participant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r group_form_responses%rowtype;
begin
  select * into r from group_form_responses where id = p_response;
  if not found or not private.form_can(r.form_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if not exists (select 1 from group_participants p join group_forms f on f.group_id = p.group_id where p.id = p_participant and f.id = r.form_id) then
    raise exception 'INVALID_VALUE' using errcode = '22023';
  end if;
  update group_form_responses set participant_id = p_participant, status = 'recibida' where id = p_response;
end;
$$;
revoke all on function public.assign_form_response(uuid, uuid) from public, anon;
grant execute on function public.assign_form_response(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------- archivos adjuntos (bucket privado)
insert into storage.buckets (id, name, public) values ('group-form-files', 'group-form-files', false) on conflict (id) do nothing;
-- Lectura de un archivo: quien gestiona el grupo si la pregunta NO es delicada; si es delicada, solo quien creó el formulario. La subida y el borrado los hace la función del servidor.
create or replace function private.form_file_ok(p_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_form uuid;
  v_field text;
  f group_forms%rowtype;
  v_sensitive boolean;
begin
  if p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9_]{1,40}-[0-9a-f-]{36}\.[a-z0-9]{2,5}$' then return false; end if;
  v_form := split_part(p_name, '/', 1)::uuid;
  v_field := regexp_replace(split_part(p_name, '/', 3), '-[0-9a-f-]{36}\.[a-z0-9]+$', '');
  select * into f from group_forms where id = v_form;
  if not found or not private.group_can(f.group_id) then return false; end if;
  select coalesce((x ->> 'sensitive')::boolean, false) into v_sensitive from jsonb_array_elements(f.fields) x where x ->> 'id' = v_field limit 1;
  return not coalesce(v_sensitive, false) or f.created_by = auth.uid();
end;
$$;
revoke execute on function private.form_file_ok(text) from public, anon;
grant execute on function private.form_file_ok(text) to authenticated;
create policy "group_form_files: read" on storage.objects for select to authenticated
  using (bucket_id = 'group-form-files' and private.form_file_ok(name));

-- ---------------------------------------------------------------------------------------------------------- IA de WhatsApp (registro en el Centro de IA) y tiempo real
insert into public.ai_function (purpose, label, module, description, origin, needs, sort) values
  ('analyze-whatsapp-contacts', 'Importar contactos desde capturas de WhatsApp', 'otros', 'Lee capturas de WhatsApp (lista de participantes de un grupo) y propone contactos: nombre de WhatsApp y teléfono visibles.', 'family', '{global}', 31)
on conflict (purpose) do nothing;

do $realtime$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['group_forms', 'group_form_recipients', 'group_form_responses', 'group_form_deletion_requests'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$realtime$;

-- Limpieza diaria de los datos delicados caducados (y sus archivos), con el mismo mecanismo que el resto de tareas programadas.
select cron.schedule(
  'purge-group-form-data-daily',
  '30 4 * * *',
  $$
  select net.http_post(
    url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/purge-group-form-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
    ),
    body := '{}'::jsonb
  );
  $$
);
