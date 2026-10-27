-- Interruptor, desde el Centro de Administración, de la publicación a su hora de un menú semanal YA APROBADO (ajuste weekly_menu_autopublish, hasta ahora solo cambiable con una
-- migración). NO es publicación sin revisión: el menú sigue necesitando la aprobación de un administrador; este ajuste solo decide si, una vez aprobado, sale solo el sábado
-- a las 10:00 (Europe/Madrid) o se queda programado sin publicarse. Por defecto sigue DESACTIVADO (0). Cambiarlo queda registrado en el historial de administración.
-- Deshacer: supabase/rollbacks/0326_community_menu_autopublish_toggle_down.sql.
create or replace function public.community_admin_set_menu_autopublish(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.community_require_admin();
  if p_enabled is null then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  update public.community_settings set value = to_jsonb(case when p_enabled then 1 else 0 end), updated_at = now() where key = 'weekly_menu_autopublish';
  perform private.community_log('menu_autopublish', 'setting', null, case when p_enabled then 'on' else 'off' end);
end;
$$;
revoke all on function public.community_admin_set_menu_autopublish(boolean) from public, anon;
grant execute on function public.community_admin_set_menu_autopublish(boolean) to authenticated;
