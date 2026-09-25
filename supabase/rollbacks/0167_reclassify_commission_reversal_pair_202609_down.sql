-- ROLLBACK de la Fase CA-4: restaura EXACTAMENTE las categorías originales de las dos filas (mismos ids, sin tocar ninguna otra columna
-- ni ninguna otra fila) — el cargo vuelve a «Otros» y la bonificación a «Devoluciones». Solo restaura si la fila sigue exactamente en
-- «Cobro anulado» (no pisa un cambio posterior de la familia). La tabla commission_reversal_reclass_log es COMPARTIDA con 0152 (pareja de
-- junio) — este rollback NO la borra, solo borra sus propias 2 filas de log, para no destruir la trazabilidad de la otra corrección.
update public.expenses x
set category = l.before ->> 'category'
from public.commission_reversal_reclass_log l
where l.entity_id = x.id and x.category = l.after ->> 'category'
  and x.id in ('9d2747d2-9857-4f50-9728-34a4141039aa', 'df534f42-198c-445b-9d61-bdc734faf56c');

delete from public.commission_reversal_reclass_log
where entity_id in ('9d2747d2-9857-4f50-9728-34a4141039aa', 'df534f42-198c-445b-9d61-bdc734faf56c');
