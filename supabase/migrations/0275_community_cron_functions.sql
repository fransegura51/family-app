-- COMUNIDAD PEPA — trabajos programados que llaman a las funciones de servidor de Comunidad.
--
--  · community-pepa              cada 10 minutos: Pepa responde preguntas sin respuesta humana (tras 6 h, máx. 3 por hora móvil) y menciones @pepa.
--  · community-maintenance       cada 15 minutos: borra del almacenamiento las fotos de la cola y, una vez al día, busca fotos sueltas.
--  · community-weekly-proposals  miércoles a las 08:00 UTC: prepara el lote semanal PARA REVISIÓN HUMANA (llega antes del sábado; nada se publica solo).
--
-- Mismo patrón que el recordatorio de calendario (0005) y que private.dispatch_user_push (0260): pg_net hace la llamada y el secreto compartido se lee
-- del Vault en el momento (nunca en texto plano aquí) y viaja en la cabecera x-cron-secret; cada función lo valida contra el mismo secreto.
-- Idempotente: si el trabajo ya existe se retira y se vuelve a programar. NO usa ai_gate (que es por familia): estas funciones cuentan con los contadores
-- de Comunidad (community_ai_usage, tope diario ai_daily_cap en community_settings).
--
-- Coste: pg_cron + pg_net no cobran aparte; cada llamada vacía de community-pepa son 4 consultas ligeras y la de mantenimiento 1-2.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'community-pepa') then
    perform cron.unschedule('community-pepa');
  end if;
  perform cron.schedule(
    'community-pepa',
    '*/10 * * * *',
    $job$
    select net.http_post(
      url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/community-pepa',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    $job$
  );

  if exists (select 1 from cron.job where jobname = 'community-maintenance') then
    perform cron.unschedule('community-maintenance');
  end if;
  perform cron.schedule(
    'community-maintenance',
    '*/15 * * * *',
    $job$
    select net.http_post(
      url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/community-maintenance',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    $job$
  );

  if exists (select 1 from cron.job where jobname = 'community-weekly-proposals') then
    perform cron.unschedule('community-weekly-proposals');
  end if;
  perform cron.schedule(
    'community-weekly-proposals',
    '0 8 * * 3',
    $job$
    select net.http_post(
      url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/community-weekly-proposals',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
    $job$
  );
end $$;
