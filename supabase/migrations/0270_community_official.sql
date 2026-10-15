-- COMUNIDAD PEPA — contenido oficial (consejos de Pepa, encuestas semanales, artículos de Equipo PEPA), resúmenes de comentarios y respuestas de Pepa.
--
-- Reglas aprobadas:
--  · Identidades oficiales «Equipo PEPA» y «Pepa», claramente marcadas (0264); no hay usuarios falsos.
--  · Pepa propone un lote semanal; basta la aprobación de CUALQUIERA de los dos administradores; el administrador puede editar, aprobar o rechazar; se registra
--    autor, fecha y versión aprobada. NADA oficial se publica sin aprobación humana, ni por fecha.
--  · Encuesta oficial semanal: propuesta en el mismo lote; si se aprueba se publica el sábado a las 10:00 y cierra el domingo a las 17:00 (hora peninsular
--    española, con el cambio de hora de verano/invierno). Un voto por persona, anónimo; antes de votar los resultados están ocultos; tras votar, parciales;
--    al cerrar, finales para todos (también visitantes). Los comentarios están abiertos desde el sábado y siguen abiertos tras el cierre.
--  · Artículos oficiales de investigación: solo con fuentes externas (INE, Eurostat…) con fechas y metodología; sin fuentes no se aprueban. Revisión humana.
--  · Pepa puede responder sola a preguntas sin respuesta humana tras 6 horas, con un máximo de 3 intervenciones no solicitadas por hora móvil; la cuarta posible
--    avisa a los dos administradores. Las menciones directas a Pepa (@pepa) se tratan aparte con límites antispam. Una respuesta de Pepa no cuenta como
--    respuesta humana (ya garantizado en los listados).
--  · Resumen de comentarios (no confundir con los artículos): con 15 comentarios o más; se actualiza tras 10 comentarios nuevos o a petición; si falla la IA
--    la conversación sigue accesible (el resumen es siempre un complemento, nunca bloquea).

-- Tipos de publicación oficiales (no son tipos de publicación de personas: las funciones de usuario solo aceptan los 4 de siempre).
alter table public.community_posts drop constraint community_posts_kind_check;
alter table public.community_posts add constraint community_posts_kind_check check (kind in ('receta', 'pregunta', 'consejo', 'anecdota', 'encuesta', 'articulo'));
alter table public.community_posts add constraint community_posts_official_kinds check (kind not in ('encuesta', 'articulo') or is_official);

-- ---------------------------------------------------------------------------------------------
-- Propuestas del lote semanal y su revisión.
-- ---------------------------------------------------------------------------------------------
create table public.community_official_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('tip', 'poll', 'article')),
  section text not null check (section in ('recetas', 'hogar')),
  topic_id text not null references public.community_topics(id),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  body text not null default '' check (char_length(body) <= 10000),
  -- poll: {"options":["a","b",...]} (2 a 6 opciones); article: {"sources":[{"title","publisher","url","date"}],"methodology":"…","comparison":"…"}.
  payload jsonb not null default '{}'::jsonb,
  batch_week date not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'published')),
  version integer not null default 1,
  proposed_by text not null default 'Pepa',
  proposed_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  approved_version integer,
  rejected_by uuid,
  rejected_at timestamptz,
  review_note text,
  publish_at timestamptz,
  published_post_id uuid references public.community_posts(id)
);
create index idx_community_official_items_status on public.community_official_items (status, batch_week);
alter table public.community_official_items enable row level security;
revoke all on public.community_official_items from anon, authenticated;

create table public.community_official_item_versions (
  item_id uuid not null references public.community_official_items(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  edited_by uuid,
  edited_at timestamptz not null default now(),
  primary key (item_id, version)
);
alter table public.community_official_item_versions enable row level security;
revoke all on public.community_official_item_versions from anon, authenticated;

alter table public.community_posts add constraint community_posts_official_item_fk foreign key (official_item_id) references public.community_official_items(id);

-- ---------------------------------------------------------------------------------------------
-- Encuestas.
-- ---------------------------------------------------------------------------------------------
create table public.community_polls (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.community_official_items(id),
  post_id uuid unique references public.community_posts(id),
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'closed')),
  check (closes_at > opens_at)
);
alter table public.community_polls enable row level security;
revoke all on public.community_polls from anon, authenticated;

