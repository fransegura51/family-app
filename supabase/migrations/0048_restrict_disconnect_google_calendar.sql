-- Se me olvidó en 0047: disconnect_google_calendar comprueba admin por
-- dentro, pero no hay razón para que ni siquiera el rol anon pueda
-- llamarla. Mismo criterio que las demás funciones de esta app.
revoke execute on function public.disconnect_google_calendar() from anon, public;
grant execute on function public.disconnect_google_calendar() to authenticated;
