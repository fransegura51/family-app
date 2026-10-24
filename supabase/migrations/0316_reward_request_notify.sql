-- Aviso a los adultos cuando alguien solicita una recompensa: hasta ahora la solicitud pendiente solo se veía abriendo Pequeños Grandes.
-- Al crearse un canje con estado 'pendiente' se avisa (historial de avisos + push) a las personas adultas y administradoras de esa familia, menos a quien lo ha pedido.
-- Una sola vez por solicitud (clave de deduplicación). Aditiva: una función y un disparador nuevos; no toca tablas, políticas ni datos.
-- Deshacer: supabase/rollbacks/0316_reward_request_notify_down.sql.
create or replace function private.notify_reward_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_name text;
  v_title text;
begin
  if new.status is distinct from 'pendiente' then
    return new;
  end if;
  begin
    select m.name into v_name from public.family_members m where m.id = new.member_id;
    v_title := trim(coalesce(new.reward_emoji || ' ', '') || coalesce(new.reward_title, 'una recompensa'));
    for r in
      select p.id from public.profiles p
      where p.family_id = new.family_id and p.role in ('admin', 'adult') and p.id is distinct from new.requested_by
    loop
      perform private.notify_user(r.id, 'personal', 'reward_request', 'Solicitud de recompensa', coalesce(v_name, 'Alguien') || ' pide: ' || v_title,
                                  '/puntos', null, 'reward-request:' || new.id::text, true, jsonb_build_object('version', 1, 'redemption_id', new.id));
    end loop;
  exception when others then
    raise warning 'notify_reward_request: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function private.notify_reward_request() from public, anon, authenticated;

drop trigger if exists trg_notify_reward_request on public.reward_redemptions;
create trigger trg_notify_reward_request
  after insert on public.reward_redemptions
  for each row execute function private.notify_reward_request();
