-- Sincroniza los movimientos de todas las cuentas bancarias enlazadas,
-- de todas las familias, 4 veces al día (petición real: "en mi banco
-- pusieron que actualizan 4 veces al día... automático") — mismo
-- mecanismo que sync-external-calendars-cron: secreto compartido por
-- cabecera, no JWT de usuario, porque no hay ninguna sesión detrás de
-- un cron.
select cron.schedule(
  'sync-bank-transactions-4x-daily',
  '0 3,9,15,21 * * *',
  $$
  select net.http_post(
    url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/enable-banking-sync-transactions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
    ),
    body := '{}'::jsonb
  );
  $$
);
