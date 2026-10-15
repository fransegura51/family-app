-- Deshace 0271_community_notifications.sql (generado a partir de la migración; revisar antes de usar). Borra los datos de Comunidad que contuviera.
do $$ begin if exists (select 1 from cron.job where jobname = 'community-run-notices') then perform cron.unschedule('community-run-notices'); end if; end $$;
do $$ begin if exists (select 1 from cron.job where jobname = 'community-run-suggestions') then perform cron.unschedule('community-run-suggestions'); end if; end $$;
drop trigger if exists community_comments_events on public.community_comments;
drop trigger if exists community_posts_followed on public.community_posts;
drop function if exists private.community_run_suggestions();
drop function if exists private.community_followed_post();
drop function if exists public.community_news_breakdown();
drop function if exists private.community_run_notices();
drop function if exists private.community_comment_events();
drop function if exists private.community_purge_private_data(uuid);
drop function if exists private.community_in_general_window(uuid);
drop function if exists private.community_in_personal_window(uuid);
drop function if exists private.community_local_time(uuid);
drop function if exists public.community_admin_set_launch(boolean);
drop function if exists public.community_status();
drop function if exists private.community_require_participant();
drop function if exists private.community_launched();
drop table if exists public.community_notice_state cascade;
drop table if exists public.community_notification_events cascade;
alter table public.user_notification_prefs drop column if exists community_suggestions_enabled;
alter table public.user_notification_prefs drop column if exists community_suggestion_every_hours;
delete from public.community_settings where key in ('launch_enabled', 'participants_adults_only');
-- private.community_require_participant() vuelve a su versión de 0265 (sin interruptor de lanzamiento ni «solo adultos»): reponer ese bloque de 0265 si hace falta.
