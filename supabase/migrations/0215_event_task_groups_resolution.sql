-- "🗂️ Encargos" v2: convertirlo en contenedor resoluble (proveedor + precio TOTAL opcional, histórico) +
-- "kind" interno estable para la auto-agrupación en origen. Aditiva: todas las columnas nullable, sin
-- backfill ni cambio de comportamiento para los encargos ya creados.
--
-- Proveedor: provider_id reutiliza event_providers tal cual (nunca un modelo paralelo); on delete set null
-- para no bloquear el borrado de un proveedor. provider_name es un SNAPSHOT tomado al resolver (mismo
-- patrón que event_task_helpers.helper_name, migración 0206): si el proveedor se edita o se borra después,
-- el histórico de CÓMO se resolvió este encargo no se pierde ni se queda huérfano.
--
-- Precio: payment_id apunta a UN ÚNICO event_payments nuevo (concept = nombre del encargo, total_amount =
-- precio TOTAL de todo el encargo) — deliberadamente NUNCA event_budget_items. La migración 0212 ya avisaba
-- de que tocar event_budget_items/un importe "por encargo" arriesgaba duplicar lo planeado por decisión;
-- event_payments es un seguimiento totalmente aparte (Pagos y fianzas, nunca sumado con Presupuesto en
-- ningún sitio del código: ver PepaConclusions/computeEventStatusSummary, que los pasan como campos
-- independientes) así que un pago nuevo por el total del encargo no duplica ni altera ninguna partida de
-- Presupuesto ya existente por decisión.
--
-- kind: identificador interno ESTABLE (p. ej. 'flores'), DISTINTO del name que la familia puede renombrar
-- libremente — para que la auto-agrupación en origen siga reconociendo el mismo encargo aunque se haya
-- renombrado. Único por evento cuando no es null (findOrCreateEventTaskGroupByKind confía en esto).
alter table event_task_groups
  add column kind text null check (kind is null or char_length(kind) <= 40),
  add column resolved_at timestamptz null,
  add column resolution_method text null check (resolution_method in ('empresa', 'nosotros', 'ayuda', 'otro')),
  add column resolution_note text null check (resolution_note is null or char_length(resolution_note) <= 500),
  add column provider_id uuid null references event_providers(id) on delete set null,
  add column provider_name text null check (provider_name is null or char_length(provider_name) <= 120),
  add column payment_id uuid null references event_payments(id) on delete set null;

create unique index event_task_groups_kind_unique on event_task_groups(event_id, kind) where kind is not null;
