-- Petición real: "creo que es menos trabajo eligiendo directamente la
-- ubicación del sitio en el mapa, como en el calendario" — coordenadas
-- reales del sitio de un evento con una sola ubicación (cumpleaños,
-- celebración, personalizado), para construir un enlace de mapa que de
-- verdad lleve a la dirección y no dependa de que el texto de "Lugar"
-- (que puede ser algo tan informal como "en mi casa") sea buscable en
-- Google Maps. Las columnas equivalentes para ceremonia/celebración
-- (comunión/bautizo/boda) ya existían desde la 0106, sin usar.
alter table public.events
  add column venue_latitude double precision,
  add column venue_longitude double precision;
