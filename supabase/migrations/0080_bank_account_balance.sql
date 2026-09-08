-- Petición real: "debajo de Economía Pepa me vas a poner tarjetas de
-- saldo con las cuentas de los bancos que te vayamos añadiendo, que se
-- puedan poner más o menos, que se puedan añadir o quitar, como está
-- en la foto [app Wallet]" — tarjetas de saldo por cuenta bancaria
-- enlazada (ver 0066), tantas como bank_accounts haya (crecen/decrecen
-- solas al conectar/desconectar un banco, sin nada extra que tocar).
--
-- El saldo no viene en el listado de cuentas de Enable Banking (ver
-- bank_accounts.raw ya guardado: solo iban/nombre/moneda) — hace falta
-- pedirlo aparte a GET /accounts/{uid}/balances y guardarlo. Se
-- actualiza en cada sincronización (manual o el cron 4 veces al día,
-- ver 0077), igual que los movimientos.
alter table bank_accounts add column balance numeric(12, 2);
alter table bank_accounts add column balance_currency text;
alter table bank_accounts add column balance_updated_at timestamptz;
