-- 0340 · ECO-CLASIF — de dónde viene la categoría de cada movimiento (automática, sugerida o confirmada por una persona).
--
-- Hasta ahora un movimiento del banco nacía con la categoría que adivinaba una lista corta de palabras, indistinguible de una elegida por la
-- familia, y lo que no reconocía caía en «Otros». Para clasificar con más autonomía SIN pisar nunca una decisión de la familia hace falta saber
-- quién decidió:
--   · category_source = 'auto'      PEPA la clasificó con confianza alta (no hace falta confirmar nada).
--   · category_source = 'sugerida'  PEPA la aplicó con confianza media: se enseña discretamente como «sugerida» para que la persona la revise.
--   · category_source = 'manual'    la decidió una persona (o confirmó la sugerencia): PEPA no la vuelve a cambiar JAMÁS.
--   · category_source NULL          movimiento anterior a esta migración (se trata como histórico: no se toca).
--   · category_suggestion           con confianza baja el movimiento queda «Pendiente de clasificar» (category NULL, como siempre) y aquí se
--                                    guarda la sugerencia razonada, si la hay, para ofrecerla con un toque.
-- Un disparador marca como 'manual' CUALQUIER cambio de categoría hecho por una persona (la app, un ticket, el asistente de voz…) sin tener que
-- tocar cada pantalla; la función de sincronización del banco (sin persona) conserva lo que escribe. Aditiva: no cambia ningún dato existente.
-- ROLLBACK: supabase/rollbacks/0340_expense_category_provenance_down.sql
alter table public.expenses
  add column if not exists category_source text,
  add column if not exists category_suggestion text;

alter table public.expenses drop constraint if exists expenses_category_source_check;
alter table public.expenses
  add constraint expenses_category_source_check check (category_source is null or category_source in ('auto', 'sugerida', 'manual'));

create or replace function private.expenses_mark_manual_category()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  -- Solo cuando una PERSONA hace el cambio (hay usuario en la sesión). La sincronización del banco usa el rol de servicio y no marca nada.
  if auth.uid() is null then
    return new;
  end if;
  if new.category is distinct from old.category then
    new.category_source := 'manual';
    new.category_suggestion := null;
  elsif new.category_source is distinct from old.category_source then
    -- Confirmar una sugerencia (o fijar una decisión): la única marca que puede poner una persona es 'manual'.
    new.category_source := 'manual';
    new.category_suggestion := null;
  end if;
  return new;
end $$;

drop trigger if exists expenses_mark_manual_category on public.expenses;
create trigger expenses_mark_manual_category
  before update of category, category_source on public.expenses
  for each row execute function private.expenses_mark_manual_category();

revoke all on function private.expenses_mark_manual_category() from public, anon, authenticated;
