-- Se quita Salud física (Hevy) por completo — la usuaria decidió no
-- seguir con ello porque no todos los miembros de la familia tienen
-- cuenta Hevy Pro (la API de Hevy solo funciona con Pro, no hay forma
-- de compartir una sola cuenta entre varias personas).
drop function if exists public.save_hevy_api_key(text);
drop function if exists public.delete_hevy_api_key();
drop function if exists public.has_hevy_api_key();
drop table if exists hevy_credentials;
