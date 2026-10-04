-- Plan del día EDITABLE (Fase 1). Todo ADITIVO y compatible con los datos que ya hay:
--
--  · source_key  — identidad ESTABLE de un elemento generado por el configurador («comida.momentos:aperitivo»).
--                 La reconciliación deja de depender del título visible: renombrar «Comida» a «Almuerzo familiar»
--                 no rompe su relación con la decisión de origen ni provoca un duplicado.
--  · show_on_share — «Mostrar al compartir». Por defecto SÍ para todo (nuevo y existente): un momento añadido a
--                 mano no debe desaparecer del documento por una casilla que nunca se tocó.
--  · coincide_ok_time — la hora para la que el usuario confirmó «sí, estos momentos coinciden a propósito».
--  · sort_order  — pasa a tener significado propio: orden manual de los «Sin hora» y desempate entre elementos con
--                 la misma hora. Se normaliza (1000, 2000…) y los nuevos se añaden al final SIN depender de Date.now().
--
-- No toca event_decisions ni ninguna otra tabla. Plan del día NO tiene concepto de día (limitación conocida,
-- documentada): una columna nullable futura (p. ej. moment_id) podrá añadirse sin tocar nada de esto.

alter table event_day_plan_items
  add column source_key text,
  add column show_on_share boolean not null default true,
  add column coincide_ok_time time;

-- 1) Adopción de lo ya generado: los elementos enlazados a «comida.momentos» reciben su clave estable a partir
--    del título del catálogo. Si por un fallo antiguo hubiera DOS del mismo momento para la misma decisión, solo
--    el más antiguo recibe la clave (así el índice único de abajo nunca puede fallar); el otro queda enlazado sin
--    clave y la reconciliación lo limpiará o lo desvinculará.
with mapped as (
  select p.id, p.event_id, p.decision_id, p.created_at,
    case p.title
      when 'Aperitivo / cóctel' then 'aperitivo'
      when 'Aperitivo / picoteo' then 'aperitivo'
      when 'Aperitivo' then 'aperitivo'
      when 'Comida / banquete' then 'comida'
      when 'Comida' then 'comida'
      when 'Cena / banquete' then 'cena'
      when 'Cena' then 'cena'
      when 'Recena' then 'recena'
      when 'Merienda' then 'merienda'
      when 'Merienda / café / dulces' then 'merienda'
    end as k
  from event_day_plan_items p
  join event_decisions d on d.id = p.decision_id and d.question_key = 'comida.momentos'
),
ranked as (
  select id, k, row_number() over (partition by event_id, decision_id, k order by created_at, id) as rn
  from mapped
  where k is not null
)
update event_day_plan_items p
set source_key = 'comida.momentos:' || r.k
from ranked r
where p.id = r.id and r.rn = 1;

-- 2) Imposible duplicar un elemento automático, ni por concurrencia: una decisión, una clave, una fila.
create unique index uq_event_day_plan_items_source
  on event_day_plan_items (event_id, decision_id, source_key)
  where decision_id is not null and source_key is not null;

-- 3) sort_order normalizado respetando EXACTAMENTE el orden que se ve hoy (con hora por hora y luego sort_order;
--    sin hora al final por sort_order).
with ordered as (
  select id, row_number() over (partition by event_id order by (item_time is null), item_time, sort_order, created_at, id) as rn
  from event_day_plan_items
)
update event_day_plan_items p
set sort_order = o.rn * 1000
from ordered o
where p.id = o.id;

-- 4) Los nuevos elementos van al final (sort_order 0 = «asígnalo tú»). Sin Date.now() en el cliente.
create or replace function public.event_day_plan_items_set_sort_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sort_order is null or new.sort_order = 0 then
    new.sort_order := coalesce((select max(sort_order) from public.event_day_plan_items where event_id = new.event_id), 0) + 1000;
  end if;
  return new;
end;
$$;

create trigger trg_event_day_plan_items_sort_order
  before insert on event_day_plan_items
  for each row execute function public.event_day_plan_items_set_sort_order();

-- 5) Reordenación atómica: recibe los ids en el orden deseado y reparte entre ellos posiciones consecutivas desde
--    la más baja que ya tenían (no mueve nada ajeno al grupo). Con p_confirm_coincidence marca además la hora de
--    cada elemento como «coincidencia confirmada». SECURITY INVOKER: el RLS de la tabla sigue mandando, así que
--    nadie puede reordenar elementos de otra familia (si algún id no es visible, no se hace nada).
create or replace function public.reorder_event_day_plan(p_ids uuid[], p_confirm_coincidence boolean default false)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total int := coalesce(array_length(p_ids, 1), 0);
  v_visible int;
  v_events int;
  v_base bigint;
begin
  if v_total = 0 then
    return;
  end if;

  select count(*), count(distinct event_id), min(sort_order)
    into v_visible, v_events, v_base
  from event_day_plan_items
  where id = any(p_ids);

  if v_visible <> v_total or v_events <> 1 then
    raise exception 'not found';
  end if;

  update event_day_plan_items p
  set sort_order = v_base + (o.ord - 1)
  from unnest(p_ids) with ordinality as o(id, ord)
  where p.id = o.id;

  if p_confirm_coincidence then
    update event_day_plan_items
    set coincide_ok_time = item_time
    where id = any(p_ids) and item_time is not null;
  end if;
end;
$$;

revoke execute on function public.reorder_event_day_plan(uuid[], boolean) from public, anon;
grant execute on function public.reorder_event_day_plan(uuid[], boolean) to authenticated;
