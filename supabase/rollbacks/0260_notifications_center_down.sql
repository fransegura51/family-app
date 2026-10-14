-- Deshace 0260_notifications_center.sql. Borra el historial de avisos y los ajustes por persona (datos nuevos, sin nada previo que recuperar).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-old-notifications') then perform cron.unschedule('purge-old-notifications'); end if;
  if exists (select 1 from cron.job where jobname = 'retry-user-push') then perform cron.unschedule('retry-user-push'); end if;
end $$;
drop function if exists public.record_notifications(jsonb);
drop function if exists private.notify_user(uuid, text, text, text, text, text, text, text, boolean, jsonb);
drop function if exists private.purge_old_notifications();
drop function if exists private.retry_user_push();
drop function if exists private.dispatch_user_push(uuid);
drop table if exists public.user_push_outbox;
drop trigger if exists user_notification_prefs_validate on public.user_notification_prefs;
drop table if exists public.user_notification_prefs;
drop function if exists private.validate_notification_prefs();
drop table if exists public.notification_dedupe;
drop table if exists public.user_notifications;
