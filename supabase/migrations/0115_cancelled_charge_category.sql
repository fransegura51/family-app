-- Petición real: "H&M las últimas dos compras me han cobrado, me lo
-- han devuelto y lo han vuelto a cobrar. En total todo está en orden,
-- pero al ver solo gastos parece que se ha gastado el doble." — un
-- cobro anulado (ANUL COMPRA TARJ...) entraba como un Ingreso suelto
-- bajo una categoría cualquiera ("Devoluciones"), sin relación con el
-- cobro que cancela; el cobro original se seguía contando entero como
-- gasto real. Mismo criterio que "Movimientos internos" (transferencia
-- entre cuentas propias: no es gasto ni ingreso real) — se añade una
-- subcategoría hermana de "Transferencias entre cuentas propias" para
-- que el sync (enable-banking-sync-transactions) pueda emparejar cobro
-- + anulación y excluir ambos de Gastado/Ingresado a la vez, con el
-- mismo mecanismo que ya usa isInternalTransferCategory en el cliente
-- — sin tocar ninguno de los sitios que ya la comprueban.
--
-- Mismo patrón que 0076_category_necessity_taxonomy.sql: una fila por
-- familia que todavía no tenga esta subcategoría bajo "Movimientos
-- internos" (idempotente, no duplica si ya existe).
do $$
declare
  fam record;
  v_parent_id uuid;
begin
  for fam in select id from families loop
    select bc.id into v_parent_id from budget_categories bc
      where bc.family_id = fam.id and bc.budget_group = 'generales' and bc.parent_id is null
        and lower(bc.name) = lower('Movimientos internos')
      limit 1;

    if v_parent_id is not null and not exists (
      select 1 from budget_categories bc
      where bc.family_id = fam.id and bc.budget_group = 'generales' and bc.parent_id = v_parent_id and lower(bc.name) = lower('Cobro anulado')
    ) then
      insert into budget_categories (family_id, name, icon, budget_group, parent_id, sort_order, necessity, is_fixed)
      values (fam.id, 'Cobro anulado', '↩️', 'generales', v_parent_id, (extract(epoch from now()) * 1000)::bigint, null, null);
    end if;
  end loop;
end $$;
