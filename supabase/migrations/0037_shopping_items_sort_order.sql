-- Poder ordenar la lista de la compra arrastrando con el dedo (petición
-- real) — hace falta guardar el orden elegido, no basta con el orden de
-- creación de siempre. Se rellena a partir de created_at para que el
-- orden actual no cambie al desplegar esto; a partir de aquí, cada
-- reordenación manda su propio sort_order nuevo.
alter table shopping_items add column sort_order bigint;
update shopping_items set sort_order = (extract(epoch from created_at) * 1000)::bigint;
alter table shopping_items alter column sort_order set not null;
alter table shopping_items alter column sort_order set default (extract(epoch from now()) * 1000)::bigint;

create index idx_shopping_items_sort on shopping_items(family_id, sort_order);
