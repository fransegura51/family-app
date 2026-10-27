-- Deshace 0325 (programa editorial semanal con IA). Restaura las versiones anteriores de community_admin_approve_proposal, community_admin_list_proposals y
-- private.community_run_official, y elimina lo añadido. ATENCIÓN: borra el registro de ejecuciones y de rectificaciones y las columnas slot_date / generated_run_id /
-- generation (no toca los artículos, encuestas ni menús, ni sus versiones, publicados o en borrador).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'community-editorial') then
    perform cron.unschedule('community-editorial');
  end if;
exception when others then
  raise warning 'community-editorial: no se pudo retirar el trabajo (%).', sqlerrm;
end $$;

drop function if exists public.community_admin_schedule_item(uuid, timestamptz);
drop function if exists public.community_admin_restore_item_version(uuid, integer);
drop function if exists public.community_admin_item_versions(uuid);
drop function if exists public.community_admin_editorial_decide_revision(uuid, boolean);
drop function if exists public.community_admin_editorial_revisions(uuid);
drop function if exists public.community_admin_editorial_items(date);
drop function if exists public.community_admin_editorial_runs(integer);
drop function if exists public.community_admin_editorial_status();
drop function if exists public.community_admin_can_generate();
drop function if exists public.community_admin_set_editorial_toggle(text, boolean);
drop function if exists public.community_service_validate_menu_item(jsonb);
drop function if exists public.community_service_editorial_save_revision(uuid, uuid, text, jsonb, text, jsonb, jsonb, text);
drop function if exists public.community_service_editorial_get_item(uuid);
drop function if exists public.community_service_editorial_create_item(uuid, jsonb);
drop function if exists public.community_service_editorial_context(text, date);
drop function if exists public.community_service_editorial_plan_articles(date);
drop function if exists public.community_service_editorial_finish_run(uuid, text, integer, integer, text, jsonb);
drop function if exists public.community_service_editorial_begin_run(text, text, date, uuid);
drop function if exists public.community_service_editorial_config();

-- Versiones anteriores (0270).
create or replace function private.community_run_official()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_polls integer := 0;
  v_menus integer := 0;
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
  return jsonb_build_object('polls', v_polls, 'menus', v_menus);
end;
$$;
revoke execute on function private.community_run_official() from public, anon, authenticated;
drop function if exists private.community_run_articles(timestamptz);

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
      'menu_check', case when i.kind = 'menu' then private.community_menu_check(i.payload -> 'menu', i.id) end) order by i.batch_week desc, i.proposed_at)
    from public.community_official_items i where i.status = p_status
  ), '[]'::jsonb);
end;
$$;

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
begin
  perform private.community_require_admin();
  select * into i from public.community_official_items x where x.id = p_id and x.status = 'proposed' for update;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if i.kind = 'article' and coalesce(jsonb_array_length(i.payload -> 'sources'), 0) = 0 then
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
    return jsonb_build_object('scheduled', true, 'opens_at', v_win.opens_at, 'closes_at', v_win.closes_at, 'post_id', v_post);
  end if;
  v_post := private.community_publish_item(p_id);
  return jsonb_build_object('scheduled', false, 'post_id', v_post);
end;
$$;

alter table public.community_ai_usage drop constraint if exists community_ai_usage_purpose_check;
delete from public.community_ai_usage where purpose in ('editorial_article', 'editorial_poll', 'editorial_menu', 'editorial_revise');
alter table public.community_ai_usage add constraint community_ai_usage_purpose_check check (purpose in ('summary', 'pepa_answer', 'pepa_mention', 'proposals'));

drop table if exists public.community_editorial_revisions;
drop index if exists public.uq_community_official_slot_menu;
drop index if exists public.uq_community_official_slot_poll;
drop index if exists public.uq_community_official_slot_article;
alter table public.community_official_items drop column if exists generation;
alter table public.community_official_items drop column if exists generated_run_id;
alter table public.community_official_items drop column if exists slot_date;
drop table if exists public.community_editorial_runs;
drop function if exists private.community_editorial_cycle(timestamptz);
delete from public.community_settings where key in ('editorial_articles_enabled', 'editorial_polls_enabled', 'editorial_menu_enabled');
