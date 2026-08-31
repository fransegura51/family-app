-- pg_cron llama a la Edge Function send-due-reminders cada minuto. El
-- secreto compartido se lee de Vault en tiempo de ejecución (nunca en
-- texto plano aquí) y viaja en la cabecera x-cron-secret; la función lo
-- valida contra el mismo secreto antes de hacer nada.
select cron.schedule(
  'send-due-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/send-due-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
    ),
    body := '{}'::jsonb
  );
  $$
);
