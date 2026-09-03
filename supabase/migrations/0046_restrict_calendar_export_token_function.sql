-- Mismo criterio que 0033: la función ya comprueba auth.uid() por
-- dentro, pero no hay razón para que el rol anon (sin sesión) pueda
-- llamarla siquiera.
revoke execute on function public.get_or_create_calendar_export_token() from anon, public;
grant execute on function public.get_or_create_calendar_export_token() to authenticated;
