-- Deshace 0243: vuelve a 0186 (envío directo sin buzón). Los avisos pendientes del buzón se pierden.
-- evaluate_location_rules: si hace falta el nombre del lugar sin categoría, volver a la definición de 0186_server_side_automations.sql.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'retry-location-alerts') then
    perform cron.unschedule('retry-location-alerts');
  end if;
end $$;

create or replace function private.send_family_push(
  p_family_id uuid, p_exclude_member_id uuid, p_title text, p_body text, p_url text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/send-family-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))),
    body := jsonb_build_object('family_id', p_family_id, 'exclude_member_id', p_exclude_member_id, 'title', p_title, 'body', p_body, 'url', p_url)
  );
end;
$$;

drop function if exists private.retry_location_alerts();
drop function if exists private.dispatch_location_alert(uuid);
drop table if exists public.location_alert_outbox;
