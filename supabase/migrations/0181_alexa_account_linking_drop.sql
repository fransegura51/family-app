-- Deshace por completo 0180_alexa_account_linking.sql — petición real: "Quita todo lo que has
-- hecho de Alexa. No funciona... Quítalo todo de la aplicación". Se deja la migración 0180 tal
-- cual (ya aplicada, cambiarla con retroefecto rompería el histórico) y se revierte aquí, en una
-- migración nueva, como exige el propio ratchet de migraciones de este repositorio.

drop function if exists public.disconnect_alexa();
drop function if exists public.redeem_alexa_auth_code(text);
drop function if exists public.mint_alexa_auth_code();

drop table if exists alexa_auth_codes;
drop table if exists alexa_links;
