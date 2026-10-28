-- 0341 · CAT-2 — Cambiar el nombre o el icono de una categoría de la familia (general o propia) sin perder nada.
--
-- Hasta ahora una categoría solo se podía crear, clasificar o borrar: no se podía corregir su nombre ni su icono. Como el NOMBRE de la categoría se guarda
-- como texto en gastos, tickets y presupuestos, cambiarlo exige actualizar todo a la vez: esta función lo hace en UNA transacción (si algo falla, no cambia
-- nada) y con los permisos de quien la llama (SECURITY INVOKER: la RLS de cada tabla se aplica tal cual; solo toca filas de la propia familia).
--   · La identidad de una categoría general NO es su nombre sino catalog_key: renombrarla afecta SOLO a esa familia y no cambia el catálogo compartido.
--   · Las categorías protegidas del catálogo (Movimientos internos, Cobro anulado, Retirada de efectivo, Transferencias entre cuentas propias, Ingreso,
--     Alimentación) siguen unidas al nombre en varios cálculos: de ellas solo se puede cambiar el icono.
--   · Una categoría personal (sin catalog_key) se puede renombrar libremente.
--   · No cambia importes, fechas, etiquetas, repartos ni presupuestos: solo la etiqueta de texto. No toca a otras familias.
-- ROLLBACK: supabase/rollbacks/0341_rename_budget_category_down.sql
-- Renombrar una categoría no es una decisión de clasificación: el disparador de 0340 no marca como «manual» los gastos que solo cambian de nombre de categoría
-- (interruptor local a la transacción, lo activa únicamente rename_budget_category).
create or replace function private.expenses_mark_manual_category()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if auth.uid() is null or coalesce(current_setting('app.skip_manual_mark', true), '') = 'on' then
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
revoke all on function private.expenses_mark_manual_category() from public, anon, authenticated;

create or replace function public.rename_budget_category(p_id uuid, p_name text default null, p_icon text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.budget_categories;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_icon text := nullif(btrim(coalesce(p_icon, '')), '');
  v_protected boolean := false;
  v_expenses integer := 0;
  v_budgets integer := 0;
  v_receipts integer := 0;
begin
  select * into v_row from public.budget_categories where id = p_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_name is not null and length(v_name) > 60 then
    return jsonb_build_object('status', 'rejected', 'reason', 'name_too_long');
  end if;
  if v_icon is not null and length(v_icon) > 16 then
    return jsonb_build_object('status', 'rejected', 'reason', 'icon_too_long');
  end if;

  if v_name is not null and v_name is distinct from v_row.name then
    if v_row.catalog_key is not null then
      select c.protected into v_protected from public.catalog_categories c where c.key = v_row.catalog_key;
    end if;
    if coalesce(v_protected, false) then
      return jsonb_build_object('status', 'rejected', 'reason', 'protected_name');
    end if;
    if exists (select 1 from public.budget_categories x
                where x.family_id = v_row.family_id and x.budget_group = v_row.budget_group and x.id <> v_row.id
                  and public.catalog_norm_name(x.name) = public.catalog_norm_name(v_name)) then
      return jsonb_build_object('status', 'rejected', 'reason', 'name_in_use');
    end if;
  end if;

  update public.budget_categories
     set name = coalesce(v_name, name),
         icon = coalesce(v_icon, icon)
   where id = p_id;

  if v_name is not null and v_name is distinct from v_row.name then
    perform set_config('app.skip_manual_mark', 'on', true);
    update public.expenses set category = v_name where family_id = v_row.family_id and category = v_row.name and budget_group = v_row.budget_group;
    get diagnostics v_expenses = row_count;
    perform set_config('app.skip_manual_mark', 'off', true);
    update public.budgets set category = v_name where family_id = v_row.family_id and category = v_row.name and budget_group = v_row.budget_group;
    get diagnostics v_budgets = row_count;
    if v_row.budget_group <> 'ingresos' then
      update public.receipts set category = v_name where family_id = v_row.family_id and category = v_row.name;
      get diagnostics v_receipts = row_count;
    end if;
  end if;

  return jsonb_build_object('status', 'ok', 'expenses', v_expenses, 'budgets', v_budgets, 'receipts', v_receipts);
end $$;

revoke all on function public.rename_budget_category(uuid, text, text) from public, anon;
grant execute on function public.rename_budget_category(uuid, text, text) to authenticated;
