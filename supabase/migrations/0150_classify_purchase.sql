-- FASE 6C.2C — classify_purchase: clasificación ATÓMICA de un gasto y su ticket vinculado (category NULL = «Pendiente de clasificar»).
--
--   classify_purchase(p_expense_id, p_receipt_id, p_category) → jsonb
--
-- Una sola transacción. SECURITY INVOKER: se ejecuta con los permisos (y la RLS) de QUIEN LLAMA, así que solo ve y toca lo que ese usuario
-- puede ver y tocar; el family_id NUNCA lo manda el cliente: se deduce de las filas autorizadas (gasto y/o ticket), y la categoría de destino
-- tiene que existir entre las categorías REALES (grupo «generales») de ESA familia. No acepta NULL, '', el texto «Pendiente de clasificar»
-- ni el nombre de una categoría de otra familia o inexistente.
--
-- El vínculo gasto ↔ ticket es receipts.expense_id (índice, 0 duplicados hoy; si hubiera más de un ticket enlazado al mismo gasto se detiene).
-- Reglas cuando hay gasto Y ticket enlazados (e = categoría del gasto, r = la del ticket, X = la categoría pedida):
--   e NULL   + r NULL              → ambos X                                            (classified)
--   e = r = X                      → idempotente, no cambia nada                        (unchanged)
--   e = r = Y ≠ X                  → ambos X (recategorizar una compra coherente)        (reclassified)
--   e NULL + r = X  (o al revés)   → completa SOLO el lado NULL con X; el clasificado no se toca  (classified)
--   e NULL + r = Y ≠ X (o al revés)→ CONFLICTO: no se cambia nada
--   e = Y, r = Z, Y ≠ Z            → CONFLICTO: no se pisa ninguno, no se elige
-- Solo gasto (sin ticket): se clasifica el gasto. Solo ticket (sin gasto): se clasifica el ticket; NO se crea ningún gasto.
--
-- NUNCA toca productos (products.category, class_confirmed_at, non_food), product_prices, importes, aprendizaje compartido ni presupuestos:
-- la categoría FINANCIERA de una compra no reclasifica sus productos.
--
-- Devuelve siempre un jsonb estructurado {status, ...}: classified | unchanged | reclassified | conflict | rejected | not_found. Un fallo de
-- permisos durante el UPDATE lanza una excepción y se revierte TODO (nunca queda un lado cambiado y el otro no).
-- ROLLBACK: supabase/rollbacks/0150_classify_purchase_down.sql

