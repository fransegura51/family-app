-- Dos ampliaciones al calendario:
--
-- 1) Marcar un calendario externo enlazado como "de festivos" (p. ej. el
--    que ya trae Google/Outlook con "Días festivos de España"), para que
--    las repeticiones semanales de tipo "de lunes a viernes" puedan
--    saltárselos automáticamente sin tener que mantener una lista de
--    fiestas a mano.
alter table external_calendar_feeds add column is_holiday_calendar boolean not null default false;

-- 2) Excepciones puntuales dentro de un evento recurrente ("borrar solo
--    este día" sin tocar el resto de la serie) — un EXDATE simplificado,
--    igual de pragmático que el resto del RRULE-lite ya usado aquí.
alter table calendar_events add column exception_dates date[] not null default '{}';
