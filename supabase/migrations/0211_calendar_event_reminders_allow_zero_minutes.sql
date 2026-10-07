-- BUG real confirmado: "El mismo día" (Preparativos, campana rápida/editor) guarda minutes_before = 0,
-- que la constraint actual (minutes_before > 0, migración 0021) rechaza siempre — error real en
-- producción: "new row for relation calendar_event_reminders violates check constraint
-- calendar_event_reminders_minutes_before_check". Auditado antes de tocar nada: 121 filas existentes hoy,
-- 0 con minutes_before <= 0 (así que "El mismo día" nunca ha podido guardarse con éxito hasta ahora),
-- mínimo real 10 — ninguna fila existente se ve afectada por este cambio.
--
-- 0 minutos antes es un valor perfectamente válido semánticamente (avisar EN el momento de empezar, no
-- antes) — la función de entrega (claim_due_reminders y las de la 0154/0187/0197) ya funciona
-- correctamente con 0 (now() >= anchor_at - interval '0 minutes' equivale a now() >= anchor_at). La
-- constraint se amplía para admitirlo, sin dejar de rechazar negativos ni nulos.
alter table calendar_event_reminders drop constraint calendar_event_reminders_minutes_before_check;
alter table calendar_event_reminders add constraint calendar_event_reminders_minutes_before_check check (minutes_before >= 0);
