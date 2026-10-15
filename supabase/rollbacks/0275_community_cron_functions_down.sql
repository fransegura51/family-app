-- Deshace 0275: retira los tres trabajos programados de Comunidad (las funciones de servidor dejan de recibir llamadas; no se borra ningún dato).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'community-pepa') then
    perform cron.unschedule('community-pepa');
  end if;
  if exists (select 1 from cron.job where jobname = 'community-maintenance') then
    perform cron.unschedule('community-maintenance');
  end if;
  if exists (select 1 from cron.job where jobname = 'community-weekly-proposals') then
    perform cron.unschedule('community-weekly-proposals');
  end if;
end $$;
