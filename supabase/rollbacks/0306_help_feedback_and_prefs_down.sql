-- Deshacer 0306: quita las valoraciones de la Ayuda y devuelve la lista cerrada de claves a la de 0305. Las preferencias de Ayuda que alguien hubiera subido a user_prefs
-- se quedan en su tabla (inofensivas: la web las ignora cuando HELP_PREFS_SYNC_ENABLED está apagado); se pueden borrar con: delete from public.user_prefs where key like 'pepa:help-%';
begin;

drop function if exists public.help_feedback_summary(integer);
drop function if exists public.record_help_feedback(text, boolean);
drop table if exists public.help_feedback_daily;

create or replace function private.user_pref_key_allowed(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_key is not null
     and length(p_key) between 1 and 120
     and p_key ~ any (array[
       '^familyapp:(alimentacion|calendario|compras|economia|ubicacion)-menu-layout$',
       '^familyapp:(alimentacion|calendario|community|compras|economia|ubicacion)-pinned-tabs$',
       '^familyapp:community-menu-order$',
       '^familyapp:(color-theme|chart-color-theme|home-card-order|home-carousel|movement-color-mode|voice-response-mode)$',
       '^familyapp:tab-order:[A-Za-z0-9_-]+$',
       '^pepa:(auto-confirm|show-classic-buttons)$',
       '^familyapp:calendar-onboarding-seen:[A-Za-z0-9_-]+$',
       '^familyapp:kids-(theme|sprite):[A-Za-z0-9_-]+$',
       '^pepa\.eventMenuView$',
       '^pepa\.reviewInvite\.until$'
     ])
$function$;
revoke all on function private.user_pref_key_allowed(text) from public, anon, authenticated;

commit;
