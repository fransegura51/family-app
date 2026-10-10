-- Orden de recuperación de requisitos (Parte C2b, autorización directa del usuario 2026-10-10) —
-- "contratar con varios proveedores en el mismo encargo": hasta ahora un encargo solo admitía UNA
-- resolución activa (event_task_groups.provider_id/payment_id, la más reciente de
-- event_task_group_resolutions). Aditiva: "active" distingue qué resoluciones cuentan hoy como vigentes
-- SIN tocar el histórico ni las columnas de event_task_groups (nadie que ya las lea nota el cambio) —
-- resolver "sustituyendo" sigue dejando una sola activa; una nueva función aparte (fuera de esta
-- migración, en la capa de datos) podrá añadir una activa MÁS sin desactivar las demás, para que un
-- encargo tenga varios proveedores a la vez.
alter table event_task_group_resolutions add column active boolean not null default true;

-- Backfill: coherente con el comportamiento de siempre (solo la resolución MÁS RECIENTE de cada encargo
-- era "la vigente") — se marca esa como activa y todas las anteriores del mismo encargo como inactivas.
with ranked as (
  select id, group_id, row_number() over (partition by group_id order by resolved_at desc, id desc) as rn
  from event_task_group_resolutions
)
update event_task_group_resolutions r
set active = (ranked.rn = 1)
from ranked
where ranked.id = r.id;

create index if not exists idx_event_task_group_resolutions_active on event_task_group_resolutions(group_id, active) where active;
