-- FASE 7.1 (F7-001) — puerta de IA para automatizaciones SIN sesión de usuario (mercadona-ticket-webhook,
-- import-event-email-webhook): se autentican con el token secreto de la familia (families.amazon_webhook_token),
-- nunca con un JWT, así que ai_gate(p_user, ...) no les sirve (no hay profiles.id que mirar, y por tanto ningún
-- rol adulto/admin que comprobar — no aplica a una automatización, no a una persona).
--
-- Para no mantener DOS copias de las reglas de control (interruptor global, apagado por propósito, apagado por
-- familia, tope diario, proveedor/modelo), esa parte se extrae UNA sola vez a private.ai_gate_core(p_family,
-- p_purpose) — el mismo núcleo que antes vivía dentro de ai_gate. Ahora:
--   ai_gate(p_user, p_purpose)        = resuelve family_id/rol desde profiles, exige adulto/admin, y delega
--                                       el resto en private.ai_gate_core — comportamiento EXTERNO idéntico al
--                                       de antes de esta migración (mismo jsonb de vuelta para los mismos casos).
--   ai_gate_family(p_family, p_purpose) = valida que p_family no sea nulo y delega directo en
--                                       private.ai_gate_core — SIN comprobación de rol adulto, porque no hay
--                                       usuario que comprobar.
-- Solo control (interruptor/tope): ninguna de las tres funciones guarda ni recibe ninguna frase, imagen ni
-- respuesta — mismo principio que ai_record_usage (0137_ai_gateway_base.sql), que esta migración no toca.
create or replace function private.ai_gate_core(p_family uuid, p_purpose text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_enabled boolean;
  v_disabled jsonb;
  v_family_enabled boolean;
  v_cap integer;
  v_calls_today integer;
  v_provider text;
  v_model text;
begin
  if p_family is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_family');
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
    from ai_family_settings where family_id = p_family;
  if coalesce(v_family_enabled, true) = false then
    return jsonb_build_object('allowed', false, 'reason', 'family_disabled');
  end if;

  if v_cap is not null then
    select coalesce(sum(calls), 0) into v_calls_today
      from ai_usage_daily
      where family_id = p_family and day = (now() at time zone 'Europe/Madrid')::date;
    if v_calls_today >= v_cap then
      return jsonb_build_object('allowed', false, 'reason', 'daily_cap');
    end if;
  end if;

  select value #>> '{}' into v_provider from ai_config where key = 'provider';
  select value #>> '{}' into v_model from ai_config where key = 'model';

  return jsonb_build_object(
    'allowed', true,
    'family_id', p_family,
    'provider', coalesce(v_provider, 'gemini'),
    'model', coalesce(v_model, 'gemini-flash-lite-latest')
  );
end;
$$;

-- Reemplaza el cuerpo de ai_gate (misma firma, mismo comportamiento externo): ahora solo resuelve
-- family_id/rol y exige adulto/admin, delegando el resto en el núcleo compartido de arriba.
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
begin
  select family_id, role into v_family, v_role from profiles where id = p_user;
  if v_family is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_family');
  end if;
  if v_role not in ('admin', 'adult') then
    return jsonb_build_object('allowed', false, 'reason', 'not_adult_account');
  end if;

  return private.ai_gate_core(v_family, p_purpose);
end;
$$;

-- Igual que ai_gate, pero para una automatización ya autenticada por token de familia (nunca sustituye esa
-- autenticación: el llamador debe validar el token y resolver p_family ANTES de llamar a esto).
create or replace function public.ai_gate_family(p_family uuid, p_purpose text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return private.ai_gate_core(p_family, p_purpose);
end;
$$;

revoke all on function public.ai_gate_family(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_gate_family(uuid, text) to service_role;
