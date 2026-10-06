-- «Preparar compra del menú»: guardado ATÓMICO de la selección confirmada (todo o nada) y sin duplicados por reintento.
-- Aditiva: una tabla nueva de peticiones (registro de idempotencia) y una función. No modifica shopping_items.
-- La función es SECURITY INVOKER: se ejecuta con los permisos del usuario, así que RLS de shopping_items, events y
-- shopping_stores se aplica tal cual. Valida en servidor el evento, la familia y la tienda (nunca confía en IDs del cliente).

create table menu_shopping_requests (
  request_id uuid primary key,
  family_id uuid not null references families(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  item_ids uuid[] not null,
  created_at timestamptz not null default now()
);

alter table menu_shopping_requests enable row level security;

create policy "menu_shopping_requests: family read" on menu_shopping_requests for select
  using (family_id = private.current_family_id() and private.has_section_access('eventos'));

create policy "menu_shopping_requests: family insert" on menu_shopping_requests for insert
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

create or replace function add_menu_shopping_lines(p_event_id uuid, p_request_id uuid, p_lines jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_existing uuid[];
  v_ids uuid[] := '{}';
  v_line jsonb;
  v_id uuid;
  v_name text;
  v_qty text;
  v_store text;
begin
  if v_family is null or not private.has_section_access('eventos') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;
  if not exists (select 1 from events e where e.id = p_event_id and e.family_id = v_family) then
    raise exception 'event_not_found' using errcode = '42501';
  end if;

  -- Reintento de la misma confirmación: devuelve lo ya guardado, sin insertar de nuevo.
  select r.item_ids into v_existing from menu_shopping_requests r
    where r.request_id = p_request_id and r.family_id = v_family;
  if found then
    return v_existing;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_name := btrim(coalesce(v_line->>'name', ''));
    if char_length(v_name) < 1 or char_length(v_name) > 200 then
      raise exception 'invalid_name' using errcode = '22023';
    end if;
    -- Cantidad desconocida = NULL (nunca 0).
    v_qty := nullif(btrim(coalesce(v_line->>'quantity', '')), '');
    if v_qty is not null and char_length(v_qty) > 100 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    v_store := nullif(btrim(coalesce(v_line->>'store', '')), '');
    if v_store is not null and not exists (
      select 1 from shopping_stores s where s.family_id = v_family and s.name = v_store
    ) then
      raise exception 'unknown_store' using errcode = '22023';
    end if;

    insert into shopping_items (family_id, name, quantity, unit, priority, trip_id, store, event_id)
      values (v_family, v_name, v_qty, '', 'normal', null, v_store, p_event_id)
      returning id into v_id;
    v_ids := array_append(v_ids, v_id);
  end loop;

  insert into menu_shopping_requests (request_id, family_id, event_id, item_ids)
    values (p_request_id, v_family, p_event_id, v_ids);

  return v_ids;
end;
$$;

revoke all on function add_menu_shopping_lines(uuid, uuid, jsonb) from public, anon;
grant execute on function add_menu_shopping_lines(uuid, uuid, jsonb) to authenticated;
