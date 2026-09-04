select cron.schedule(
  'purge-old-receipt-photos-daily',
  '15 4 * * *',
  $$
  select net.http_post(
    url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/purge-old-receipt-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
    ),
    body := '{}'::jsonb
  );
  $$
);
