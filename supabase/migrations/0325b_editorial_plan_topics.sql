-- Corrección de 0325: el plan de artículos no repite en otro hueco el subtema de una idea de las familias (tier 2).
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

