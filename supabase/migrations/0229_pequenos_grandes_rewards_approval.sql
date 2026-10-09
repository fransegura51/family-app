-- Pequeños Grandes (prompt maestro) — Fase 4: Puntos y recompensas, AMPLIANDO el módulo ya existente
-- (rewards/reward_redemptions, migración 0006; calendar_event_completions, migraciones 0039/0040) —
-- nunca rehecho desde cero. Aditiva en su totalidad: ninguna fila existente pierde datos.
--
-- 4.2 — catálogo: emoji/descripción/activo (nuevas, opcionales o con default seguro).
alter table rewards add column emoji text null;
alter table rewards add column description text null check (description is null or char_length(description) <= 500);
alter table rewards add column active boolean not null default true;

-- 4.2 — snapshot del premio en el momento del canje: "el historial debe conservar el nombre, coste y
-- datos relevantes del premio en el momento del canje, aunque posteriormente se edite el catálogo" —
-- petición real del prompt maestro. Backfill desde la fila actual de rewards (lo más fiel disponible
-- hoy); de aquí en adelante cada canje nuevo guarda su propio snapshot en el INSERT.
alter table reward_redemptions add column reward_title text null;
alter table reward_redemptions add column reward_emoji text null;
update reward_redemptions rr set reward_title = r.title, reward_emoji = r.emoji from rewards r where rr.reward_id = r.id and rr.reward_title is null;

-- BUG REAL encontrado en la auditoría previa: reward_id era "on delete cascade" — borrar una recompensa
-- del catálogo borraba en cascada TODO su historial de canjes. Con el snapshot de arriba ya guardado, el
-- historial puede sobrevivir a que la recompensa se borre de verdad (aunque 4.2 ya pide "desactivar", no
-- borrar, como acción normal) — nunca más se pierde un canje ya hecho por borrar el catálogo.
alter table reward_redemptions drop constraint reward_redemptions_reward_id_fkey;
alter table reward_redemptions add constraint reward_redemptions_reward_id_fkey foreign key (reward_id) references rewards(id) on delete set null;

-- family_id PROPIO en reward_redemptions (antes se comprobaba solo a través de rewards, migración 0006)
-- — imprescindible ahora que reward_id puede quedar en null: sin esto, borrar una recompensa dejaría ese
-- canje invisible para su propia RLS (ver políticas más abajo). Backfill desde la propia recompensa.
alter table reward_redemptions add column family_id uuid null references families(id) on delete cascade;
update reward_redemptions rr set family_id = r.family_id from rewards r where rr.reward_id = r.id and rr.family_id is null;
alter table reward_redemptions alter column family_id set not null;

create index idx_reward_redemptions_family on reward_redemptions(family_id);

-- 4.3 — canjes con aprobación: pendiente → aprobada/rechazada; aprobada → disfrutada. "Al solicitar,
-- reservar los puntos... al aprobar, descontar definitivamente... al rechazar, liberar la reserva... al
-- marcar como disfrutada, no descontar otra vez" — status distingue las cuatro, la reserva/liberación
-- sale sola de la fórmula de saldo (cuenta todo lo que no esté 'rechazada'), sin una columna de reserva
-- aparte que pudiera desincronizarse.
alter table reward_redemptions add column status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada', 'disfrutada'));
alter table reward_redemptions add column requested_by uuid null references profiles(id) on delete set null;
alter table reward_redemptions add column decided_by uuid null references profiles(id) on delete set null;
alter table reward_redemptions add column decided_at timestamptz null;
alter table reward_redemptions add column enjoyed_at timestamptz null;

-- Los canjes ya existentes eran siempre instantáneos (nunca hubo aprobación hasta hoy) — se consideran
-- ya disfrutados de verdad, nunca se reabren como si estuvieran pendientes de decidir algo ya ocurrido.
update reward_redemptions set status = 'disfrutada', decided_at = redeemed_at, enjoyed_at = redeemed_at where status = 'pendiente';

-- RLS reconstruida — antes "rewards: family crud"/"reward_redemptions: family crud" dejaban a
-- CUALQUIER miembro (también un niño) crear/editar/borrar recompensas y decidir sus propios canjes.
-- Ahora: el catálogo lo gestionan solo adultos autorizados (private.current_role_in_family(), migración
-- 0001/0097 — admin/adult, nunca child/guest); cualquiera de la familia puede LEER el catálogo y
-- solicitar un canje (status='pendiente' únicamente, con requested_by = quien de verdad lo pide — nunca
-- se puede suplantar a otro); solo un adulto puede decidir (aprobar/rechazar/marcar disfrutado). Nunca
-- se permite borrar un canje ya hecho (no hay política de delete para reward_redemptions).
drop policy "rewards: family crud" on rewards;
create policy "rewards: family select" on rewards for select
  using (family_id = private.current_family_id());
