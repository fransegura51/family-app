-- Mismo motivo que 0099 para expenses: un presupuesto nuevo creado desde
-- la pestaña Individual queda automáticamente "tuyo" sin que el cliente
-- tenga que fijarlo; la pestaña Común pasa owner_member_id: null a mano
-- (lo contrario del default, así que sigue haciendo falta pasarlo ahí).
alter table budgets
  alter column owner_member_id set default private.current_member_id();
