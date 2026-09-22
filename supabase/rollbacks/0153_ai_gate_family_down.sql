-- Rollback de 0153_ai_gate_family.sql: restaura ai_gate a su cuerpo original (con las comprobaciones inline,
-- sin delegar en private.ai_gate_core) y quita ai_gate_family y el núcleo compartido.
create or replace function public.ai_gate(p_user uuid, p_purpose text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_family uuid;
  v_role text;
  v_enabled boolean;
  v_disabled jsonb;
  v_family_enabled boolean;
  v_cap integer;
  v_calls_today integer;
  v_provider text;
  v_model text;
begin
  select family_id, role into v_family, v_role from profiles where id = p_user;
  if v_family is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_family');
  end if;
  if v_role not in ('admin', 'adult') then
    return jsonb_build_object('allowed', false, 'reason', 'not_adult_account');
  end if;

  select (value)::boolean into v_enabled from ai_config where key = 'enabled';
  if coalesce(v_enabled, true) = false then
    return jsonb_build_object('allowed', false, 'reason', 'ai_disabled');
  end if;

  select value into v_disabled from ai_config where key = 'purposes_disabled';
  if v_disabled is not null and v_disabled ? p_purpose then
    return jsonb_build_object('allowed', false, 'reason', 'purpose_disabled');
  end if;

  select ai_enabled, daily_call_cap into v_family_enabled, v_cap
    from ai_family_settings where family_id = v_family;
  if coalesce(v_family_enabled, true) = false then
    return jsonb_build_object('allowed', false, 'reason', 'family_disabled');
  end if;

  if v_cap is not null then
    select coalesce(sum(calls), 0) into v_calls_today
      from ai_usage_daily
      where family_id = v_family and day = (now() at time zone 'Europe/Madrid')::date;
    if v_calls_today >= v_cap then
      return jsonb_build_object('allowed', false, 'reason', 'daily_cap');
    end if;
  end if;

  select value #>> '{}' into v_provider from ai_config where key = 'provider';
  select value #>> '{}' into v_model from ai_config where key = 'model';

  return jsonb_build_object(
    'allowed', true,
    'family_id', v_family,
    'provider', coalesce(v_provider, 'gemini'),
    'model', coalesce(v_model, 'gemini-flash-lite-latest')
  );
end;
$$;

drop function if exists public.ai_gate_family(uuid, text);
drop function if exists private.ai_gate_core(uuid, text);