create or replace function public.classify_purchase(
  p_expense_id uuid default null,
  p_receipt_id uuid default null,
  p_category text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_e public.expenses;
  v_r public.receipts;
  v_has_e boolean := false;
  v_has_r boolean := false;
  v_family uuid;
  v_links integer;
  v_set_e boolean := false;
  v_set_r boolean := false;
  v_status text := 'unchanged';
  v_n integer;
begin
  -- ── 1. Destino: una categoría real, con nombre exacto ──
  if p_category is null then return jsonb_build_object('status', 'rejected', 'reason', 'null_category'); end if;
  if btrim(p_category) = '' then return jsonb_build_object('status', 'rejected', 'reason', 'empty_category'); end if;
  if lower(btrim(p_category)) = 'pendiente de clasificar' then return jsonb_build_object('status', 'rejected', 'reason', 'pending_label'); end if;
  if p_expense_id is null and p_receipt_id is null then return jsonb_build_object('status', 'rejected', 'reason', 'nothing_to_classify'); end if;

  -- ── 2. Filas: solo las que la RLS deja ver a quien llama ──
  if p_expense_id is not null then
    select * into v_e from public.expenses where id = p_expense_id for update;
    if not found then return jsonb_build_object('status', 'not_found', 'reason', 'expense'); end if;
    v_has_e := true;
  end if;

  if p_receipt_id is not null then
    select * into v_r from public.receipts where id = p_receipt_id for update;
    if not found then return jsonb_build_object('status', 'not_found', 'reason', 'receipt'); end if;
    v_has_r := true;
    if v_has_e and v_r.expense_id is distinct from v_e.id then
      return jsonb_build_object('status', 'rejected', 'reason', 'link_mismatch');
    end if;
    if not v_has_e and v_r.expense_id is not null then
      -- El ticket dice tener un gasto: se completa con ESE gasto (si no se puede ver o ya no existe, no se toca nada).
      select * into v_e from public.expenses where id = v_r.expense_id for update;
      if not found then return jsonb_build_object('status', 'rejected', 'reason', 'linked_expense_not_accessible'); end if;
      v_has_e := true;
    end if;
  end if;

  if v_has_e and not v_has_r then
    select count(*) into v_links from public.receipts where expense_id = v_e.id;
    if v_links > 1 then return jsonb_build_object('status', 'rejected', 'reason', 'ambiguous_link'); end if;
    if v_links = 1 then
      select * into v_r from public.receipts where expense_id = v_e.id for update;
      v_has_r := true;
    end if;
  elsif v_has_e and v_has_r then
    select count(*) into v_links from public.receipts where expense_id = v_e.id;
    if v_links > 1 then return jsonb_build_object('status', 'rejected', 'reason', 'ambiguous_link'); end if;
  end if;

  -- ── 3. La familia sale de las filas autorizadas, nunca del cliente ──
  if v_has_e and v_has_r and v_e.family_id is distinct from v_r.family_id then
    return jsonb_build_object('status', 'rejected', 'reason', 'family_mismatch');
  end if;
  v_family := case when v_has_e then v_e.family_id else v_r.family_id end;
  if v_has_e and v_e.is_income then return jsonb_build_object('status', 'rejected', 'reason', 'income_not_supported'); end if;

  -- ── 4. La categoría existe entre las reales de ESA familia (la RLS ya limita a la del usuario) ──
  if not exists (select 1 from public.budget_categories where family_id = v_family and name = p_category and budget_group = 'generales') then
    return jsonb_build_object('status', 'rejected', 'reason', 'unknown_category');
  end if;

  -- ── 5. Matriz de decisión ──
  if v_has_e and v_has_r then
    if v_e.category is null and v_r.category is null then
      v_set_e := true; v_set_r := true; v_status := 'classified';
    elsif v_e.category is not distinct from v_r.category then
      if v_e.category = p_category then v_status := 'unchanged';
      else v_set_e := true; v_set_r := true; v_status := 'reclassified'; end if;
    elsif v_e.category is null then
      if v_r.category = p_category then v_set_e := true; v_status := 'classified';
      else return jsonb_build_object('status', 'conflict', 'reason', 'one_side_differs', 'expense_id', v_e.id, 'receipt_id', v_r.id, 'expense_category', v_e.category, 'receipt_category', v_r.category, 'requested', p_category); end if;
    elsif v_r.category is null then
      if v_e.category = p_category then v_set_r := true; v_status := 'classified';
      else return jsonb_build_object('status', 'conflict', 'reason', 'one_side_differs', 'expense_id', v_e.id, 'receipt_id', v_r.id, 'expense_category', v_e.category, 'receipt_category', v_r.category, 'requested', p_category); end if;
    else
      return jsonb_build_object('status', 'conflict', 'reason', 'different_categories', 'expense_id', v_e.id, 'receipt_id', v_r.id, 'expense_category', v_e.category, 'receipt_category', v_r.category, 'requested', p_category);
    end if;
  elsif v_has_e then
    if v_e.category is null then v_set_e := true; v_status := 'classified';
    elsif v_e.category = p_category then v_status := 'unchanged';
    else v_set_e := true; v_status := 'reclassified'; end if;
  else
    if v_r.category is null then v_set_r := true; v_status := 'classified';
    elsif v_r.category = p_category then v_status := 'unchanged';
    else v_set_r := true; v_status := 'reclassified'; end if;
  end if;

  -- ── 6. Cambios: solo la columna category, y los dos lados o ninguno (una excepción revierte todo) ──
  if v_set_e then
    update public.expenses set category = p_category where id = v_e.id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'classify_purchase: no se pudo actualizar el gasto' using errcode = '42501'; end if;
  end if;
  if v_set_r then
    update public.receipts set category = p_category where id = v_r.id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'classify_purchase: no se pudo actualizar el ticket' using errcode = '42501'; end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'category', p_category,
    'expense_id', case when v_has_e then v_e.id end,
    'receipt_id', case when v_has_r then v_r.id end,
    'changed_expense', v_set_e,
    'changed_receipt', v_set_r
  );
end;
$$;

comment on function public.classify_purchase(uuid, uuid, text) is
  'Clasifica de forma atómica un gasto y su ticket vinculado (category NULL = pendiente de clasificar). SECURITY INVOKER (RLS de quien llama); solo categorías reales de su familia; conflictos estructurados, nunca pisa; no toca productos.';

revoke all on function public.classify_purchase(uuid, uuid, text) from public, anon;
grant execute on function public.classify_purchase(uuid, uuid, text) to authenticated;
