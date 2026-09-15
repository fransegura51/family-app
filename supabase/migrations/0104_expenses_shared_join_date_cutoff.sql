-- Petición real, tras encontrar por qué Jenny seguía viendo movimientos
-- antiguos del Sabadell aunque 0101 ya metía un corte por fecha de
-- entrada: "que la persona que se mete nueva no pueda ver movimientos
-- anteriores a la fecha de entrada a la app. De ese modo el historial no
-- se cambia para los presentes ya y a la vez no nos tenemos que
-- preocupar por qué alguien vea información que no debe".
--
-- 0101 solo aplicaba el corte de fecha a la rama "owner_member_id is
-- null" — pero 0098 marca `shared = true` SIEMPRE que owner_member_id es
-- null (es la propia definición de "Común implícito"), así que la rama
-- "or shared" de la política dejaba pasar exactamente esas mismas filas
-- sin mirar la fecha en absoluto: el corte por fecha nunca llegaba a
-- aplicarse de verdad. Se une la condición de "Común" (sin dueño) y la
-- de "compartido a propósito" (shared) bajo el mismo corte por fecha —
-- lo propio de cada uno (owner_member_id = quien mira) se sigue viendo
-- siempre, sin importar la fecha.

drop policy "expenses: family crud" on expenses;
create policy "expenses: family crud" on expenses
  for all
  using (
    family_id = private.current_family_id()
    and (budget_group = 'alimentacion' or private.has_section_access('dinero'))
    and (
      budget_group = 'alimentacion'
      or private.current_accounts_mode() = 'compartido'
      or owner_member_id = private.current_member_id()
      or (
        (owner_member_id is null or shared)
        and expense_date >= private.current_member_joined_at()::date
      )
    )
  )
  with check (
    family_id = private.current_family_id()
    and (budget_group = 'alimentacion' or private.has_section_access('dinero'))
    and (
      budget_group = 'alimentacion'
      or private.current_accounts_mode() = 'compartido'
      or owner_member_id = private.current_member_id()
      or (
        (owner_member_id is null or shared)
        and expense_date >= private.current_member_joined_at()::date
      )
    )
  );
