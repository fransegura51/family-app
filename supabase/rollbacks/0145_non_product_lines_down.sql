-- ROLLBACK de la Fase 6A (0145_non_product_lines.sql): quita el refuerzo de la base de datos y RESTAURA el PARKING histórico.
-- Restaura, con sus mismos ids, el producto y los precios archivados en non_product_line_archive; después elimina el trigger, las
-- funciones y el propio archivo. No toca receipts, expenses, budgets, catálogo, cadenas ni el aprendizaje compartido.
--
-- Orden: primero el trigger (si no, descartaría en silencio los precios de PARKING al restaurarlos).
-- Reversibilidad: la limpieza se hizo copiando antes cada fila íntegra (jsonb) al archivo, así que la restauración es exacta.
-- Si el producto ya existe otra vez (mismo id o mismo nombre en la familia) o el ticket ya no existe, esa fila se omite en vez de fallar.
-- IMPORTANTE: para volver del todo al comportamiento anterior hay que revertir también el commit de la Fase 6A y redesplegar
-- mercadona-ticket-webhook con su versión anterior; si no, el cliente y el webhook seguirían omitiendo las líneas PARKING nuevas.
drop trigger if exists product_prices_skip_non_product on public.product_prices;

insert into public.products
select * from jsonb_populate_recordset(null::public.products, coalesce((select jsonb_agg(a.product) from public.non_product_line_archive a), '[]'::jsonb))
on conflict do nothing;

insert into public.product_prices
select r.*
from jsonb_populate_recordset(
       null::public.product_prices,
       coalesce((select jsonb_agg(pr) from public.non_product_line_archive a, jsonb_array_elements(a.prices) pr), '[]'::jsonb)
     ) r
where exists (select 1 from public.products p where p.id = r.product_id)
  and (r.receipt_id is null or exists (select 1 from public.receipts x where x.id = r.receipt_id))
on conflict do nothing;

drop function if exists public.product_prices_skip_non_product();
drop function if exists public.is_non_product_line(text, text);
drop table if exists public.non_product_line_archive;
