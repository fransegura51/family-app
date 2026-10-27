-- COMUNIDAD PEPA — programa editorial semanal con IA, controles de administración y rectificaciones (Fase 2, 27/10/2026).
--
-- Programa aprobado: cada semana 7 artículos (uno por día, de lunes a domingo), 1 encuesta (sábado; cierra el domingo a las 17:00, hora peninsular) y 1 menú semanal (sábado,
-- para la semana siguiente). PEPA genera BORRADORES por anticipado (un ciclo cada miércoles a las 08:00, hora de Madrid, con el cambio de hora) para que una persona los revise,
-- rectifique, apruebe y programe. GENERAR NO ES PUBLICAR: nada se publica sin que un administrador lo apruebe (regla innegociable, sin cambios).
--
-- Qué añade esta migración (todo aditivo; ningún dato ni permiso existente cambia, salvo lo indicado):
--  1. Interruptores independientes (artículos / encuestas / menú), guardados de verdad en community_settings, PAUSADOS por defecto. Pausar detiene SOLO las generaciones nuevas del
--     tipo: no borra borradores, ni publicaciones aprobadas o programadas, ni el historial.
--  2. community_editorial_runs: registro de cada ejecución (programada o manual): resultado, errores (sin datos privados), borradores creados, intentos. Una sola ejecución
--     programada por tipo y semana (índice único), reintentos limitados (3) y separados al menos 50 minutos: ejecutar dos veces no duplica nada.
--  3. Huecos del programa en community_official_items (slot_date): un artículo por día, una encuesta por sábado y un menú por semana; índices únicos que impiden duplicados.
--  4. Selección de temas con prioridad: 1) subtemas sin publicaciones, 2) ideas de «Propón un tema», 3) subtemas con pocas publicaciones, 4) el resto. Las ideas se enlazan al
--     borrador con su consentimiento de agradecimiento (línea «❤️ Este artículo nació de una idea de @alias» solo con quienes lo aceptaron).
--  5. Artículos programados: aprobar un artículo del programa lo programa para su día a las 10:00 (Europe/Madrid) en vez de publicarlo al instante; el trabajo de cada 5 minutos
--     lo publica a su hora. Los artículos prácticos del programa (payload.editorial = true) pueden ir sin fuentes externas, SIEMPRE con revisión humana; un artículo con
--     datos externos sigue necesitando sus fuentes (regla anterior intacta).
--  6. Rectificaciones con IA: community_editorial_revisions guarda cada propuesta de cambio (instrucción, antes, después) para compararla y aceptarla o rechazarla. Aceptar
--     crea una VERSIÓN NUEVA (la anterior se conserva y se puede restaurar) y deja el elemento como borrador: aceptar NUNCA publica.
--  7. Nuevos fines de IA en el recuento de uso de Comunidad (editorial_article, editorial_poll, editorial_menu, editorial_revise).
-- Deshacer: supabase/rollbacks/0325_community_editorial_automation_down.sql.

-- ---------------------------------------------------------------------------------------------
-- 1) Interruptores (pausados por defecto)
-- ---------------------------------------------------------------------------------------------
insert into public.community_settings (key, value, description) values
  ('editorial_articles_enabled', '0', 'Generación semanal de los 7 artículos (borradores): 1 = activada, 0 = en pausa. No publica nada.'),
  ('editorial_polls_enabled', '0', 'Generación semanal de la encuesta (borrador): 1 = activada, 0 = en pausa. No publica nada.'),
  ('editorial_menu_enabled', '0', 'Generación semanal del menú (borrador): 1 = activada, 0 = en pausa. No publica nada.')
on conflict (key) do nothing;

create or replace function public.community_admin_set_editorial_toggle(p_kind text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := case p_kind when 'articles' then 'editorial_articles_enabled' when 'polls' then 'editorial_polls_enabled' when 'menu' then 'editorial_menu_enabled' end;
begin
  perform private.community_require_admin();
  if v_key is null or p_enabled is null then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  update public.community_settings set value = to_jsonb(case when p_enabled then 1 else 0 end), updated_at = now() where key = v_key;
  perform private.community_log('editorial_toggle', 'setting', null, p_kind || '=' || case when p_enabled then 'on' else 'off' end);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2) Ejecuciones
-- ---------------------------------------------------------------------------------------------
create table public.community_editorial_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('articles', 'poll', 'menu')),
  trigger text not null check (trigger in ('schedule', 'manual')),
  -- Lunes de la semana del programa a la que pertenece lo generado (artículos y menú: la semana siguiente; encuesta: la semana en curso, abre el sábado).
  week_start date not null,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'error', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_created integer not null default 0 check (items_created >= 0),
  items_expected integer not null default 0 check (items_expected >= 0),
  attempt integer not null default 1 check (attempt >= 1),
  -- Código y motivo corto del error (NUNCA datos privados ni texto de personas).
  error text,
  detail jsonb not null default '{}'::jsonb,
  requested_by uuid
);
create index idx_community_editorial_runs_recent on public.community_editorial_runs (started_at desc);
-- Una sola ejecución PROGRAMADA «viva» (en curso, correcta o parcial) por tipo y semana: la segunda se descarta. Las fallidas permiten reintento (máx. 3, ver begin_run).
create unique index uq_community_editorial_run_schedule on public.community_editorial_runs (kind, week_start) where trigger = 'schedule' and status in ('running', 'ok', 'partial');
alter table public.community_editorial_runs enable row level security;
revoke all on public.community_editorial_runs from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3) Huecos del programa en los elementos oficiales
-- ---------------------------------------------------------------------------------------------
-- slot_date: artículo = día en que toca publicarlo; encuesta = sábado en que abre; menú = lunes de la semana a la que corresponde. Null = creado a mano (sin hueco).
alter table public.community_official_items add column slot_date date;
alter table public.community_official_items add column generated_run_id uuid references public.community_editorial_runs(id) on delete set null;
alter table public.community_official_items add column generation jsonb;
create unique index uq_community_official_slot_article on public.community_official_items (slot_date) where kind = 'article' and slot_date is not null and status in ('proposed', 'approved', 'published');
create unique index uq_community_official_slot_poll on public.community_official_items (slot_date) where kind = 'poll' and slot_date is not null and status in ('proposed', 'approved', 'published');
create unique index uq_community_official_slot_menu on public.community_official_items (slot_date) where kind = 'menu' and slot_date is not null and status in ('proposed', 'approved', 'published');

