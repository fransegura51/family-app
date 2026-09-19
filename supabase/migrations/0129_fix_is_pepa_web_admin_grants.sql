-- 0122 olvidó revocar el EXECUTE por defecto a PUBLIC (patrón ya usado
-- en 0109_event_open_rsvp_token.sql) — is_pepa_web_admin() solo tiene
-- sentido para una sesión ya autenticada, no para anon.
revoke execute on function public.is_pepa_web_admin() from public, anon;
grant execute on function public.is_pepa_web_admin() to authenticated;
