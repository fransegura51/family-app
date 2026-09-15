-- Piso compartido: petición real tras probarlo con un 2º adulto de
-- prueba: "un usuario nuevo del modo cuentas separadas no pueda ver el
-- historial anterior a su creación de las cuentas del primer adulto".
-- Un gasto sin dueño resuelto (owner_member_id null) se trataba como
-- "Común, visible para todos" sin mirar la fecha — correcto para lo que
-- de verdad se comparte a propósito, pero también dejaba ver TODO el
-- histórico de antes de que el nuevo miembro existiera (la inmensa
-- mayoría de gastos antiguos nunca llegó a tener dueño resuelto). Ahora
-- un gasto sin dueño solo cuenta como "Común visible" para un miembro
-- si es de fecha igual o posterior a cuando ESE miembro entró a la
-- familia — cada uno sigue viendo su propio histórico desde que existe,
-- pero no el de antes de unirse.

create or replace function private.current_member_joined_at()
returns timestamptz
language sql
security definer
stable
set search_path = public
as $$
  select created_at from family_members where id = private.current_member_id()
$$;

revoke execute on function private.current_member_joined_at() from public, anon, authenticated;
grant execute on function private.current_member_joined_at() to authenticated;

drop policy "expenses: family crud" on expenses;
create policy "expenses: family crud" on expenses
  for all
  using (
    family_id = private.current_family_id()
    and (budget_group = 'alimentacion' or private.has_section_access('dinero'))
    and (
      budget_group = 'alimentacion'
      or private.current_accounts_mode() = 'compartido'
      or (owner_member_id is null and expense_date >= private.current_member_joined_at()::date)
      or shared
      or owner_member_id = private.current_member_id()
    )
  )
  with check (
    family_id = private.current_family_id()
    and (budget_group = 'alimentacion' or private.has_section_access('dinero'))
    and (
      budget_group = 'alimentacion'
      or private.current_accounts_mode() = 'compartido'
      or (owner_member_id is null and expense_date >= private.current_member_joined_at()::date)
      or shared
      or owner_member_id = private.current_member_id()
    )
  );
