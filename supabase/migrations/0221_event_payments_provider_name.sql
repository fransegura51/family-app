-- Revisión Proveedores/Presupuesto/Pagos (Parte B, bug real reportado) — las tarjetas de "🧾 Pagos y
-- fianzas" no mostraban el proveedor porque event_payments nunca guardó su nombre, solo provider_id (FK a
-- event_providers, ON DELETE SET NULL). Snapshot aditivo, mismo criterio que event_task_groups.provider_name
-- (migración 0215): sobrevive a que se edite, archive o borre el proveedor más adelante — el pago sigue
-- diciendo de quién fue, igual que ya pasa en Encargos.
--
-- Backfill SEGURO (nunca inventa nada): copia el nombre desde el proveedor YA enlazado por provider_id en
-- los pagos existentes que todavía no tengan provider_name — es un dato derivado de una relación real que
-- ya existía, no una suposición. Los pagos sin provider_id (pagos sueltos, sin proveedor) se quedan en
-- NULL, como corresponde.
alter table event_payments add column provider_name text null;

update event_payments p
set provider_name = ep.name
from event_providers ep
where p.provider_id = ep.id and p.provider_name is null;

-- Sin cambios de RLS: la política "event_payments: family crud" (migración 0106) ya es `for all` sin
-- condiciones por columna, cubre la columna nueva sin tocarla.
