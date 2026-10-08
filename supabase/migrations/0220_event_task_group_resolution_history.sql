-- Tanda integrada "Personas especiales, complementos, regalos, preparativos y encargos" — "reabrir un
-- encargo ya resuelto SIN borrar su historial económico" (decisión explícita de la usuaria tras
-- preguntárselo: nunca se debe perder una resolución anterior al añadir una tarea nueva al mismo encargo).
--
-- Hasta ahora event_task_groups.resolved_at/resolution_method/provider_id/provider_name/payment_id eran
-- CAMPOS ÚNICOS por encargo — resolver dos veces el mismo encargo (p. ej. Flores: una vez para el ramo
-- principal, otra después para un complemento añadido más tarde) sobrescribiría en silencio la resolución
-- anterior (proveedor, importe, método), perdiendo el histórico económico. Aplica a TODOS los encargos, no
-- solo a Flores — por eso esto vive en event_task_groups, no en nada específico de personas especiales.
--
-- event_task_group_resolutions es un registro APÉNDICE (nunca se actualiza ni se borra una fila ya
-- escrita): cada vez que se resuelve un encargo (la primera vez, o de nuevo tras añadirle algo pendiente)
-- se guarda una fila nueva aquí, ADEMÁS de actualizar las columnas de event_task_groups (que siguen
-- reflejando solo la resolución MÁS RECIENTE, para no romper nada de lo que ya las lee hoy). Mismos tipos
-- y mismas referencias que las columnas ya existentes en event_task_groups (migración 0215) — ningún
-- modelo paralelo, solo se conserva cada resolución en vez de solo la última.
--
-- Nada en esta migración cambia qué significa "resuelto": eso lo decide, a partir de ahora, si el encargo
-- tiene o no tareas pendientes (lo calcula la propia UI a partir de las tareas de siempre) — no hace falta
-- ninguna columna de estado nueva ni tocar resolved_at para "reabrir": basta con que una tarea nueva se
-- añada a un encargo que ya tenía tareas completadas, y la propia presencia de esa tarea pendiente es la
-- señal — resolved_at/method/provider/payment de event_task_groups se quedan tal cual, como referencia de
-- "la última vez que se resolvió", sin que nadie los borre ni los reinterprete.
create table event_task_group_resolutions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references event_task_groups(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  method text not null check (method in ('empresa', 'nosotros', 'ayuda', 'otro')),
  note text null check (note is null or char_length(note) <= 500),
  provider_id uuid null references event_providers(id) on delete set null,
  provider_name text null check (provider_name is null or char_length(provider_name) <= 120),
  payment_id uuid null references event_payments(id) on delete set null,
  resolved_at timestamptz not null default now()
);

create index idx_event_task_group_resolutions_group on event_task_group_resolutions(group_id);

alter table event_task_group_resolutions enable row level security;
create policy "event_task_group_resolutions: family crud" on event_task_group_resolutions for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('eventos')
    and exists (select 1 from event_task_groups g where g.id = group_id and g.family_id = private.current_family_id())
  );
