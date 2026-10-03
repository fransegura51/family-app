-- Corrección real (bug observado): al elegir una vivienda particular en "Buscar en el mapa" dentro de
-- "Gestionar evento", el picker mostraba de entrada una dirección postal legible, pero al guardar y
-- volver a entrar esa dirección había desaparecido (solo quedaba "✓ Ubicación real guardada"), y el
-- enlace compartido con los invitados caía siempre a coordenadas en bruto (Plus Code) en vez de una
-- dirección legible. Auditoría: `events` nunca tuvo dónde guardar la dirección postal ni el place_id de
-- Google — solo venue_label (texto libre tipo "Nuestra casa") + venue_latitude/venue_longitude.
--
-- Mismo precedente ya usado en event_moments (migración 0177, mismo problema, ya resuelto ahí): dos
-- columnas nuevas, NULLABLE, sin default distinto de null. Un evento existente (solo venue_label +
-- coordenadas) sigue funcionando exactamente igual — estos campos quedan vacíos hasta que alguien
-- vuelva a elegir la ubicación con el buscador. Sin backfill inventado, sin geocodificación masiva.
alter table public.events add column venue_address text;
alter table public.events add column venue_place_id text;
