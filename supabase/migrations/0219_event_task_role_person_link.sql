-- Tanda integrada "Personas especiales, complementos, regalos, preparativos y encargos" — "Preparativos
-- desglosados": hasta ahora reconcilePairGeneration/applyPairDecisionGeneration daban por hecho como mucho
-- UNA tarea por decision_id en todo el motor (ver cabecera de eventPairDecisions.ts) — correcto para toda
-- decisión existente, pero insuficiente para "complementos especiales", donde ahora puede haber una tarea
-- POR PERSONA ("María — Prendido floral", "Ana — Ramo") colgando de la MISMA decisión de complementos.
--
-- role_person_id es la clave que distingue esas tareas entre sí dentro de una misma decision_id — nunca el
-- título (que puede cambiar) ni el nombre de la persona (texto libre, puede repetirse). ON DELETE SET
-- NULL: borrar la persona especial NUNCA borra su tarea ya creada (ni su fecha/responsable/prioridad/nota/
-- historial/Calendario/encargo), solo desvincula el origen — mismo criterio que decisionId/groupId, ya
-- ambos ON DELETE SET NULL en esta misma tabla.
--
-- Una tarea SIN role_person_id (el 99% de las existentes y de las que se seguirán creando para el resto de
-- decisiones) sigue funcionando exactamente igual que siempre — columna puramente aditiva y opcional.
alter table event_tasks add column role_person_id uuid references event_role_people(id) on delete set null;

create index idx_event_tasks_role_person on event_tasks(role_person_id);

-- Mismo patrón "hardened" que decision_id ya tiene en esta misma policy desde la migración 0176 (el
-- "with check" real y vigente hoy — group_id, añadido después en 0212, se quedó sin este mismo endurecido;
-- no se toca aquí, fuera de alcance de esta tanda). Se reproduce la condición de decision_id TAL CUAL,
-- solo añadiendo la nueva de role_person_id — nunca se debilita lo que ya protegía esta tabla.
drop policy "event_tasks: family crud" on event_tasks;
create policy "event_tasks: family crud" on event_tasks for all
  using (family_id = private.current_family_id() and private.has_section_access('eventos'))
  with check (
    family_id = private.current_family_id() and private.has_section_access('eventos')
    and (decision_id is null or exists (select 1 from event_decisions d where d.id = decision_id and d.family_id = private.current_family_id() and d.event_id = event_tasks.event_id))
    and (
      role_person_id is null
      or exists (
        select 1 from event_role_people rp
        where rp.id = role_person_id and rp.family_id = private.current_family_id() and rp.event_id = event_tasks.event_id
      )
    )
  );