-- ---------------------------------------------------------------------------------------------
-- 4) Calendario del programa (hora de Madrid, con el cambio de hora)
-- ---------------------------------------------------------------------------------------------
-- Ciclo de generación: el miércoles de la semana de p_now a las 08:00 (Europe/Madrid). Genera los artículos y el menú de la semana SIGUIENTE y la encuesta del sábado de esta semana.
create or replace function private.community_editorial_cycle(p_now timestamptz)
returns table (run_at timestamptz, monday date, articles_week date, poll_week date, menu_week date, due boolean)
language sql
stable
set search_path = ''
as $$
  with l as (select date_trunc('week', p_now at time zone 'Europe/Madrid')::date as mon)
  select ((l.mon + 2) + time '08:00') at time zone 'Europe/Madrid', l.mon, l.mon + 7, l.mon, l.mon + 7,
         p_now >= ((l.mon + 2) + time '08:00') at time zone 'Europe/Madrid'
  from l
$$;
revoke execute on function private.community_editorial_cycle(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5) Funciones de servidor (solo service_role): configuración, ejecuciones, plan de temas y alta de borradores
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_service_editorial_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'launched', private.community_launched(),
    'articles_enabled', private.community_setting_int('editorial_articles_enabled', 0) = 1,
    'polls_enabled', private.community_setting_int('editorial_polls_enabled', 0) = 1,
    'menu_enabled', private.community_setting_int('editorial_menu_enabled', 0) = 1,
    'run_at', c.run_at, 'due', c.due, 'articles_week', c.articles_week, 'poll_week', c.poll_week, 'menu_week', c.menu_week)
  from private.community_editorial_cycle(now()) c
$$;

