-- Quita el control por voz desde el coche (IFTTT) — petición real:
-- "lo del coche lo podemos eliminar" tras confirmar que IFTTT ya no
-- deja capturar frases libres desde Google Assistant, así que la
-- función nunca iba a poder usarse de verdad. Se borra también la
-- tabla del token (era un secreto de acceso, mejor no dejarlo
-- rondando sin uso) — la función de servidor voice-webhook se deja
-- inerte al no encontrar ningún token válido nunca más.
drop function if exists public.create_voice_webhook_token(text);
drop table if exists voice_webhook_tokens;
