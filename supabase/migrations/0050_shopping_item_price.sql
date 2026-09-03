-- El precio de un producto ya comprado no se guardaba en ningún sitio
-- del propio producto — solo en la Memoria de precios (product_prices,
-- por nombre) y en estado local de React. Al cerrar la app y volver a
-- abrirla, "Comprados" no tenía forma de saber que ese precio YA se
-- había guardado, y volvía a pedirlo (bug real: "le doy a guardar, me
-- desaparece, pero si cierro la aplicación y la vuelvo a abrir, me
-- vuelven a aparecer otra vez con el guardar").
alter table shopping_items add column price numeric;
