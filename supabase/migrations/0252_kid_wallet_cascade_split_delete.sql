-- PG-PUNTOS-FINANZAS (Parte B8) — auditoría del modelo financiero de Educación financiera: se encontró
-- que borrar un ingreso ('Eliminar' en el historial, ya existente desde antes de esta parte) no borraba
-- las filas 'ahorro'/'impuesto' que ese mismo ingreso generó automáticamente (source_income_id apuntaba a
-- él con "on delete set null") — se quedaban huérfanas, contando igual en walletCategoryTotal/
-- walletBalance, así que "Para gastar" podía quedar negativo sin ningún ingreso real que lo respalde.
-- Nunca se detectó en producción (solo al limpiar datos de prueba manualmente por SQL en esta sesión,
-- dos veces — lección aprendida), pero es el mismo fallo que podría darle a un adulto real si borra un
-- ingreso por error.
--
-- Arreglo: el reparto automático es parte INDISOCIABLE del ingreso que lo generó (nunca se puede borrar
-- el ingreso y dejar el reparto suelto, ni al revés) — "on delete cascade" en vez de "on delete set null".
-- Aditiva en el sentido de que no toca ninguna fila existente, solo cambia qué pasa la PRÓXIMA vez que se
-- borre un ingreso con reparto.
alter table kid_wallet_transactions drop constraint kid_wallet_transactions_source_income_id_fkey;
alter table kid_wallet_transactions
  add constraint kid_wallet_transactions_source_income_id_fkey
  foreign key (source_income_id) references kid_wallet_transactions(id) on delete cascade;
