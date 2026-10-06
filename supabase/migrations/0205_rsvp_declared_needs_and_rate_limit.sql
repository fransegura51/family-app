-- RSVP → necesidades alimentarias (tanda Eventos). Aditiva: crea tablas y una función; no modifica datos existentes.
--
-- 1) event_guest_declared_needs: lo que DECLARA el invitado en su RSVP. Es una capa SEPARADA de
--    event_guest_dietary_needs (lo confirmado por la familia). El RSVP solo escribe aquí, siempre como 'pendiente'.
--    La familia acepta (pasa a event_guest_dietary_needs, sin duplicar), corrige la clasificación o rechaza.
--    Rechazar NO borra el texto: la fila se conserva con status 'rechazada' (trazabilidad).
-- 2) Límite de duplicados: como mucho UNA declaración pendiente igual (invitado + persona + categoría + texto).
-- 3) rsvp_rate_limits + rsvp_rate_limit_hit(): contador de peticiones por clave (token o IP) en base de datos, atómico,
--    para que el límite se cumpla aunque la función de borde tenga varias instancias. Solo service_role lo usa.
-- RLS: la familia (misma familia + permiso de Eventos) gestiona sus declaraciones. Anon/authenticated no escriben
-- directamente desde el RSVP: el RSVP usa service_role después de validar token, invitado y persona en servidor.

create table event_guest_declared_needs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  guest_id uuid not null references event_guests(id) on delete cascade,
  member_id uuid null references event_guest_members(id) on delete cascade,
  -- Texto literal del invitado. Nunca se modifica.
  declared_text text not null check (char_length(declared_text) between 1 and 300),
  -- Clasificación OPERATIVA propuesta por el invitado (la familia puede corregirla al aceptar). No es un diagnóstico.
  category text not null check (category in ('gluten', 'lactosa', 'lacteos', 'huevo', 'frutos_secos', 'cacahuete', 'marisco', 'pescado', 'soja', 'vegetariano', 'vegano', 'sin_cerdo', 'sin_alcohol', 'otra')),
  kind text null check (kind in ('alergia', 'intolerancia', 'celiaquia', 'preferencia', 'dieta', 'otro')),
  -- Procedencia: siempre el RSVP.
  origin text not null default 'rsvp' check (origin = 'rsvp'),
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada')),
  -- Si se aceptó, la necesidad confirmada que la representa (sin duplicar).
  accepted_need_id uuid null references event_guest_dietary_needs(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz null,
  decided_by uuid null,
  check (status = 'pendiente' or decided_at is not null)
);

create index idx_event_guest_declared_needs_event on event_guest_declared_needs(event_id);
create index idx_event_guest_declared_needs_guest on event_guest_declared_needs(guest_id);

-- Un invitado no puede acumular duplicados pendientes de lo mismo.
create unique index event_guest_declared_needs_pending_dedupe
  on event_guest_declared_needs (guest_id, coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid), category, lower(btrim(declared_text)))
  where status = 'pendiente';

alter table event_guest_declared_needs enable row level security;

create policy "event_guest_declared_needs: family crud" on event_guest_declared_needs for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (
      select 1 from event_guests g
      where g.id = guest_id and g.family_id = private.current_family_id() and g.event_id = event_guest_declared_needs.event_id
    )
    and (
      member_id is null
      or exists (
        select 1 from event_guest_members m
        where m.id = member_id and m.guest_id = event_guest_declared_needs.guest_id and m.family_id = private.current_family_id()
      )
    )
  );

revoke all on event_guest_declared_needs from anon;

-- Contador de peticiones. Sin políticas: ni anon ni authenticated lo leen ni escriben; solo la función (service_role).
create table rsvp_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null check (hits >= 0)
);

alter table rsvp_rate_limits enable row level security;
revoke all on rsvp_rate_limits from anon, authenticated;

create or replace function rsvp_rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  insert into rsvp_rate_limits as r (key, window_start, hits)
    values (p_key, now(), 1)
    on conflict (key) do update set
      window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
      hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
    returning (r.hits <= p_limit) into v_allowed;
  return v_allowed;
end;
$$;

revoke all on function rsvp_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function rsvp_rate_limit_hit(text, integer, integer) to service_role;
