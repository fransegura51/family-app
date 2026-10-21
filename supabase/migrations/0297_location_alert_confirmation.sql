-- 0297_location_alert_confirmation.sql
--
-- Falsos avisos de «ha llegado / se ha ido de Casa» (21/10/2026): la posición salta fuera y dentro del radio en
-- segundos y el servidor avisaba con la primera lectura que cambiaba de lado.
--
-- Qué cambia: un cambio de estado (cerca <-> lejos) ya NO avisa con una sola lectura. La primera lectura que
-- contradice el estado guardado solo queda «pendiente»; el aviso sale cuando llega otra lectura que confirma el mismo
-- cambio y han pasado al menos 60 s desde la primera. Si entre medias llega una lectura del lado antiguo, el
-- pendiente se borra (era un rebote del GPS) y no se avisa de nada.
--
-- No añade llamadas: todo ocurre dentro del disparador que ya existe; solo se escriben dos columnas más en la
-- misma fila de estado. La histéresis de distancia (radio * 1,25 + 20 m) se mantiene tal cual.
--
-- Datos reales (21/10/2026, 12:23 y 12:49): el móvil de Jennifer alternaba entre dos puntos a ~380 m de Casa y, de vez en
-- cuando, una lectura suelta a 4-25 m de Casa. Cada lectura suelta cruzaba el radio y avisaba. Con la confirmación,
-- una lectura suelta nunca avisa. Los 60 s están en c_confirm_seconds.

alter table public.automation_rule_member_state
  add column if not exists pending_near boolean,
  add column if not exists pending_since timestamptz;

create or replace function private.evaluate_location_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_confirm_seconds constant integer := 60;
  r record;
  v_dist double precision;
  v_prev boolean;
  v_pending_near boolean;
  v_pending_since timestamptz;
  v_near boolean;
  v_member_name text;
  v_at timestamptz := coalesce(new.recorded_at, now());
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

      select s.near, s.pending_near, s.pending_since
        into v_prev, v_pending_near, v_pending_since
      from public.automation_rule_member_state s
      where s.rule_id = r.id and s.member_id = new.member_id;

      -- Primera lectura de esta persona para esta regla: solo se guarda el estado, sin avisar.
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

      -- La lectura coincide con el estado guardado: si había un cambio pendiente era un rebote; se descarta.
      if v_near = v_prev then
        if v_pending_near is not null then
          update public.automation_rule_member_state
          set pending_near = null, pending_since = null
          where rule_id = r.id and member_id = new.member_id;
        end if;
        continue;
      end if;

      -- La lectura contradice el estado guardado. Primera vez (o cambio de sentido): queda pendiente, sin avisar.
      if v_pending_near is distinct from v_near or v_pending_since is null then
        update public.automation_rule_member_state
        set pending_near = v_near, pending_since = v_at
        where rule_id = r.id and member_id = new.member_id;
        continue;
      end if;

      -- Segunda lectura en el mismo sentido: se confirma solo si ha pasado el tiempo mínimo.
      if v_at < v_pending_since + make_interval(secs => c_confirm_seconds) then
        continue;
      end if;

      update public.automation_rule_member_state
      set near = v_near, updated_at = now(), pending_near = null, pending_since = null
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
