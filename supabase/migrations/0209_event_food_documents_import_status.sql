-- Bloque C (importación del menú): distingue de forma fiable un documento ya subido pero cuya
-- importación nunca llegó a completarse (la app se cerró/falló entre subir el original y confirmar los
-- platos) de uno que sí completó su importación. Aditiva, sin backfill de valores inventados: todo
-- documento YA existente se marca 'completed' porque, si existe hoy, es porque su importación anterior
-- (con el flujo previo a esta columna) llegó a buen término — no hay forma de distinguirlo retroactivo,
-- y asumir 'pending' para documentos antiguos los mostraría como huérfanos sin serlo.
alter table event_food_documents
  add column import_status text not null default 'pending' check (import_status in ('pending', 'completed', 'failed'));

update event_food_documents set import_status = 'completed';
