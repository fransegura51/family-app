-- Deshace 0279_family_dietary_restrictions.sql (escrito a mano). BORRA TODAS las alergias, intolerancias y consentimientos registrados (datos de salud): no hay vuelta atrás.
drop trigger if exists dietary_purge_on_profile_delete on public.profiles;
drop function if exists public.dietary_delete(uuid);
drop function if exists public.dietary_update(uuid, text, text, text, text);
drop function if exists public.dietary_add(uuid, text, text, text, text, text);
drop function if exists public.dietary_revoke_consent(uuid);
drop function if exists public.dietary_grant_consent(uuid, text);
drop function if exists public.dietary_list();
drop table if exists public.member_dietary_restrictions cascade;
drop table if exists public.member_health_consent cascade;
drop function if exists private.dietary_purge_on_profile_delete();
drop function if exists private.dietary_purge_on_revoke();
drop function if exists private.dietary_restrictions_guard();
drop function if exists private.dietary_norm(text);
drop function if exists private.dietary_allergen_keys();
