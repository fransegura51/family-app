-- SEGURIDAD (hallazgo de la auditoría de Comunidad, 15/10/2026): hasta ahora cualquier persona con sesión podía editar SU PROPIA fila de «profiles» sin
-- límite de columnas (la política «update own row» no tenía WITH CHECK y la tabla daba UPDATE sobre todas las columnas). Eso permitía ponerse
-- role = 'admin', is_app_owner = true (administrador de la app y de Comunidad), cambiar allowed_sections o incluso family_id (saltarse el aislamiento
-- entre familias si conocía el identificador de otra familia).
--
-- Arreglo: la app solo escribe directamente SUS ajustes de preferencias (colores del calendario, orden de tareas, día de inicio de mes, filtros de fecha).
-- Todo lo demás (role, family_id, is_app_owner, allowed_sections, display_name, id, created_at) solo lo cambian funciones del servidor
-- (create_family, join_family_with_code, funciones de la app y funciones con service_role), que NO dependen de este permiso porque son SECURITY DEFINER.
-- Además se añade WITH CHECK a la política para que nadie pueda «mover» la fila a otra persona.
--
-- Sin cambios de datos. Reversible con supabase/rollbacks/0276_profiles_protect_privileged_columns_down.sql.

revoke update on public.profiles from anon, authenticated;
grant update (
  calendar_color_mode,
  calendar_task_order,
  calendar_task_strikethrough,
  calendar_task_done_color,
  calendar_task_move_completed,
  finance_month_start_day,
  date_filter_favorite,
  date_filter_disabled
) on public.profiles to authenticated;

drop policy if exists "profiles: update own row" on public.profiles;
create policy "profiles: update own row" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