create table public.community_poll_votes (
  poll_id uuid not null references public.community_polls(id) on delete cascade,
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  option_index integer not null check (option_index between 0 and 5),
  voted_at timestamptz not null default now(),
  primary key (poll_id, profile_id)
);
alter table public.community_poll_votes enable row level security;
revoke all on public.community_poll_votes from anon, authenticated;

-- Sábado a las 10:00 y domingo a las 17:00 hora de Madrid (con el cambio de hora). p_from = instante de aprobación.
-- Si se aprueba DENTRO de la ventana (sábado 10:00 – domingo 17:00), se publica al momento y cierra ese domingo; si no, el sábado siguiente.
create or replace function private.community_poll_window(p_from timestamptz)
returns table(opens_at timestamptz, closes_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_from at time zone 'Europe/Madrid';
  v_date date := v_local::date;
  v_dow integer := extract(isodow from v_local)::integer; -- 1 lunes … 7 domingo
  v_sat date;
  v_sat_open timestamptz;
  v_sun_close timestamptz;
begin
  v_sat := v_date + ((6 - v_dow + 7) % 7);
  if v_dow = 7 then
    v_sat := v_date - 1;
  end if;
  v_sat_open := ((v_sat + time '10:00') at time zone 'Europe/Madrid');
  v_sun_close := (((v_sat + 1) + time '17:00') at time zone 'Europe/Madrid');
  if p_from >= v_sat_open and p_from < v_sun_close then
    return query select p_from, v_sun_close;
  elsif p_from >= v_sun_close then
    v_sat := v_sat + 7;
    return query select ((v_sat + time '10:00') at time zone 'Europe/Madrid'), (((v_sat + 1) + time '17:00') at time zone 'Europe/Madrid');
  else
    return query select v_sat_open, v_sun_close;
  end if;
end;
$$;
revoke execute on function private.community_poll_window(timestamptz) from public, anon, authenticated;

-- Publica un elemento oficial aprobado como publicación (identidad oficial correspondiente). Los artículos exigen fuentes.
create or replace function private.community_publish_item(p_item uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_author uuid;
  v_label text;
  v_kind text;
  v_post uuid := gen_random_uuid();
begin
  select * into i from public.community_official_items x where x.id = p_item for update;
  if not found or i.status <> 'approved' or i.published_post_id is not null then
    return null;
  end if;
  v_author := case i.kind when 'tip' then '00000000-0000-4000-8000-0000000000a2'::uuid else '00000000-0000-4000-8000-0000000000a1'::uuid end;
  v_label := case i.kind when 'tip' then 'Consejo de Pepa' when 'poll' then 'Encuesta de Equipo PEPA' else 'Artículo de Equipo PEPA' end;
  v_kind := case i.kind when 'tip' then 'consejo' when 'poll' then 'encuesta' else 'articulo' end;
  insert into public.community_posts (id, author_id, kind, section, topic_id, title, body, is_official, official_label, official_item_id, article_sources)
  values (v_post, v_author, v_kind, i.section, i.topic_id, i.title, i.body, true, v_label, i.id, case when i.kind = 'article' then i.payload end);
  update public.community_official_items set status = 'published', published_post_id = v_post where id = i.id;
  if i.kind = 'poll' then
    update public.community_polls set post_id = v_post, status = case when now() >= opens_at then 'open' else status end where item_id = i.id;
  end if;
  return v_post;
end;
$$;
revoke execute on function private.community_publish_item(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Lote semanal (lo crea la función de servidor con IA; solo service_role).
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_service_create_proposals(p_week date, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  v_n integer := 0;
  v_id uuid;
  v_kind text;
  v_payload jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_kind := it ->> 'kind';
    v_payload := coalesce(it -> 'payload', '{}'::jsonb);
    continue when v_kind not in ('tip', 'poll', 'article');
    -- Un artículo sin fuentes externas NO se propone nunca.
    continue when v_kind = 'article' and coalesce(jsonb_array_length(v_payload -> 'sources'), 0) = 0;
    continue when v_kind = 'poll' and (jsonb_typeof(v_payload -> 'options') <> 'array' or jsonb_array_length(v_payload -> 'options') not between 2 and 6);
    begin
      insert into public.community_official_items (kind, section, topic_id, title, body, payload, batch_week)
      values (v_kind, it ->> 'section', it ->> 'topic_id', left(btrim(it ->> 'title'), 140), left(coalesce(it ->> 'body', ''), 10000), v_payload, p_week)
      returning id into v_id;
      insert into public.community_official_item_versions (item_id, version, snapshot) values (v_id, 1, it);
      v_n := v_n + 1;
    exception when others then
      raise warning 'community_service_create_proposals: %', sqlerrm;
    end;
  end loop;
  if v_n > 0 then
    perform private.community_notify_admins('Propuestas semanales de Pepa', 'Hay ' || v_n || ' propuestas pendientes de revisar.', '/comunidad/admin', 'proposals:' || p_week);
  end if;
  return v_n;
end;
$$;
revoke all on function public.community_service_create_proposals(date, jsonb) from public, anon, authenticated;
grant execute on function public.community_service_create_proposals(date, jsonb) to service_role;

create or replace function public.community_admin_list_proposals(p_status text default 'proposed')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'kind', i.kind, 'section', i.section, 'topic_id', i.topic_id, 'title', i.title, 'body', i.body, 'payload', i.payload,
      'batch_week', i.batch_week, 'status', i.status, 'version', i.version, 'proposed_at', i.proposed_at, 'approved_version', i.approved_version,
      'approved_at', i.approved_at, 'approved_by_name', (select pr.display_name from public.profiles pr where pr.id = i.approved_by),
      'review_note', i.review_note, 'publish_at', i.publish_at, 'published_post_id', i.published_post_id) order by i.batch_week desc, i.proposed_at)
    from public.community_official_items i where i.status = p_status
  ), '[]'::jsonb);