-- Abre una ejecución. Devuelve su id o NULL si no procede (ya hay una viva, o se agotaron los reintentos, o es demasiado pronto para reintentar). Las ejecuciones en curso
-- de hace más de 20 minutos se dan por fallidas (TIMEOUT) para no bloquear la semana.
create or replace function public.community_service_editorial_begin_run(p_kind text, p_trigger text, p_week date, p_user uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_failed integer;
  v_last timestamptz;
begin
  if p_kind not in ('articles', 'poll', 'menu') or p_trigger not in ('schedule', 'manual') or p_week is null then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  update public.community_editorial_runs set status = 'error', finished_at = now(), error = 'TIMEOUT: la ejecución no terminó.'
  where status = 'running' and started_at < now() - interval '20 minutes';
  if p_trigger = 'manual' then
    if exists (select 1 from public.community_editorial_runs r where r.kind = p_kind and r.status = 'running') then
      return null;
    end if;
    insert into public.community_editorial_runs (kind, trigger, week_start, requested_by) values (p_kind, 'manual', p_week, p_user) returning id into v_id;
    return v_id;
  end if;
  select count(*), max(coalesce(r.finished_at, r.started_at)) into v_failed, v_last
  from public.community_editorial_runs r where r.kind = p_kind and r.week_start = p_week and r.trigger = 'schedule' and r.status = 'error';
  if v_failed >= 3 or (v_last is not null and v_last > now() - interval '50 minutes') then
    return null;
  end if;
  begin
    insert into public.community_editorial_runs (kind, trigger, week_start, attempt) values (p_kind, 'schedule', p_week, v_failed + 1) returning id into v_id;
  exception when unique_violation then
    return null;
  end;
  return v_id;
end;
$$;

create or replace function public.community_service_editorial_finish_run(p_run uuid, p_status text, p_created integer, p_expected integer, p_error text default null, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.community_editorial_runs%rowtype;
begin
  if p_status not in ('ok', 'partial', 'error', 'skipped') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  update public.community_editorial_runs
  set status = p_status, finished_at = now(), items_created = greatest(coalesce(p_created, 0), 0), items_expected = greatest(coalesce(p_expected, 0), 0),
      error = left(nullif(btrim(coalesce(p_error, '')), ''), 300), detail = coalesce(p_detail, '{}'::jsonb)
  where id = p_run and status = 'running'
  returning * into r;
  if not found then
    return;
  end if;
  if r.items_created > 0 then
    perform private.community_notify_admins('Borradores de Comunidad listos',
      'Pepa ha preparado ' || r.items_created || (case when r.items_created = 1 then ' borrador' else ' borradores' end) || ' (' ||
      (case r.kind when 'articles' then 'artículos' when 'poll' then 'encuesta' else 'menú semanal' end) || '). Revísalos en el Centro de Administración: nada se publica sin tu aprobación.',
      '/comunidad/admin', 'editorial:' || r.id);
  end if;
  if p_status = 'error' and r.trigger = 'schedule' and r.attempt >= 3 then
    perform private.community_notify_admins('La generación semanal ha fallado',
      'No se ha podido preparar ' || (case r.kind when 'articles' then 'los artículos' when 'poll' then 'la encuesta' else 'el menú' end) || ' de la semana tras 3 intentos. Puedes generarlo a mano desde el Centro de Administración.',
      '/comunidad/admin', 'editorial-error:' || r.kind || ':' || r.week_start);
  end if;
end;
$$;

-- Plan de temas de los artículos que faltan en la semana (un hueco por día), por PRIORIDAD:
--   1) subtemas sin publicaciones (ni borradores pendientes); 2) ideas de «Propón un tema» aún sin usar; 3) subtemas con pocas publicaciones; 4) el resto (el de artículo más antiguo).
-- Una idea cuyo subtema está vacío se usa en ese mismo artículo (cumple las dos prioridades sin duplicar). Devuelve {slots:[…], avoid_titles:[…]}.
create or replace function public.community_service_editorial_plan_articles(p_week date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_missing date[];
  v_n integer;
  v_topics jsonb;
  v_cands jsonb := '[]'::jsonb;
  v_used_topics text[] := '{}';
  v_used_groups text[] := '{}';
  t record;
  g record;
  v_gk text;
  v_slots jsonb := '[]'::jsonb;
  v_i integer := 0;
  v_cand jsonb;
  v_recent jsonb;
  v_total integer;
begin
  select coalesce(array_agg(d::date order by d), '{}') into v_missing
  from generate_series(p_week::timestamp, (p_week + 6)::timestamp, interval '1 day') d
  where not exists (select 1 from public.community_official_items i where i.kind = 'article' and i.slot_date = d::date and i.status in ('proposed', 'approved', 'published'));
  v_n := coalesce(cardinality(v_missing), 0);
  if v_n = 0 then
    return jsonb_build_object('slots', '[]'::jsonb, 'avoid_titles', '[]'::jsonb);
  end if;

  -- Estadística por subtema (publicaciones visibles de cualquier tipo y autor; borradores o aprobados pendientes de artículo/consejo).
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', tp.id, 'section', tp.section, 'label', tp.label, 'sort_order', tp.sort_order,
    'published_n', (select count(*) from public.community_posts p where p.topic_id = tp.id and p.status = 'published'),
    'pending_n', (select count(*) from public.community_official_items i where i.topic_id = tp.id and i.kind in ('article', 'tip') and i.status in ('proposed', 'approved')),
    'last_at', (select max(coalesce(i.publish_at, i.proposed_at)) from public.community_official_items i where i.topic_id = tp.id and i.kind = 'article' and i.status <> 'rejected'))), '[]'::jsonb)
  into v_topics from public.community_topics tp;
  v_total := jsonb_array_length(v_topics);

  -- Tier 1: subtemas vacíos (recetas antes que hogar, por su orden), cada uno con su mejor idea de las familias si la hay.
  for t in select * from jsonb_to_recordset(v_topics) as x(id text, section text, label text, sort_order integer, published_n integer, pending_n integer, last_at timestamptz)
           where published_n = 0 and pending_n = 0 order by (case section when 'recetas' then 0 else 1 end), sort_order loop
    exit when jsonb_array_length(v_cands) >= v_n;
    v_gk := null;
    select x.group_key into v_gk
    from public.community_topic_proposals x where x.status = 'new' and x.item_id is null and x.topic_id = t.id and not (x.group_key = any (v_used_groups))
    group by x.group_key order by count(distinct x.profile_id) desc, max(x.created_at) desc limit 1;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('tier', 1, 'topic_id', t.id, 'group_key', v_gk));
    v_used_topics := v_used_topics || t.id;
    if v_gk is not null then
      v_used_groups := v_used_groups || v_gk;
    end if;
  end loop;
  -- Tier 2: el resto de ideas de las familias (las más pedidas primero), cada una en el subtema que eligió quien la propuso.
  for g in
    select x.group_key, (array_agg(x.topic_id order by x.created_at))[1] as topic_id, count(distinct x.profile_id) as people, max(x.created_at) as last_at
    from public.community_topic_proposals x where x.status = 'new' and x.item_id is null and not (x.group_key = any (v_used_groups))
    group by x.group_key order by count(distinct x.profile_id) desc, max(x.created_at) desc
  loop
    exit when jsonb_array_length(v_cands) >= v_n;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('tier', 2, 'topic_id', g.topic_id, 'group_key', g.group_key));
    v_used_groups := v_used_groups || g.group_key;
    v_used_topics := v_used_topics || g.topic_id;
  end loop;
  -- Tier 3: subtemas con pocas publicaciones (hasta 3) aún no elegidos.
  for t in select * from jsonb_to_recordset(v_topics) as x(id text, section text, label text, sort_order integer, published_n integer, pending_n integer, last_at timestamptz)
           where not (id = any (v_used_topics)) and published_n + pending_n <= 3 order by published_n + pending_n, last_at nulls first, sort_order loop
    exit when jsonb_array_length(v_cands) >= v_n;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('tier', 3, 'topic_id', t.id, 'group_key', null));
    v_used_topics := v_used_topics || t.id;
  end loop;
  -- Tier 4: el resto, por el artículo más antiguo.
  for t in select * from jsonb_to_recordset(v_topics) as x(id text, section text, label text, sort_order integer, published_n integer, pending_n integer, last_at timestamptz)
           where not (id = any (v_used_topics)) order by last_at nulls first, sort_order loop
    exit when jsonb_array_length(v_cands) >= v_n;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('tier', 4, 'topic_id', t.id, 'group_key', null));
    v_used_topics := v_used_topics || t.id;
  end loop;
  -- Si hay más huecos que subtemas, se repiten los de artículo más antiguo (tier 4).
  while jsonb_array_length(v_cands) < v_n loop
    select * into t from jsonb_to_recordset(v_topics) as x(id text, section text, label text, sort_order integer, published_n integer, pending_n integer, last_at timestamptz)
      order by last_at nulls first, sort_order offset (jsonb_array_length(v_cands) % v_total) limit 1;
    v_cands := v_cands || jsonb_build_array(jsonb_build_object('tier', 4, 'topic_id', t.id, 'group_key', null));
  end loop;

  for v_cand in select * from jsonb_array_elements(v_cands) loop
    v_i := v_i + 1;
    select * into t from jsonb_to_recordset(v_topics) as x(id text, section text, label text, sort_order integer, published_n integer, pending_n integer, last_at timestamptz) where x.id = v_cand ->> 'topic_id';
    select coalesce(jsonb_agg(r.title order by r.at desc), '[]'::jsonb) into v_recent
    from (select i.title, coalesce(i.publish_at, i.proposed_at) as at from public.community_official_items i
          where i.topic_id = t.id and i.kind in ('article', 'tip') and i.status <> 'rejected' order by coalesce(i.publish_at, i.proposed_at) desc limit 8) r;
    v_gk := nullif(v_cand ->> 'group_key', '');
    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'slot_date', v_missing[v_i], 'topic_id', t.id, 'section', t.section, 'label', t.label, 'tier', (v_cand ->> 'tier')::integer,
      'published_n', t.published_n, 'pending_n', t.pending_n,
      'group_key', v_gk,
      'proposal_texts', case when v_gk is null then '[]'::jsonb else (
        select coalesce(jsonb_agg(d.text), '[]'::jsonb) from (select distinct y.text from public.community_topic_proposals y where y.group_key = v_gk and y.status = 'new' limit 6) d) end,
      'proposal_people', case when v_gk is null then 0 else (select count(distinct y.profile_id) from public.community_topic_proposals y where y.group_key = v_gk and y.status = 'new') end,
      'topic_recent_titles', v_recent));
  end loop;
  return jsonb_build_object('slots', v_slots,
    'avoid_titles', (select coalesce(jsonb_agg(a.title), '[]'::jsonb) from (
      select i.title from public.community_official_items i where i.kind in ('article', 'tip') and i.status <> 'rejected' and i.proposed_at > now() - interval '120 days' order by i.proposed_at desc limit 80) a));
end;
$$;

