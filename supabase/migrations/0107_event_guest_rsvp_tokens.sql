-- Módulo Eventos — Fase 2: enlaces personalizados de RSVP.
-- Mismo patrón que get_or_create_calendar_export_token (0045/0046):
-- SECURITY DEFINER, comprueba que quien llama pertenece a la familia
-- dueña del invitado antes de generar/rotar su token — el token en sí
-- (24 bytes aleatorios, como el de exportar calendario) es la única
-- autenticación de la página pública de RSVP (ver función edge
-- event-rsvp), que corre sin sesión de PEPA.

create or replace function public.generate_event_guest_rsvp_token(p_guest_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_token text;
begin
  select e.family_id into v_family_id
  from event_guests g
  join events e on e.id = g.event_id
  where g.id = p_guest_id;

  if v_family_id is null or v_family_id <> private.current_family_id() then
    raise exception 'not found';
  end if;

  select rsvp_token into v_token from event_guests where id = p_guest_id;
  if v_token is not null then
    return v_token;
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  update event_guests set rsvp_token = v_token where id = p_guest_id;
  return v_token;
end;
$$;

revoke execute on function public.generate_event_guest_rsvp_token(uuid) from public, anon;
grant execute on function public.generate_event_guest_rsvp_token(uuid) to authenticated;

-- Petición de la Skill: "Organizer can regenerate/invalidate the RSVP
-- token/link if needed" — sobrescribir el token deja el enlace viejo
-- inservible al instante (ya no hay ninguna fila con ese valor), sin
-- necesidad de una bandera aparte.
create or replace function public.regenerate_event_guest_rsvp_token(p_guest_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_token text;
begin
  select e.family_id into v_family_id
  from event_guests g
  join events e on e.id = g.event_id
  where g.id = p_guest_id;

  if v_family_id is null or v_family_id <> private.current_family_id() then
    raise exception 'not found';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  update event_guests set rsvp_token = v_token where id = p_guest_id;
  return v_token;
end;
$$;

revoke execute on function public.regenerate_event_guest_rsvp_token(uuid) from public, anon;
grant execute on function public.regenerate_event_guest_rsvp_token(uuid) to authenticated;
