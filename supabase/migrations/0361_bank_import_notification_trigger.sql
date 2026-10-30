-- NOT-04 (parte 2) — el aviso agrupado de movimientos importados se genera EN LA BASE DE DATOS, sin tocar la función de servidor de sincronización del banco.
--
-- Por qué: la función enable-banking-sync-transactions ya está desplegada y estable; el aviso se calcula mejor donde se sabe con certeza qué movimientos son NUEVOS (los que de
-- verdad se insertan) en lugar de reescribirla. Un disparador de sentencia sobre bank_transactions (con tabla de transición) agrupa lo insertado por cuenta:
--   · solo cuentan movimientos NUEVOS con fecha de los últimos 7 días (ampliar el periodo y traer histórico antiguo no avisa de nada);
--   · la primera importación de una cuenta (no había ningún movimiento antes) no avisa: sería avisar de todo el histórico;
--   · un movimiento que ya existía y solo se reescribe (el margen de 3 días del sincronizador) es una actualización, no una inserción: no avisa;
--   · una sincronización con varias páginas de resultados se acumula en el MISMO aviso (5 minutos): «Has recibido 1 ingreso y 3 cargos nuevos», un solo aviso y un solo push;
--   · reprocesar no duplica: lo ya insertado no se vuelve a insertar, y la clave anti-repeticiones del lote lo impide también.
-- El aviso guarda los identificadores de los movimientos bancarios; la app resuelve a qué gastos corresponden al abrirlo (Economía → Movimientos).
-- Sustituye la firma de notify_bank_import de 0360 (ahora recibe los identificadores del banco, no los de los gastos, que aún no existen en el momento de insertar).
-- Deshacer: supabase/rollbacks/0361_bank_import_notification_trigger_down.sql.

drop function if exists public.notify_bank_import(uuid, text, integer, integer, uuid[]);

create or replace function public.notify_bank_import(
  p_account_id uuid,
  p_batch text,
  p_credits integer,
  p_debits integer,
  p_bank_tx_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_owner uuid;
  v_owner_profile uuid;
  r record;
  ex record;
  v_total integer := coalesce(p_credits, 0) + coalesce(p_debits, 0);
  v_sent integer := 0;
  v_id uuid;
  v_c integer;
  v_d integer;
  v_ids uuid[];
begin
  if v_total <= 0 or p_batch is null or char_length(p_batch) > 100 then
    return 0;
  end if;
  select bc.family_id, ba.owner_member_id into v_family, v_owner
  from public.bank_accounts ba join public.bank_connections bc on bc.id = ba.connection_id
  where ba.id = p_account_id;
  if not found then
    return 0;
  end if;
  if v_owner is not null then
    select fm.linked_profile_id into v_owner_profile from public.family_members fm where fm.id = v_owner;
  end if;

  for r in
    select p.id as profile_id
    from public.profiles p
    left join public.user_notification_prefs np on np.profile_id = p.id
    where p.family_id = v_family
      and p.role in ('admin', 'adult')
      and (p.allowed_sections is null or 'dinero' = any(p.allowed_sections))
      and coalesce(np.bank_import_enabled, true)
      and (v_owner is null or p.id = v_owner_profile)
  loop
    -- Un aviso de esta cuenta creado hace menos de 5 minutos (otra página de la misma sincronización): se acumula en él, sin segundo aviso ni segundo push.
    select n.id, n.payload into ex
    from public.user_notifications n
    where n.profile_id = r.profile_id and n.category = 'bank_import' and n.group_key = 'bank-import:' || p_account_id and n.created_at > now() - interval '5 minutes'
    order by n.created_at desc limit 1;
    if found then
      v_c := coalesce((ex.payload->>'credits')::integer, 0) + coalesce(p_credits, 0);
      v_d := coalesce((ex.payload->>'debits')::integer, 0) + coalesce(p_debits, 0);
      select coalesce(array_agg(x), '{}') into v_ids
      from (select distinct x from unnest(coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(coalesce(ex.payload->'bank_tx_ids', '[]'::jsonb))), '{}'::uuid[]) || coalesce(p_bank_tx_ids, '{}'::uuid[])) x limit 200) s;
      update public.user_notifications
      set read_at = null, body = private.bank_import_text(v_c, v_d),
          payload = jsonb_build_object('version', 1, 'credits', v_c, 'debits', v_d, 'bank_tx_ids', to_jsonb(v_ids))
      where id = ex.id;
      v_sent := v_sent + 1;
    else
      v_id := private.notify_user(
        r.profile_id, 'other', 'bank_import', 'Movimientos nuevos del banco', private.bank_import_text(coalesce(p_credits, 0), coalesce(p_debits, 0)), '/dinero?importados=1',
        'bank-import:' || p_account_id, 'bankimport:' || p_account_id || ':' || p_batch, true,
        jsonb_build_object('version', 1, 'credits', coalesce(p_credits, 0), 'debits', coalesce(p_debits, 0), 'bank_tx_ids', to_jsonb(coalesce(p_bank_tx_ids[1:200], '{}'::uuid[]))));
      if v_id is not null then v_sent := v_sent + 1; end if;
    end if;
  end loop;
  return v_sent;
end;
$$;
revoke all on function public.notify_bank_import(uuid, text, integer, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.notify_bank_import(uuid, text, integer, integer, uuid[]) to service_role;

-- «Has recibido 1 ingreso y 3 cargos nuevos» (singular/plural correctos).
create or replace function private.bank_import_text(p_credits integer, p_debits integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Has recibido ' || array_to_string(array_remove(array[
      case when p_credits > 0 then p_credits || case when p_credits = 1 then ' ingreso' else ' ingresos' end end,
      case when p_debits > 0 then p_debits || case when p_debits = 1 then ' cargo' else ' cargos' end end
    ], null), ' y ') || case when p_credits + p_debits = 1 then ' nuevo' else ' nuevos' end;
$$;
revoke execute on function private.bank_import_text(integer, integer) from public, anon, authenticated;

create or replace function private.bank_transactions_notify_new()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_since date := (now() at time zone 'Europe/Madrid')::date - 7;
begin
  for r in
    select g.account_id, g.credits, g.debits, g.ids, g.refs
    from (
      select n.account_id,
             count(*) filter (where n.credit_debit = 'CRDT')::integer as credits,
             count(*) filter (where n.credit_debit = 'DBIT')::integer as debits,
             array_agg(n.id) as ids,
             string_agg(coalesce(n.entry_reference, n.id::text), '|' order by coalesce(n.entry_reference, n.id::text)) as refs
      from new_rows n
      where n.transaction_date is not null and n.transaction_date >= v_since
      group by n.account_id
    ) g
    -- La primera importación de una cuenta (no había nada antes de esta tanda) no avisa.
    where exists (select 1 from public.bank_transactions o where o.account_id = g.account_id and o.id not in (select id from new_rows))
  loop
    perform public.notify_bank_import(r.account_id, md5(r.refs), r.credits, r.debits, r.ids[1:200]);
  end loop;
  return null;
exception when others then
  -- Un fallo al avisar nunca impide guardar los movimientos del banco.
  raise warning 'bank_transactions_notify_new: %', sqlerrm;
  return null;
end;
$$;
revoke execute on function private.bank_transactions_notify_new() from public, anon, authenticated;

create trigger bank_transactions_notify_new
  after insert on public.bank_transactions
  referencing new table as new_rows
  for each statement execute function private.bank_transactions_notify_new();