-- Contexto para la encuesta y el menú: si ya hay borrador en el hueco, y lo reciente para no repetir.
create or replace function public.community_service_editorial_context(p_kind text, p_week date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slot date := case p_kind when 'poll' then p_week + 5 when 'menu' then p_week end;
begin
  if p_kind not in ('poll', 'menu') or p_week is null then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'slot_date', v_slot,
    'exists', exists (select 1 from public.community_official_items i where i.kind = p_kind and i.slot_date = v_slot and i.status in ('proposed', 'approved', 'published')),
    'recent_questions', case p_kind when 'poll' then (select coalesce(jsonb_agg(r.title order by r.at desc), '[]'::jsonb) from (
      select i.title, i.proposed_at as at from public.community_official_items i where i.kind = 'poll' and i.status <> 'rejected' order by i.proposed_at desc limit 16) r) end,
    'recent_dishes', case p_kind when 'menu' then (select coalesce(jsonb_agg(distinct d.title), '[]'::jsonb) from (
      select m -> 'meals' -> mm ->> 'title' as title
      from (select i.payload -> 'menu' as menu from public.community_official_items i where i.kind = 'menu' and i.status <> 'rejected' order by i.proposed_at desc limit 5) x,
           jsonb_array_elements(x.menu -> 'days') m, unnest(array['comida', 'cena']) mm) d where d.title is not null) end,
    'hogar_topics', case p_kind when 'poll' then (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label) order by t.sort_order), '[]'::jsonb) from public.community_topics t where t.section = 'hogar') end);
end;
$$;

-- Alta de UN borrador del programa. Devuelve su id o NULL si el hueco ya estaba ocupado (otra ejecución se adelantó: no se duplica) o el contenido no es válido
-- (se anota en el detalle de la ejecución; el borrador no se guarda a medias). Validaciones: las mismas que las propuestas semanales (menú completo, recetas, opciones).
create or replace function public.community_service_editorial_create_item(p_run uuid, p_item jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := p_item ->> 'kind';
  v_slot date := (p_item ->> 'slot_date')::date;
  v_topic text := p_item ->> 'topic_id';
  v_section text;
  v_payload jsonb := coalesce(p_item -> 'payload', '{}'::jsonb);
  v_title text := left(btrim(coalesce(p_item ->> 'title', '')), 140);
  v_body text := left(coalesce(p_item ->> 'body', ''), 10000);
  v_group text := nullif(p_item ->> 'group_key', '');
  v_id uuid;
  v_err text;
  v_aliases text[];
  v_line text;
  v_who text;
  v_week date;
begin
  if not exists (select 1 from public.community_editorial_runs r where r.id = p_run and r.status = 'running') then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if v_kind not in ('article', 'poll', 'menu') or v_slot is null or char_length(v_title) < 3 then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  select t.section into v_section from public.community_topics t where t.id = v_topic;
  if v_section is null then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  if v_kind = 'article' then
    if coalesce(jsonb_array_length(v_payload -> 'sources'), 0) = 0 and coalesce(v_payload ->> 'editorial', 'false') <> 'true' then
      raise exception 'NO_SOURCES' using errcode = 'P0001';
    end if;
    if char_length(btrim(v_body)) < 200 then
      raise exception 'TEXT_REQUIRED' using errcode = 'P0001';
    end if;
    if v_payload ? 'recipes' and jsonb_typeof(v_payload -> 'recipes') <> 'null' then
      v_err := private.community_validate_post_recipes(v_payload -> 'recipes');
      if v_err is not null then
        raise exception 'RECIPES_INVALID' using errcode = 'P0001', detail = v_err;
      end if;
    end if;
    -- Mismo título (sin tildes ni mayúsculas) que otro de los últimos 120 días: no se duplica.
    if exists (select 1 from public.community_official_items i where i.kind in ('article', 'tip') and i.status <> 'rejected' and i.proposed_at > now() - interval '120 days'
               and private.community_menu_norm(i.title) = private.community_menu_norm(v_title)) then
      return null;
    end if;
  elsif v_kind = 'poll' then
    if jsonb_typeof(v_payload -> 'options') <> 'array' or jsonb_array_length(v_payload -> 'options') not between 2 and 6 or v_section <> 'hogar' then
      raise exception 'BAD_KIND' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.community_official_items i where i.kind = 'poll' and i.status <> 'rejected' and private.community_menu_norm(i.title) = private.community_menu_norm(v_title)) then
      return null;
    end if;
  else
    v_err := private.community_validate_menu_item(v_payload);
    if v_err is not null then
      raise exception 'MENU_INVALID' using errcode = 'P0001', detail = v_err;
    end if;
    if v_payload ->> 'schedule' is distinct from 'saturday' then
      raise exception 'MENU_INVALID' using errcode = 'P0001', detail = 'El menú semanal debe llevar la programación «saturday».';
    end if;
  end if;
  v_week := date_trunc('week', v_slot)::date;
  begin
    insert into public.community_official_items (kind, section, topic_id, title, body, payload, batch_week, proposed_by, slot_date, generated_run_id, generation)
    values (v_kind, v_section, v_topic, v_title, v_body, v_payload, v_week, 'Pepa (IA)', v_slot, p_run, jsonb_build_object('tier', p_item -> 'tier', 'group_key', v_group, 'ai', true))
    returning id into v_id;
  exception when unique_violation then
    return null;
  end;
  insert into public.community_official_item_versions (item_id, version, snapshot)
  values (v_id, 1, jsonb_build_object('kind', v_kind, 'section', v_section, 'topic_id', v_topic, 'title', v_title, 'body', v_body, 'payload', v_payload));
  -- Idea de las familias: se enlaza al borrador (nada se publica) y, solo con quienes aceptaron el agradecimiento público, se añade la línea al final.
  if v_kind = 'article' and v_group is not null then
    update public.community_topic_proposals set item_id = v_id, status = 'drafted', handled_at = now()
    where group_key = v_group and status = 'new' and item_id is null;
    select array_agg(a.alias order by a.alias) into v_aliases from (
      select distinct cp.alias from public.community_topic_proposals x join public.community_profiles cp on cp.id = x.profile_id
      where x.item_id = v_id and x.credit_consent and cp.deleted_at is null and cp.alias is not null and btrim(cp.alias) <> '' and not cp.is_official) a;
    if v_aliases is not null and cardinality(v_aliases) > 0 then
      if cardinality(v_aliases) = 1 then
        v_line := '❤️ Este artículo nació de una idea de @' || v_aliases[1] || '. ¡Gracias por ayudarnos a hacer crecer Comunidad PEPA!';
      else
        select string_agg('@' || a, ', ' order by a) into v_who from unnest(v_aliases[1:cardinality(v_aliases) - 1]) a;
        v_line := '❤️ Este artículo nació de ideas de ' || v_who || ' y @' || v_aliases[cardinality(v_aliases)] || '. ¡Gracias por ayudarnos a hacer crecer Comunidad PEPA!';
      end if;
      update public.community_official_items set body = btrim(body) || E'\n\n' || v_line where id = v_id;
    end if;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6) Rectificaciones con IA