create policy "rewards: adult insert" on rewards for insert
  with check (family_id = private.current_family_id() and private.current_role_in_family() in ('admin', 'adult'));
create policy "rewards: adult update" on rewards for update
  using (family_id = private.current_family_id() and private.current_role_in_family() in ('admin', 'adult'))
  with check (family_id = private.current_family_id());
create policy "rewards: adult delete" on rewards for delete
  using (family_id = private.current_family_id() and private.current_role_in_family() in ('admin', 'adult'));

drop policy "reward_redemptions: family crud" on reward_redemptions;
create policy "reward_redemptions: family select" on reward_redemptions for select
  using (family_id = private.current_family_id());
create policy "reward_redemptions: member request" on reward_redemptions for insert
  with check (family_id = private.current_family_id() and status = 'pendiente' and requested_by = auth.uid());
create policy "reward_redemptions: adult decide" on reward_redemptions for update
  using (family_id = private.current_family_id() and private.current_role_in_family() in ('admin', 'adult'))
  with check (family_id = private.current_family_id());

-- 4.4 — "Dar puntos" manualmente: ledger aparte (nunca una tercera forma de tocar un saldo que no exista
-- ya como fila propia — el saldo sigue siendo 100% derivado, nunca una columna mutable). Las
-- correcciones NUNCA editan ni borran un movimiento ya dado: una fila nueva con amount negativo
-- (reverses_grant_id apuntando a la original) deshace el error sin perder el rastro de que existió.
create table point_grants (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text null check (reason is null or char_length(reason) <= 300),
  granted_by uuid null references profiles(id) on delete set null,
  reverses_grant_id uuid null references point_grants(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_point_grants_member on point_grants(member_id);
create index idx_point_grants_family on point_grants(family_id);

alter table point_grants enable row level security;
create policy "point_grants: family select" on point_grants for select
  using (family_id = private.current_family_id());
create policy "point_grants: adult insert" on point_grants for insert
  with check (family_id = private.current_family_id() and private.current_role_in_family() in ('admin', 'adult') and granted_by = auth.uid());
-- Nunca se actualiza ni se borra un point_grant ya insertado (ver comentario de arriba) — sin políticas
-- de update/delete, RLS las deniega por defecto.

-- RPC — solicitar un canje con reserva atómica de puntos: el saldo disponible (ganado por tareas +
-- puntos dados a mano - lo ya gastado en canjes no rechazados) se comprueba y la fila se inserta en la
-- MISMA transacción, con un bloqueo por miembro (pg_advisory_xact_lock) para que dos solicitudes
-- simultáneas del mismo niño nunca puedan reservar más puntos de los que tiene de verdad.
create or replace function request_reward_redemption(p_reward_id uuid, p_member_id uuid)
returns reward_redemptions
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_reward rewards;
  v_balance integer;
  v_row reward_redemptions;
begin
  select * into v_reward from rewards where id = p_reward_id;
  if v_reward is null or v_reward.family_id <> private.current_family_id() then
    raise exception 'reward_not_found';
  end if;
  if not v_reward.active then
    raise exception 'reward_inactive';
  end if;
  if not exists (select 1 from family_members m where m.id = p_member_id and m.family_id = private.current_family_id()) then
    raise exception 'member_not_found';
  end if;

  -- Bloqueo por miembro: serializa cualquier solicitud concurrente de ESE miembro (nunca bloquea a otros).
  perform pg_advisory_xact_lock(hashtext(p_member_id::text));

  select coalesce((select sum(points_awarded) from calendar_event_completions where member_id = p_member_id), 0)
       + coalesce((select sum(amount) from point_grants where member_id = p_member_id), 0)
       - coalesce((select sum(points_spent) from reward_redemptions where member_id = p_member_id and status <> 'rechazada'), 0)
    into v_balance;

  if v_balance < v_reward.points_cost then
    raise exception 'not_enough_points';
  end if;

  insert into reward_redemptions (reward_id, member_id, family_id, points_spent, status, requested_by, reward_title, reward_emoji)
  values (p_reward_id, p_member_id, v_reward.family_id, v_reward.points_cost, 'pendiente', auth.uid(), v_reward.title, v_reward.emoji)
  returning * into v_row;

  return v_row;
end;
$function$;

revoke all on function request_reward_redemption(uuid, uuid) from public, anon;
grant execute on function request_reward_redemption(uuid, uuid) to authenticated;
