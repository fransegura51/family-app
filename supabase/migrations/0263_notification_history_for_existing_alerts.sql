-- Historial de la campana para los avisos que YA existían: llegadas/salidas y avisos diarios de la familia, y recordatorios de Previsión de pagos.
--
-- Los avisos del calendario los anota la función de servidor send-due-reminders (record_notifications); estos dos nacen en la propia base de datos y
-- se anotan aquí, sin cambiar a quién se avisa ni cómo se envía el push:
--  · private.send_family_push (0243): mismo cuerpo de siempre (buzón + envío con reintentos) y, además, un aviso en el historial de cada persona de la
--    familia que recibe el push (todas menos quien se movió). Cualquier fallo al anotar el historial solo deja un warning: el push sigue igual.
--  · public.claim_due_forecast_reminders (0155): mismo cuerpo de siempre y, además, un aviso en el historial de cada administrador/adulto de la familia.
--    La clave anti-repeticiones (recordatorio + fecha) evita duplicados aunque se ejecute cada minuto.
-- Ambos son avisos «otras notificaciones» (no personales).

create or replace function private.send_family_push(
  p_family_id uuid,
  p_exclude_member_id uuid,
  p_title text,
  p_body text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_exclude uuid := p_exclude_member_id;
  v_exclude_profile uuid;
  r record;
begin
  -- Modo prueba (ver 0243): también se avisa a quien se ha movido.
  if coalesce((select public.get_app_secret('location_alert_test_mode')), '') = 'on' then
    v_exclude := null;
  end if;

  insert into public.location_alert_outbox (family_id, member_id, exclude_member_id, title, body, url)
  values (p_family_id, p_exclude_member_id, v_exclude, p_title, p_body, coalesce(p_url, '/ubicacion'))
  returning id into v_id;

  perform private.dispatch_location_alert(v_id);

  -- Historial de la campana: nunca puede estropear el envío del push.
  begin
    select fm.linked_profile_id into v_exclude_profile from public.family_members fm where fm.id = v_exclude and fm.family_id = p_family_id;
    for r in select p.id from public.profiles p where p.family_id = p_family_id and p.id is distinct from v_exclude_profile loop
      perform private.notify_user(r.id, 'other', 'family_alert', p_title, p_body, coalesce(p_url, '/ubicacion'), null, null, false);
    end loop;
  exception when others then
    raise warning 'send_family_push historial: %', sqlerrm;
  end;
end;
$$;

revoke execute on function private.send_family_push(uuid, uuid, text, text, text) from public, anon, authenticated;

create or replace function public.claim_due_forecast_reminders(p_due jsonb)
returns table(out_subscription_id uuid, out_endpoint text, out_p256dh text, out_auth text, out_title text, out_occurrence_date date)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Historial de la campana (una vez por recordatorio y fecha gracias a la clave anti-repeticiones); nunca impide el envío.
  begin
    perform private.notify_user(pr.id, 'other', 'forecast_due', 'Previsión: ' || fp.title, 'Vence pronto', '/dinero', null,
      'forecast:' || (elem->>'reminder_id') || ':' || (elem->>'occurrence_date'), false)
    from jsonb_array_elements(p_due) as elem
    join forecast_reminders fr on fr.id = (elem->>'reminder_id')::uuid
    join forecast_payments fp on fp.id = fr.forecast_payment_id and fp.active
    join profiles pr on pr.family_id = fp.family_id and pr.role in ('admin', 'adult');
  exception when others then
    raise warning 'claim_due_forecast_reminders historial: %', sqlerrm;
  end;

  return query
  with due as (
    select (elem->>'reminder_id')::uuid as reminder_id, (elem->>'occurrence_date')::date as occurrence_date
    from jsonb_array_elements(p_due) as elem
  ),
  due_info as (
    select d.reminder_id, d.occurrence_date, fp.family_id, fp.title
    from due d
    join forecast_reminders fr on fr.id = d.reminder_id
    join forecast_payments fp on fp.id = fr.forecast_payment_id
    where fp.active
  ),
  candidates as (
    select di.reminder_id, di.occurrence_date, di.title, ps.id as sub_id, ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from due_info di
    join profiles pr on pr.family_id = di.family_id and pr.role in ('admin', 'adult')
    join push_subscriptions ps on ps.profile_id = pr.id
  ),
  claimed as (
    insert into forecast_reminder_deliveries (forecast_reminder_id, occurrence_date, subscription_id)
    select reminder_id, occurrence_date, sub_id from candidates
    on conflict (forecast_reminder_id, occurrence_date, subscription_id) do nothing
    returning forecast_reminder_deliveries.forecast_reminder_id, forecast_reminder_deliveries.occurrence_date, forecast_reminder_deliveries.subscription_id
  )
  select c.sub_id, c.ep, c.p256dh_key, c.auth_key, c.title, c.occurrence_date
  from candidates c
  join claimed cl on cl.forecast_reminder_id = c.reminder_id and cl.occurrence_date = c.occurrence_date and cl.subscription_id = c.sub_id;
end;
$function$;

revoke all on function public.claim_due_forecast_reminders(jsonb) from public, anon, authenticated;
grant execute on function public.claim_due_forecast_reminders(jsonb) to service_role;