-- ---------------------------------------------------------------------------------------------
create table public.community_editorial_revisions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.community_official_items(id) on delete cascade,
  -- Versión del elemento sobre la que se pidió el cambio: si cambia antes de decidir (otra edición), la propuesta queda «obsoleta» y no se aplica.
  base_version integer not null,
  scope text not null check (scope in ('item', 'dish')),
  -- Para un plato del menú: {"day": 0-6, "meal": "comida"|"cena"}. Vacío en el resto.
  target jsonb not null default '{}'::jsonb,
  instruction text not null check (char_length(btrim(instruction)) between 3 and 1000),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'stale')),
  before jsonb not null,
  result jsonb not null,
  -- Resumen breve de qué ha cambiado la IA (para la persona que decide; sin datos privados).
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);
create index idx_community_editorial_revisions_item on public.community_editorial_revisions (item_id, created_at desc);
alter table public.community_editorial_revisions enable row level security;
revoke all on public.community_editorial_revisions from anon, authenticated;

-- Contenido del elemento para que la IA lo rectifique (solo borradores o aprobados aún sin publicar).
create or replace function public.community_service_editorial_get_item(p_item uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', i.id, 'kind', i.kind, 'section', i.section, 'topic_id', i.topic_id, 'topic_label', (select t.label from public.community_topics t where t.id = i.topic_id),
                            'status', i.status, 'version', i.version, 'title', i.title, 'body', i.body, 'payload', i.payload)
  from public.community_official_items i where i.id = p_item and i.status in ('proposed', 'approved') and i.published_post_id is null
$$;

-- Guarda una propuesta de rectificación. Límites: 30 por elemento y día, 100 por persona y día (freno de consumo de IA). Devuelve el id.
create or replace function public.community_service_editorial_save_revision(p_item uuid, p_user uuid, p_scope text, p_target jsonb, p_instruction text, p_before jsonb, p_result jsonb, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_id uuid;
begin
  select i.version into v_version from public.community_official_items i where i.id = p_item and i.status in ('proposed', 'approved') and i.published_post_id is null;
  if v_version is null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if (select count(*) from public.community_editorial_revisions r where r.item_id = p_item and r.created_at > now() - interval '1 day') >= 30
     or (select count(*) from public.community_editorial_revisions r where r.created_by = p_user and r.created_at > now() - interval '1 day') >= 100 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  -- Una propuesta nueva sin decidir sustituye a la anterior sin decidir del mismo elemento (no se acumulan).
  update public.community_editorial_revisions set status = 'rejected', decided_at = now() where item_id = p_item and status = 'proposed';
  insert into public.community_editorial_revisions (item_id, base_version, scope, target, instruction, before, result, notes, created_by)
  values (p_item, v_version, p_scope, coalesce(p_target, '{}'::jsonb), left(btrim(p_instruction), 1000), p_before, p_result, left(nullif(btrim(coalesce(p_notes, '')), ''), 500), p_user)
  returning id into v_id;
  return v_id;
end;
$$;

-- Validación del menú completo + avisos de calidad (para que la IA y el panel enseñen el estado de un menú propuesto antes de aceptarlo).
create or replace function public.community_service_validate_menu_item(p_payload jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('error', private.community_validate_menu_item(p_payload),
                            'quality', case when private.community_validate_menu_item(p_payload) is null then private.community_menu_quality(p_payload -> 'menu') else '[]'::jsonb end)
$$;

-- ---------------------------------------------------------------------------------------------
-- 7) Administración (cualquier persona administradora de Comunidad)
-- ---------------------------------------------------------------------------------------------
-- La usa la función de servidor para comprobar que quien llama es administrador antes de generar o rectificar con IA.
create or replace function public.community_admin_can_generate()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return jsonb_build_object('ok', true, 'user', (select auth.uid()));
end;
$$;

create or replace function public.community_admin_editorial_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
  v_out jsonb := '{}'::jsonb;
  k text;
  v_enabled boolean;
  v_week date;
  v_last jsonb;
  v_sched jsonb;
  v_done boolean;
  v_failed integer;
  v_next timestamptz;
  v_expected integer;
begin
  perform private.community_require_admin();
  select * into c from private.community_editorial_cycle(now());
  foreach k in array array['articles', 'poll', 'menu'] loop
    v_enabled := private.community_setting_int(case k when 'articles' then 'editorial_articles_enabled' when 'poll' then 'editorial_polls_enabled' else 'editorial_menu_enabled' end, 0) = 1;
    v_week := case k when 'articles' then c.articles_week when 'poll' then c.poll_week else c.menu_week end;
    v_expected := case k when 'articles' then 7 else 1 end;
    select to_jsonb(r) - 'detail' into v_last from (select x.id, x.kind, x.trigger, x.week_start, x.status, x.started_at, x.finished_at, x.items_created, x.items_expected, x.attempt, x.error
      from public.community_editorial_runs x where x.kind = k order by x.started_at desc limit 1) r;
    select to_jsonb(r) into v_sched from (select x.id, x.status, x.started_at, x.finished_at, x.items_created, x.items_expected, x.error
      from public.community_editorial_runs x where x.kind = k and x.trigger = 'schedule' order by x.started_at desc limit 1) r;
    select exists (select 1 from public.community_editorial_runs x where x.kind = k and x.trigger = 'schedule' and x.week_start = v_week and x.status in ('running', 'ok', 'partial')) into v_done;
    select count(*) into v_failed from public.community_editorial_runs x where x.kind = k and x.trigger = 'schedule' and x.week_start = v_week and x.status = 'error';
    v_next := case when v_done or v_failed >= 3 then c.run_at + interval '7 days' else c.run_at end;
    v_out := v_out || jsonb_build_object(k, jsonb_build_object(
      'enabled', v_enabled, 'week_start', v_week, 'next_run', v_next, 'due_now', (not v_done and v_failed < 3 and c.due), 'cycle_done', v_done, 'failed_attempts', v_failed,
      'last_run', v_last, 'last_scheduled_run', v_sched, 'expected', v_expected,
      'drafts', jsonb_build_object(
        'proposed', (select count(*) from public.community_official_items i where i.kind = case k when 'articles' then 'article' else k end and i.generated_run_id is not null and i.status = 'proposed'),
        'approved', (select count(*) from public.community_official_items i where i.kind = case k when 'articles' then 'article' else k end and i.generated_run_id is not null and i.status = 'approved'),
        'published', (select count(*) from public.community_official_items i where i.kind = case k when 'articles' then 'article' else k end and i.generated_run_id is not null and i.status = 'published'),
        'in_target_week', (select count(*) from public.community_official_items i where i.kind = case k when 'articles' then 'article' else k end and i.slot_date between v_week and v_week + 6 and i.status in ('proposed', 'approved', 'published')))));
  end loop;
  return jsonb_build_object(
    'launched', private.community_launched(),
    'cycle', jsonb_build_object('run_at', c.run_at, 'due', c.due, 'monday', c.monday),
    'kinds', v_out,
    'menu_autopublish', private.community_setting_int('weekly_menu_autopublish', 0) = 1,
    'ai', jsonb_build_object(
      'enabled', coalesce((select (cfg.value)::text <> 'false' from public.ai_config cfg where cfg.key = 'enabled'), true),
      'daily_cap', private.community_setting_int('ai_daily_cap', 300),
      'used_today', coalesce((select sum(u.calls) from public.community_ai_usage u where u.day = (now() at time zone 'Europe/Madrid')::date), 0)),
    'errors', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from (
      select r.id, r.kind, r.trigger, r.week_start, r.status, r.started_at, r.error, r.items_created, r.items_expected
      from public.community_editorial_runs r where r.status in ('error', 'partial') order by r.started_at desc limit 10) e));
