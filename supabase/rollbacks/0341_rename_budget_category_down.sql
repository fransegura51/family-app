-- ROLLBACK de 0341. Quita la función. Los nombres ya cambiados se conservan (son datos válidos de la familia); si hiciera falta devolver uno, se vuelve a renombrar.
drop function if exists public.rename_budget_category(uuid, text, text);
-- El disparador vuelve a su versión de 0340 (sin el interruptor de renombrado).
create or replace function private.expenses_mark_manual_category()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.category is distinct from old.category then
    new.category_source := 'manual';
    new.category_suggestion := null;
  elsif new.category_source is distinct from old.category_source then
    new.category_source := 'manual';
    new.category_suggestion := null;
  end if;
  return new;
end $$;
