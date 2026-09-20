-- Base de la capa central de IA de PEPA (ver supabase/functions/_shared/ai).
--
-- Solo CONTADORES y ajustes: nunca se guarda ninguna frase, imagen ni
-- respuesta de la IA. Todas las tablas tienen RLS activado y NINGUNA
-- política, así que solo las lee/escribe el servidor (service_role) a
-- través de las funciones de abajo.

-- Ajustes globales: interruptor de apagado, proveedor y modelo. El modelo
-- es un ajuste, no un valor escrito en el código; hoy sigue siendo el
-- mismo que usaban las funciones antes de esta migración.
create table if not exists ai_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table ai_config enable row level security;

insert into ai_config (key, value) values
  ('enabled', 'true'::jsonb),
  ('provider', '"gemini"'::jsonb),
  ('model', '"gemini-flash-lite-latest"'::jsonb),
  ('purposes_disabled', '[]'::jsonb)
on conflict (key) do nothing;

-- Ajustes por familia. Sin fila = valores por defecto (IA activada, sin
-- tope diario), así que ninguna familia existente cambia de comportamiento.
create table if not exists ai_family_settings (
  family_id uuid primary key references families(id) on delete cascade,
  ai_enabled boolean not null default true,
  daily_call_cap integer check (daily_call_cap is null or daily_call_cap >= 0),
  updated_at timestamptz not null default now()
);
alter table ai_family_settings enable row level security;

-- Contadores por familia, día y propósito (Europe/Madrid).
create table if not exists ai_usage_daily (
  family_id uuid not null references families(id) on delete cascade,
  day date not null,
  purpose text not null,
  calls integer not null default 0,
  errors integer not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  primary key (family_id, day, purpose)
);
alter table ai_usage_daily enable row level security;

-- ¿Puede este usuario usar la IA ahora mismo? Solo cuentas adultas
-- (admin/adult) durante las pruebas. Devuelve {allowed, reason, ...}.
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

-- Suma una llamada (y, si el proveedor los da, los tokens) al contador.
create or replace function public.ai_record_usage(
  p_family uuid,
  p_purpose text,
  p_tokens_in integer,
  p_tokens_out integer,
  p_error boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into ai_usage_daily (family_id, day, purpose, calls, errors, tokens_in, tokens_out)
  values (
    p_family,
    (now() at time zone 'Europe/Madrid')::date,
    p_purpose,
    1,
    case when p_error then 1 else 0 end,
    greatest(coalesce(p_tokens_in, 0), 0),
    greatest(coalesce(p_tokens_out, 0), 0)
  )
  on conflict (family_id, day, purpose) do update set
    calls = ai_usage_daily.calls + 1,
    errors = ai_usage_daily.errors + excluded.errors,
    tokens_in = ai_usage_daily.tokens_in + excluded.tokens_in,
    tokens_out = ai_usage_daily.tokens_out + excluded.tokens_out;
$$;

revoke all on function public.ai_gate(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_gate(uuid, text) to service_role;
revoke all on function public.ai_record_usage(uuid, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.ai_record_usage(uuid, text, integer, integer, boolean) to service_role;
