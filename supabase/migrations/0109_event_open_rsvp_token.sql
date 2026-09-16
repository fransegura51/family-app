-- Módulo Eventos — Fase 4: enlace de RSVP abierto (opcional, para
-- eventos informales — petición de la Skill, 07-invitations-rsvp.md
-- punto 7: "an open RSVP link may allow recipient to type minimal
-- identification and adult/child counts"). Mismo patrón que
-- generate_event_guest_rsvp_token (0107), pero sobre events.
-- open_rsvp_token (ya existía desde la migración 0106) en vez de un
-- invitado concreto — set search_path incluye "extensions" desde el
-- principio esta vez (pgcrypto vive ahí en este proyecto, ver 0084 y
-- el fix aplicado a 0107).
create or replace function public.generate_event_open_rsvp_token(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_family_id uuid;
  v_token text;
begin
  select family_id into v_family_id from events where id = p_event_id;

  if v_family_id is null or v_family_id <> private.current_family_id() then
    raise exception 'not found';
  end if;

  select open_rsvp_token into v_token from events where id = p_event_id;
  if v_token is not null then
    return v_token;
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  update events set open_rsvp_token = v_token where id = p_event_id;
  return v_token;
end;
$$;

revoke execute on function public.generate_event_open_rsvp_token(uuid) from public, anon;
grant execute on function public.generate_event_open_rsvp_token(uuid) to authenticated;

create or replace function public.regenerate_event_open_rsvp_token(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_family_id uuid;
  v_token text;
begin
  select family_id into v_family_id from events where id = p_event_id;

  if v_family_id is null or v_family_id <> private.current_family_id() then
    raise exception 'not found';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  update events set open_rsvp_token = v_token where id = p_event_id;
  return v_token;
end;
$$;

revoke execute on function public.regenerate_event_open_rsvp_token(uuid) from public, anon;
grant execute on function public.regenerate_event_open_rsvp_token(uuid) to authenticated;
