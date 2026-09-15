-- Petición real, revisando el arreglo anterior (0102): "pienso que el
-- administrador tampoco debería poder modificar la etiqueta de otro"
-- — se quita la excepción de admin. Reasignar el dueño de una cuenta
-- ya asignada a otra persona ahora solo lo puede hacer esa misma
-- persona; ni siquiera el administrador de la familia. Una cuenta sin
-- dueño la sigue pudiendo reclamar cualquiera con acceso a Economía.

drop policy "bank_accounts: owner update" on bank_accounts;
create policy "bank_accounts: owner update" on bank_accounts
  for update
  using (
    exists (
      select 1 from bank_connections c
      where c.id = bank_accounts.connection_id
        and c.family_id = private.current_family_id()
        and private.has_section_access('dinero')
    )
    and (
      bank_accounts.owner_member_id is null
      or bank_accounts.owner_member_id = private.current_member_id()
    )
  )
  with check (
    exists (
      select 1 from bank_connections c
      where c.id = bank_accounts.connection_id
        and c.family_id = private.current_family_id()
        and private.has_section_access('dinero')
    )
  );
