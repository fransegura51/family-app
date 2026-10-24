-- 0310 · Soporte técnico de «Pepa te acompaña»: incidencias con conversación propia, adjuntos privados, historial y avisos.
--
-- PENDIENTE DE REVISIÓN Y AUTORIZACIÓN (no aplicada en producción). Reversión: supabase/rollbacks/0310_support_tickets_down.sql.
-- La web trae todo el soporte APAGADO (src/support/flags.ts → SUPPORT_ENABLED = false): hasta que esto se revise, se aplique y se encienda el interruptor, nadie ve ningún botón.
--
-- Diseño (por qué así):
--  · Cada incidencia tiene SU hilo (support_tickets → support_messages). Es un sistema aparte del Buzón de sugerencias (que es una petición con una sola nota) y del Centro de avisos
--    (que borra a los 30 días y solo es un puntero): los avisos llevan a la incidencia, pero el contenido vive aquí.
--  · Nadie escribe directamente en estas tablas: solo las funciones de abajo (SECURITY DEFINER, search_path vacío), que validan longitudes, límites diarios y pertenencia. Las
--    políticas RLS solo dan LECTURA: cada persona ve sus incidencias; las notas internas y los datos de gestión solo los ve la administración de PEPA (profiles.is_app_owner, NO el rol
--    «admin» de una familia).
--  · Mensajes con autor tipificado ('user' | 'admin' | 'ai' | 'system') y `responder`/`meta` abiertos: así un agente de IA futuro escribe en el MISMO hilo sin cambiar el modelo. Ahora
--    ninguna función permite crear mensajes 'ai' ni hay endpoints de IA: el motor y las fuentes de conocimiento son interfaces de la web (src/support/responder.ts), sin proveedor.
--  · Minimización: el contexto técnico es una lista BLANCA de claves cortas (versión, navegador, sistema, tipo de dispositivo, sección, identificador de error…). Cualquier otra
--    clave se descarta en el servidor.
--  · Adjuntos en el bucket privado «support-attachments», ruta <family_id>/support/<incidencia>/<uuid>.<ext>: al borrar una familia, delete-account ya borra todo lo que cuelga de su
--    carpeta (family_storage_paths). Solo se pueden LEER los adjuntos propios (o todos, siendo administración de PEPA); una persona de la misma familia no ve los de otra.

-- ======================================================================================================================== tablas
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null check (kind in ('tecnico', 'error', 'resultado_incorrecto', 'clasificacion', 'sincronizacion', 'otra')),
  section text not null default 'otra' check (section ~ '^[a-z0-9-]{1,40}$'),
  subject text not null check (char_length(subject) between 3 and 120),
  status text not null default 'recibida' check (status in ('recibida', 'en_revision', 'esperando_usuario', 'resuelta', 'cerrada')),
  priority text not null default 'normal' check (priority in ('baja', 'normal', 'alta')),
  assignee_id uuid references public.profiles(id) on delete set null,
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 2000),
  duplicate_of uuid references public.support_tickets(id) on delete set null,
  user_unread boolean not null default false,
  admin_unread boolean not null default true,
  message_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  first_admin_reply_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz
);
create index idx_support_tickets_requester on public.support_tickets (requester_id, last_message_at desc);
create index idx_support_tickets_status on public.support_tickets (status, last_message_at desc);
create index idx_support_tickets_section on public.support_tickets (section, kind, created_at desc);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_kind text not null check (author_kind in ('user', 'admin', 'ai', 'system')),
  author_id uuid references public.profiles(id) on delete set null,
  visibility text not null default 'public' check (visibility in ('public', 'internal')),
  body text not null check (char_length(body) between 1 and 4000),
  -- Quién/qué respondió: 'human' hoy; un motor futuro dirá cuál (p. ej. 'ai:nombre-del-motor') sin cambiar el esquema.
  responder text not null default 'human' check (responder ~ '^[a-z0-9:_.-]{1,40}$'),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 4000),
  created_at timestamptz not null default now(),
  -- Lo que escribe la persona usuaria siempre es visible para ella; las notas internas solo pueden ser de la administración o del sistema.
  constraint support_user_messages_are_public check (author_kind <> 'user' or visibility = 'public')
);
create index idx_support_messages_ticket on public.support_messages (ticket_id, created_at);

