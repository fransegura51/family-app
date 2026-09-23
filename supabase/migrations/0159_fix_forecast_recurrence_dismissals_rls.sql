-- Fase 1E.0 — corrige un bug real de RLS en forecast_recurrence_dismissals (migración 0158).
--
-- La policy original comprobaba "account_id pertenece de verdad a esta familia" con:
--   where a.id = account_id and c.family_id = family_id
-- El `family_id` sin cualificar, dentro del EXISTS correlacionado, se resuelve al `family_id` de
-- bank_connections (alias c, en el propio FROM del subquery) en vez de al `family_id` de la fila de
-- forecast_recurrence_dismissals (la tabla externa) — sombreado de nombre clásico en un subquery
-- correlacionado. El resultado real, confirmado contra pg_policies en producción, era literalmente
-- "c.family_id = c.family_id": una tautología que siempre es verdadera, así que esa mitad de la
-- comprobación no protegía nada. El primer AND (family_id = private.current_family_id()) seguía
-- restringiendo qué FILAS ve/escribe cada familia por su propio family_id — el hueco real era que un
-- account_id de OTRA familia también pasaba el EXISTS, sin que la app lo hubiera permitido nunca (la UI
-- siempre manda un account_id ya filtrado a la familia real), pero la defensa en profundidad prometida
-- explícitamente en el comentario de 0158 no funcionaba.
--
-- Corrección: cualificar el lado derecho con el nombre real de la tabla externa
-- (forecast_recurrence_dismissals.family_id), eliminando la ambigüedad. Verificado en rehearsal
-- (BEGIN/ROLLBACK) contra datos reales: con la versión antigua, un account_id real de una familia y un
-- family_id de OTRA familia distinta pasaban el EXISTS (bug demostrado); con esta versión, el mismo caso
-- se rechaza correctamente y el caso de la misma familia se sigue aceptando.
--
-- No cambia el comportamiento funcional de "No me interesa": la app nunca ha mandado un account_id ajeno,
-- así que ningún dismissal real queda afectado. No se borra ni modifica ninguna fila existente.
drop policy "forecast_recurrence_dismissals: family crud" on forecast_recurrence_dismissals;

create policy "forecast_recurrence_dismissals: family crud" on forecast_recurrence_dismissals for all
  using (
    family_id = private.current_family_id()
    and private.has_section_access('dinero')
    and exists (
      select 1 from bank_accounts a
      join bank_connections c on c.id = a.connection_id
      where a.id = forecast_recurrence_dismissals.account_id
        and c.family_id = forecast_recurrence_dismissals.family_id
    )
  )
  with check (
    family_id = private.current_family_id()
    and private.has_section_access('dinero')
    and exists (
      select 1 from bank_accounts a
      join bank_connections c on c.id = a.connection_id
      where a.id = forecast_recurrence_dismissals.account_id
        and c.family_id = forecast_recurrence_dismissals.family_id
    )
  );
