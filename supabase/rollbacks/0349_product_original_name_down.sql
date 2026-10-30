-- ROLLBACK de 0349. Quita la columna de referencia (los nombres visibles no cambian).
alter table public.products drop column if exists original_name;
