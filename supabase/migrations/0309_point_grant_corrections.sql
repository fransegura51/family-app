-- 0309 — Corregir o anular puntos concedidos por error (Pequeños Grandes → Puntos y recompensas → Historial).
--
-- ESTADO: APLICADA en producción el 23/10/2026 (con autorización expresa), tras guardar una copia de point_grants (public.point_grants_backup_20261023_pre0309, 4 filas) y comprobar los datos. Deshacer:
-- supabase/rollbacks/0309_point_grant_corrections_down.sql.
--
-- Cómo se guardan hoy los puntos: `point_grants` es un libro de movimientos (nunca una columna de saldo).
-- El saldo y el recorrido de Mi Camino salen de sumar sus filas (más los puntos de Calendario), así que
-- una corrección es simplemente OTRA FILA con la diferencia, nunca un UPDATE ni un DELETE:
--   · concesion  (kind): el «Dar puntos» original, amount > 0. NO se toca jamás.
--   · correccion (kind): fila nueva con la diferencia (nueva cantidad − cantidad vigente), apunta a la original.
--   · anulacion  (kind): fila nueva con −(cantidad vigente), apunta a la original.
-- La fila lleva fecha (created_at), responsable (granted_by) y motivo opcional (reason).
--
-- Seguridad (todo en el servidor, la pantalla solo esconde botones):
--   1. Ya NO se puede insertar a mano una fila que referencie a otra: el insert directo solo admite una
--      concesión nueva (kind = 'concesion', sin referencia, amount > 0) y a un miembro de LA MISMA familia.
--      (Antes la política permitía a un adulto insertar cualquier fila con cualquier signo y apuntar a
--      cualquier id, incluido el de otra familia.)
--   2. Corregir/anular solo por adjust_point_grant(): comprueba sesión, adulto/admin, misma familia,
--      que lo corregido sea una concesión original (no una corrección ni un canje), que no esté ya
--      anulada (evita la doble anulación), y que la corrección no deje al niño/a con saldo negativo
--      (los puntos ya gastados en canjes no se pueden «descontar» sin dejar un saldo incoherente).
--   3. Un bloqueo por miembro (el mismo que usa request_reward_redemption) serializa corregir/anular y
--      solicitar un premio del mismo niño/a: nunca se cruzan.
--   4. Sin políticas de update/delete: RLS las deniega, el historial anterior no se altera.

alter table point_grants
  add column if not exists kind text not null default 'concesion'
  check (kind in ('concesion', 'correccion', 'anulacion'));

-- Filas anteriores que ya referenciaban a otra (reversión total hecha a mano antes de existir esta
-- función) se etiquetan como anulación; todo lo demás sigue siendo una concesión. No se cambia ninguna cantidad.
update point_grants set kind = 'anulacion' where reverses_grant_id is not null and kind = 'concesion';

drop policy if exists "point_grants: adult insert" on point_grants;
create policy "point_grants: adult insert" on point_grants for insert
  with check (
    family_id = private.current_family_id()
    and private.current_role_in_family() in ('admin', 'adult')
    and granted_by = auth.uid()
    and kind = 'concesion'
    and reverses_grant_id is null
    and amount > 0
    and exists (select 1 from family_members m where m.id = member_id and m.family_id = private.current_family_id())
  );

create or replace function public.adjust_point_grant(
  p_grant_id uuid,
  p_action text,
  p_new_amount integer default null,
  p_reason text default null
)
returns point_grants
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_grant point_grants;
  v_effective integer;
  v_delta integer;
  v_balance integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row point_grants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if private.current_role_in_family() is null or private.current_role_in_family() not in ('admin', 'adult') then
    raise exception 'not_allowed';
  end if;
  if p_action not in ('corregir', 'anular') then
    raise exception 'invalid_action';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'reason_too_long';
  end if;

  select * into v_grant from point_grants where id = p_grant_id;
  -- Misma respuesta si no existe o es de otra familia: nunca se confirma que el id existe fuera de la propia.
  if v_grant.id is null or v_grant.family_id <> private.current_family_id() then
    raise exception 'grant_not_found';
  end if;
  if v_grant.kind <> 'concesion' or v_grant.reverses_grant_id is not null or v_grant.amount <= 0 then
    raise exception 'not_a_grant';
  end if;

  -- Mismo bloqueo por miembro que request_reward_redemption: corregir y canjear del mismo niño/a se serializan.
  perform pg_advisory_xact_lock(hashtext(v_grant.member_id::text));

  select v_grant.amount + coalesce((select sum(amount) from point_grants where reverses_grant_id = v_grant.id), 0)
    into v_effective;
  if v_effective <= 0 then
    raise exception 'already_annulled';
  end if;

  if p_action = 'anular' then
    v_delta := -v_effective;
  else
    if p_new_amount is null or p_new_amount < 1 or p_new_amount > 10000 then
      raise exception 'invalid_amount';
    end if;
    if p_new_amount = v_effective then
      raise exception 'no_change';
    end if;
    v_delta := p_new_amount - v_effective;
  end if;

  if v_delta < 0 then
    select coalesce((select sum(points_awarded) from calendar_event_completions where member_id = v_grant.member_id), 0)
         + coalesce((select sum(amount) from point_grants where member_id = v_grant.member_id), 0)
         - coalesce((select sum(points_spent) from reward_redemptions where member_id = v_grant.member_id and status <> 'rechazada'), 0)
      into v_balance;
    if v_balance + v_delta < 0 then
      raise exception 'would_make_balance_negative';
    end if;
  end if;

  insert into point_grants (family_id, member_id, amount, reason, granted_by, reverses_grant_id, kind)
  values (v_grant.family_id, v_grant.member_id, v_delta, v_reason, auth.uid(), v_grant.id,
          case when p_action = 'anular' then 'anulacion' else 'correccion' end)
  returning * into v_row;
  return v_row;
end;
$function$;

revoke all on function public.adjust_point_grant(uuid, text, integer, text) from public, anon;
grant execute on function public.adjust_point_grant(uuid, text, integer, text) to authenticated;