end;
$$;

create or replace function public.community_admin_editorial_runs(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc) from (
    select x.id, x.kind, x.trigger, x.week_start, x.status, x.started_at, x.finished_at, x.items_created, x.items_expected, x.attempt, x.error, x.detail
    from public.community_editorial_runs x order by x.started_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100)) r), '[]'::jsonb);
end;
$$;

-- Borradores generados por el programa (o con hueco) para una semana de programa: lo que el panel enseña bajo cada interruptor.
create or replace function public.community_admin_editorial_items(p_week date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.slot_date, r.kind) from (
    select i.id, i.kind, i.title, i.status, i.version, i.slot_date, i.topic_id, (select t.label from public.community_topics t where t.id = i.topic_id) as topic_label,
           i.proposed_at, i.publish_at, i.generated_run_id, i.publish_error, (i.generation ->> 'tier')::integer as tier
    from public.community_official_items i
    where i.slot_date is not null and i.status <> 'rejected'
      and (p_week is null or i.slot_date between p_week and p_week + 6)
      and i.slot_date >= coalesce(p_week, current_date - 14)) r), '[]'::jsonb);
end;
$$;

create or replace function public.community_admin_editorial_revisions(p_item uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
    select x.id, x.item_id, x.base_version, x.scope, x.target, x.instruction, x.status, x.before, x.result, x.notes, x.created_at, x.decided_at
    from public.community_editorial_revisions x where x.item_id = p_item order by x.created_at desc limit 15) r), '[]'::jsonb);
end;
$$;

-- Aceptar o rechazar una rectificación. Aceptar crea una VERSIÓN NUEVA (la anterior queda en el historial) y el elemento vuelve a «proposed»: NO se publica nada y hay que
-- aprobarlo de nuevo. Si el elemento cambió mientras tanto (otra edición), la propuesta queda obsoleta y no se aplica (STALE).
create or replace function public.community_admin_editorial_decide_revision(p_revision uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.community_editorial_revisions%rowtype;
  i public.community_official_items%rowtype;
  v_version integer;
begin
  perform private.community_require_admin();
  select * into r from public.community_editorial_revisions x where x.id = p_revision and x.status = 'proposed' for update;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if not coalesce(p_accept, false) then
    update public.community_editorial_revisions set status = 'rejected', decided_by = (select auth.uid()), decided_at = now() where id = p_revision;
    perform private.community_log('editorial_revision_rejected', 'official_item', r.item_id, null, jsonb_build_object('revision', p_revision));
    return jsonb_build_object('accepted', false);
  end if;
  select * into i from public.community_official_items x where x.id = r.item_id and x.status in ('proposed', 'approved') and x.published_post_id is null for update;
  if not found then
    update public.community_editorial_revisions set status = 'stale', decided_by = (select auth.uid()), decided_at = now() where id = p_revision;
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if i.version <> r.base_version then
    update public.community_editorial_revisions set status = 'stale', decided_by = (select auth.uid()), decided_at = now() where id = p_revision;
    raise exception 'STALE' using errcode = 'P0001';
  end if;
  -- Pasa por la edición editorial normal (valida el menú, guarda versión nueva, vuelve a exigir aprobación).
  v_version := public.community_admin_edit_proposal(r.item_id, coalesce(r.result ->> 'title', i.title), coalesce(r.result ->> 'body', i.body), r.result -> 'payload');
  update public.community_editorial_revisions set status = 'accepted', decided_by = (select auth.uid()), decided_at = now() where id = p_revision;
  perform private.community_log('editorial_revision_accepted', 'official_item', r.item_id, null, jsonb_build_object('revision', p_revision, 'version', v_version));
  return jsonb_build_object('accepted', true, 'version', v_version);
end;
$$;

-- Historial de versiones de un elemento (no se pierde ninguna) y restauración de una anterior (crea otra versión nueva; nunca borra).
create or replace function public.community_admin_item_versions(p_item uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('version', v.version, 'title', v.snapshot ->> 'title', 'body', v.snapshot ->> 'body', 'payload', v.snapshot -> 'payload', 'edited_at', v.edited_at) order by v.version desc)
                   from public.community_official_item_versions v where v.item_id = p_item), '[]'::jsonb);
end;
$$;

