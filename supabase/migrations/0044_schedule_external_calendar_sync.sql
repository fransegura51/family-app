-- pg_cron llama a sync-external-calendars-cron cada hora — petición
-- real: "quiero que los calendarios externos se sincronicen
-- automáticamente cada hora". Mismo patrón que send-due-reminders
-- (migración 0005): secreto compartido de Vault en la cabecera, la
-- función lo valida antes de hacer nada.
select cron.schedule(
  'sync-external-calendars',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/sync-external-calendars-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
    ),
    body := '{}'::jsonb
  );
  $$
);
