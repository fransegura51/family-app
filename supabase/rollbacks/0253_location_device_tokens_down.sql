-- Deshace 0253: la ubicación con la app nativa cerrada deja de funcionar (la app abierta sigue igual).
drop function if exists public.report_device_location(text, double precision, double precision, timestamptz);
drop function if exists public.revoke_location_device_tokens();
drop function if exists public.create_location_device_token(uuid);
drop table if exists public.location_device_tokens;
