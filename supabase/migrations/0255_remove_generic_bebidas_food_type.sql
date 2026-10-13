-- COM-03 — elimina la ÚNICA fila "Bebidas" genérica que quedaba en family_food_types (catalog_key
-- null, nombre exacto "Bebidas"): PEPA ya no debe ofrecerla para clasificar productos nuevos. Las dos
-- específicas que ya existían se conservan intactas, sin tocar ("Bebidas alcohólicas"/"Bebidas no
-- alcohólicas", cada una con su propio catalog_key food.bebidas_alcoholicas/food.bebidas_no_alcoholicas,
-- sembradas en 0139_catalog_base.sql).
--
-- Comprobado antes de escribir esta migración (solo lectura, ver auditoría COM-03):
--   · select count(*) from products where category = 'Bebidas'  →  0 en TODA la base de datos.
--   · select * from family_food_types where name = 'Bebidas'    →  una sola fila, de una sola familia
--     ("Familia prueba"), catalog_key null, sin ningún producto que la use.
-- Ningún importe, fecha, establecimiento, ticket ni estadística depende de esta fila — por eso es
-- seguro borrarla (nunca solo ocultarla) en vez de necesitar una reclasificación de datos históricos.
--
-- El alcance de este WHERE solo puede coincidir con la semilla genérica antigua (domain/foodTypes.ts,
-- FOOD_TYPES, antes de este commit): las filas enlazadas al catálogo siempre tienen catalog_key no nulo,
-- y ninguna otra fila legítima lleva exactamente el nombre "Bebidas" sin enlazar.
delete from public.family_food_types
where name = 'Bebidas' and catalog_key is null;
