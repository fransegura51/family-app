-- Deshace 0307: vuelve al disparador original de 0011 (anota todos los updates, también los que no cambian nada).
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
