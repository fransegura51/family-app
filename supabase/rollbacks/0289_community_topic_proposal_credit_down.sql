-- Deshacer 0289: vuelve a «Propón un tema» de 0284 (sin consentimiento de agradecimiento, sin vínculo manual ni aviso al publicar).
drop trigger if exists community_idea_published on public.community_official_items;
drop function if exists private.community_idea_published_trigger();
drop function if exists private.community_notify_idea_published(uuid);
drop function if exists public.community_admin_add_credit(uuid);
drop function if exists public.community_admin_unlink_topic_proposals(text);
drop function if exists public.community_admin_link_topic_proposals(text, uuid);
drop function if exists public.community_propose_topic(text, text, boolean);

create or replace function public.community_propose_topic(p_topic text, p_text text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp uuid;
  v_text text;
  v_norm text;
  v_id uuid;
begin
  perform private.community_require_reader();
  perform private.community_require_participation_access();
  v_cp := private.community_require_participant();
  if not exists (select 1 from public.community_topics t where t.id = p_topic) then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  v_text := private.community_clean_text(p_text, 200, true);
  if char_length(v_text) < 8 then
    raise exception 'TEXT_REQUIRED' using errcode = 'P0001';
  end if;
  v_norm := regexp_replace(private.community_menu_norm(v_text), '[^a-z0-9 ]', '', 'g');
  v_norm := btrim(regexp_replace(v_norm, '\s+', ' ', 'g'));
  select id into v_id from public.community_topic_proposals x where x.profile_id = v_cp and x.norm_key = v_norm and x.status = 'new';
  if v_id is not null then
    return v_id;
  end if;
  if (select count(*) from public.community_topic_proposals x where x.profile_id = v_cp and x.created_at > now() - interval '1 day') >= 5 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.community_topic_proposals (profile_id, topic_id, text, norm_key, group_key)
  values (v_cp, p_topic, v_text, v_norm, v_norm)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.community_admin_list_topic_proposals(p_status text default 'new')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  if p_status not in ('new', 'drafted', 'dismissed') then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(g.item order by g.people desc, g.last_at desc)
    from (
      select count(distinct x.profile_id) as people, max(x.created_at) as last_at,
             jsonb_build_object(
               'group_key', x.group_key,
               'label', coalesce(max(x.group_label), (array_agg(x.text order by x.created_at))[1]),
               'topic_id', (array_agg(x.topic_id order by x.created_at))[1],
               'topic_label', (select t.label from public.community_topics t where t.id = (array_agg(x.topic_id order by x.created_at))[1]),
               'people', count(distinct x.profile_id),
               'proposals', count(*),
               'first_at', min(x.created_at),
               'last_at', max(x.created_at),
               'texts', (select coalesce(jsonb_agg(d.text), '[]'::jsonb) from (select distinct y.text from public.community_topic_proposals y where y.group_key = x.group_key and y.status = p_status limit 6) d),
               'ids', jsonb_agg(x.id),
               'item_id', max(x.item_id::text)) as item
      from public.community_topic_proposals x
      where x.status = p_status
      group by x.group_key
      order by count(distinct x.profile_id) desc, max(x.created_at) desc
      limit 200
    ) g
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.community_propose_topic(text, text) from public, anon;
grant execute on function public.community_propose_topic(text, text) to authenticated;

alter table public.community_topic_proposals drop column if exists notified_at;
alter table public.community_topic_proposals drop column if exists credit_consent;
