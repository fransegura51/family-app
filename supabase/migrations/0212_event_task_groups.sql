-- Bloque D de la tanda "campana/prioridad/agrupación" — agrupación ORGANIZATIVA de Preparativos
-- relacionados (p. ej. "Flores": ramo, prendidos, decoración, recoger). Deliberadamente SIN ninguna
-- relación con Proveedores/Presupuesto en esta migración: el modelo actual de event_providers/
-- event_budget_items vive por DECISIÓN (decision_id, con event_decision_providers para que varias
-- decisiones comparten un proveedor sin duplicar la fila) y cada concepto de presupuesto tiene su propio
-- importe independiente — unificar "un encargo = un proveedor = un importe total" tocaría esa semántica
-- y podría sumarse por duplicado; esa es una decisión de producto aparte, señalada en el informe, no
-- algo que esta migración decida por su cuenta.
--
-- UN grupo principal por tarea (según lo pedido): basta una columna nullable en event_tasks, nunca una
-- tabla puente. Borrar un grupo NUNCA borra tareas — on delete set null las deja sin encargo, exactamente
-- como estaban antes de agruparlas.
create table event_task_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_event_task_groups_event on event_task_groups(event_id);
create index idx_event_task_groups_family on event_task_groups(family_id);

alter table event_task_groups enable row level security;
create policy "event_task_groups: family crud" on event_task_groups for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (family_id = private.current_family_id() and private.has_section_access('eventos'));

alter table event_tasks add column group_id uuid null references event_task_groups(id) on delete set null;
create index idx_event_tasks_group on event_tasks(group_id);