create table public.support_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid not null references public.support_messages(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 20 and 300),
  file_name text not null check (char_length(file_name) between 1 and 120),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain')),
  size_bytes int not null check (size_bytes between 1 and 5242880),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_support_attachments_ticket on public.support_attachments (ticket_id);

create table public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('user', 'admin', 'ai', 'system')),
  actor_id uuid references public.profiles(id) on delete set null,
  event text not null check (event in ('created', 'message', 'status_changed', 'assigned', 'priority_changed', 'reopened', 'resolution_confirmed', 'resolution_denied', 'attachment_added', 'note_added')),
  from_value text,
  to_value text,
  -- Lo que ve la persona usuaria en su historial: los cambios de estado y mensajes, no la gestión interna (asignación, prioridad, notas).
  visible_to_user boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_support_events_ticket on public.support_ticket_events (ticket_id, created_at);

-- ======================================================================================================================== RLS: solo lectura
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_attachments enable row level security;
alter table public.support_ticket_events enable row level security;
revoke all on public.support_tickets, public.support_messages, public.support_attachments, public.support_ticket_events from anon, authenticated;
grant select on public.support_tickets, public.support_messages, public.support_attachments, public.support_ticket_events to authenticated;

create policy "support_tickets: cada persona ve las suyas, la administración de PEPA todas" on public.support_tickets
  for select to authenticated
  using (requester_id = (select auth.uid()) or (select public.am_i_app_owner()));

create policy "support_messages: lo visible de mis incidencias; la administración todo" on public.support_messages
  for select to authenticated
  using (
    (select public.am_i_app_owner())
    or (visibility = 'public' and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.requester_id = (select auth.uid())))
  );

create policy "support_attachments: los de mis incidencias; la administración todos" on public.support_attachments
  for select to authenticated
  using (
    (select public.am_i_app_owner())
    or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.requester_id = (select auth.uid()))
  );

create policy "support_ticket_events: el historial visible de mis incidencias; la administración todo" on public.support_ticket_events
  for select to authenticated
  using (
    (select public.am_i_app_owner())
    or (visible_to_user and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.requester_id = (select auth.uid())))
  );

-- ======================================================================================================================== ayudas privadas
-- Lista blanca de contexto técnico: solo estas claves, solo texto/número/booleano, máximo 80 caracteres cada una.
create or replace function private.support_clean_context(p_ctx jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_object_agg(x.k, to_jsonb(left(x.v, 80)))
       from (
         select e.key as k, e.value #>> '{}' as v
           from jsonb_each(case when jsonb_typeof(p_ctx) = 'object' then p_ctx else '{}'::jsonb end) e
          where e.key = any (array['app_version', 'platform', 'mode', 'os', 'browser', 'device', 'section', 'error_id', 'locale', 'viewport'])
            and jsonb_typeof(e.value) in ('string', 'number', 'boolean')
       ) x
      where x.v is not null),
    '{}'::jsonb)
$$;

