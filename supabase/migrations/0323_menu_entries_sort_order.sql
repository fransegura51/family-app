-- Menú semanal: varios platos por comida, cada uno con su propio lugar (reordenar sin tocar los demás). Aditiva y compatible:
--   · menu_entries ya admitía varias filas por día y comida (no hay restricción de unicidad); solo faltaba un orden propio. Hasta ahora el orden salía de created_at.
--   · sort_order nace con el mismo orden que ya tenían los platos (se rellena desde created_at: ningún menú existente cambia de aspecto) y, para las filas nuevas, con la hora de
--     inserción en microsegundos (un plato nuevo va detrás de los que ya había; la importación de Comunidad sigue poniendo el principal antes que su acompañamiento).
--   · Ningún plato, receta, fecha ni comida se modifica; no se borra nada.
-- Deshacer: supabase/rollbacks/0323_menu_entries_sort_order_down.sql.

alter table public.menu_entries
  add column sort_order bigint not null default (extract(epoch from clock_timestamp()) * 1000000)::bigint;

-- Mismo orden que hasta ahora: por created_at y, en empate, por id (nunca queda un empate sin resolver).
update public.menu_entries m
set sort_order = s.rn
from (
  select id, (extract(epoch from created_at) * 1000000)::bigint + (row_number() over (partition by created_at order by id) - 1) as rn
  from public.menu_entries
) s
where m.id = s.id;

create index idx_menu_entries_family_slot_order on public.menu_entries (family_id, entry_date, meal_type, sort_order, created_at, id);
