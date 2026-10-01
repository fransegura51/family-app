-- Cierre de Fase 2 (Momentos/Google Maps) — aditiva, sin tocar ninguna fila existente. Google Places
-- Details ya devolvía nombre (displayName) y dirección (formattedAddress) por separado, pero el proxy
-- (supabase/functions/google-maps/index.ts) los colapsaba en un único texto priorizando la dirección —
-- el nombre real del sitio se perdía en cuanto había dirección, y el place_id nunca se devolvía aunque ya
-- se tenía. Ahora que se devuelven los 3 por separado, event_moments necesita dónde guardarlos.
--
-- Ambas columnas NULLABLE, sin default distinto de null: una fila antigua (solo location_label +
-- coordenadas, del picker de OpenStreetMap o de un pick anterior a este cambio) sigue funcionando
-- exactamente igual — estos campos quedan vacíos hasta que alguien vuelva a elegir la ubicación con el
-- buscador de Google Maps. Sin geocodificación inversa masiva, sin inventar direcciones.
alter table event_moments add column location_address text;
alter table event_moments add column location_place_id text;
