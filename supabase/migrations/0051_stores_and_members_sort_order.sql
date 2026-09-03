-- Poder ordenar las tiendas (Compras) y los miembros de la familia
-- arrastrando con el dedo, igual que ya se hace con la lista de la
-- compra (petición real: "los supermercados quiero poder tocarlos con
-- el dedo... los miembros de la familia los cojo y los puedo
-- arrastrar"). Mismo patrón que 0037: se rellena a partir de
-- created_at para no cambiar el orden actual al desplegar esto.
alter table shopping_stores add column sort_order bigint;
update shopping_stores set sort_order = (extract(epoch from created_at) * 1000)::bigint;
alter table shopping_stores alter column sort_order set not null;
alter table shopping_stores alter column sort_order set default (extract(epoch from now()) * 1000)::bigint;

alter table family_members add column sort_order bigint;
update family_members set sort_order = (extract(epoch from created_at) * 1000)::bigint;
alter table family_members alter column sort_order set not null;
alter table family_members alter column sort_order set default (extract(epoch from now()) * 1000)::bigint;

create index idx_shopping_stores_sort on shopping_stores(family_id, sort_order);
create index idx_family_members_sort on family_members(family_id, sort_order);