-- Avisa a las administradoras de PEPA (bucle sobre is_app_owner, como el aviso de reseñas de 1-2 estrellas). Un fallo del aviso nunca debe romper la incidencia.
create or replace function private.support_notify_owners(p_title text, p_body text, p_ticket uuid, p_dedupe text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  for o in select p.id from public.profiles p where p.is_app_owner loop
    begin
      perform private.notify_user(o.id, 'other', 'support_admin', left(p_title, 190), left(p_body, 900), '/administracion?area=sistema&soporte=' || p_ticket::text, 'support:' || p_ticket::text, p_dedupe || ':' || o.id::text, true, jsonb_build_object('ticket', p_ticket));
    exception when others then
      raise warning 'support_notify_owners: %', sqlerrm;
    end;
  end loop;
end;
$$;

create or replace function private.support_notify_requester(p_requester uuid, p_title text, p_body text, p_ticket uuid, p_dedupe text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_user(p_requester, 'personal', 'support_user', left(p_title, 190), left(p_body, 900), '/ayuda?soporte=' || p_ticket::text, 'support:' || p_ticket::text, p_dedupe || ':' || p_requester::text, true, jsonb_build_object('ticket', p_ticket));
exception when others then
  raise warning 'support_notify_requester: %', sqlerrm;
end;
$$;

create or replace function private.support_event(p_ticket uuid, p_actor_kind text, p_actor uuid, p_event text, p_from text, p_to text, p_visible boolean default true)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.support_ticket_events (ticket_id, actor_kind, actor_id, event, from_value, to_value, visible_to_user) values (p_ticket, p_actor_kind, p_actor, p_event, p_from, p_to, p_visible)
$$;

create or replace function private.support_require_owner()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.am_i_app_owner() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.support_clean_context(jsonb), private.support_notify_owners(text, text, uuid, text), private.support_notify_requester(uuid, text, text, uuid, text),
  private.support_event(uuid, text, uuid, text, text, text, boolean), private.support_require_owner() from public, anon, authenticated;

-- ======================================================================================================================== funciones de la persona usuaria
create or replace function public.support_create_ticket(p_kind text, p_section text, p_subject text, p_body text, p_context jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_name text;
  v_id uuid;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_uid is null then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select p.family_id, p.display_name into v_family, v_name from public.profiles p where p.id = v_uid;
  if v_family is null then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('tecnico', 'error', 'resultado_incorrecto', 'clasificacion', 'sincronizacion', 'otra') then raise exception 'INVALID_KIND' using errcode = 'P0001'; end if;
  if p_section is null or p_section !~ '^[a-z0-9-]{1,40}$' then raise exception 'INVALID_SECTION' using errcode = 'P0001'; end if;
  if char_length(v_subject) not between 3 and 120 then raise exception 'INVALID_SUBJECT' using errcode = 'P0001'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'INVALID_BODY' using errcode = 'P0001'; end if;
  if (select count(*) from public.support_tickets t where t.requester_id = v_uid and t.created_at > now() - interval '24 hours') >= 5 then raise exception 'RATE_LIMIT' using errcode = 'P0001'; end if;

  insert into public.support_tickets (requester_id, family_id, kind, section, subject, context, message_count)
  values (v_uid, v_family, p_kind, p_section, v_subject, private.support_clean_context(p_context), 1)
  returning id into v_id;
  insert into public.support_messages (ticket_id, author_kind, author_id, body) values (v_id, 'user', v_uid, v_body);
  perform private.support_event(v_id, 'user', v_uid, 'created', null, 'recibida');
  perform private.support_notify_owners('Nueva incidencia de soporte', coalesce(v_name, 'Alguien') || ': ' || v_subject, v_id, 'support-new:' || v_id::text);
  return v_id;
end;
$$;

create or replace function public.support_post_message(p_ticket uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.support_tickets%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_msg uuid;
  v_new text;
begin
  if v_uid is null then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select * into t from public.support_tickets x where x.id = p_ticket and x.requester_id = v_uid for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'INVALID_BODY' using errcode = 'P0001'; end if;
  if (select count(*) from public.support_messages m where m.ticket_id = p_ticket and m.author_kind = 'user' and m.created_at > now() - interval '24 hours') >= 30 then raise exception 'RATE_LIMIT' using errcode = 'P0001'; end if;

  insert into public.support_messages (ticket_id, author_kind, author_id, body) values (p_ticket, 'user', v_uid, v_body) returning id into v_msg;
  v_new := case when t.status in ('resuelta', 'cerrada', 'esperando_usuario') then 'en_revision' else t.status end;
  update public.support_tickets
     set status = v_new, message_count = message_count + 1, last_message_at = now(), updated_at = now(), admin_unread = true, user_unread = false,
         resolved_at = case when t.status = 'resuelta' then null else resolved_at end,
         closed_at = case when t.status = 'cerrada' then null else closed_at end
   where id = p_ticket;
  if v_new <> t.status then
    perform private.support_event(p_ticket, 'user', v_uid, case when t.status in ('resuelta', 'cerrada') then 'reopened' else 'status_changed' end, t.status, v_new);
  end if;
  perform private.support_event(p_ticket, 'user', v_uid, 'message', null, null);
  perform private.support_notify_owners(case when t.status in ('resuelta', 'cerrada') then 'Incidencia reabierta' else 'Respuesta en una incidencia' end, t.subject, p_ticket, 'support-msg:' || v_msg::text);
  return v_msg;
end;
$$;

create or replace function public.support_register_attachment(p_ticket uuid, p_message uuid, p_path text, p_name text, p_mime text, p_size int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_id uuid;
  v_prefix text;
begin
  if v_uid is null then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select t.family_id into v_family from public.support_tickets t where t.id = p_ticket and t.requester_id = v_uid;
  if v_family is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.support_messages m where m.id = p_message and m.ticket_id = p_ticket and m.author_id = v_uid and m.author_kind = 'user') then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  v_prefix := v_family::text || '/support/' || p_ticket::text || '/';
  if p_path is null or left(p_path, char_length(v_prefix)) <> v_prefix or p_path ~ '\.\.' or p_path !~ '^[a-zA-Z0-9/_.-]+$' then raise exception 'INVALID_PATH' using errcode = 'P0001'; end if;
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain') then raise exception 'INVALID_FILE' using errcode = 'P0001'; end if;
  if p_size is null or p_size not between 1 and 5242880 then raise exception 'INVALID_FILE' using errcode = 'P0001'; end if;
  if (select count(*) from public.support_attachments a where a.message_id = p_message) >= 5 or (select count(*) from public.support_attachments a where a.ticket_id = p_ticket) >= 15 then raise exception 'RATE_LIMIT' using errcode = 'P0001'; end if;
  insert into public.support_attachments (ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, created_by)
  values (p_ticket, p_message, p_path, left(btrim(coalesce(p_name, 'archivo')), 120), p_mime, p_size, v_uid)
  returning id into v_id;
  perform private.support_event(p_ticket, 'user', v_uid, 'attachment_added', null, p_mime);
  return v_id;
end;
$$;

-- La persona confirma si el problema está resuelto (solo cuando la administración lo marcó como «resuelta»).
create or replace function public.support_confirm_resolution(p_ticket uuid, p_resolved boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.support_tickets%rowtype;
  v_new text;
begin
  if v_uid is null then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select * into t from public.support_tickets x where x.id = p_ticket and x.requester_id = v_uid for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if t.status <> 'resuelta' then raise exception 'INVALID_STATE' using errcode = 'P0001'; end if;
  v_new := case when p_resolved then 'cerrada' else 'en_revision' end;
  update public.support_tickets set status = v_new, updated_at = now(), admin_unread = true, closed_at = case when p_resolved then now() else null end, resolved_at = case when p_resolved then resolved_at else null end where id = p_ticket;
  perform private.support_event(p_ticket, 'user', v_uid, case when p_resolved then 'resolution_confirmed' else 'resolution_denied' end, 'resuelta', v_new);
  perform private.support_notify_owners(case when p_resolved then 'Incidencia confirmada como resuelta' else 'Incidencia reabierta: no estaba resuelta' end, t.subject, p_ticket, 'support-conf:' || p_ticket::text || ':' || v_new || ':' || extract(epoch from now())::bigint::text);
  return v_new;
end;
$$;

create or replace function public.support_mark_read(p_ticket uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.support_tickets set user_unread = false where id = p_ticket and requester_id = auth.uid() and user_unread
$$;

-- ======================================================================================================================== funciones de la administración de PEPA
create or replace function public.support_admin_list(p_status text default null, p_section text default null, p_priority text default null, p_assignee uuid default null, p_limit int default 100)
returns table (id uuid, requester_name text, family_name text, kind text, section text, subject text, status text, priority text, assignee_id uuid, assignee_name text, created_at timestamptz,
               last_message_at timestamptz, admin_unread boolean, message_count int, duplicate_of uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.support_require_owner();
  return query
    select t.id, p.display_name, f.name, t.kind, t.section, t.subject, t.status, t.priority, t.assignee_id, a.display_name, t.created_at, t.last_message_at, t.admin_unread, t.message_count, t.duplicate_of
      from public.support_tickets t
      left join public.profiles p on p.id = t.requester_id
      left join public.families f on f.id = t.family_id
      left join public.profiles a on a.id = t.assignee_id
     where (p_status is null or t.status = p_status) and (p_section is null or t.section = p_section) and (p_priority is null or t.priority = p_priority) and (p_assignee is null or t.assignee_id = p_assignee)
     order by (t.status in ('resuelta', 'cerrada')), t.last_message_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 300));
end;
$$;

create or replace function public.support_admin_reply(p_ticket uuid, p_body text, p_internal boolean default false, p_new_status text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.support_tickets%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_msg uuid;
  v_new text;
begin
  perform private.support_require_owner();
  select * into t from public.support_tickets x where x.id = p_ticket for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'INVALID_BODY' using errcode = 'P0001'; end if;
  if p_new_status is not null and p_new_status not in ('recibida', 'en_revision', 'esperando_usuario', 'resuelta', 'cerrada') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;

  insert into public.support_messages (ticket_id, author_kind, author_id, visibility, body) values (p_ticket, 'admin', v_uid, case when p_internal then 'internal' else 'public' end, v_body) returning id into v_msg;
  if p_internal then
    perform private.support_event(p_ticket, 'admin', v_uid, 'note_added', null, null, false);
    update public.support_tickets set updated_at = now() where id = p_ticket;
    return v_msg;
  end if;

  v_new := coalesce(p_new_status, case when t.status = 'recibida' then 'en_revision' else t.status end);
  update public.support_tickets
     set status = v_new, message_count = message_count + 1, last_message_at = now(), updated_at = now(), user_unread = true, admin_unread = false,
         first_admin_reply_at = coalesce(first_admin_reply_at, now()),
         resolved_at = case when v_new = 'resuelta' then now() when v_new in ('cerrada') then resolved_at else null end,
         closed_at = case when v_new = 'cerrada' then now() else null end
   where id = p_ticket;
  if v_new <> t.status then perform private.support_event(p_ticket, 'admin', v_uid, 'status_changed', t.status, v_new); end if;
  perform private.support_event(p_ticket, 'admin', v_uid, 'message', null, null);
  perform private.support_notify_requester(t.requester_id,
    case v_new when 'esperando_usuario' then 'Soporte necesita más información' when 'resuelta' then 'Tu incidencia está marcada como resuelta' else 'Soporte ha respondido a tu incidencia' end,
    t.subject, p_ticket, 'support-reply:' || v_msg::text);
  return v_msg;
end;
$$;

create or replace function public.support_admin_set_status(p_ticket uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.support_tickets%rowtype;
begin
  perform private.support_require_owner();
  if p_status is null or p_status not in ('recibida', 'en_revision', 'esperando_usuario', 'resuelta', 'cerrada') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  select * into t from public.support_tickets x where x.id = p_ticket for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if t.status = p_status then return; end if;
  update public.support_tickets
     set status = p_status, updated_at = now(), admin_unread = false, user_unread = true,
         resolved_at = case when p_status = 'resuelta' then now() when p_status = 'cerrada' then resolved_at else null end,
         closed_at = case when p_status = 'cerrada' then now() else null end
   where id = p_ticket;
  perform private.support_event(p_ticket, 'admin', v_uid, case when t.status in ('resuelta', 'cerrada') and p_status not in ('resuelta', 'cerrada') then 'reopened' else 'status_changed' end, t.status, p_status);
  perform private.support_notify_requester(t.requester_id, case p_status when 'resuelta' then 'Tu incidencia está marcada como resuelta' when 'cerrada' then 'Tu incidencia se ha cerrado' when 'esperando_usuario' then 'Soporte necesita más información' else 'Ha cambiado el estado de tu incidencia' end,
    t.subject, p_ticket, 'support-status:' || p_ticket::text || ':' || p_status || ':' || extract(epoch from now())::bigint::text);
end;
$$;

create or replace function public.support_admin_assign(p_ticket uuid, p_assignee uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
begin
  perform private.support_require_owner();
  if p_assignee is not null and not exists (select 1 from public.profiles p where p.id = p_assignee and p.is_app_owner) then raise exception 'INVALID_ASSIGNEE' using errcode = 'P0001'; end if;
  select assignee_id into v_old from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  update public.support_tickets set assignee_id = p_assignee, updated_at = now() where id = p_ticket;
  perform private.support_event(p_ticket, 'admin', auth.uid(), 'assigned', v_old::text, p_assignee::text, false);
end;
$$;

create or replace function public.support_admin_set_priority(p_ticket uuid, p_priority text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform private.support_require_owner();
  if p_priority is null or p_priority not in ('baja', 'normal', 'alta') then raise exception 'INVALID_PRIORITY' using errcode = 'P0001'; end if;
  select priority into v_old from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  update public.support_tickets set priority = p_priority, updated_at = now() where id = p_ticket;
  perform private.support_event(p_ticket, 'admin', auth.uid(), 'priority_changed', v_old, p_priority, false);
end;
$$;

create or replace function public.support_admin_mark_read(p_ticket uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.support_require_owner();
  update public.support_tickets set admin_unread = false where id = p_ticket and admin_unread;
end;
$$;

-- Incidencias parecidas: misma sección y tipo, o palabras largas del asunto en común (últimos 90 días).
create or replace function public.support_admin_similar(p_ticket uuid)
returns table (id uuid, subject text, status text, section text, kind text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.support_tickets%rowtype;
  v_words text[];
begin
  perform private.support_require_owner();
  select * into b from public.support_tickets x where x.id = p_ticket;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select coalesce(array_agg(w), '{}') into v_words from unnest(string_to_array(lower(regexp_replace(b.subject, '[^[:alnum:] ]', '', 'g')), ' ')) w where char_length(w) > 4;
  return query
    select t.id, t.subject, t.status, t.section, t.kind, t.created_at
      from public.support_tickets t
     where t.id <> p_ticket and t.created_at > now() - interval '90 days'
       and ((t.section = b.section and t.kind = b.kind) or exists (select 1 from unnest(v_words) w where lower(t.subject) like '%' || w || '%'))
     order by t.created_at desc
     limit 10;
end;
$$;

-- Las cuentas propietarias a las que se puede asignar una incidencia (la lista de profiles de otras familias no es visible para nadie por RLS).
create or replace function public.support_admin_owners()
returns table (id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.support_require_owner();
  return query select p.id, p.display_name from public.profiles p where p.is_app_owner order by p.display_name;
end;
$$;

create or replace function public.support_admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.support_require_owner();
  return jsonb_build_object(
    'total', (select count(*) from public.support_tickets),
    'abiertas', (select count(*) from public.support_tickets where status not in ('resuelta', 'cerrada')),
    'sin_leer', (select count(*) from public.support_tickets where admin_unread),
    'por_estado', coalesce((select jsonb_object_agg(s.status, s.n) from (select status, count(*) n from public.support_tickets group by 1) s), '{}'::jsonb),
    'por_seccion', coalesce((select jsonb_object_agg(s.section, s.n) from (select section, count(*) n from public.support_tickets group by 1 order by 2 desc limit 8) s), '{}'::jsonb),
    'creadas_30_dias', (select count(*) from public.support_tickets where created_at > now() - interval '30 days'),
    'horas_primera_respuesta', (select round(avg(extract(epoch from (first_admin_reply_at - created_at)) / 3600)::numeric, 1) from public.support_tickets where first_admin_reply_at is not null)
  );
end;
$$;

revoke all on function public.support_create_ticket(text, text, text, text, jsonb), public.support_post_message(uuid, text), public.support_register_attachment(uuid, uuid, text, text, text, int),
  public.support_confirm_resolution(uuid, boolean), public.support_mark_read(uuid),
  public.support_admin_list(text, text, text, uuid, int), public.support_admin_reply(uuid, text, boolean, text), public.support_admin_set_status(uuid, text), public.support_admin_assign(uuid, uuid),
  public.support_admin_set_priority(uuid, text), public.support_admin_mark_read(uuid), public.support_admin_similar(uuid), public.support_admin_owners(), public.support_admin_stats() from public, anon;
grant execute on function public.support_create_ticket(text, text, text, text, jsonb), public.support_post_message(uuid, text), public.support_register_attachment(uuid, uuid, text, text, text, int),
  public.support_confirm_resolution(uuid, boolean), public.support_mark_read(uuid),
  public.support_admin_list(text, text, text, uuid, int), public.support_admin_reply(uuid, text, boolean, text), public.support_admin_set_status(uuid, text), public.support_admin_assign(uuid, uuid),
  public.support_admin_set_priority(uuid, text), public.support_admin_mark_read(uuid), public.support_admin_similar(uuid), public.support_admin_owners(), public.support_admin_stats() to authenticated;

-- ======================================================================================================================== almacenamiento privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'])
on conflict (id) do nothing;

-- Subir: solo dentro de la carpeta de MI familia, bajo «support/», en una incidencia que es MÍA.
create policy "support_attachments storage: subir a mis incidencias" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = (select private.current_family_id())::text
    and (storage.foldername(name))[2] = 'support'
    and exists (select 1 from public.support_tickets t where t.id::text = (storage.foldername(name))[3] and t.requester_id = (select auth.uid()))
  );

-- Leer: solo los adjuntos REGISTRADOS por mí, o todos si soy administración de PEPA. Otra persona de mi misma familia no los ve.
create policy "support_attachments storage: leer los míos o todos si soy administración" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and (
      (select public.am_i_app_owner())
      or exists (select 1 from public.support_attachments a where a.storage_path = name and a.created_by = (select auth.uid()))
    )
  );
-- Sin política de borrado ni de actualización: los adjuntos solo se retiran al borrar la incidencia/familia (delete-account) o por la administración con las herramientas del panel.
