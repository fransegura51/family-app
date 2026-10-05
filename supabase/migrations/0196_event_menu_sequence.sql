-- «Menú del evento»: el orden del documento manda, no la sección. Cambio MÍNIMO y aditivo.
--
--  · event_menu_items.kind — qué es cada elemento: 'dish' (plato, lo de siempre), 'heading' (encabezado o separador
--    con significado: «Cambio de Tercio», «Cena», «Segundo servicio»…) o 'note' (texto informativo). Un texto
--    significativo se conserva en su sitio sin fingir que es un plato: no tiene sección, receta, origen ni compras ni
--    cuenta como alimento en los avisos de necesidades.
--  · event_menu_items.sort_order — pasa a ser la POSICIÓN explícita y persistente del elemento en el menú (no la
--    sección, no el nombre, no created_at). Se normaliza (1000, 2000…) respetando el orden actual, y los nuevos se
--    añaden al final desde la base de datos. Cambiar la sección de un elemento NO toca su posición.
--  · reorder_event_menu_items — reordena el menú completo de forma atómica (SECURITY INVOKER: el RLS de la tabla
--    sigue mandando; exige TODOS los elementos del evento, de un único evento).
--
-- La sección (event_menu_items.category) sigue siendo metadato de clasificación. Nada se borra ni se reescribe salvo
-- el número de posición.

alter table event_menu_items
  add column kind text not null default 'dish' check (kind in ('dish', 'heading', 'note'));

with ordered as (
  select id, row_number() over (partition by event_id order by sort_order, created_at, id) as rn
  from event_menu_items
)
update event_menu_items i
set sort_order = o.rn * 1000
from ordered o
where i.id = o.id;

create or replace function public.event_menu_items_set_sort_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sort_order is null or new.sort_order = 0 then
    new.sort_order := coalesce((select max(sort_order) from public.event_menu_items where event_id = new.event_id), 0) + 1000;
  end if;
  return new;
end;
$$;

create trigger trg_event_menu_items_sort_order
  before insert on event_menu_items
  for each row execute function public.event_menu_items_set_sort_order();

create or replace function public.reorder_event_menu_items(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total int := coalesce(array_length(p_ids, 1), 0);
  v_visible int;
  v_events int;
  v_event uuid;
begin
  if v_total = 0 then
    return;
  end if;

  select count(*), count(distinct event_id), min(event_id::text)::uuid
    into v_visible, v_events, v_event
  from event_menu_items
  where id = any(p_ids);

  -- Todos visibles (de mi familia), de un único evento, y sin dejarse ningún elemento de ese evento fuera.
  if v_visible <> v_total or v_events <> 1 then
    raise exception 'not found';
  end if;
  if (select count(*) from event_menu_items where event_id = v_event) <> v_total then
    raise exception 'incomplete order';
  end if;

  update event_menu_items i
  set sort_order = o.ord * 1000
  from unnest(p_ids) with ordinality as o(id, ord)
  where i.id = o.id;
end;
$$;

revoke execute on function public.reorder_event_menu_items(uuid[]) from public, anon;
grant execute on function public.reorder_event_menu_items(uuid[]) to authenticated;
