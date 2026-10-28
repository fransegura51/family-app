-- ROLLBACK de 0340. Quita el disparador, la función y las dos columnas (solo guardan el origen de la categoría; la categoría en sí no se toca).
drop trigger if exists expenses_mark_manual_category on public.expenses;
drop function if exists private.expenses_mark_manual_category();
alter table public.expenses drop constraint if exists expenses_category_source_check;
alter table public.expenses drop column if exists category_suggestion;
alter table public.expenses drop column if exists category_source;
