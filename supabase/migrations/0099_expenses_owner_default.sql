-- Complemento a 0098_shared_accounts_mode.sql: para que un gasto nuevo
-- apuntado a mano (o un ticket subido) quede automáticamente "tuyo" sin
-- tener que tocar cada sitio del cliente que hace insert en expenses
-- (AddIncomeInline, uploadReceipt, EditExpenseInline "quick add"...),
-- owner_member_id toma por defecto quien esté logueado. Si el gasto se
-- crea directamente en la pestaña Común, el cliente solo necesita marcar
-- shared = true — el dueño (para el saldo entre personas) sigue
-- resolviéndose solo. Los inserts del edge function de banco corren con
-- el rol de servicio (sin auth.uid()), así que este default no les afecta
-- — siguen fijando owner_member_id ellos mismos, desde
-- bank_accounts.owner_member_id.
alter table expenses
  alter column owner_member_id set default private.current_member_id();
