-- Aviso del linter de seguridad de Supabase: create_family (SECURITY
-- DEFINER) era ejecutable por el rol `anon` vía /rest/v1/rpc. La función
-- ya rechaza llamadas sin sesión (auth.uid() null), pero no hay motivo
-- para exponerla sin iniciar sesión: el alta de familia siempre ocurre
-- con la cuenta ya creada.
revoke execute on function public.create_family(text, text, text) from public, anon;
grant execute on function public.create_family(text, text, text) to authenticated;
