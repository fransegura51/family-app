-- ROLLBACK de la Fase 6C.2A (0149_category_nullable_pending.sql): restaura el esquema anterior EXACTO.
--   expenses.category  NOT NULL
--   receipts.category  NOT NULL DEFAULT 'Alimentación'
--   se retiran los dos CHECK nuevos.
-- ANTES de volver a NOT NULL se comprueba que NO existe ninguna fila con category NULL: si existe, se ABORTA sin cambiar nada.
-- Nunca se convierte un NULL en una categoría inventada; hay que clasificar (o decidir) esas filas primero.
do $$
declare
  v_null_exp bigint;
  v_null_rec bigint;
begin
  select count(*) into v_null_exp from public.expenses where category is null;
  select count(*) into v_null_rec from public.receipts where category is null;
  if v_null_exp > 0 or v_null_rec > 0 then
    raise exception 'rollback 6C.2A abortado: hay % gastos y % tickets con category NULL (pendientes de clasificar). Clasifícalos antes de volver a NOT NULL; no se inventa ninguna categoría.', v_null_exp, v_null_rec;
  end if;

  alter table public.expenses drop constraint if exists expenses_category_not_blank;
  alter table public.receipts drop constraint if exists receipts_category_not_blank;
  alter table public.expenses alter column category set not null;
  alter table public.receipts alter column category set not null;
  alter table public.receipts alter column category set default 'Alimentación';
  comment on column public.expenses.category is null;
  comment on column public.receipts.category is null;
end $$;
