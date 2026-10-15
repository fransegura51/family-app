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

-- Defensa en profundidad: esas tablas ya tienen RLS sin política de INSERT/DELETE (se deniegan), pero se quitan además los permisos de tabla para que no
-- dependan de una sola capa. Las funciones SECURITY DEFINER (create_family, join_family_with_code, borrado de cuenta) no los necesitan.
revoke insert, delete, truncate on public.profiles from anon, authenticated;
revoke insert, delete, truncate on public.families from anon, authenticated;

-- Una persona de la familia solo puede enlazarse con una cuenta de SU MISMA familia (antes una administradora podía poner el identificador de una cuenta
-- ajena en family_members.linked_profile_id y recibir/dirigir avisos hacia otra familia).
create or replace function private.family_members_check_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.linked_profile_id is not null
     and (tg_op = 'INSERT' or new.linked_profile_id is distinct from old.linked_profile_id)
     and not exists (select 1 from public.profiles p where p.id = new.linked_profile_id and p.family_id = new.family_id) then
    raise exception 'La cuenta enlazada no pertenece a esta familia' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.family_members_check_link() from public, anon, authenticated;
drop trigger if exists family_members_check_link on public.family_members;
create trigger family_members_check_link before insert or update of linked_profile_id on public.family_members
  for each row execute function private.family_members_check_link();
