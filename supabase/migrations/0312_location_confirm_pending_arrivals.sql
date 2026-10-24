-- 0312_location_confirm_pending_arrivals.sql
--
-- «Las ubicaciones van con unos minutos de retraso» (24/10/2026). Desde 0297 un cambio de estado (cerca <-> lejos) solo avisa con una SEGUNDA lectura al menos 60 s después de la
-- primera. Al LLEGAR y quedarse quieto (casa, trabajo, colegio) el móvil no manda más lecturas (filtro de 25 m), así que la llegada se quedaba «pendiente» hasta la siguiente
-- lectura: datos reales de hoy, Paco llegó a casa a las 13:18 y el aviso salió a las 13:41; Jenny llegó al colegio a las 08:58 y avisó a las 09:06.
--
-- Qué hace: un trabajo cada minuto confirma por su cuenta una llegada pendiente cuando
--   · han pasado al menos 60 s desde la primera lectura cercana (el mismo plazo de 0297),
--   · la ÚLTIMA posición conocida de la persona sigue dentro del radio del lugar y es posterior a esa primera lectura (no hay una lectura que la contradiga), y
--   · HAY APROXIMACIÓN REAL: al menos 2 lecturas guardadas en los 15 minutos anteriores, a menos de max(3 × radio, 150 m) del lugar. Una posición falsa de red que salta a casa
--     de golpe, estando la persona lejos, no tiene esa cola de lecturas previas y NO se confirma (es el caso que arregló 0297).
-- Solo confirma LLEGADAS (pending_near = true): las salidas siempre traen lecturas nuevas porque la persona se mueve.
--
-- La parte que decide es de solo lectura (private.pending_arrivals_ready) para poder probarla con datos reales sin enviar nada. La confirmación reclama la fila con un UPDATE
-- condicionado (pending_near is true): si el disparador de 0297 y este trabajo coinciden, solo uno avisa. Los avisos son los mismos (send_family_push, mismo texto).

create or replace function private.arrival_has_approach_trail(
  p_member uuid,
  p_family uuid,
  p_since timestamptz,
  p_lat double precision,
  p_lon double precision,
  p_radius_m integer
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 2
  from public.member_location_history h
  where h.member_id = p_member
    and h.family_id = p_family
    and h.recorded_at between p_since - interval '15 minutes' and p_since + interval '5 seconds'
    and private.distance_m(h.latitude, h.longitude, p_lat, p_lon) <= greatest(p_radius_m * 3, 150)
$$;

create or replace function private.pending_arrivals_ready()
returns table (
  rule_id uuid,
  member_id uuid,
  family_id uuid,
  pending_since timestamptz,
  place_name text,
  rule_name text,
  rule_message text,
  trigger_type text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.rule_id, s.member_id, ar.family_id, s.pending_since,
         coalesce(nullif(btrim(lp.category), ''), lp.name) as place_name,
         ar.name, ar.message, ar.trigger_type
  from public.automation_rule_member_state s
  join public.automation_rules ar on ar.id = s.rule_id
  join public.location_places lp on lp.id = ar.place_id and lp.family_id = ar.family_id
  join public.member_locations ml on ml.member_id = s.member_id and ml.family_id = ar.family_id
  where s.pending_near is true
    and s.pending_since <= now() - interval '60 seconds'
    and s.pending_since > now() - interval '30 minutes'
    and ar.active
    and (ar.muted_until is null or ar.muted_until <= now())
    and ar.trigger_type in ('llegada', 'salida')
    and (ar.member_id is null or ar.member_id = s.member_id)
    and s.near is false
    -- la última posición conocida es posterior a la primera lectura cercana y sigue dentro del radio
    and ml.recorded_at >= s.pending_since
    and private.distance_m(ml.latitude, ml.longitude, lp.latitude, lp.longitude) <= lp.radius_m
    -- y hay aproximación real (no un salto aislado)
    and private.arrival_has_approach_trail(s.member_id, ar.family_id, s.pending_since, lp.latitude, lp.longitude, lp.radius_m)
$$;

create or replace function private.confirm_pending_arrivals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_claimed integer;
  v_member_name text;
  v_done integer := 0;
begin
  for r in select * from private.pending_arrivals_ready() loop
    begin
      -- Reclama la fila: si otro (el disparador) ya la confirmó o la descartó, no se avisa dos veces.
      update public.automation_rule_member_state s
         set near = true, updated_at = now(), pending_near = null, pending_since = null
       where s.rule_id = r.rule_id and s.member_id = r.member_id and s.pending_near is true and s.near is false;
      get diagnostics v_claimed = row_count;
      if v_claimed = 0 then
        continue;
      end if;

      if r.trigger_type = 'llegada' then
        select fm.name into v_member_name from public.family_members fm where fm.id = r.member_id and fm.family_id = r.family_id;
        perform private.send_family_push(
          r.family_id,
          r.member_id,
          replace(replace(r.rule_name, '{miembro}', coalesce(v_member_name, 'Alguien')), '{lugar}', r.place_name),
          replace(replace(r.rule_message, '{miembro}', coalesce(v_member_name, 'Alguien')), '{lugar}', r.place_name),
          '/ubicacion'
        );
      end if;
      v_done := v_done + 1;
    exception when others then
      raise warning 'confirm_pending_arrivals: %', sqlerrm;
    end;
  end loop;
  return v_done;
end;
$$;

revoke execute on function private.arrival_has_approach_trail(uuid, uuid, timestamptz, double precision, double precision, integer) from public, anon, authenticated;
revoke execute on function private.pending_arrivals_ready() from public, anon, authenticated;
revoke execute on function private.confirm_pending_arrivals() from public, anon, authenticated;

-- Cada minuto. Idempotente: si el trabajo ya existe se retira y se vuelve a programar.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'location-confirm-pending-arrivals') then
    perform cron.unschedule('location-confirm-pending-arrivals');
  end if;
  perform cron.schedule('location-confirm-pending-arrivals', '* * * * *', 'select private.confirm_pending_arrivals();');
end
$$;
