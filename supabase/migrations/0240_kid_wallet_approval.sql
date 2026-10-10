-- Pequeños Grandes, Fase 8 (orden de recuperación de requisitos, autorización directa del usuario
-- 2026-10-10) — "autonomía y aprobaciones": hasta ahora un niño podía registrar su propio ingreso o gasto
-- y se aplicaba DIRECTO (register_kid_income repartía ahorro/impuesto al instante, addWalletTransaction
-- insertaba sin más). Ahora, cuando quien registra es el propio niño (role 'child', sobre su propio
-- member_id), el movimiento de ingreso/gasto queda 'pendiente' hasta que un adulto lo apruebe — un adulto
-- que registra en nombre de un niño sigue aplicándose directo, como siempre.
--
-- Aditiva: status por defecto 'aprobado' — todo movimiento ya existente queda exactamente como estaba
-- (aprobado, cuenta en el saldo de siempre), nunca se reinterpreta como pendiente con carácter retroactivo.
alter table kid_wallet_transactions add column status text not null default 'aprobado' check (status in ('pendiente', 'aprobado', 'rechazado'));
alter table kid_wallet_transactions add column requested_by uuid null references profiles(id) on delete set null;
alter table kid_wallet_transactions add column decided_by uuid null references profiles(id) on delete set null;
alter table kid_wallet_transactions add column decided_at timestamptz null;

-- La RLS ya existente (family crud) no cambia: decide QUIÉN puede escribir qué fila. Este trigger decide
-- el STATUS de lo que se escribe, a prueba de que el cliente intente mandar 'aprobado' directamente (un
-- insert/update crudo contra la tabla, sin pasar por el RPC) — nunca basta con que el formulario de la
-- app "no lo permita"; la base de datos es quien de verdad lo impide.
create or replace function private.enforce_kid_wallet_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := private.current_role_in_family();
  v_self uuid := private.current_member_id();
begin
  if v_role = 'child' and new.member_id = v_self then
    if tg_op = 'INSERT' and new.type in ('ingreso', 'gasto') then
      new.status := 'pendiente';
      new.requested_by := auth.uid();
      new.decided_by := null;
      new.decided_at := null;
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
      -- Un niño puede seguir editando lo suyo (si algún día hay edición), pero nunca auto-aprobarse ni
      -- auto-rechazarse cambiando el status a mano.
      raise exception 'not_authorized';
    end if;
  end if;
  return new;
end;
$$;

create trigger kid_wallet_transactions_enforce_status
before insert or update on kid_wallet_transactions
for each row execute function private.enforce_kid_wallet_status();

-- register_kid_income (migración 0230) seguía repartiendo ahorro/impuesto SIEMPRE, aunque quien llamara
-- fuera el propio niño. Ahora solo reparte si el ingreso queda realmente aprobado al insertarlo (lo decide
-- el trigger de arriba, no esta función) — si un niño lo registra sobre sí mismo, el trigger lo deja
-- 'pendiente' y aquí NO se reparte nada todavía; decide_kid_wallet_transaction reparte al aprobarlo.
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

  insert into kid_wallet_transactions (family_id, member_id, type, amount, description)
  values (v_family_id, p_member_id, 'ingreso', p_amount, p_description)
  returning * into v_income;

  if v_income.status = 'aprobado' then
    select ahorro_pct, impuesto_pct into v_ahorro_pct, v_impuesto_pct
    from kid_income_split_configs where member_id = p_member_id;

    if not found then
      v_ahorro_pct := 60;
      v_impuesto_pct := 20;
    end if;

    v_ahorro_amount := round(p_amount * v_ahorro_pct / 100.0, 2);
    v_impuesto_amount := round(p_amount * v_impuesto_pct / 100.0, 2);

    if v_ahorro_amount > 0 then
      insert into kid_wallet_transactions (family_id, member_id, type, amount, description, source_income_id)
      values (v_family_id, p_member_id, 'ahorro', v_ahorro_amount, 'Reparto automático', v_income.id);
    end if;

    if v_impuesto_amount > 0 then
      insert into kid_wallet_transactions (family_id, member_id, type, amount, description, source_income_id)
      values (v_family_id, p_member_id, 'impuesto', v_impuesto_amount, 'Reparto automático', v_income.id);
    end if;
  end if;

  return v_income;
end;
$function$;

-- Decidir (aprobar/rechazar) un movimiento pendiente — solo un adulto/admin (nunca un 'child', ni
-- siquiera sobre el pendiente de otro niño). Aprobar un ingreso reparte ahorro/impuesto EN ESE MOMENTO,
-- con la configuración vigente; rechazar no reparte nada y el movimiento deja de contar en ningún saldo
-- (walletBalance solo suma 'aprobado', ver src/domain/finance.ts).
create or replace function public.decide_kid_wallet_transaction(p_transaction_id uuid, p_approved boolean)
returns kid_wallet_transactions
language plpgsql
set search_path = 'public'
as $function$
declare
  v_family_id uuid := private.current_family_id();
  v_role text := private.current_role_in_family();
  v_tx kid_wallet_transactions;
  v_ahorro_pct integer;
  v_impuesto_pct integer;
  v_ahorro_amount numeric(10, 2);
  v_impuesto_amount numeric(10, 2);
begin
  if v_role = 'child' then
    raise exception 'not_authorized';
  end if;

  select * into v_tx from kid_wallet_transactions
  where id = p_transaction_id and family_id = v_family_id and status = 'pendiente'
  for update;

  if v_tx.id is null then
    raise exception 'not_found';
  end if;

  if p_approved then
    update kid_wallet_transactions set status = 'aprobado', decided_by = auth.uid(), decided_at = now()
    where id = v_tx.id
    returning * into v_tx;

    if v_tx.type = 'ingreso' then
      select ahorro_pct, impuesto_pct into v_ahorro_pct, v_impuesto_pct
      from kid_income_split_configs where member_id = v_tx.member_id;

      if not found then
        v_ahorro_pct := 60;
        v_impuesto_pct := 20;
      end if;

      v_ahorro_amount := round(v_tx.amount * v_ahorro_pct / 100.0, 2);
      v_impuesto_amount := round(v_tx.amount * v_impuesto_pct / 100.0, 2);

      if v_ahorro_amount > 0 then
        insert into kid_wallet_transactions (family_id, member_id, type, amount, description, source_income_id)
        values (v_family_id, v_tx.member_id, 'ahorro', v_ahorro_amount, 'Reparto automático', v_tx.id);
      end if;

      if v_impuesto_amount > 0 then
        insert into kid_wallet_transactions (family_id, member_id, type, amount, description, source_income_id)
        values (v_family_id, v_tx.member_id, 'impuesto', v_impuesto_amount, 'Reparto automático', v_tx.id);
      end if;
    end if;
  else
    update kid_wallet_transactions set status = 'rechazado', decided_by = auth.uid(), decided_at = now()
    where id = v_tx.id
    returning * into v_tx;
  end if;

  return v_tx;
end;
$function$;

revoke execute on function public.decide_kid_wallet_transaction(uuid, boolean) from public, anon;
grant execute on function public.decide_kid_wallet_transaction(uuid, boolean) to authenticated;
