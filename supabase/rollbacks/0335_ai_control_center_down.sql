-- Deshacer 0335 (Centro de Control de IA). Devuelve la puerta de IA y los contadores a su forma anterior. Los datos del registro de llamadas se pierden (son solo estadísticas).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ai-detect') then
    perform cron.unschedule('ai-detect');
  end if;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime drop table public.ai_config;
  alter publication supabase_realtime drop table public.ai_alert;
exception when others then null;
end $$;
drop policy if exists ai_config_owner_read on public.ai_config;
drop policy if exists ai_alert_owner_read on public.ai_alert;
revoke select on public.ai_config from authenticated;

-- Puerta de IA sin límites.
create or replace function private.ai_gate_core(p_family uuid, p_purpose text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_enabled boolean; v_disabled jsonb; v_family_enabled boolean; v_cap integer; v_calls_today integer; v_provider text; v_model text;
begin
  if p_family is null then return jsonb_build_object('allowed', false, 'reason', 'no_family'); end if;
  select (value)::boolean into v_enabled from ai_config where key = 'enabled';
  if coalesce(v_enabled, true) = false then return jsonb_build_object('allowed', false, 'reason', 'ai_disabled'); end if;
  select value into v_disabled from ai_config where key = 'purposes_disabled';
  if v_disabled is not null and v_disabled ? p_purpose then return jsonb_build_object('allowed', false, 'reason', 'purpose_disabled'); end if;
  select ai_enabled, daily_call_cap into v_family_enabled, v_cap from ai_family_settings where family_id = p_family;
  if coalesce(v_family_enabled, true) = false then return jsonb_build_object('allowed', false, 'reason', 'family_disabled'); end if;
  if v_cap is not null then
    select coalesce(sum(calls), 0) into v_calls_today from ai_usage_daily where family_id = p_family and day = (now() at time zone 'Europe/Madrid')::date;
    if v_calls_today >= v_cap then return jsonb_build_object('allowed', false, 'reason', 'daily_cap'); end if;
  end if;
  select value #>> '{}' into v_provider from ai_config where key = 'provider';
  select value #>> '{}' into v_model from ai_config where key = 'model';
  return jsonb_build_object('allowed', true, 'family_id', p_family, 'provider', coalesce(v_provider, 'gemini'), 'model', coalesce(v_model, 'gemini-flash-lite-latest'));
end;
$$;
create or replace function public.ai_gate(p_user uuid, p_purpose text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_family uuid; v_role text;
begin
  select family_id, role into v_family, v_role from profiles where id = p_user;
  if v_family is null then return jsonb_build_object('allowed', false, 'reason', 'no_family'); end if;
  if v_role not in ('admin', 'adult') then return jsonb_build_object('allowed', false, 'reason', 'not_adult_account'); end if;
  return private.ai_gate_core(v_family, p_purpose);
end;
$$;
create or replace function public.ai_gate_family(p_family uuid, p_purpose text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin return private.ai_gate_core(p_family, p_purpose); end;
$$;
drop function if exists private.ai_gate_core(uuid, text, uuid);

create or replace function public.ai_record_usage(p_family uuid, p_purpose text, p_tokens_in integer, p_tokens_out integer, p_error boolean)
returns void language sql security definer set search_path = public as $$
  insert into ai_usage_daily (family_id, day, purpose, calls, errors, tokens_in, tokens_out)
  values (p_family, (now() at time zone 'Europe/Madrid')::date, p_purpose, 1, case when p_error then 1 else 0 end, greatest(coalesce(p_tokens_in, 0), 0), greatest(coalesce(p_tokens_out, 0), 0))
  on conflict (family_id, day, purpose) do update set calls = ai_usage_daily.calls + 1, errors = ai_usage_daily.errors + excluded.errors,
    tokens_in = ai_usage_daily.tokens_in + excluded.tokens_in, tokens_out = ai_usage_daily.tokens_out + excluded.tokens_out;
$$;

drop function if exists public.community_service_record_ai(text, boolean, text, text, uuid, uuid, uuid, text, text, bigint, bigint, bigint, integer, integer);
create or replace function public.community_service_record_ai(p_purpose text, p_error boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.community_ai_usage (day, purpose, calls, errors)
  values ((now() at time zone 'Europe/Madrid')::date, p_purpose, 1, case when p_error then 1 else 0 end)
  on conflict (day, purpose) do update set calls = public.community_ai_usage.calls + 1, errors = public.community_ai_usage.errors + case when p_error then 1 else 0 end
$$;

drop function if exists public.community_service_ai_allowed(text);
create or replace function public.community_service_ai_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.community_launched() and private.community_setting_int('ai_enabled', 0) = 1
     and (private.community_setting_int('ai_daily_cap', 300) = 0
          or coalesce((select sum(u.calls) from public.community_ai_usage u where u.day = (now() at time zone 'Europe/Madrid')::date), 0) < private.community_setting_int('ai_daily_cap', 300))
$$;
drop function if exists public.ai_record_call(uuid, uuid, uuid, uuid, text, text, text, text, text, bigint, bigint, bigint, text, integer, integer);

create or replace function public.community_service_editorial_begin_run(p_kind text, p_trigger text, p_week date, p_user uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_failed integer; v_last timestamptz;
begin
  if p_kind not in ('articles', 'poll', 'menu') or p_trigger not in ('schedule', 'manual') or p_week is null then raise exception 'BAD_KIND' using errcode = 'P0001'; end if;
  update public.community_editorial_runs set status = 'error', finished_at = now(), error = 'TIMEOUT: la ejecución no terminó.' where status = 'running' and started_at < now() - interval '20 minutes';
  if p_trigger = 'manual' then
    if exists (select 1 from public.community_editorial_runs r where r.kind = p_kind and r.status = 'running') then return null; end if;
    insert into public.community_editorial_runs (kind, trigger, week_start, requested_by) values (p_kind, 'manual', p_week, p_user) returning id into v_id;
    return v_id;
  end if;
  select count(*), max(coalesce(r.finished_at, r.started_at)) into v_failed, v_last from public.community_editorial_runs r where r.kind = p_kind and r.week_start = p_week and r.trigger = 'schedule' and r.status = 'error';
  if v_failed >= 3 or (v_last is not null and v_last > now() - interval '50 minutes') then return null; end if;
  begin
    insert into public.community_editorial_runs (kind, trigger, week_start, attempt) values (p_kind, 'schedule', p_week, v_failed + 1) returning id into v_id;
  exception when unique_violation then return null; end;
  return v_id;
end;
$$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'ai\_admin\_%'
  loop execute format('drop function %s', f); end loop;
end $$;

drop function if exists private.ai_detect();
drop function if exists private.ai_raise(text, text, text, jsonb);
drop function if exists private.ai_limits_block(uuid, uuid, text);
drop function if exists private.ai_limit_used(text, text, text, text);
drop function if exists private.ai_purpose_disabled(text);
drop function if exists private.ai_global_enabled();
drop function if exists private.ai_audit(text, text, jsonb, jsonb);
drop function if exists private.ai_cfg_text(text, text);
drop function if exists private.ai_bump_daily(uuid, text, bigint, bigint, boolean);
drop function if exists private.ai_log_insert(uuid, uuid, uuid, uuid, text, text, text, text, text, bigint, bigint, bigint, text, integer, integer);
drop function if exists private.ai_is_owner();
drop function if exists private.ai_require_owner();
drop table if exists public.ai_family_plan, public.ai_plan_quota, public.ai_plan, public.ai_alert, public.ai_admin_log, public.ai_limit_exception, public.ai_limit, public.ai_call_log, public.ai_price, public.ai_function;
delete from public.ai_config where key in ('alert_thresholds', 'plans_enforced');
