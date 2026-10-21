-- Deshace 0297: vuelve a la función de 0243 (avisa con la primera lectura que cambia de lado) y quita las dos columnas.
create or replace function private.evaluate_location_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_dist double precision;
  v_prev boolean;
  v_near boolean;
  v_member_name text;
begin
  begin
    for r in
      select ar.id, ar.name, ar.trigger_type, ar.message,
             coalesce(nullif(btrim(lp.category), ''), lp.name) as place_name,
             lp.latitude as place_lat, lp.longitude as place_lon, lp.radius_m
      from public.automation_rules ar
      join public.location_places lp on lp.id = ar.place_id and lp.family_id = ar.family_id
      where ar.family_id = new.family_id
        and ar.active
        and (ar.muted_until is null or ar.muted_until <= now())
        and ar.trigger_type in ('llegada', 'salida')
        and (ar.member_id is null or ar.member_id = new.member_id)
    loop
      v_dist := private.distance_m(new.latitude, new.longitude, r.place_lat, r.place_lon);

      select s.near into v_prev
      from public.automation_rule_member_state s
      where s.rule_id = r.id and s.member_id = new.member_id;

      if v_prev is null then
        insert into public.automation_rule_member_state (rule_id, member_id, near)
        values (r.id, new.member_id, v_dist <= r.radius_m)
        on conflict (rule_id, member_id) do nothing;
        continue;
      end if;

      if v_prev then
        v_near := v_dist <= (r.radius_m * 1.25 + 20);
      else
        v_near := v_dist <= r.radius_m;
      end if;

      if v_near = v_prev then
        continue;
      end if;

      update public.automation_rule_member_state
      set near = v_near, updated_at = now()
      where rule_id = r.id and member_id = new.member_id;

      if (r.trigger_type = 'llegada' and v_near) or (r.trigger_type = 'salida' and not v_near) then
        select fm.name into v_member_name
        from public.family_members fm
        where fm.id = new.member_id and fm.family_id = new.family_id;

        perform private.send_family_push(
          new.family_id,
          new.member_id,
          replace(replace(r.name, '{miembro}', coalesce(v_member_name, 'Alguien')), '{lugar}', r.place_name),
          replace(replace(r.message, '{miembro}', coalesce(v_member_name, 'Alguien')), '{lugar}', r.place_name),
          '/ubicacion'
        );
      end if;
    end loop;
  exception when others then
    raise warning 'evaluate_location_rules: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function private.evaluate_location_rules() from public, anon, authenticated;

alter table public.automation_rule_member_state
  drop column if exists pending_near,
  drop column if exists pending_since;
