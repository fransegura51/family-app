-- Reprogramar una ENCUESTA oficial ya aprobada y aún sin publicar a otro sábado (Centro Editorial, 29/10/2026).
-- Antes solo se podían reprogramar artículos (community_admin_schedule_item) y menús (community_admin_reschedule_menu). Una encuesta aprobada abría el sábado siguiente a su
-- aprobación y no se podía trasladar a la semana que se quería coordinar con los artículos y el menú.
--
-- Reglas (las mismas que las de aprobar una encuesta, solo cambia la semana):
--   · solo administración de Comunidad (private.community_require_admin);
--   · la encuesta debe estar aprobada, sin publicar y con su ventana todavía «programada» (no abierta ni cerrada);
--   · la apertura es un SÁBADO a las 10:00 de Madrid, futuro y dentro de los próximos 60 días; el cierre es el domingo siguiente a las 17:00 de Madrid;
--   · no puede haber otra encuesta programada, abierta o aprobada en esa misma apertura (POLL_WEEK_TAKEN);
--   · NO cambia ni el texto ni las opciones ni la versión ni el estado de aprobación: solo las fechas. No publica nada.
create or replace function public.community_admin_reschedule_poll(p_id uuid, p_opens_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp;
  v_closes timestamptz;
  v_poll public.community_polls%rowtype;
begin
  perform private.community_require_admin();
  if p_opens_at is null or p_opens_at <= now() or p_opens_at > now() + interval '60 days' then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  v_local := p_opens_at at time zone 'Europe/Madrid';
  if extract(isodow from v_local)::integer <> 6 or v_local::time <> time '10:00' then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  v_closes := (((v_local::date + 1) + time '17:00') at time zone 'Europe/Madrid');

  select * into v_poll from public.community_polls p
  where p.item_id = p_id
    and p.status = 'scheduled'
    and exists (select 1 from public.community_official_items i where i.id = p.item_id and i.kind = 'poll' and i.status = 'approved' and i.published_post_id is null)
  for update;
  if not found then
    raise exception 'NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.community_polls o where o.item_id <> p_id and o.opens_at = p_opens_at and o.status in ('scheduled', 'open')) then
    raise exception 'POLL_WEEK_TAKEN' using errcode = 'P0001';
  end if;

  update public.community_polls set opens_at = p_opens_at, closes_at = v_closes where item_id = p_id;
  update public.community_official_items set publish_at = p_opens_at, publish_attempts = 0, publish_error = null, last_publish_attempt_at = null where id = p_id;
  perform private.community_log('item_rescheduled', 'official_item', p_id, null, jsonb_build_object('kind', 'poll', 'opens_at', p_opens_at, 'closes_at', v_closes));
  return jsonb_build_object('opens_at', p_opens_at, 'closes_at', v_closes);
end;
$$;
revoke all on function public.community_admin_reschedule_poll(uuid, timestamptz) from public, anon;
grant execute on function public.community_admin_reschedule_poll(uuid, timestamptz) to authenticated;
