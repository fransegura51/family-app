-- Deshace 0298: quita los disparadores que descartan posiciones y la tabla de zonas fantasma.
drop trigger if exists trg_drop_phantom_positions on public.member_locations;
drop trigger if exists trg_drop_phantom_positions on public.member_location_history;
drop function if exists private.drop_phantom_positions();
drop table if exists public.location_phantom_zones;
