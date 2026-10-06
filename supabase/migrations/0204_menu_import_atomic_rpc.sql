-- «Menú del evento»: importación ATÓMICA de un menú ya revisado por la familia (todo o nada).
-- Antes eran dos llamadas (insertar y, después, reordenar): si la segunda fallaba quedaban platos a medias.
-- Esta función hace inserción + posiciones en UNA transacción: si cualquier paso falla, se deshacen TODOS los
-- platos nuevos de esta importación. No borra ni cambia el contenido de platos existentes; solo reubica sus
-- posiciones cuando la importación se coloca en medio del menú (el mismo efecto que tenía el reordenado).
-- SECURITY INVOKER: RLS de event_menu_items, events y event_food_documents se aplica tal cual.
-- Aditiva: solo añade una función. El documento original se sube fuera (Storage) como hasta ahora.

create or replace function import_event_menu(p_event_id uuid, p_document_id uuid, p_rows jsonb, p_placement jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_family uuid := private.current_family_id();
  v_new_ids uuid[] := '{}';
  v_old_order uuid[];
  v_final uuid[];
  v_id uuid;
  v_row jsonb;
  v_text text;
  v_kind text;
  v_cat text;
  v_notes text;
  v_type text;
  v_after uuid;
  v_pos int;
  v_base bigint;
  v_count int;
  v_i int;
begin
  if v_family is null or not private.has_section_access('eventos') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from events e where e.id = p_event_id and e.family_id = v_family) then
    raise exception 'event_not_found' using errcode = '42501';
  end if;
  if p_document_id is not null and not exists (
    select 1 from event_food_documents d where d.id = p_document_id and d.event_id = p_event_id and d.family_id = v_family
  ) then
    raise exception 'document_not_found' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 300 then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;

  v_type := coalesce(p_placement->>'type', 'end');
  if v_type not in ('end', 'start', 'after') then
    raise exception 'invalid_placement' using errcode = '22023';
  end if;
  if v_type = 'after' then
    v_after := (p_placement->>'itemId')::uuid;
    if not exists (select 1 from event_menu_items i where i.id = v_after and i.event_id = p_event_id) then
      raise exception 'placement_item_not_found' using errcode = '22023';
    end if;
  end if;

  select coalesce(max(i.sort_order), 0) into v_base from event_menu_items i where i.event_id = p_event_id;

  for v_i in 1..v_count loop
    v_row := p_rows -> (v_i - 1);
    v_text := btrim(coalesce(v_row->>'text', ''));
    if char_length(v_text) < 1 or char_length(v_text) > 300 then
      raise exception 'invalid_text' using errcode = '22023';
    end if;
    v_kind := coalesce(v_row->>'kind', 'dish');
    if v_kind not in ('dish', 'heading', 'note') then
      raise exception 'invalid_kind' using errcode = '22023';
    end if;
    -- Sección solo para platos (un encabezado no tiene sección).
    v_cat := case when v_kind = 'dish' then nullif(btrim(coalesce(v_row->>'category', '')), '') else null end;
    if v_cat is not null and char_length(v_cat) > 80 then
      raise exception 'invalid_category' using errcode = '22023';
    end if;
    v_notes := nullif(btrim(coalesce(v_row->>'notes', '')), '');
    if v_notes is not null and char_length(v_notes) > 2000 then
      raise exception 'invalid_notes' using errcode = '22023';
    end if;

    insert into event_menu_items (event_id, family_id, name, category, notes, sort_order, source, document_id, kind)
      values (p_event_id, v_family, v_text, v_cat, v_notes, v_base + v_i * 1000, 'importado', p_document_id, v_kind)
      returning id into v_id;
    v_new_ids := array_append(v_new_ids, v_id);
  end loop;

  -- Colocación: al final ya quedan con su orden; en otro sitio, se reconstruye el orden completo dentro de la misma transacción.
  if v_type <> 'end' then
    select array_agg(i.id order by i.sort_order, i.created_at, i.id) into v_old_order
      from event_menu_items i
      where i.event_id = p_event_id and i.id <> all(v_new_ids);
    v_old_order := coalesce(v_old_order, '{}');
    if v_type = 'start' then
      v_pos := 0;
    else
      v_pos := array_position(v_old_order, v_after);
      if v_pos is null then
        raise exception 'placement_item_not_found' using errcode = '22023';
      end if;
    end if;
    v_final := v_old_order[1:v_pos] || v_new_ids || v_old_order[v_pos + 1:coalesce(array_length(v_old_order, 1), 0)];
    for v_i in 1..coalesce(array_length(v_final, 1), 0) loop
      update event_menu_items set sort_order = v_i * 1000, updated_at = now()
        where id = v_final[v_i] and sort_order <> v_i * 1000;
    end loop;
  end if;

  return v_new_ids;
end;
$$;

revoke all on function import_event_menu(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function import_event_menu(uuid, uuid, jsonb, jsonb) to authenticated;
