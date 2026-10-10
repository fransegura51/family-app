-- Rollback de 0240_kid_wallet_approval.sql.
revoke execute on function public.decide_kid_wallet_transaction(uuid, boolean) from authenticated;
drop function if exists public.decide_kid_wallet_transaction(uuid, boolean);

create or replace function public.register_kid_income(p_member_id uuid, p_amount numeric, p_description text)
returns kid_wallet_transactions
language plpgsql
set search_path = 'public'
as $function$
declare
  v_family_id uuid := private.current_family_id();
  v_ahorro_pct integer;
  v_impuesto_pct integer;
  v_ahorro_amount numeric(10, 2);
  v_impuesto_amount numeric(10, 2);
  v_income kid_wallet_transactions;
begin
  if not exists (select 1 from family_members m where m.id = p_member_id and m.family_id = v_family_id) then
    raise exception 'member_not_found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select ahorro_pct, impuesto_pct into v_ahorro_pct, v_impuesto_pct
  from kid_income_split_configs where member_id = p_member_id;

  if not found then
    v_ahorro_pct := 60;
    v_impuesto_pct := 20;
  end if;

  v_ahorro_amount := round(p_amount * v_ahorro_pct / 100.0, 2);
  v_impuesto_amount := round(p_amount * v_impuesto_pct / 100.0, 2);

  insert into kid_wallet_transactions (family_id, member_id, type, amount, description)
  values (v_family_id, p_member_id, 'ingreso', p_amount, p_description)
  returning * into v_income;

  if v_ahorro_amount > 0 then
    insert into kid_wallet_transactions (family_id, member_id, type, amount, description, source_income_id)
    values (v_family_id, p_member_id, 'ahorro', v_ahorro_amount, 'Reparto automático', v_income.id);
  end if;

  if v_impuesto_amount > 0 then
    insert into kid_wallet_transactions (family_id, member_id, type, amount, description, source_income_id)
    values (v_family_id, p_member_id, 'impuesto', v_impuesto_amount, 'Reparto automático', v_income.id);
  end if;

  return v_income;
end;
$function$;

drop trigger if exists kid_wallet_transactions_enforce_status on kid_wallet_transactions;
drop function if exists private.enforce_kid_wallet_status();

alter table kid_wallet_transactions drop column if exists decided_at;
alter table kid_wallet_transactions drop column if exists decided_by;
alter table kid_wallet_transactions drop column if exists requested_by;
alter table kid_wallet_transactions drop column if exists status;
