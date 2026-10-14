-- Deshace 0262.
do $$ begin if exists (select 1 from cron.job where jobname = 'daily-task-summaries') then perform cron.unschedule('daily-task-summaries'); end if; end $$;
drop function if exists private.run_daily_task_summaries();
drop table if exists public.daily_task_summary_deliveries;