create or replace function public.community_admin_restore_item_version(p_item uuid, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
begin
  perform private.community_require_admin();
  select v.snapshot into s from public.community_official_item_versions v where v.item_id = p_item and v.version = p_version;
  if s is null then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  return public.community_admin_edit_proposal(p_item, s ->> 'title', s ->> 'body', s -> 'payload');
end;
$$;

-- Reprogramar un artículo ya aprobado (no publicado). Fecha entre ahora y 60 días.
create or replace function public.community_admin_schedule_item(p_id uuid, p_publish_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  if p_publish_at is null or p_publish_at < now() - interval '1 minute' or p_publish_at > now() + interval '60 days' then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  update public.community_official_items set publish_at = p_publish_at, publish_attempts = 0, publish_error = null, last_publish_attempt_at = null
  where id = p_id and kind = 'article' and status = 'approved' and published_post_id is null and publish_at is not null;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  perform private.community_log('item_rescheduled', 'official_item', p_id, null, jsonb_build_object('publish_at', p_publish_at));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 8) Aprobar: los artículos del programa se PROGRAMAN para su día (10:00, Madrid); los artículos prácticos pueden ir sin fuentes externas
-- ---------------------------------------------------------------------------------------------
create or replace function public.community_admin_approve_proposal(p_id uuid, p_confirm_text boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.community_official_items%rowtype;
  v_win record;
  v_post uuid;
  v_err text;
  v_at timestamptz;
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x where x.id = p_id and x.status = 'proposed' for update;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  -- Un artículo con datos externos necesita sus fuentes; un artículo PRÁCTICO del programa (payload.editorial = true) puede ir sin ellas (siempre con revisión humana).
  if i.kind = 'article' and coalesce(jsonb_array_length(i.payload -> 'sources'), 0) = 0 and coalesce(i.payload ->> 'editorial', 'false') <> 'true' then
    raise exception 'NO_SOURCES' using errcode = 'P0001';
  end if;
  if i.kind = 'menu' then
    v_err := private.community_validate_menu_item(i.payload);
    if v_err is not null then
      raise exception 'MENU_INVALID' using errcode = 'P0001', detail = v_err;
    end if;
    if i.menu_text_stale and not coalesce(p_confirm_text, false) then
      raise exception 'MENU_TEXT_STALE' using errcode = 'P0001';
    end if;
    if i.payload ->> 'schedule' = 'saturday' then
      select * into v_win from private.community_menu_publish_window(now());
      begin
        update public.community_official_items
        set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), approved_version = version, publish_at = v_win.publish_at,
            menu_week_start = v_win.week_start, publish_attempts = 0, publish_error = null, last_publish_attempt_at = null, menu_text_stale = false
        where id = p_id;
      exception when unique_violation then
        raise exception 'MENU_WEEK_TAKEN' using errcode = 'P0001';
      end;
      perform private.community_log('proposal_approved', 'official_item', p_id, null,
        jsonb_build_object('version', i.version, 'kind', i.kind, 'publish_at', v_win.publish_at, 'week_start', v_win.week_start, 'text_confirmed', i.menu_text_stale));
      return jsonb_build_object('scheduled', true, 'publish_at', v_win.publish_at, 'week_start', v_win.week_start, 'week_end', v_win.week_end, 'post_id', null);
    end if;
  end if;
  -- Artículo del programa (con hueco): se programa para su día a las 10:00 (hora de Madrid); si esa hora ya pasó, sale en cuanto lo recoja el trabajo de cada 5 minutos.
  if i.kind = 'article' and i.slot_date is not null then
    v_at := greatest(((i.slot_date + time '10:00') at time zone 'Europe/Madrid'), now() + interval '1 minute');
    update public.community_official_items
    set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), approved_version = version, publish_at = v_at, publish_attempts = 0, publish_error = null, last_publish_attempt_at = null
    where id = p_id;
    perform private.community_log('proposal_approved', 'official_item', p_id, null, jsonb_build_object('version', i.version, 'kind', i.kind, 'publish_at', v_at));
    return jsonb_build_object('scheduled', true, 'publish_at', v_at, 'post_id', null);
  end if;
  update public.community_official_items
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), approved_version = version, menu_text_stale = false
  where id = p_id;
  perform private.community_log('proposal_approved', 'official_item', p_id, null, jsonb_build_object('version', i.version, 'kind', i.kind));
  if i.kind = 'poll' then
    select * into v_win from private.community_poll_window(now());
    insert into public.community_polls (item_id, question, options, opens_at, closes_at)
    values (p_id, i.title, i.payload -> 'options', v_win.opens_at, v_win.closes_at)
    on conflict (item_id) do update set question = excluded.question, options = excluded.options, opens_at = excluded.opens_at, closes_at = excluded.closes_at;
    update public.community_official_items set publish_at = v_win.opens_at where id = p_id;
    -- Nunca se publica al aprobar: lo hace el trabajo programado (community_run_polls) a la hora de apertura.
    return jsonb_build_object('scheduled', true, 'opens_at', v_win.opens_at, 'closes_at', v_win.closes_at, 'post_id', v_post);
  end if;
  v_post := private.community_publish_item(p_id);
  return jsonb_build_object('scheduled', false, 'post_id', v_post);
end;
$$;