end;
$$;

create or replace function public.community_admin_edit_proposal(p_id uuid, p_title text, p_body text, p_payload jsonb default null, p_topic text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_version integer;
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x where x.id = p_id and x.status in ('proposed', 'approved') for update;
  if not found or i.published_post_id is not null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  update public.community_official_items
  set title = left(btrim(p_title), 140), body = left(coalesce(p_body, ''), 10000), payload = coalesce(p_payload, payload),
      topic_id = coalesce(p_topic, topic_id), version = version + 1,
      -- Editar tras aprobar obliga a aprobar de nuevo la versión nueva.
      status = 'proposed', approved_by = null, approved_at = null, approved_version = null, publish_at = null
  where id = p_id returning version into v_version;
  insert into public.community_official_item_versions (item_id, version, snapshot, edited_by)
  select i2.id, i2.version, jsonb_build_object('kind', i2.kind, 'section', i2.section, 'topic_id', i2.topic_id, 'title', i2.title, 'body', i2.body, 'payload', i2.payload), (select auth.uid())
  from public.community_official_items i2 where i2.id = p_id;
  delete from public.community_polls where item_id = p_id and status = 'scheduled';
  perform private.community_log('proposal_edit', 'official_item', p_id, null, jsonb_build_object('version', v_version));
  return v_version;
end;
$$;

-- Aprobar: basta UNA aprobación de cualquiera de los dos administradores. Publica al momento (consejos y artículos) o programa la encuesta.
create or replace function public.community_admin_approve_proposal(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_win record;
  v_post uuid;
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x where x.id = p_id and x.status = 'proposed' for update;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if i.kind = 'article' and coalesce(jsonb_array_length(i.payload -> 'sources'), 0) = 0 then
    raise exception 'NO_SOURCES' using errcode = 'P0001';
  end if;
  update public.community_official_items
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), approved_version = version
  where id = p_id;
  perform private.community_log('proposal_approved', 'official_item', p_id, null, jsonb_build_object('version', i.version, 'kind', i.kind));
  if i.kind = 'poll' then
    select * into v_win from private.community_poll_window(now());
    insert into public.community_polls (item_id, question, options, opens_at, closes_at)
    values (p_id, i.title, i.payload -> 'options', v_win.opens_at, v_win.closes_at)
    on conflict (item_id) do update set question = excluded.question, options = excluded.options, opens_at = excluded.opens_at, closes_at = excluded.closes_at;
    update public.community_official_items set publish_at = v_win.opens_at where id = p_id;
    if v_win.opens_at <= now() then
      v_post := private.community_publish_item(p_id);
    end if;
    return jsonb_build_object('scheduled', v_post is null, 'opens_at', v_win.opens_at, 'closes_at', v_win.closes_at, 'post_id', v_post);
  end if;
  v_post := private.community_publish_item(p_id);
  return jsonb_build_object('scheduled', false, 'post_id', v_post);
end;
$$;

create or replace function public.community_admin_reject_proposal(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  update public.community_official_items set status = 'rejected', rejected_by = (select auth.uid()), rejected_at = now(), review_note = left(p_note, 500)
  where id = p_id and status in ('proposed', 'approved') and published_post_id is null;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  delete from public.community_polls where item_id = p_id and status = 'scheduled';
  perform private.community_log('proposal_rejected', 'official_item', p_id, p_note);
end;
$$;

-- Trabajo programado (cada 5 min): publica las encuestas aprobadas cuya hora ha llegado y cierra las que han vencido.
create or replace function private.community_run_polls()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in select p.item_id from public.community_polls p join public.community_official_items i on i.id = p.item_id
           where p.status = 'scheduled' and p.opens_at <= now() and i.status = 'approved' loop
    perform private.community_publish_item(r.item_id);
    v_n := v_n + 1;
  end loop;
  update public.community_polls set status = 'open' where status = 'scheduled' and opens_at <= now() and post_id is not null;
  update public.community_polls set status = 'closed' where status = 'open' and closes_at <= now();
  return v_n;
end;
$$;
revoke execute on function private.community_run_polls() from public, anon, authenticated;

-- Votar y ver resultados (reglas de visibilidad del enunciado).
create or replace function private.community_poll_json(p public.community_polls, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_voted integer;
  v_closed boolean := p.status = 'closed' or now() >= p.closes_at;
  v_counts jsonb;
begin
  if p_viewer is not null then
    select v.option_index into v_voted from public.community_poll_votes v where v.poll_id = p.id and v.profile_id = p_viewer;
  end if;
  if v_closed or v_voted is not null then
    select coalesce(jsonb_agg(coalesce(c.n, 0) order by o.i), '[]'::jsonb) into v_counts
    from generate_series(0, jsonb_array_length(p.options) - 1) o(i)
    left join (select option_index, count(*)::integer as n from public.community_poll_votes where poll_id = p.id group by option_index) c on c.option_index = o.i;
  end if;
  return jsonb_build_object(
    'id', p.id, 'post_id', p.post_id, 'question', p.question, 'options', p.options, 'opens_at', p.opens_at, 'closes_at', p.closes_at,
    'status', case when v_closed then 'closed' else p.status end,
    'my_vote', v_voted,
    'results_visible', v_closed or v_voted is not null,
    'final', v_closed,
    'counts', v_counts,
    'total_votes', case when v_closed or v_voted is not null then (select count(*) from public.community_poll_votes where poll_id = p.id) end);
end;
$$;
revoke execute on function private.community_poll_json(public.community_polls, uuid) from public, anon, authenticated;

create or replace function public.community_get_poll(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.community_polls%rowtype;
begin
  select pl.* into p from public.community_polls pl join public.community_posts po on po.id = pl.post_id where pl.post_id = p_post and po.status = 'published';
  if not found then
    return null;
  end if;
  return private.community_poll_json(p, private.community_cp());
end;
$$;

create or replace function public.community_vote_poll(p_post uuid, p_option integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid := private.community_require_participant();
  p public.community_polls%rowtype;
begin
  select pl.* into p from public.community_polls pl join public.community_posts po on po.id = pl.post_id where pl.post_id = p_post and po.status = 'published';
  if not found or now() < p.opens_at or now() >= p.closes_at or p_option is null or p_option < 0 or p_option >= jsonb_array_length(p.options) then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  begin
    insert into public.community_poll_votes (poll_id, profile_id, option_index) values (p.id, v_cp, p_option);
  exception when unique_violation then
    raise exception 'ALREADY_VOTED' using errcode = 'P0001';
  end;
  return private.community_poll_json(p, v_cp);
end;
$$;

-- Encuesta para visitantes sin sesión: SOLO si ya ha cerrado (resultados finales).
create or replace function public.community_public_get_poll(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.community_polls%rowtype;
begin
  select pl.* into p from public.community_polls pl join public.community_posts po on po.id = pl.post_id where pl.post_id = p_post and po.status = 'published';
  if not found then
    return null;
  end if;
  if not (p.status = 'closed' or now() >= p.closes_at) then
    return jsonb_build_object('id', p.id, 'post_id', p.post_id, 'question', p.question, 'options', p.options, 'opens_at', p.opens_at, 'closes_at', p.closes_at,
                              'status', 'open', 'results_visible', false, 'final', false);
  end if;
  return private.community_poll_json(p, null);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Resumen de comentarios (Pepa). El texto lo genera la función de servidor; aquí solo se guarda y se decide cuándo hace falta.
-- ---------------------------------------------------------------------------------------------
create table public.community_post_summaries (
  post_id uuid primary key references public.community_posts(id) on delete cascade,
  summary text not null,
  comment_count_at integer not null,
  generated_at timestamptz not null default now(),
  refresh_requested_at timestamptz
);
alter table public.community_post_summaries enable row level security;
revoke all on public.community_post_summaries from anon, authenticated;

create or replace function public.community_get_summary(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_threshold integer := private.community_setting_int('summary_comment_threshold', 15);
  v_every integer := private.community_setting_int('summary_refresh_every', 10);
  v_count integer;
  s public.community_post_summaries%rowtype;
begin
  select p.comment_count into v_count from public.community_posts p where p.id = p_post and p.status = 'published';
  if v_count is null then
    return null;
  end if;
  select * into s from public.community_post_summaries x where x.post_id = p_post;
  return jsonb_build_object(
    'comment_count', v_count,
    'eligible', v_count >= v_threshold,
    'threshold', v_threshold,
    'summary', s.summary,
    'generated_at', s.generated_at,
    'comments_since', case when found then v_count - s.comment_count_at end,
    'stale', v_count >= v_threshold and (not found or v_count - s.comment_count_at >= v_every or s.refresh_requested_at is not null));
end;
$$;

-- La función de servidor pide los comentarios a resumir (solo si hace falta o se pide). Sin nombres: solo texto y orden.
create or replace function public.community_service_summary_input(p_post uuid, p_force boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state jsonb := public.community_get_summary(p_post);
begin
  if v_state is null or not (v_state ->> 'eligible')::boolean then
    return jsonb_build_object('needed', false, 'reason', 'not_eligible');
  end if;
  if not p_force and not (v_state ->> 'stale')::boolean then
    return jsonb_build_object('needed', false, 'reason', 'fresh');
  end if;
  return jsonb_build_object(
    'needed', true,
    'comment_count', (v_state ->> 'comment_count')::integer,
    'title', (select p.title from public.community_posts p where p.id = p_post),
    'body', (select left(p.body, 2000) from public.community_posts p where p.id = p_post),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object('n', x.rn, 'reply_to', x.reply_n, 'text', left(x.body, 600)) order by x.rn), '[]'::jsonb)
                 from (select row_number() over (order by c.created_at) as rn,
                              (select r.rn2 from (select c2.id, row_number() over (order by c2.created_at) as rn2 from public.community_comments c2
                                                  where c2.post_id = p_post and c2.status = 'published') r where r.id = c.reply_to_id) as reply_n,
                              c.body
                       from public.community_comments c where c.post_id = p_post and c.status = 'published' and c.body <> '' limit 300) x));
end;
$$;
revoke all on function public.community_service_summary_input(uuid, boolean) from public, anon, authenticated;
grant execute on function public.community_service_summary_input(uuid, boolean) to service_role;

create or replace function public.community_service_save_summary(p_post uuid, p_summary text, p_comment_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.community_post_summaries (post_id, summary, comment_count_at, generated_at, refresh_requested_at)
  values (p_post, left(p_summary, 3000), p_comment_count, now(), null)
  on conflict (post_id) do update set summary = excluded.summary, comment_count_at = excluded.comment_count_at, generated_at = now(), refresh_requested_at = null;
end;
$$;
revoke all on function public.community_service_save_summary(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.community_service_save_summary(uuid, text, integer) to service_role;

-- «Actualizar resumen» a petición de una persona con alias (la función de servidor lo genera al instante).
create or replace function public.community_request_summary_refresh(p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_participant();
  update public.community_post_summaries set refresh_requested_at = now() where post_id = p_post;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Pepa responde: preguntas sin respuesta humana tras 6 horas (máx. 3 por hora móvil; la cuarta avisa a los administradores) y menciones directas.
-- ---------------------------------------------------------------------------------------------
create table public.community_pepa_activity (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('unanswered', 'mention', 'summary', 'proposals')),
  post_id uuid,
  comment_id uuid,
  requester_id uuid,
  created_at timestamptz not null default now()
);
create index idx_community_pepa_activity_recent on public.community_pepa_activity (kind, created_at desc);
alter table public.community_pepa_activity enable row level security;
revoke all on public.community_pepa_activity from anon, authenticated;

create table public.community_pepa_mentions (
  comment_id uuid primary key references public.community_comments(id) on delete cascade,
  requester_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  skipped boolean not null default false
);
alter table public.community_pepa_mentions enable row level security;
revoke all on public.community_pepa_mentions from anon, authenticated;

create or replace function private.community_detect_pepa_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and new.body ~* '(^|\s)@pepa\y' and not exists (select 1 from public.community_profiles cp where cp.id = new.author_id and cp.is_official) then
    insert into public.community_pepa_mentions (comment_id, requester_id) values (new.id, new.author_id) on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function private.community_detect_pepa_mention() from public, anon, authenticated;
create trigger community_comments_pepa_mention after insert on public.community_comments for each row execute function private.community_detect_pepa_mention();

-- Preguntas que Pepa puede responder AHORA (la función de servidor las responde). Aplica el presupuesto por hora móvil.
create or replace function public.community_service_pepa_candidates()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours integer := private.community_setting_int('pepa_unanswered_hours', 6);
  v_max integer := private.community_setting_int('pepa_max_per_hour', 3);
  v_used integer;
  v_budget integer;
  v_pending integer;
  v_out jsonb;
begin
  select count(*)::integer into v_used from public.community_pepa_activity a where a.kind = 'unanswered' and a.created_at > now() - interval '1 hour';
  v_budget := greatest(v_max - v_used, 0);
  select count(*)::integer, coalesce(jsonb_agg(x.j order by x.rn) filter (where x.rn <= v_budget), '[]'::jsonb) into v_pending, v_out
  from (
    select row_number() over (order by p.created_at) as rn,
           jsonb_build_object('post_id', p.id, 'title', p.title, 'body', left(p.body, 3000), 'topic_id', p.topic_id) as j
    from public.community_posts p
    where p.kind = 'pregunta' and p.status = 'published' and not p.is_official
      and p.created_at <= now() - make_interval(hours => v_hours)
      and not exists (select 1 from public.community_comments c join public.community_profiles ca on ca.id = c.author_id
                      where c.post_id = p.id and c.status = 'published' and c.author_id <> p.author_id and not ca.is_official)
      and not exists (select 1 from public.community_pepa_activity a where a.kind = 'unanswered' and a.post_id = p.id)
  ) x;
  if v_pending > v_budget and v_used >= v_max then
    -- La cuarta posible intervención no la hace Pepa: avisa a los dos administradores (una vez por hora).
    perform private.community_notify_admins('Preguntas sin responder', 'Pepa ha alcanzado su límite por hora y quedan ' || v_pending || ' preguntas sin respuesta. ¿Respondes tú?',
      '/comunidad/admin', 'pepa-limit:' || to_char(now(), 'YYYYMMDDHH24'));
  end if;
  return v_out;
end;
$$;
revoke all on function public.community_service_pepa_candidates() from public, anon, authenticated;
grant execute on function public.community_service_pepa_candidates() to service_role;

-- Pepa escribe su respuesta (identidad oficial «Pepa»; texto validado como cualquier otro). Anota la actividad para el presupuesto.
create or replace function public.community_service_pepa_comment(p_post uuid, p_body text, p_kind text default 'unanswered', p_reply_to uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pepa uuid := '00000000-0000-4000-8000-0000000000a2';
  v_body text := private.community_clean_text(p_body, 2000);
  v_id uuid;
  v_parent uuid;
  v_target public.community_comments%rowtype;
begin
  if p_kind not in ('unanswered', 'mention') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.community_posts p where p.id = p_post and p.status = 'published') then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if p_reply_to is not null then
    select * into v_target from public.community_comments c where c.id = p_reply_to and c.post_id = p_post;
    v_parent := coalesce(v_target.parent_id, v_target.id);
  end if;
  insert into public.community_comments (post_id, author_id, parent_id, reply_to_id, body) values (p_post, v_pepa, v_parent, p_reply_to, v_body) returning id into v_id;
  insert into public.community_pepa_activity (kind, post_id, comment_id) values (p_kind, p_post, v_id);
  return v_id;
end;
$$;
revoke all on function public.community_service_pepa_comment(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.community_service_pepa_comment(uuid, text, text, uuid) to service_role;

-- Menciones pendientes (antispam: como mucho 3 respuestas a la misma persona por hora y 20 por hora en total; el resto se descarta sin responder).
create or replace function public.community_service_pepa_mentions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_out jsonb := '[]'::jsonb;
  v_total integer;
  v_mine integer;
begin
  select count(*)::integer into v_total from public.community_pepa_activity a where a.kind = 'mention' and a.created_at > now() - interval '1 hour';
  for r in select m.*, c.post_id, c.body from public.community_pepa_mentions m join public.community_comments c on c.id = m.comment_id
           where m.handled_at is null and not m.skipped and m.created_at > now() - interval '2 hours' order by m.created_at limit 20 loop
    select count(*)::integer into v_mine from public.community_pepa_activity a where a.kind = 'mention' and a.requester_id = r.requester_id and a.created_at > now() - interval '1 hour';
    if v_total >= 20 or v_mine >= 3 then
      update public.community_pepa_mentions set skipped = true where comment_id = r.comment_id;
      continue;
    end if;
    insert into public.community_pepa_activity (kind, post_id, comment_id, requester_id) values ('mention', r.post_id, r.comment_id, r.requester_id);
    update public.community_pepa_mentions set handled_at = now() where comment_id = r.comment_id;
    v_total := v_total + 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object('comment_id', r.comment_id, 'post_id', r.post_id, 'text', left(r.body, 1000),
      'title', (select p.title from public.community_posts p where p.id = r.post_id), 'post_body', (select left(p.body, 2000) from public.community_posts p where p.id = r.post_id)));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.community_service_pepa_mentions() from public, anon, authenticated;
grant execute on function public.community_service_pepa_mentions() to service_role;

-- ---------------------------------------------------------------------------------------------
-- Permisos y trabajos.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.community_admin_list_proposals(text) from public, anon;
revoke all on function public.community_admin_edit_proposal(uuid, text, text, jsonb, text) from public, anon;
revoke all on function public.community_admin_approve_proposal(uuid) from public, anon;
revoke all on function public.community_admin_reject_proposal(uuid, text) from public, anon;
revoke all on function public.community_get_poll(uuid) from public, anon;
revoke all on function public.community_vote_poll(uuid, integer) from public, anon;
revoke all on function public.community_get_summary(uuid) from public, anon;
revoke all on function public.community_request_summary_refresh(uuid) from public, anon;
revoke all on function public.community_public_get_poll(uuid) from public;
grant execute on function public.community_admin_list_proposals(text) to authenticated;
grant execute on function public.community_admin_edit_proposal(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.community_admin_approve_proposal(uuid) to authenticated;
grant execute on function public.community_admin_reject_proposal(uuid, text) to authenticated;
grant execute on function public.community_get_poll(uuid) to authenticated;
grant execute on function public.community_vote_poll(uuid, integer) to authenticated;
grant execute on function public.community_get_summary(uuid) to authenticated;
grant execute on function public.community_request_summary_refresh(uuid) to authenticated;
grant execute on function public.community_public_get_poll(uuid) to anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'community-run-polls') then
    perform cron.unschedule('community-run-polls');
  end if;
  perform cron.schedule('community-run-polls', '*/5 * * * *', 'select private.community_run_polls()');
end $$;
