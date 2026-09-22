-- ROLLBACK de la Fase 6D.0: restaura EXACTAMENTE las categorías originales de las dos filas (mismos ids, sin tocar ninguna otra columna
-- ni ninguna otra fila) — el cargo vuelve a «Comisiones y cargos» y la bonificación a «Devoluciones». Solo restaura si la fila sigue
-- exactamente en «Cobro anulado» (no pisa un cambio posterior de la familia).
update public.expenses x
set category = l.before ->> 'category'
from public.commission_reversal_reclass_log l
where l.entity_id = x.id and x.category = l.after ->> 'category'
  and x.id in ('75004698-08a0-4bd7-b4ce-d4d61c3f0fee', 'b9bc07b6-bc49-440b-9c52-65b0ead1a8cc');

drop table if exists public.commission_reversal_reclass_log;
