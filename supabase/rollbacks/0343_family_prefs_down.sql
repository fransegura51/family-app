-- Deshacer 0343: devuelve el valor familiar a cada miembro como preferencia personal (sin pisar un valor personal ya existente) y borra lo familiar.
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
       '^familyapp:compras-compare-(mode|sort)$',
       '^familyapp:tab-order:[A-Za-z0-9_-]+$',
       '^pepa:(auto-confirm|show-classic-buttons)$',
       '^familyapp:calendar-onboarding-seen:[A-Za-z0-9_-]+$',
       '^familyapp:kids-(theme|sprite):[A-Za-z0-9_-]+$',
       '^pepa\.eventMenuView$',
       '^pepa\.reviewInvite\.until$'
     ])
$function$;
revoke all on function private.user_pref_key_allowed(text) from public, anon, authenticated;

insert into public.user_prefs (user_id, key, value)
select pr.id, f.key, f.value
  from public.family_prefs f
  join public.profiles pr on pr.family_id = f.family_id
on conflict (user_id, key) do nothing;

do $realtime$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'family_prefs') then
    alter publication supabase_realtime drop table public.family_prefs;
  end if;
end
$realtime$;

drop function if exists public.set_family_pref(text, jsonb, bigint);
drop function if exists private.family_pref_key_allowed(text);
drop table if exists public.family_prefs;
