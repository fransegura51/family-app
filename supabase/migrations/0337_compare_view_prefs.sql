-- 0337 · Preferencias del Comparador de precios (NORM-3): modo (productos idénticos / alternativas comparables) y ordenación.
-- Solo AMPLÍA la lista cerrada de claves de user_prefs (private.user_pref_key_allowed) con dos claves de pantalla. No toca tablas, políticas ni datos.
-- Debe coincidir con SYNCED_KEY_PATTERN_SOURCES de src/state/prefs/prefsRegistry.ts.
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
