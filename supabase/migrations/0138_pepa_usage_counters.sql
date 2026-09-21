-- Contadores de uso de PEPA: cuántas respuestas resuelve el código (reglas) y cuántas necesitan IA,
-- por familia, día y función (por ejemplo 'finance.spent', 'finance.analyze').
--
-- Solo NÚMEROS: nunca se guarda ninguna frase, ninguna respuesta ni ningún dato de la conversación.
-- Los tokens de las llamadas a la IA ya se cuentan en ai_usage_daily (por propósito); esto añade lo
-- que faltaba para medir el porcentaje de preguntas resueltas SIN IA.
--
-- RLS activado y SIN políticas: no se lee ni se escribe directamente; solo a través de la función de
-- abajo (o con service_role para consultar las estadísticas).
create table if not exists pepa_usage_daily (
  family_id uuid not null references families(id) on delete cascade,
  day date not null,
  fn text not null,
  rules_answers integer not null default 0,
  ai_answers integer not null default 0,
  primary key (family_id, day, fn)
);
alter table pepa_usage_daily enable row level security;

-- Anota UNA respuesta de la persona autenticada (su familia se saca de su perfil, no de lo que envíe).
create or replace function public.pepa_record_answer(p_function text, p_used_ai boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid;
begin
  select family_id into v_family from profiles where id = auth.uid();
  if v_family is null then
    return;
  end if;
  if p_function is null or p_function !~ '^[a-z0-9_.]{1,60}$' then
    return;
  end if;

  insert into pepa_usage_daily (family_id, day, fn, rules_answers, ai_answers)
  values (
    v_family,
    (now() at time zone 'Europe/Madrid')::date,
    p_function,
    case when coalesce(p_used_ai, false) then 0 else 1 end,
    case when coalesce(p_used_ai, false) then 1 else 0 end
  )
  on conflict (family_id, day, fn) do update set
    rules_answers = pepa_usage_daily.rules_answers + excluded.rules_answers,
    ai_answers = pepa_usage_daily.ai_answers + excluded.ai_answers;
end;
$$;

revoke all on function public.pepa_record_answer(text, boolean) from public, anon;
grant execute on function public.pepa_record_answer(text, boolean) to authenticated;