-- El listado de propuestas enseña además el hueco del programa, quién lo generó y el nivel de prioridad del tema (resto igual que antes).
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
      'review_note', i.review_note, 'publish_at', i.publish_at, 'published_post_id', i.published_post_id,
      'menu_week_start', i.menu_week_start, 'publish_attempts', i.publish_attempts, 'publish_error', i.publish_error, 'menu_text_stale', i.menu_text_stale,
      'menu_check', case when i.kind = 'menu' then private.community_menu_check(i.payload -> 'menu', i.id) end,
      'slot_date', i.slot_date, 'generated', i.generated_run_id is not null, 'proposed_by', i.proposed_by, 'tier', (i.generation ->> 'tier')::integer) order by i.batch_week desc, i.slot_date nulls last, i.proposed_at)
    from public.community_official_items i where i.status = p_status
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 9) Publicar a su hora los artículos aprobados con programación (cada 5 minutos, junto con encuestas y menús)
-- ---------------------------------------------------------------------------------------------
create or replace function private.community_run_articles(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_n integer := 0;
  v_attempts integer;
  v_title text;
  v_msg text;
  v_detail text;
begin
  with c as (
    select i.id from public.community_official_items i
    where i.kind = 'article' and i.status = 'approved' and i.published_post_id is null and i.publish_at is not null and i.publish_at <= p_now
      and i.publish_attempts < 3 and (i.last_publish_attempt_at is null or i.last_publish_attempt_at <= p_now - interval '4 minutes')
    order by i.publish_at, i.id limit 5 for update skip locked
  )
  select array_agg(c.id) into v_ids from c;
  foreach v_id in array coalesce(v_ids, '{}'::uuid[]) loop
    begin
      if private.community_publish_item(v_id) is not null then
        v_n := v_n + 1;
        perform private.community_log('article_published', 'official_item', v_id, 'programada');
      end if;
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_msg := left(sqlstate || ': ' || sqlerrm || case when sqlstate = 'P0001' and v_detail is not null then ' — ' || v_detail else '' end, 300);
      update public.community_official_items set publish_attempts = publish_attempts + 1, publish_error = v_msg, last_publish_attempt_at = p_now
      where id = v_id returning publish_attempts, title into v_attempts, v_title;
      perform private.community_log('article_publish_failed', 'official_item', v_id, v_msg, jsonb_build_object('attempt', v_attempts));
      if v_attempts >= 3 then
        perform private.community_notify_admins('Artículo con error', 'El artículo «' || v_title || '» no se ha podido publicar tras 3 intentos. Revísalo en el Centro de Administración.', '/comunidad/admin', 'article-error:' || v_id);
      end if;
    end;
  end loop;
  return v_n;
end;
$$;
revoke execute on function private.community_run_articles(timestamptz) from public, anon, authenticated;

create or replace function private.community_run_official()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_polls integer := 0;
  v_menus integer := 0;
  v_articles integer := 0;
begin
  begin
    v_polls := private.community_run_polls();
  exception when others then
    raise warning 'community_run_official (encuestas): %', sqlerrm;
  end;
  begin
    v_menus := private.community_run_menus();
  exception when others then
    raise warning 'community_run_official (menús): %', sqlerrm;
  end;
  begin
    v_articles := private.community_run_articles();
  exception when others then
    raise warning 'community_run_official (artículos): %', sqlerrm;
  end;
  return jsonb_build_object('polls', v_polls, 'menus', v_menus, 'articles', v_articles);
end;
$$;
revoke execute on function private.community_run_official() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 10) Uso de IA: nuevos fines
-- ---------------------------------------------------------------------------------------------
alter table public.community_ai_usage drop constraint if exists community_ai_usage_purpose_check;
alter table public.community_ai_usage add constraint community_ai_usage_purpose_check
  check (purpose in ('summary', 'pepa_answer', 'pepa_mention', 'proposals', 'editorial_article', 'editorial_poll', 'editorial_menu', 'editorial_revise'));

-- ---------------------------------------------------------------------------------------------
-- 11) Permisos
-- ---------------------------------------------------------------------------------------------
revoke all on function public.community_service_editorial_config() from public, anon, authenticated;
revoke all on function public.community_service_editorial_begin_run(text, text, date, uuid) from public, anon, authenticated;
revoke all on function public.community_service_editorial_finish_run(uuid, text, integer, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.community_service_editorial_plan_articles(date) from public, anon, authenticated;
revoke all on function public.community_service_editorial_context(text, date) from public, anon, authenticated;
revoke all on function public.community_service_editorial_create_item(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.community_service_editorial_get_item(uuid) from public, anon, authenticated;
revoke all on function public.community_service_editorial_save_revision(uuid, uuid, text, jsonb, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.community_service_validate_menu_item(jsonb) from public, anon, authenticated;
grant execute on function public.community_service_editorial_config() to service_role;
grant execute on function public.community_service_editorial_begin_run(text, text, date, uuid) to service_role;
grant execute on function public.community_service_editorial_finish_run(uuid, text, integer, integer, text, jsonb) to service_role;
grant execute on function public.community_service_editorial_plan_articles(date) to service_role;
grant execute on function public.community_service_editorial_context(text, date) to service_role;
grant execute on function public.community_service_editorial_create_item(uuid, jsonb) to service_role;
grant execute on function public.community_service_editorial_get_item(uuid) to service_role;
grant execute on function public.community_service_editorial_save_revision(uuid, uuid, text, jsonb, text, jsonb, jsonb, text) to service_role;
grant execute on function public.community_service_validate_menu_item(jsonb) to service_role;

revoke all on function public.community_admin_set_editorial_toggle(text, boolean) from public, anon;
revoke all on function public.community_admin_can_generate() from public, anon;
revoke all on function public.community_admin_editorial_status() from public, anon;
revoke all on function public.community_admin_editorial_runs(integer) from public, anon;
revoke all on function public.community_admin_editorial_items(date) from public, anon;
revoke all on function public.community_admin_editorial_revisions(uuid) from public, anon;
revoke all on function public.community_admin_editorial_decide_revision(uuid, boolean) from public, anon;
revoke all on function public.community_admin_item_versions(uuid) from public, anon;
revoke all on function public.community_admin_restore_item_version(uuid, integer) from public, anon;
revoke all on function public.community_admin_schedule_item(uuid, timestamptz) from public, anon;
revoke all on function public.community_admin_approve_proposal(uuid, boolean) from public, anon;
revoke all on function public.community_admin_list_proposals(text) from public, anon;
grant execute on function public.community_admin_set_editorial_toggle(text, boolean) to authenticated;
grant execute on function public.community_admin_can_generate() to authenticated;
grant execute on function public.community_admin_editorial_status() to authenticated;
grant execute on function public.community_admin_editorial_runs(integer) to authenticated;
grant execute on function public.community_admin_editorial_items(date) to authenticated;
grant execute on function public.community_admin_editorial_revisions(uuid) to authenticated;
grant execute on function public.community_admin_editorial_decide_revision(uuid, boolean) to authenticated;
grant execute on function public.community_admin_item_versions(uuid) to authenticated;
grant execute on function public.community_admin_restore_item_version(uuid, integer) to authenticated;
grant execute on function public.community_admin_schedule_item(uuid, timestamptz) to authenticated;
grant execute on function public.community_admin_approve_proposal(uuid, boolean) to authenticated;
grant execute on function public.community_admin_list_proposals(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 12) Trabajo programado: cada hora, minuto 7. La función de servidor decide si toca (miércoles ≥ 08:00 hora de Madrid), respeta los interruptores y no duplica.
--     Con los tres interruptores en pausa no hace nada ni gasta IA.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'community-editorial') then
    perform cron.unschedule('community-editorial');
  end if;
  perform cron.schedule(
    'community-editorial',
    '7 * * * *',
    $job$
    select net.http_post(
      url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/community-editorial',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
      ),
      body := '{"action":"cron"}'::jsonb,
      timeout_milliseconds := 150000
    );
    $job$
  );
exception when others then
  raise warning 'community-editorial: no se pudo programar el trabajo (%).', sqlerrm;
end $$;
