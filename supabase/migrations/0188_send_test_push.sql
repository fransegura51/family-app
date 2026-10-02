-- Botón "Mandarme un aviso de prueba" (Familia → Avisos en este móvil).
--
-- Petición real: "añade un botón para activar los avisos desde la aplicación de Pepa... para
-- activarlo o desactivarlo". La única forma de saber de verdad que los avisos llegan a un móvil es
-- mandar uno real por el mismo camino que los de verdad (Edge Function send-family-push), no un aviso
-- local de la página — que sale aunque el envío del servidor esté roto, que era justo el problema.
--
-- SOLO llega a los dispositivos de quien lo pide (only_profile_id), nunca a toda la familia. Cada
-- pulsación cuesta una invocación de la Edge Function, así que hay un enfriamiento de 20 s por persona.

create table push_test_log (
  profile_id uuid primary key references profiles(id) on delete cascade,
  last_sent_at timestamptz not null
);

-- RLS activo SIN políticas: nadie lo lee ni lo escribe por la API, solo la función de abajo.
alter table push_test_log enable row level security;

create or replace function public.send_test_push_to_me()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := auth.uid();
  v_family uuid := private.current_family_id();
begin
  if v_profile is null or v_family is null then
    raise exception 'No autenticado';
  end if;

  insert into public.push_test_log (profile_id, last_sent_at)
  values (v_profile, now())
  on conflict (profile_id) do update set last_sent_at = now()
  where public.push_test_log.last_sent_at < now() - interval '20 seconds';

  if not found then
    raise exception 'Espera unos segundos antes de mandar otra prueba';
  end if;

  perform net.http_post(
    url := 'https://objhgjgrinbhyzscjlbw.supabase.co/functions/v1/send-family-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select public.get_app_secret('cron_shared_secret'))
    ),
    body := jsonb_build_object(
      'family_id', v_family,
      'only_profile_id', v_profile,
      'title', '🔔 Prueba de avisos',
      'body', 'Si ves esto, los avisos funcionan en este móvil.',
      'url', '/familia'
    )
  );
end;
$$;

revoke execute on function public.send_test_push_to_me() from public, anon;
grant execute on function public.send_test_push_to_me() to authenticated;
