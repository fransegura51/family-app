-- Punto 3.2 (prompt de correcciones) — una partida de presupuesto generada por la misma decisión que una
-- tarea ya agrupada en un encargo (p. ej. "Ramo de Jennifer" ↔ tarea "Encargar ramo de Jennifer", agrupada
-- en "Flores") se quedaba sin group_id: event_tasks sí recibía el encargo en origen (create_task), pero
-- event_budget_items nunca lo recibía (create_budget no llevaba groupKind). Ya corregido en origen para
-- decisiones nuevas (ver eventPairDecisions.ts/events.ts); esta es la conexión real que faltaba hacer con
-- los datos ya existentes — nunca se inventa una relación, solo se copia la que ya existe en la tarea
-- hermana de la MISMA decisión y el MISMO evento.
update event_budget_items b
set group_id = t.group_id
from event_tasks t
where b.decision_id is not null
  and b.group_id is null
  and t.decision_id = b.decision_id
  and t.event_id = b.event_id
  and t.group_id is not null;
