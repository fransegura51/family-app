-- Retira el puente con OwnTracks (migración 0213), por decisión de la usuaria: demasiado difícil de activar para una familia.
-- Borra las funciones y la tabla de códigos (los códigos ya generados dejan de valer al instante). Las posiciones ya guardadas en
-- member_locations / member_location_history no se tocan: son datos normales de la ubicación de PEPA.
drop function if exists public.ingest_member_location(uuid, text, double precision, double precision, timestamptz, double precision);
drop function if exists public.list_member_location_token_status();
drop function if exists public.revoke_member_location_token(uuid);
drop function if exists public.create_member_location_token(uuid);
drop table if exists public.member_location_tokens;
