-- Rollback de 0213_owntracks_background_location.sql: quita las funciones y la tabla de códigos de OwnTracks.
-- Las posiciones ya guardadas (member_locations / member_location_history) no se tocan.
drop function if exists public.ingest_member_location(uuid, text, double precision, double precision, timestamptz, double precision);
drop function if exists public.list_member_location_token_status();
drop function if exists public.revoke_member_location_token(uuid);
drop function if exists public.create_member_location_token(uuid);
drop table if exists public.member_location_tokens;
