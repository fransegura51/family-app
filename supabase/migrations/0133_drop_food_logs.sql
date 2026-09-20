-- Registro de comidas eliminado de la app (petición del usuario: no es
-- práctico y los datos eran de prueba). Sin claves foráneas ni vistas que
-- dependan de la tabla (comprobado antes de aplicarla).
drop table if exists public.food_logs;
