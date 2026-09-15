-- Fallo de seguridad real encontrado probando en vivo el modo Cuentas
-- Separadas con un segundo adulto de verdad: la política "ALL" de
-- bank_accounts dejaba a CUALQUIER miembro con acceso a Economía
-- reasignar el dueño de CUALQUIER cuenta — incluida la de otra
-- persona. Como el dueño (owner_member_id) es justo lo que decide
-- quién ve el saldo/movimientos en modo separado, bastaba con
-- ponerse a uno mismo como dueño de la cuenta ajena para verla
-- entera. Petición real: "solo uno mismo pueda cambiar la asignada a
-- su nombre a Común u otro usuario pero nunca otro pueda editar la
-- etiqueta de un tercero".
--
-- Se separa la política única en cuatro (select/insert/delete iguales
-- que antes; update con la condición nueva): reasignar el dueño de
-- una cuenta ya asignada a un tercero solo lo puede hacer el admin —
-- el propio dueño actual sigue pudiendo cambiar SU cuenta (a Común o
-- a quien sea), y una cuenta sin dueño la puede reclamar cualquiera
-- con acceso, como hasta ahora.

drop policy "bank_accounts: family crud" on bank_accounts;

create policy "bank_accounts: family select" on bank_accounts
  for select
  using (
    exists (
      select 1 from bank_connections c
      where c.id = bank_accounts.connection_id
        and c.family_id = private.current_family_id()
        and private.has_section_access('dinero')
    )
  );

create policy "bank_accounts: family insert" on bank_accounts
  for insert
  with check (
    exists (
      select 1 from bank_connections c
      where c.id = bank_accounts.connection_id
        and c.family_id = private.current_family_id()
        and private.has_section_access('dinero')
    )
  );

create policy "bank_accounts: family delete" on bank_accounts
  for delete
  using (
    exists (
      select 1 from bank_connections c
      where c.id = bank_accounts.connection_id
        and c.family_id = private.current_family_id()
        and private.has_section_access('dinero')
    )
  );

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
      private.current_role_in_family() = 'admin'
      or bank_accounts.owner_member_id is null
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
