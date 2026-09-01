-- Cada producto de la lista se puede etiquetar con la tienda donde se
-- compra ("en Mercadona patatas y huevos, en la pescadería el pescado")
-- para poder ver la lista agrupada por tienda al programar la compra.
alter table shopping_items add column store text;
