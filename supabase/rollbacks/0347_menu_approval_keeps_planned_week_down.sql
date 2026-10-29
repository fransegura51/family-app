-- Deshace 0347: restaura community_admin_approve_proposal tal como estaba (el menú vuelve a programarse siempre para el próximo sábado a las 10:00) y quita la función auxiliar.
-- No toca filas: los menús ya aprobados conservan la semana y la hora que tengan.
create or replace function public.community_admin_approve_proposal(p_id uuid, p_confirm_text boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
    return jsonb_build_object('scheduled', true, 'opens_at', v_win.opens_at, 'closes_at', v_win.closes_at, 'post_id', v_post);
  end if;
  v_post := private.community_publish_item(p_id);
  return jsonb_build_object('scheduled', false, 'post_id', v_post);
end;
$function$;
revoke all on function public.community_admin_approve_proposal(uuid, boolean) from public, anon;
grant execute on function public.community_admin_approve_proposal(uuid, boolean) to authenticated;

drop function if exists private.community_menu_window_for_slot(date, timestamptz);
