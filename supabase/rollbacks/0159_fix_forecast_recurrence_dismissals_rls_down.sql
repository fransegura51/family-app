-- Rollback de 0159_fix_forecast_recurrence_dismissals_rls.sql — restaura la policy tal como quedó en
-- 0158 (con el bug de sombreado de nombre). Solo para revertir esta migración concreta si hiciera falta;
-- no se espera usar en producción.
drop policy "forecast_recurrence_dismissals: family crud" on forecast_recurrence_dismissals;

create policy "forecast_recurrence_dismissals: family crud" on forecast_recurrence_dismissals for all
  using (
    family_id = private.current_family_id()
    and private.has_section_access('dinero')
    and exists (
      select 1 from bank_accounts a
      join bank_connections c on c.id = a.connection_id
      where a.id = account_id and c.family_id = family_id
    )
  )
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('dinero')
    and exists (
      select 1 from bank_accounts a
      join bank_connections c on c.id = a.connection_id
      where a.id = account_id and c.family_id = family_id
    )
  );
