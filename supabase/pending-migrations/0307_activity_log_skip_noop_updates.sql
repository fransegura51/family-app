-- 0307 · «Actividad reciente»: un UPDATE que no cambia nada ya no es actividad.
--
-- PENDIENTE DE APLICAR (no se ha aplicado en producción). Reversión: supabase/rollbacks/0307_activity_log_skip_noop_updates_down.sql.
--
-- Causa demostrada en el código: el disparador log_activity() (0011) anota CADA update de calendar_events, aunque el valor no cambie. La sincronización horaria de Google
-- (sync-calendar-from-google-cron) hace `update` de TODOS los eventos ya importados en cada vuelta, con los mismos datos y sin sesión de persona (auth.uid() nulo): por eso salían
-- decenas de «Alguien modificó un evento» idénticas cada hora, que además tapaban la actividad real (la pantalla solo enseña las últimas 50).
--
-- Cambio mínimo y no destructivo: si es un UPDATE y la fila es igual salvo `updated_at`, no se anota nada. Un cambio real (título, hora, miembros asignados que toquen la fila…) se sigue
-- anotando igual que antes, con la misma persona. NO borra ni modifica ninguna fila de activity_log ya existente.

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_record_id uuid;
begin
  if TG_OP = 'UPDATE' and (to_jsonb(OLD) - 'updated_at') = (to_jsonb(NEW) - 'updated_at') then
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    v_family_id := OLD.family_id;
    v_record_id := OLD.id;
  else
    v_family_id := NEW.family_id;
    v_record_id := NEW.id;
  end if;

  insert into activity_log (family_id, actor_id, table_name, action, record_id)
  values (v_family_id, auth.uid(), TG_TABLE_NAME, lower(TG_OP), v_record_id);

  return coalesce(NEW, OLD);
end;
$$;

revoke all on function public.log_activity() from public, anon, authenticated;
