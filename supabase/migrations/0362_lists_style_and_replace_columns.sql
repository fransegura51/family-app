-- Mis listas: «Estilo de lista» de las listas de Ideas (bombillas, puntos, numeración, guiones, estrellas, casillas o sin símbolo).
-- Columna opcional: null = el predeterminado de cada formato (Tareas y Comparativa: casillas; Ideas: bombillas). No toca ni transforma ningún
-- dato existente: los elementos conservan su estado «hecho» aunque el estilo no enseñe casillas. La RLS de user_lists no cambia (solo quien
-- creó la lista cambia sus ajustes, igual que sort_mode) y el tiempo real ya cubre la tabla (0324), así que se sincroniza entre dispositivos.
-- Deshacer: alter table public.user_lists drop column item_style;
alter table public.user_lists
  add column if not exists item_style text
  check (item_style is null or item_style in ('bombillas', 'puntos', 'numeracion', 'guiones', 'estrellas', 'casillas', 'ninguno'));

-- «Sustituir» al importar en una COMPARATIVA: cada elemento puede traer su columna ({"column_id": uuid}); solo se respeta si esa columna
-- pertenece a la misma lista (si no, queda sin columna y se enseña en la primera, como antes). Sin «column_id» se comporta exactamente igual
-- que la versión anterior. Sigue siendo SECURITY INVOKER (manda la RLS) y atómica. Deshacer: volver a crear la versión de 0321.
create or replace function public.replace_list_items(p_list uuid, p_items jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare n integer;
begin
  if not private.list_accessible(p_list) then raise exception 'lista no accesible' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'elementos no válidos' using errcode = '22023'; end if;
  delete from list_items where list_id = p_list;
  insert into list_items (list_id, family_id, depth, text, rich, done, sort_order, column_id)
  select p_list, private.current_family_id(), coalesce((e->>'depth')::smallint, 0), btrim(e->>'text'), nullif(e->>'rich', ''), coalesce((e->>'done')::boolean, false), (ord * 1000)::bigint,
         (select c.id from list_columns c where c.list_id = p_list and c.id::text = e->>'column_id')
  from jsonb_array_elements(p_items) with ordinality as t(e, ord)
  where btrim(coalesce(e->>'text', '')) <> '';
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.replace_list_items(uuid, jsonb) from public, anon;
grant execute on function public.replace_list_items(uuid, jsonb) to authenticated;
