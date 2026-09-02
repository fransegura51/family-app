-- Educación financiera: el saldo de cada niño se separa en 4 categorías
-- (ingresos/ahorro/gastos/impuestos) en vez de solo ingreso/gasto —
-- petición real de la usuaria, "para poder poner en cada momento lo
-- que tiene, y lo que tienen ahorrado, lo que tienen ingresado y lo
-- que han gastado".
alter table kid_wallet_transactions drop constraint kid_wallet_transactions_type_check;
alter table kid_wallet_transactions add constraint kid_wallet_transactions_type_check
  check (type = any (array['ingreso'::text, 'ahorro'::text, 'gasto'::text, 'impuesto'::text]));
