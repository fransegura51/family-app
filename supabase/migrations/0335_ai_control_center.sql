-- CENTRO DE CONTROL DE IA (0335) — control, medición, límites, alertas y proyección de TODA la IA de PEPA, sin duplicar lo que ya existe.
--
-- Qué ya existía y se REUTILIZA (no se sustituye):
--   · ai_config.enabled            → interruptor GLOBAL de la IA (lo leen ai_gate / ai_gate_family y la IA de Comunidad).
--   · ai_config.purposes_disabled  → funciones apagadas una a una (lo lee ai_gate_core). Apagar el global NO borra esta selección: al reactivarlo vuelve exactamente igual.
--   · ai_usage_daily / community_ai_usage → contadores diarios que alimentan los topes que ya existían (daily_call_cap por familia y ai_daily_cap de Comunidad). No se tocan.
--
-- Qué añade:
--   · ai_function  → registro central (nombre en español, módulo, quién la lanza, dependencias). La pantalla se pinta desde aquí: una función nueva aparece sola.
--   · ai_call_log  → UNA fila por llamada real al proveedor (solo números: tokens, coste estimado, duración, estado). Nunca frases, imágenes, respuestas ni datos bancarios.
--   · ai_price     → tarifas versionadas con fecha de vigencia; el coste se marca «estimado» o «confirmado» (jamás se presenta una estimación como exacta).
--   · ai_limit / ai_limit_exception → presupuestos y topes por global, módulo, función, familia o usuario. TODOS nacen en modo observación (no bloquean).
--   · ai_alert     → alertas de consumo anómalo, sin repetirse por la misma incidencia.
--   · ai_plan*     → estructura de planes (gratuito / de pago) PREPARADA y SIN efecto: ai_config.plans_enforced = false.
--   · ai_admin_log → quién cambió qué y cuándo.
--   · La IA de Comunidad pasa a respetar el interruptor global y el de cada función. Los artículos/encuestas/menús editoriales YA NO dependen de ai_enabled de Comunidad
--     (que gobierna las respuestas y resúmenes de la conversación): se controlan con su función en el Centro de Control y sus interruptores de programación.
-- Todo es aditivo: no cambia datos de familias, ni reglas de edad, ni permisos de privacidad. Deshacer: supabase/rollbacks/0335_ai_control_center_down.sql.

-- ---------------------------------------------------------------------------------------------
-- 0) Comprobación de administrador (la única puerta de las funciones ai_admin_*)
-- ---------------------------------------------------------------------------------------------
create or replace function private.ai_require_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid and p.is_app_owner) then
    raise exception 'NOT_ADMIN' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;
revoke execute on function private.ai_require_owner() from public, anon, authenticated;

create or replace function private.ai_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_app_owner)
$$;
revoke execute on function private.ai_is_owner() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 1) Registro central de funciones con IA
-- ---------------------------------------------------------------------------------------------
create table public.ai_function (
  purpose text primary key check (purpose ~ '^[a-z0-9_-]{2,60}$'),
  label text not null,
  module text not null check (module in ('compras_economia', 'comunidad', 'ayuda', 'cocina', 'mis_listas', 'eventos', 'otros')),
  description text not null,
  -- Quién la lanza por defecto: 'family' = una persona o la automatización de una familia; 'automatic' = PEPA por su cuenta (programa editorial, lotes); 'admin' = un administrador.
  origin text not null default 'family' check (origin in ('family', 'automatic', 'admin')),
  -- Dependencias que explica la pantalla: global | community_launched | community_ai_enabled.
  needs text[] not null default '{global}',
  sort integer not null default 100
);
alter table public.ai_function enable row level security;
revoke all on public.ai_function from anon, authenticated;

insert into public.ai_function (purpose, label, module, description, origin, needs, sort) values
  ('analyze-receipt-photo', 'Lectura inteligente de tickets', 'compras_economia', 'Lee la foto o el PDF de un ticket de compra y propone fecha, importe y productos.', 'family', '{global}', 10),
  ('mercadona-ticket-webhook', 'Tickets reenviados por correo', 'compras_economia', 'Lee los tickets que cada familia reenvía automáticamente por correo (si falla, el ticket se guarda sin leer).', 'family', '{global}', 20),
  ('analyze-package-photo', 'Lectura de envases por foto', 'compras_economia', 'Lee el formato y la marca de un envase fotografiado para comparar precios.', 'family', '{global}', 30),
  ('split-grocery-list', 'Reparto de la lista entre supermercados', 'compras_economia', 'Propone en qué supermercado comprar cada producto de la lista.', 'family', '{global}', 40),
  ('analyze-offer-budget-document', 'Lectura de presupuestos y ofertas', 'compras_economia', 'Lee un presupuesto u oferta en foto o PDF.', 'family', '{global}', 50),
  ('analyze-forecast-document', 'Lectura de documentos de pagos previstos', 'compras_economia', 'Lee recibos o facturas para proponer pagos previstos.', 'family', '{global}', 60),
  ('finance-intent', 'Órdenes de Economía por voz o texto', 'compras_economia', 'Entiende frases como «apunta 20 euros de gasolina».', 'family', '{global}', 70),
  ('finance-budget-intent', 'Órdenes de presupuestos por voz o texto', 'compras_economia', 'Entiende frases para crear o cambiar presupuestos.', 'family', '{global}', 80),
  ('finance-analysis', 'Análisis de gastos con IA', 'compras_economia', 'Redacta un análisis de los gastos de la familia.', 'family', '{global}', 90),
  ('summary', 'Resúmenes de conversaciones de Comunidad', 'comunidad', 'Resume los comentarios largos de una publicación.', 'family', '{global,community_launched,community_ai_enabled}', 10),
  ('pepa_answer', 'Respuestas automáticas de Pepa en Comunidad', 'comunidad', 'Pepa contesta una pregunta que lleva horas sin respuesta.', 'family', '{global,community_launched,community_ai_enabled}', 20),
  ('pepa_mention', 'Pepa responde cuando la mencionan', 'comunidad', 'Pepa contesta cuando alguien la menciona en un comentario.', 'family', '{global,community_launched,community_ai_enabled}', 30),
  ('proposals', 'Propuestas semanales de temas', 'comunidad', 'Propone temas de conversación cada semana (antiguo lote semanal).', 'automatic', '{global,community_launched,community_ai_enabled}', 40),
  ('editorial_article', 'Generación de artículos', 'comunidad', 'Redacta borradores de los artículos de la semana. Nunca publica: un administrador aprueba.', 'automatic', '{global,community_launched}', 50),
  ('editorial_poll', 'Generación de encuestas', 'comunidad', 'Redacta el borrador de la encuesta de la semana. Nunca publica.', 'automatic', '{global,community_launched}', 60),
  ('editorial_menu', 'Generación de menús', 'comunidad', 'Redacta el borrador del menú semanal. Nunca publica.', 'automatic', '{global,community_launched}', 70),
  ('editorial_revise', 'Rectificación de borradores con IA', 'comunidad', 'Propone una versión corregida de un borrador a petición de un administrador.', 'admin', '{global,community_launched}', 80),
  ('help-search', 'Ayuda inteligente', 'ayuda', 'Elige entre las fichas de Ayuda verificadas la que mejor responde a la pregunta.', 'family', '{global}', 10),
  ('pepa-intent', 'Hablar con Pepa (entender las órdenes)', 'ayuda', 'Interpreta lo que se le dice a Pepa por voz o texto.', 'family', '{global}', 20),
  ('recipe-generate', 'Recetas con IA', 'cocina', 'Escribe el borrador de una receta.', 'family', '{global}', 10),
  ('what-to-cook', '¿Qué cocino hoy?', 'cocina', 'Propone ideas de comida con lo que hay.', 'family', '{global}', 20),
  ('analyze-fridge-photo', 'Lectura de la foto de la nevera', 'cocina', 'Reconoce los alimentos de una foto de la nevera o la despensa.', 'family', '{global}', 30),
  ('analyze-list-document', 'Importar listas desde foto o PDF', 'mis_listas', 'Convierte una foto o PDF de una lista en elementos de la lista.', 'family', '{global}', 10),
  ('analyze-event-food-document', 'Lectura de menús y comidas de eventos', 'eventos', 'Lee un documento con la comida de un evento.', 'family', '{global}', 10),
  ('import-event-email-webhook', 'Eventos desde correos reenviados', 'eventos', 'Crea un evento a partir de un correo reenviado por la familia.', 'family', '{global}', 20),
  ('analyze-document-expiry', 'Lectura de caducidades de documentos', 'otros', 'Detecta la fecha de caducidad de un documento escaneado.', 'family', '{global}', 10),
  ('analyze-provider-contact-document', 'Lectura de datos de contactos y proveedores', 'otros', 'Lee los datos de contacto de una tarjeta o documento.', 'family', '{global}', 20)
on conflict (purpose) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 2) Tarifas versionadas
-- ---------------------------------------------------------------------------------------------
create table public.ai_price (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  -- Cada modalidad puede facturarse distinto (texto, imagen, audio, vídeo). Si no hay tarifa de la modalidad, se usa la de texto.
  modality text not null default 'text' check (modality in ('text', 'image', 'audio', 'video')),
  input_per_mtok numeric(12, 6) not null check (input_per_mtok >= 0),
  output_per_mtok numeric(12, 6) not null check (output_per_mtok >= 0),
  currency text not null default 'USD',
  valid_from date not null,
  valid_to date,
  -- 'confirmed' = contrastada con la factura del proveedor; 'estimated' = tarifa pública sin contrastar.
  kind text not null default 'estimated' check (kind in ('confirmed', 'estimated')),
  source text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index idx_ai_price_lookup on public.ai_price (provider, model, modality, valid_from desc);
alter table public.ai_price enable row level security;
revoke all on public.ai_price from anon, authenticated;

-- Tarifa de pago pública de la familia Flash-Lite de Gemini. El modelo configurado es un alias («-latest») y PEPA usa hoy el plan gratuito: la factura real puede ser 0 € y la
-- cifra es una ESTIMACIÓN a tarifa de pago. Se contrasta con la factura de Google y se corrige desde el Centro de Control de IA (nueva fila con su fecha de vigencia).
insert into public.ai_price (provider, model, modality, input_per_mtok, output_per_mtok, currency, valid_from, kind, source)
values ('gemini', 'gemini-flash-lite-latest', 'text', 0.10, 0.40, 'USD', date '2025-07-01', 'estimated',
        'Tarifa pública de pago de Gemini Flash-Lite (estimada para el alias «-latest»; el plan gratuito puede no facturarla). Pendiente de contrastar con la factura de Google.');

-- ---------------------------------------------------------------------------------------------
-- 3) Registro de llamadas (solo números)
-- ---------------------------------------------------------------------------------------------
create table public.ai_call_log (
  -- Identificador de la llamada: si el servidor reintenta el anotado con el mismo id, no se cuenta dos veces.
  id uuid primary key default gen_random_uuid(),
  -- Operación lógica (p. ej. una ejecución editorial) a la que pertenecen varias llamadas; permite agruparlas.
  run_id uuid,
  created_at timestamptz not null default now(),
  family_id uuid references public.families(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  origin text not null default 'family' check (origin in ('family', 'automatic', 'admin')),
  purpose text not null,
  module text not null,
  provider text not null,
  model text not null,
  modality text not null default 'text' check (modality in ('text', 'image', 'audio', 'video', 'mixed')),
  tokens_in bigint not null default 0 check (tokens_in >= 0),
  tokens_out bigint not null default 0 check (tokens_out >= 0),
  -- Tokens facturables adicionales (p. ej. de razonamiento), si el proveedor los informa.
  tokens_extra bigint not null default 0 check (tokens_extra >= 0),
  cost numeric(14, 8),
  cost_kind text not null default 'none' check (cost_kind in ('confirmed', 'estimated', 'none')),
  currency text not null default 'USD',
  status text not null check (status in ('ok', 'failed', 'cancelled', 'retried')),
  retries integer not null default 0 check (retries >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0)
);
create index idx_ai_call_log_time on public.ai_call_log (created_at desc);
create index idx_ai_call_log_family on public.ai_call_log (family_id, created_at desc);
create index idx_ai_call_log_purpose on public.ai_call_log (purpose, created_at desc);
create index idx_ai_call_log_user on public.ai_call_log (user_id, created_at desc) where user_id is not null;
alter table public.ai_call_log enable row level security;
revoke all on public.ai_call_log from anon, authenticated;

-- Inserta una llamada con su coste estimado. Devuelve false si ya estaba anotada (mismo id). NUNCA guarda texto, imágenes ni respuestas.
create or replace function private.ai_log_insert(
  p_id uuid, p_run uuid, p_family uuid, p_user uuid, p_origin text, p_purpose text, p_provider text, p_model text, p_modality text,
  p_in bigint, p_out bigint, p_extra bigint, p_status text, p_retries integer, p_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module text;
  v_origin text;
  v_price public.ai_price%rowtype;
  v_cost numeric;
  v_kind text := 'none';
  v_status text;
  v_modality text := case when p_modality in ('text', 'image', 'audio', 'video', 'mixed') then p_modality else 'text' end;
  v_n integer;
begin
  select f.module, f.origin into v_module, v_origin from public.ai_function f where f.purpose = p_purpose;
  v_status := case when p_status in ('ok', 'failed', 'cancelled', 'retried') then p_status else 'ok' end;
  if v_status = 'ok' and coalesce(p_retries, 0) > 0 then
    v_status := 'retried';
  end if;
  if coalesce(p_in, 0) + coalesce(p_out, 0) + coalesce(p_extra, 0) > 0 then
    select * into v_price from public.ai_price pr
    where pr.provider = p_provider and pr.model = p_model and pr.modality in (case when v_modality = 'mixed' then 'image' else v_modality end, 'text')
      and pr.valid_from <= current_date and (pr.valid_to is null or pr.valid_to >= current_date)
    order by (pr.modality <> 'text') desc, pr.valid_from desc
    limit 1;
    if found then
      v_cost := (greatest(coalesce(p_in, 0), 0) * v_price.input_per_mtok + greatest(coalesce(p_out, 0) + coalesce(p_extra, 0), 0) * v_price.output_per_mtok) / 1000000.0;
      v_kind := v_price.kind;
    end if;
  end if;
  insert into public.ai_call_log (id, run_id, family_id, user_id, origin, purpose, module, provider, model, modality, tokens_in, tokens_out, tokens_extra, cost, cost_kind, status, retries, duration_ms)
  values (
    coalesce(p_id, gen_random_uuid()), p_run, p_family, p_user,
    case when p_origin in ('family', 'automatic', 'admin') then p_origin else coalesce(v_origin, 'family') end,
    p_purpose, coalesce(v_module, 'otros'), coalesce(nullif(p_provider, ''), 'gemini'), coalesce(nullif(p_model, ''), 'desconocido'), v_modality,
    greatest(coalesce(p_in, 0), 0), greatest(coalesce(p_out, 0), 0), greatest(coalesce(p_extra, 0), 0), v_cost, v_kind, v_status, greatest(coalesce(p_retries, 0), 0), p_ms
  )
  on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke execute on function private.ai_log_insert(uuid, uuid, uuid, uuid, text, text, text, text, text, bigint, bigint, bigint, text, integer, integer) from public, anon, authenticated;

-- Contador diario por familia (el que ya alimentaba daily_call_cap).
create or replace function private.ai_bump_daily(p_family uuid, p_purpose text, p_in bigint, p_out bigint, p_error boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_usage_daily (family_id, day, purpose, calls, errors, tokens_in, tokens_out)
  values (p_family, (now() at time zone 'Europe/Madrid')::date, p_purpose, 1, case when p_error then 1 else 0 end, greatest(coalesce(p_in, 0), 0), greatest(coalesce(p_out, 0), 0))
  on conflict (family_id, day, purpose) do update set
    calls = public.ai_usage_daily.calls + 1,
    errors = public.ai_usage_daily.errors + excluded.errors,
    tokens_in = public.ai_usage_daily.tokens_in + excluded.tokens_in,
    tokens_out = public.ai_usage_daily.tokens_out + excluded.tokens_out
$$;
revoke execute on function private.ai_bump_daily(uuid, text, bigint, bigint, boolean) from public, anon, authenticated;

create or replace function private.ai_cfg_text(p_key text, p_default text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.value #>> '{}' from public.ai_config c where c.key = p_key), p_default)
$$;
revoke execute on function private.ai_cfg_text(text, text) from public, anon, authenticated;

-- Misma firma de siempre (las funciones ya desplegadas la siguen llamando): además de sumar al contador, anota la llamada en el registro. Si el registro fallase, la función
-- que llama NO se rompe (el control nunca estropea lo que ya funcionaba).
create or replace function public.ai_record_usage(p_family uuid, p_purpose text, p_tokens_in integer, p_tokens_out integer, p_error boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ai_bump_daily(p_family, p_purpose, p_tokens_in, p_tokens_out, p_error);
  begin
    perform private.ai_log_insert(null, null, p_family, null, null, p_purpose, private.ai_cfg_text('provider', 'gemini'), private.ai_cfg_text('model', 'gemini-flash-lite-latest'), 'text',
                                  p_tokens_in, p_tokens_out, 0, case when p_error then 'failed' else 'ok' end, 0, null);
  exception when others then
    raise warning 'ai_record_usage: no se pudo anotar la llamada (%)', sqlerrm;
  end;
end;
$$;

-- Versión completa (la usa el código nuevo): id de llamada (idempotente), operación, usuario, origen, modalidad, tokens adicionales, reintentos y duración.
create or replace function public.ai_record_call(
  p_call_id uuid, p_run_id uuid, p_family uuid, p_user uuid, p_origin text, p_purpose text, p_provider text, p_model text, p_modality text,
  p_tokens_in bigint, p_tokens_out bigint, p_tokens_extra bigint, p_status text, p_retries integer, p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean := true;
begin
  begin
    v_new := private.ai_log_insert(p_call_id, p_run_id, p_family, p_user, p_origin, p_purpose, p_provider, p_model, p_modality, p_tokens_in, p_tokens_out, p_tokens_extra, p_status, p_retries, p_duration_ms);
  exception when others then
    raise warning 'ai_record_call: no se pudo anotar la llamada (%)', sqlerrm;
  end;
  -- Un reintento del anotado con el mismo id no vuelve a sumar al contador diario.
  if v_new and p_family is not null then
    perform private.ai_bump_daily(p_family, p_purpose, p_tokens_in, p_tokens_out, p_status = 'failed');
  end if;
end;
$$;
revoke all on function public.ai_record_call(uuid, uuid, uuid, uuid, text, text, text, text, text, bigint, bigint, bigint, text, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_record_call(uuid, uuid, uuid, uuid, text, text, text, text, text, bigint, bigint, bigint, text, integer, integer) to service_role;
revoke all on function public.ai_record_usage(uuid, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.ai_record_usage(uuid, text, integer, integer, boolean) to service_role;

-- IA de Comunidad: el contador propio (community_ai_usage, que alimenta ai_daily_cap) se conserva y además se anota la llamada. UNA sola función: la llamada de siempre
-- (purpose, error) sigue valiendo y los parámetros nuevos son opcionales. Un reintento con el mismo p_call_id no vuelve a contar.
drop function if exists public.community_service_record_ai(text, boolean);
create or replace function public.community_service_record_ai(
  p_purpose text, p_error boolean default false, p_provider text default null, p_model text default null, p_call_id uuid default null, p_run_id uuid default null,
  p_user uuid default null, p_origin text default null, p_modality text default null, p_tokens_in bigint default 0, p_tokens_out bigint default 0, p_tokens_extra bigint default 0,
  p_retries integer default 0, p_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean := true;
begin
  begin
    v_new := private.ai_log_insert(p_call_id, p_run_id, null, p_user, p_origin, p_purpose, coalesce(p_provider, private.ai_cfg_text('provider', 'gemini')),
                                   coalesce(p_model, private.ai_cfg_text('model', 'gemini-flash-lite-latest')), p_modality, p_tokens_in, p_tokens_out, p_tokens_extra,
                                   case when p_error then 'failed' else 'ok' end, p_retries, p_duration_ms);
  exception when others then
    raise warning 'community_service_record_ai: no se pudo anotar la llamada (%)', sqlerrm;
  end;
  if v_new then
    insert into public.community_ai_usage (day, purpose, calls, errors)
    values ((now() at time zone 'Europe/Madrid')::date, p_purpose, 1, case when p_error then 1 else 0 end)
    on conflict (day, purpose) do update set calls = public.community_ai_usage.calls + 1, errors = public.community_ai_usage.errors + case when p_error then 1 else 0 end;
  end if;
end;
$$;
revoke all on function public.community_service_record_ai(text, boolean, text, text, uuid, uuid, uuid, text, text, bigint, bigint, bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.community_service_record_ai(text, boolean, text, text, uuid, uuid, uuid, text, text, bigint, bigint, bigint, integer, integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 4) Límites y excepciones (TODOS nacen en observación)
-- ---------------------------------------------------------------------------------------------
create table public.ai_limit (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'module', 'function', 'family', 'user')),
  -- global: '' · module: id del módulo · function: purpose · family/user: uuid.
  scope_key text not null default '',
  period text not null check (period in ('day', 'month')),
  metric text not null check (metric in ('cost', 'calls')),
  max_value numeric(14, 4) not null check (max_value > 0),
  warn_pct integer not null default 80 check (warn_pct between 1 and 100),
  -- observe = solo registra · warn = avisa al llegar al umbral · block = impide NUEVAS operaciones al alcanzarlo.
  mode text not null default 'observe' check (mode in ('observe', 'warn', 'block')),
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (scope, scope_key, period, metric)
);
alter table public.ai_limit enable row level security;
revoke all on public.ai_limit from anon, authenticated;

-- Excepción: la familia queda fuera de los límites globales, de módulo y de función (no de los suyos propios ni de las reglas de edad o seguridad, que no se evalúan aquí).
create table public.ai_limit_exception (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  purpose text references public.ai_function(purpose) on delete cascade,
  until date,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid
);
create unique index uq_ai_limit_exception on public.ai_limit_exception (family_id, coalesce(purpose, ''));
alter table public.ai_limit_exception enable row level security;
revoke all on public.ai_limit_exception from anon, authenticated;

create table public.ai_admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id uuid,
  action text not null,
  subject text,
  before jsonb,
  after jsonb
);
create index idx_ai_admin_log_at on public.ai_admin_log (at desc);
alter table public.ai_admin_log enable row level security;
revoke all on public.ai_admin_log from anon, authenticated;

create or replace function private.ai_audit(p_action text, p_subject text, p_before jsonb, p_after jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_admin_log (admin_id, action, subject, before, after) values ((select auth.uid()), p_action, p_subject, p_before, p_after)
$$;
revoke execute on function private.ai_audit(text, text, jsonb, jsonb) from public, anon, authenticated;

-- Uso acumulado en el periodo de un límite (día o mes naturales de Madrid). Coste = suma de las llamadas con coste calculable.
create or replace function private.ai_limit_used(p_scope text, p_key text, p_period text, p_metric text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case p_metric when 'cost' then coalesce(sum(c.cost), 0) else count(*)::numeric end
  from public.ai_call_log c
  where c.status <> 'cancelled'
    and c.created_at >= (date_trunc(case p_period when 'month' then 'month' else 'day' end, now() at time zone 'Europe/Madrid')) at time zone 'Europe/Madrid'
    and (p_scope = 'global'
         or (p_scope = 'module' and c.module = p_key)
         or (p_scope = 'function' and c.purpose = p_key)
         or (p_scope = 'family' and c.family_id::text = p_key)
         or (p_scope = 'user' and c.user_id::text = p_key))
$$;
revoke execute on function private.ai_limit_used(text, text, text, text) from public, anon, authenticated;

create or replace function private.ai_global_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (c.value)::boolean from public.ai_config c where c.key = 'enabled'), true)
$$;
revoke execute on function private.ai_global_enabled() from public, anon, authenticated;

create or replace function private.ai_purpose_disabled(p_purpose text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.value ? p_purpose from public.ai_config c where c.key = 'purposes_disabled'), false)
$$;
revoke execute on function private.ai_purpose_disabled(text) from public, anon, authenticated;

-- ¿Algún límite en modo BLOQUEO está alcanzado? Devuelve 'budget_limit' o null. Con todos en observación (estado inicial) siempre devuelve null. Si la comprobación fallase, NO bloquea.
create or replace function private.ai_limits_block(p_family uuid, p_user uuid, p_purpose text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.ai_limit%rowtype;
  v_module text;
  v_exempt boolean := false;
begin
  select f.module into v_module from public.ai_function f where f.purpose = p_purpose;
  v_module := coalesce(v_module, 'otros');
  if p_family is not null then
    select exists (
      select 1 from public.ai_limit_exception e
      where e.family_id = p_family and (e.purpose is null or e.purpose = p_purpose) and (e.until is null or e.until >= (now() at time zone 'Europe/Madrid')::date)
    ) into v_exempt;
  end if;
  for l in
    select * from public.ai_limit x
    where x.mode = 'block'
      and (x.scope = 'global'
           or (x.scope = 'module' and x.scope_key = v_module)
           or (x.scope = 'function' and x.scope_key = p_purpose)
           or (x.scope = 'family' and p_family is not null and x.scope_key = p_family::text)
           or (x.scope = 'user' and p_user is not null and x.scope_key = p_user::text))
  loop
    if v_exempt and l.scope in ('global', 'module', 'function') then
      continue;
    end if;
    if private.ai_limit_used(l.scope, l.scope_key, l.period, l.metric) >= l.max_value then
      return 'budget_limit';
    end if;
  end loop;
  return null;
exception when others then
  return null;
end;
$$;
revoke execute on function private.ai_limits_block(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5) Puerta de la IA con los límites (mismo resultado de siempre cuando no hay ninguno en bloqueo)
-- ---------------------------------------------------------------------------------------------
create or replace function private.ai_gate_core(p_family uuid, p_purpose text, p_user uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_disabled jsonb;
  v_family_enabled boolean;
  v_cap integer;
  v_calls_today integer;
  v_provider text;
  v_model text;
  v_block text;
begin
  if p_family is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_family');
  end if;

  select (value)::boolean into v_enabled from public.ai_config where key = 'enabled';
  if coalesce(v_enabled, true) = false then
    return jsonb_build_object('allowed', false, 'reason', 'ai_disabled');
  end if;

  select value into v_disabled from public.ai_config where key = 'purposes_disabled';
  if v_disabled is not null and v_disabled ? p_purpose then
    return jsonb_build_object('allowed', false, 'reason', 'purpose_disabled');
  end if;

  select ai_enabled, daily_call_cap into v_family_enabled, v_cap
    from public.ai_family_settings where family_id = p_family;
  if coalesce(v_family_enabled, true) = false then
    return jsonb_build_object('allowed', false, 'reason', 'family_disabled');
  end if;

  if v_cap is not null then
    select coalesce(sum(calls), 0) into v_calls_today
      from public.ai_usage_daily
      where family_id = p_family and day = (now() at time zone 'Europe/Madrid')::date;
    if v_calls_today >= v_cap then
      return jsonb_build_object('allowed', false, 'reason', 'daily_cap');
    end if;
  end if;

  v_block := private.ai_limits_block(p_family, p_user, p_purpose);
  if v_block is not null then
    return jsonb_build_object('allowed', false, 'reason', v_block);
  end if;

  select value #>> '{}' into v_provider from public.ai_config where key = 'provider';
  select value #>> '{}' into v_model from public.ai_config where key = 'model';

  return jsonb_build_object(
    'allowed', true,
    'family_id', p_family,
    'provider', coalesce(v_provider, 'gemini'),
    'model', coalesce(v_model, 'gemini-flash-lite-latest')
  );
end;
$$;
revoke execute on function private.ai_gate_core(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.ai_gate(p_user uuid, p_purpose text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_role text;
begin
  select family_id, role into v_family, v_role from public.profiles where id = p_user;
  if v_family is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_family');
  end if;
  if v_role not in ('admin', 'adult') then
    return jsonb_build_object('allowed', false, 'reason', 'not_adult_account');
  end if;
  return private.ai_gate_core(v_family, p_purpose, p_user);
end;
$$;

create or replace function public.ai_gate_family(p_family uuid, p_purpose text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return private.ai_gate_core(p_family, p_purpose, null);
end;
$$;

revoke all on function public.ai_gate(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_gate(uuid, text) to service_role;
revoke all on function public.ai_gate_family(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_gate_family(uuid, text) to service_role;
drop function if exists private.ai_gate_core(uuid, text);

-- IA de Comunidad: UNA función. Sin p_purpose conserva la regla de siempre y respeta además el interruptor global; con p_purpose respeta también el interruptor de esa función, los
-- límites en bloqueo y deja de exigir ai_enabled a los artículos, encuestas y menús editoriales (ese ajuste gobierna la conversación, no el programa editorial).
drop function if exists public.community_service_ai_allowed();
create or replace function public.community_service_ai_allowed(p_purpose text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.ai_global_enabled()
     and (p_purpose is null or not private.ai_purpose_disabled(p_purpose))
     and private.community_launched()
     and (private.community_setting_int('ai_enabled', 0) = 1 or coalesce(left(p_purpose, 10) = 'editorial_', false))
     and (private.community_setting_int('ai_daily_cap', 300) = 0
          or coalesce((select sum(u.calls) from public.community_ai_usage u where u.day = (now() at time zone 'Europe/Madrid')::date), 0) < private.community_setting_int('ai_daily_cap', 300))
     and (p_purpose is null or private.ai_limits_block(null, null, p_purpose) is null)
$$;
revoke all on function public.community_service_ai_allowed(text) from public, anon, authenticated;
grant execute on function public.community_service_ai_allowed(text) to service_role;

-- Procesos programados: una ejecución editorial PROGRAMADA no se abre (ni gasta un intento) si la IA global o la función están apagadas. (Una manual sí se abre y queda «omitida».)
create or replace function public.community_service_editorial_begin_run(p_kind text, p_trigger text, p_week date, p_user uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_failed integer;
  v_last timestamptz;
begin
  if p_kind not in ('articles', 'poll', 'menu') or p_trigger not in ('schedule', 'manual') or p_week is null then
    raise exception 'BAD_KIND' using errcode = 'P0001';
  end if;
  update public.community_editorial_runs set status = 'error', finished_at = now(), error = 'TIMEOUT: la ejecución no terminó.'
  where status = 'running' and started_at < now() - interval '20 minutes';
  if p_trigger = 'manual' then
    if exists (select 1 from public.community_editorial_runs r where r.kind = p_kind and r.status = 'running') then
      return null;
    end if;
    insert into public.community_editorial_runs (kind, trigger, week_start, requested_by) values (p_kind, 'manual', p_week, p_user) returning id into v_id;
    return v_id;
  end if;
  if not private.ai_global_enabled()
     or private.ai_purpose_disabled(case p_kind when 'articles' then 'editorial_article' when 'poll' then 'editorial_poll' else 'editorial_menu' end) then
    return null;
  end if;
  select count(*), max(coalesce(r.finished_at, r.started_at)) into v_failed, v_last
  from public.community_editorial_runs r where r.kind = p_kind and r.week_start = p_week and r.trigger = 'schedule' and r.status = 'error';
  if v_failed >= 3 or (v_last is not null and v_last > now() - interval '50 minutes') then
    return null;
  end if;
  begin
    insert into public.community_editorial_runs (kind, trigger, week_start, attempt) values (p_kind, 'schedule', p_week, v_failed + 1) returning id into v_id;
  exception when unique_violation then
    return null;
  end;
  return v_id;
end;
$$;
revoke all on function public.community_service_editorial_begin_run(text, text, date, uuid) from public, anon, authenticated;
grant execute on function public.community_service_editorial_begin_run(text, text, date, uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 6) Alertas
-- ---------------------------------------------------------------------------------------------
create table public.ai_alert (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  subject text not null default '',
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  -- Solo números y códigos: nunca contenido de las familias.
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  occurrences integer not null default 1,
  reviewed_by uuid,
  reviewed_at timestamptz
);
create index idx_ai_alert_status on public.ai_alert (status, last_seen desc);
create index idx_ai_alert_subject on public.ai_alert (kind, subject, last_seen desc);
alter table public.ai_alert enable row level security;
revoke all on public.ai_alert from anon, authenticated;

-- Una misma incidencia no genera avisos repetidos: mientras siga abierta, o durante 24 horas después de revisarla o descartarla, solo se actualiza.
create or replace function private.ai_raise(p_kind text, p_subject text, p_severity text, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_seen timestamptz;
begin
  select a.id, a.status, a.last_seen into v_id, v_status, v_seen from public.ai_alert a where a.kind = p_kind and a.subject = p_subject order by a.last_seen desc limit 1;
  if v_id is not null and (v_status = 'open' or v_seen > now() - interval '24 hours') then
    update public.ai_alert set last_seen = now(), occurrences = occurrences + 1, details = p_details, severity = p_severity where id = v_id;
  else
    insert into public.ai_alert (kind, subject, severity, details) values (p_kind, p_subject, p_severity, p_details);
  end if;
end;
$$;
revoke execute on function private.ai_raise(text, text, text, jsonb) from public, anon, authenticated;

insert into public.ai_config (key, value) values
  ('alert_thresholds', jsonb_build_object(
    'cost_spike_factor', 3, 'cost_min_usd', 0.5,
    'calls_spike_factor', 4, 'calls_min', 30,
    'family_share_pct', 60, 'family_min_calls', 30,
    'function_growth_factor', 3, 'function_min_calls', 30,
    'retry_ratio_pct', 30, 'retry_min_calls', 10,
    'loop_calls_10min', 20,
    'provider_errors_1h', 5)),
  ('plans_enforced', 'false'::jsonb)
on conflict (key) do nothing;

-- Estado inicial SIN activar nada: hasta hoy la generación editorial exigía «Inteligencia artificial de Comunidad» (ai_enabled). Si ese ajuste está apagado, sus cuatro funciones nacen
-- APAGADAS en el Centro de Control (el comportamiento no cambia); un administrador las enciende a conciencia. Si ya estaba encendido, no se toca nada.
insert into public.ai_config (key, value, updated_at)
select 'purposes_disabled',
       (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
          from jsonb_array_elements_text(coalesce((select c.value from public.ai_config c where c.key = 'purposes_disabled'), '[]'::jsonb) || '["editorial_article","editorial_poll","editorial_menu","editorial_revise"]'::jsonb) x),
       now()
where private.community_setting_int('ai_enabled', 0) <> 1
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function private.ai_detect()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t jsonb := coalesce((select c.value from public.ai_config c where c.key = 'alert_thresholds'), '{}'::jsonb);
  r record;
  v_n numeric;
  v_prev numeric;
  v_total numeric;
  v_raised integer := 0;
  g numeric;
  m numeric;
begin
  -- Conservación del registro: 18 meses.
  delete from public.ai_call_log where created_at < now() - interval '18 months';

  -- 1) Coste de las últimas 24 h frente a la media diaria de los 7 días anteriores.
  select coalesce(sum(cost) filter (where created_at >= now() - interval '24 hours'), 0),
         coalesce(sum(cost) filter (where created_at < now() - interval '24 hours'), 0) / 7.0
    into v_n, v_prev
    from public.ai_call_log where created_at >= now() - interval '8 days' and status <> 'cancelled';
  g := coalesce((t ->> 'cost_spike_factor')::numeric, 3);
  m := coalesce((t ->> 'cost_min_usd')::numeric, 0.5);
  if v_n >= m and v_n > g * v_prev then
    perform private.ai_raise('cost_spike', '', 'warning', jsonb_build_object('cost_24h', round(v_n, 4), 'daily_avg_prev7', round(v_prev, 4), 'factor', g));
    v_raised := v_raised + 1;
  end if;

  -- 2) Llamadas de la última hora frente a la media horaria de las 24 h anteriores.
  select count(*) filter (where created_at >= now() - interval '1 hour'),
         count(*) filter (where created_at < now() - interval '1 hour') / 24.0
    into v_n, v_prev
    from public.ai_call_log where created_at >= now() - interval '25 hours' and status <> 'cancelled';
  g := coalesce((t ->> 'calls_spike_factor')::numeric, 4);
  m := coalesce((t ->> 'calls_min')::numeric, 30);
  if v_n >= m and v_n > g * greatest(v_prev, 1) then
    perform private.ai_raise('calls_spike', '', 'warning', jsonb_build_object('calls_1h', v_n, 'hourly_avg_prev24h', round(v_prev, 2), 'factor', g));
    v_raised := v_raised + 1;
  end if;

  -- 3) Una familia concentra una parte excepcional de las llamadas de las últimas 24 h.
  select count(*) into v_total from public.ai_call_log where created_at >= now() - interval '24 hours' and family_id is not null and status <> 'cancelled';
  if v_total > 0 then
    for r in
      select family_id, count(*) as n from public.ai_call_log
      where created_at >= now() - interval '24 hours' and family_id is not null and status <> 'cancelled'
      group by family_id
      having count(*) >= coalesce((t ->> 'family_min_calls')::numeric, 30)
         and count(*) * 100.0 / v_total >= coalesce((t ->> 'family_share_pct')::numeric, 60)
         and (select count(distinct x.family_id) from public.ai_call_log x where x.created_at >= now() - interval '24 hours' and x.family_id is not null) >= 2
    loop
      perform private.ai_raise('family_outlier', r.family_id::text, 'warning', jsonb_build_object('calls_24h', r.n, 'share_pct', round(r.n * 100.0 / v_total, 1)));
      v_raised := v_raised + 1;
    end loop;
  end if;

  -- 4) Una función crece de golpe respecto a su media diaria de los 7 días anteriores.
  g := coalesce((t ->> 'function_growth_factor')::numeric, 3);
  for r in
    select purpose,
           count(*) filter (where created_at >= now() - interval '24 hours') as n,
           count(*) filter (where created_at < now() - interval '24 hours') / 7.0 as prev
    from public.ai_call_log where created_at >= now() - interval '8 days' and status <> 'cancelled'
    group by purpose
  loop
    if r.n >= coalesce((t ->> 'function_min_calls')::numeric, 30) and r.n > g * greatest(r.prev, 1) then
      perform private.ai_raise('function_growth', r.purpose, 'warning', jsonb_build_object('calls_24h', r.n, 'daily_avg_prev7', round(r.prev, 2), 'factor', g));
      v_raised := v_raised + 1;
    end if;
  end loop;

  -- 5) Demasiados reintentos en una función.
  for r in
    select purpose, count(*) as n, count(*) filter (where retries > 0) as rt from public.ai_call_log
    where created_at >= now() - interval '24 hours' and status <> 'cancelled' group by purpose
  loop
    if r.n >= coalesce((t ->> 'retry_min_calls')::numeric, 10) and r.rt * 100.0 / r.n >= coalesce((t ->> 'retry_ratio_pct')::numeric, 30) then
      perform private.ai_raise('excessive_retries', r.purpose, 'warning', jsonb_build_object('calls_24h', r.n, 'with_retries', r.rt, 'ratio_pct', round(r.rt * 100.0 / r.n, 1)));
      v_raised := v_raised + 1;
    end if;
  end loop;

  -- 6) Posible bucle: muchas llamadas de la misma función y familia en 10 minutos.
  for r in
    select purpose, family_id, count(*) as n from public.ai_call_log
    where created_at >= now() - interval '10 minutes' and status <> 'cancelled' group by purpose, family_id
    having count(*) >= coalesce((t ->> 'loop_calls_10min')::numeric, 20)
  loop
    perform private.ai_raise('possible_loop', r.purpose || '|' || coalesce(r.family_id::text, 'comunidad'), 'critical', jsonb_build_object('calls_10min', r.n));
    v_raised := v_raised + 1;
  end loop;

  -- 7) Errores repetidos de un proveedor en la última hora.
  for r in
    select provider, count(*) as n from public.ai_call_log
    where created_at >= now() - interval '1 hour' and status = 'failed' group by provider
    having count(*) >= coalesce((t ->> 'provider_errors_1h')::numeric, 5)
  loop
    perform private.ai_raise('provider_errors', r.provider, 'critical', jsonb_build_object('failed_1h', r.n));
    v_raised := v_raised + 1;
  end loop;

  -- 8) Aproximación a un límite en modo aviso o bloqueo.
  for r in select * from public.ai_limit where mode in ('warn', 'block') loop
    v_n := private.ai_limit_used(r.scope, r.scope_key, r.period, r.metric);
    if v_n * 100.0 >= r.max_value * r.warn_pct then
      perform private.ai_raise('near_limit', r.id::text, case when v_n >= r.max_value then 'critical' else 'warning' end,
                               jsonb_build_object('used', round(v_n, 4), 'max', r.max_value, 'pct', round(v_n * 100.0 / r.max_value, 1), 'mode', r.mode, 'scope', r.scope, 'period', r.period, 'metric', r.metric));
      v_raised := v_raised + 1;
    end if;
  end loop;

  return v_raised;
end;
$$;
revoke execute on function private.ai_detect() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7) Planes (PREPARADOS, sin efecto: ai_config.plans_enforced = false y ninguna puerta los lee)
-- ---------------------------------------------------------------------------------------------
create table public.ai_plan (
  id text primary key check (id ~ '^[a-z0-9_-]{2,40}$'),
  name text not null,
  -- Precio de la suscripción: se rellena cuando exista. NO se inventa ninguna tarifa comercial.
  monthly_price_eur numeric(10, 2) check (monthly_price_eur is null or monthly_price_eur >= 0),
  active boolean not null default true,
  note text,
  updated_at timestamptz not null default now()
);
create table public.ai_plan_quota (
  plan_id text not null references public.ai_plan(id) on delete cascade,
  -- Una función concreta o '*' = todas.
  purpose text not null default '*',
  period text not null check (period in ('day', 'month')),
  metric text not null check (metric in ('cost', 'calls')),
  max_value numeric(14, 4) not null check (max_value >= 0),
  primary key (plan_id, purpose, period, metric)
);
create table public.ai_family_plan (
  family_id uuid primary key references public.families(id) on delete cascade,
  plan_id text not null references public.ai_plan(id) on delete restrict,
  kind text not null default 'plan' check (kind in ('plan', 'exception', 'promo')),
  until date,
  note text
);
alter table public.ai_plan enable row level security;
alter table public.ai_plan_quota enable row level security;
alter table public.ai_family_plan enable row level security;
revoke all on public.ai_plan, public.ai_plan_quota, public.ai_family_plan from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 8) Funciones de administración (todas exigen is_app_owner; el servidor decide, no la pantalla)
-- ---------------------------------------------------------------------------------------------
create or replace function public.ai_admin_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_disabled jsonb := coalesce((select c.value from public.ai_config c where c.key = 'purposes_disabled'), '[]'::jsonb);
  v_key boolean := false;
  v_res jsonb;
begin
  perform private.ai_require_owner();
  begin
    v_key := public.get_app_secret(case when private.ai_cfg_text('provider', 'gemini') = 'gemini' then 'gemini_api_key' else private.ai_cfg_text('provider', 'gemini') || '_api_key' end) is not null;
  exception when others then
    v_key := false;
  end;
  select jsonb_build_object(
    'enabled', private.ai_global_enabled(),
    'provider', private.ai_cfg_text('provider', 'gemini'),
    'model', private.ai_cfg_text('model', 'gemini-flash-lite-latest'),
    'key_configured', v_key,
    'plans_enforced', coalesce((select (c.value)::boolean from public.ai_config c where c.key = 'plans_enforced'), false),
    'thresholds', coalesce((select c.value from public.ai_config c where c.key = 'alert_thresholds'), '{}'::jsonb),
    'community', jsonb_build_object(
      'launched', private.community_launched(),
      'ai_enabled', private.community_setting_int('ai_enabled', 0) = 1,
      'daily_cap', private.community_setting_int('ai_daily_cap', 300),
      'used_today', coalesce((select sum(u.calls) from public.community_ai_usage u where u.day = (now() at time zone 'Europe/Madrid')::date), 0),
      'schedule_articles', private.community_setting_int('editorial_articles_enabled', 0) = 1,
      'schedule_polls', private.community_setting_int('editorial_polls_enabled', 0) = 1,
      'schedule_menu', private.community_setting_int('editorial_menu_enabled', 0) = 1),
    'open_alerts', (select count(*) from public.ai_alert a where a.status = 'open'),
    'functions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'purpose', f.purpose, 'label', f.label, 'module', f.module, 'description', f.description, 'origin', f.origin, 'needs', to_jsonb(f.needs),
        'enabled', not (v_disabled ? f.purpose),
        'calls_24h', coalesce(s.calls, 0), 'failed_24h', coalesce(s.failed, 0), 'last_call', s.last_call, 'last_failure', s.last_fail)
        order by f.module, f.sort, f.label)
      from public.ai_function f
      left join (
        select l.purpose, count(*) as calls, count(*) filter (where l.status = 'failed') as failed, max(l.created_at) as last_call, max(l.created_at) filter (where l.status = 'failed') as last_fail
        from public.ai_call_log l where l.created_at > now() - interval '24 hours' group by l.purpose
      ) s on s.purpose = f.purpose), '[]'::jsonb),
    'unregistered', coalesce((select jsonb_agg(distinct l.purpose) from public.ai_call_log l where l.created_at > now() - interval '30 days' and not exists (select 1 from public.ai_function f where f.purpose = l.purpose)), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

create or replace function public.ai_admin_set_global(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before boolean;
begin
  perform private.ai_require_owner();
  if p_enabled is null then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  v_before := private.ai_global_enabled();
  insert into public.ai_config (key, value, updated_at) values ('enabled', to_jsonb(p_enabled), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform private.ai_audit('global', 'enabled', jsonb_build_object('enabled', v_before), jsonb_build_object('enabled', p_enabled));
  return jsonb_build_object('enabled', p_enabled);
end;
$$;

create or replace function public.ai_admin_set_function(p_purpose text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list jsonb;
  v_before boolean;
begin
  perform private.ai_require_owner();
  if p_enabled is null or not exists (select 1 from public.ai_function f where f.purpose = p_purpose) then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  v_list := coalesce((select c.value from public.ai_config c where c.key = 'purposes_disabled'), '[]'::jsonb);
  v_before := not (v_list ? p_purpose);
  if p_enabled then
    v_list := coalesce((select jsonb_agg(x) from jsonb_array_elements_text(v_list) x where x <> p_purpose), '[]'::jsonb);
  elsif not (v_list ? p_purpose) then
    v_list := v_list || to_jsonb(p_purpose);
  end if;
  insert into public.ai_config (key, value, updated_at) values ('purposes_disabled', v_list, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform private.ai_audit('function', p_purpose, jsonb_build_object('enabled', v_before), jsonb_build_object('enabled', p_enabled));
  return jsonb_build_object('purpose', p_purpose, 'enabled', p_enabled);
end;
$$;

-- Resumen del periodo (y del periodo anterior de la misma duración) con desgloses por función, módulo, modelo, día, origen y familia.
create or replace function public.ai_admin_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_len interval;
  v_pf timestamptz;
  r jsonb;
begin
  perform private.ai_require_owner();
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'BAD_RANGE' using errcode = 'P0001';
  end if;
  v_len := p_to - p_from;
  v_pf := p_from - v_len;
  with cur as (select * from public.ai_call_log where created_at >= p_from and created_at < p_to and status <> 'cancelled'),
       prev as (select * from public.ai_call_log where created_at >= v_pf and created_at < p_from and status <> 'cancelled')
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', (select jsonb_build_object('cost', coalesce(sum(cost), 0), 'calls', count(*), 'failed', count(*) filter (where status = 'failed'),
                 'tokens_in', coalesce(sum(tokens_in), 0), 'tokens_out', coalesce(sum(tokens_out + tokens_extra), 0),
                 'unpriced_calls', count(*) filter (where cost is null), 'estimated_calls', count(*) filter (where cost_kind = 'estimated'),
                 'confirmed_calls', count(*) filter (where cost_kind = 'confirmed'),
                 'families', count(distinct family_id), 'users', count(distinct user_id),
                 'automatic_cost', coalesce(sum(cost) filter (where origin = 'automatic'), 0)) from cur),
    'previous', (select jsonb_build_object('cost', coalesce(sum(cost), 0), 'calls', count(*)) from prev),
    'by_function', (select coalesce(jsonb_agg(x order by (x ->> 'cost')::numeric desc, (x ->> 'calls')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('purpose', c.purpose, 'label', coalesce(f.label, c.purpose), 'module', c.module, 'calls', count(*),
                 'failed', count(*) filter (where c.status = 'failed'), 'tokens_in', sum(c.tokens_in), 'tokens_out', sum(c.tokens_out + c.tokens_extra),
                 'cost', coalesce(sum(c.cost), 0),
                 'prev_cost', coalesce((select sum(p.cost) from prev p where p.purpose = c.purpose), 0),
                 'prev_calls', (select count(*) from prev p where p.purpose = c.purpose)) as x
        from cur c left join public.ai_function f on f.purpose = c.purpose group by c.purpose, c.module, f.label) s),
    'by_module', (select coalesce(jsonb_agg(jsonb_build_object('module', module, 'calls', n, 'cost', cst) order by cst desc, n desc), '[]'::jsonb)
                  from (select module, count(*) as n, coalesce(sum(cost), 0) as cst from cur group by module) s),
    'by_model', (select coalesce(jsonb_agg(jsonb_build_object('model', provider || '/' || model, 'calls', n, 'cost', cst) order by cst desc, n desc), '[]'::jsonb)
                 from (select provider, model, count(*) as n, coalesce(sum(cost), 0) as cst from cur group by provider, model) s),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'calls', n, 'cost', cst) order by d), '[]'::jsonb)
               from (select (created_at at time zone 'Europe/Madrid')::date as d, count(*) as n, coalesce(sum(cost), 0) as cst from cur group by 1) s),
    'by_origin', (select coalesce(jsonb_agg(jsonb_build_object('origin', origin, 'calls', n, 'cost', cst)), '[]'::jsonb)
                  from (select origin, count(*) as n, coalesce(sum(cost), 0) as cst from cur group by origin) s),
    'top_families', (select coalesce(jsonb_agg(jsonb_build_object('family_id', fid, 'name', nm, 'calls', n, 'cost', cst, 'users', u, 'functions', fn) order by cst desc, n desc), '[]'::jsonb) from (
        select c.family_id as fid, coalesce(fa.name, 'Familia') as nm, count(*) as n, coalesce(sum(c.cost), 0) as cst, count(distinct c.user_id) as u, count(distinct c.purpose) as fn
        from cur c join public.families fa on fa.id = c.family_id where c.family_id is not null
        group by c.family_id, fa.name order by coalesce(sum(c.cost), 0) desc, count(*) desc limit 25) s)
  ) into r;
  return r;
end;
$$;

-- Detalle de una familia: por función, por persona (agregado) y lo automático aparte. Sin ningún contenido de las interacciones.
create or replace function public.ai_admin_family_detail(p_family uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_len interval;
  r jsonb;
begin
  perform private.ai_require_owner();
  if p_family is null or p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'BAD_RANGE' using errcode = 'P0001';
  end if;
  v_len := p_to - p_from;
  with cur as (select * from public.ai_call_log where family_id = p_family and created_at >= p_from and created_at < p_to and status <> 'cancelled'),
       prev as (select * from public.ai_call_log where family_id = p_family and created_at >= p_from - v_len and created_at < p_from and status <> 'cancelled')
  select jsonb_build_object(
    'family_id', p_family,
    'name', (select fa.name from public.families fa where fa.id = p_family),
    'totals', (select jsonb_build_object('cost', coalesce(sum(cost), 0), 'calls', count(*), 'prev_cost', coalesce((select sum(cost) from prev), 0), 'prev_calls', (select count(*) from prev),
                 'individual_cost', coalesce(sum(cost) filter (where origin = 'family' and user_id is not null), 0),
                 'unattributed_cost', coalesce(sum(cost) filter (where origin = 'family' and user_id is null), 0),
                 'automatic_cost', coalesce(sum(cost) filter (where origin <> 'family'), 0)) from cur),
    'by_function', (select coalesce(jsonb_agg(jsonb_build_object('purpose', c.purpose, 'label', coalesce(f.label, c.purpose), 'calls', n, 'cost', cst) order by cst desc, n desc), '[]'::jsonb) from (
        select purpose, count(*) as n, coalesce(sum(cost), 0) as cst from cur group by purpose) c left join public.ai_function f on f.purpose = c.purpose),
    'by_user', (select coalesce(jsonb_agg(jsonb_build_object('user_id', u, 'name', nm, 'calls', n, 'cost', cst) order by cst desc, n desc), '[]'::jsonb) from (
        select c.user_id as u, coalesce(p.display_name, 'Sin identificar') as nm, count(*) as n, coalesce(sum(c.cost), 0) as cst
        from cur c left join public.profiles p on p.id = c.user_id where c.user_id is not null group by c.user_id, p.display_name) s),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'calls', n, 'cost', cst) order by d), '[]'::jsonb)
               from (select (created_at at time zone 'Europe/Madrid')::date as d, count(*) as n, coalesce(sum(cost), 0) as cst from cur group by 1) s),
    'limits', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from public.ai_limit l where l.scope = 'family' and l.scope_key = p_family::text),
    'exceptions', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'purpose', e.purpose, 'until', e.until, 'note', e.note)), '[]'::jsonb) from public.ai_limit_exception e where e.family_id = p_family)
  ) into r;
  return r;
end;
$$;

-- Ranking de familias con IA activa o con límite propio.
create or replace function public.ai_admin_families(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_len interval;
begin
  perform private.ai_require_owner();
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'BAD_RANGE' using errcode = 'P0001';
  end if;
  v_len := p_to - p_from;
  return coalesce((
    select jsonb_agg(jsonb_build_object('family_id', fa.id, 'name', fa.name, 'users', coalesce(u.users, 0), 'calls', coalesce(u.calls, 0), 'cost', coalesce(u.cost, 0),
             'prev_cost', coalesce(pv.cost, 0), 'functions', coalesce(u.fn, 0), 'has_limit', exists (select 1 from public.ai_limit l where l.scope = 'family' and l.scope_key = fa.id::text),
             'disabled', exists (select 1 from public.ai_family_settings s where s.family_id = fa.id and s.ai_enabled = false))
           order by coalesce(u.cost, 0) desc, coalesce(u.calls, 0) desc)
    from public.families fa
    left join (select family_id, count(*) as calls, coalesce(sum(cost), 0) as cost, count(distinct user_id) as users, count(distinct purpose) as fn from public.ai_call_log
               where created_at >= p_from and created_at < p_to and status <> 'cancelled' and family_id is not null group by family_id) u on u.family_id = fa.id
    left join (select family_id, coalesce(sum(cost), 0) as cost from public.ai_call_log
               where created_at >= p_from - v_len and created_at < p_from and status <> 'cancelled' and family_id is not null group by family_id) pv on pv.family_id = fa.id
    where u.calls > 0 or exists (select 1 from public.ai_limit l where l.scope = 'family' and l.scope_key = fa.id::text)
  ), '[]'::jsonb);
end;
$$;

-- Límites con su uso actual.
create or replace function public.ai_admin_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  return jsonb_build_object(
    'limits', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'scope', l.scope, 'scope_key', l.scope_key, 'period', l.period, 'metric', l.metric, 'max_value', l.max_value, 'warn_pct', l.warn_pct, 'mode', l.mode,
               'note', l.note, 'updated_at', l.updated_at,
               'label', case l.scope when 'global' then 'Toda la IA de PEPA'
                                     when 'module' then 'Módulo ' || l.scope_key
                                     when 'function' then coalesce((select f.label from public.ai_function f where f.purpose = l.scope_key), l.scope_key)
                                     when 'family' then coalesce((select 'Familia ' || fa.name from public.families fa where fa.id::text = l.scope_key), 'Familia')
                                     else coalesce((select 'Persona ' || p.display_name from public.profiles p where p.id::text = l.scope_key), 'Persona') end,
               'used', private.ai_limit_used(l.scope, l.scope_key, l.period, l.metric))
             order by l.scope, l.scope_key, l.period, l.metric)
      from public.ai_limit l), '[]'::jsonb),
    'exceptions', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'family_id', e.family_id, 'family', coalesce(fa.name, 'Familia'), 'purpose', e.purpose, 'until', e.until, 'note', e.note) order by e.created_at desc)
      from public.ai_limit_exception e left join public.families fa on fa.id = e.family_id), '[]'::jsonb),
    'community_daily_cap', jsonb_build_object('cap', private.community_setting_int('ai_daily_cap', 300),
      'used_today', coalesce((select sum(u.calls) from public.community_ai_usage u where u.day = (now() at time zone 'Europe/Madrid')::date), 0))
  );
end;
$$;

create or replace function public.ai_admin_set_limit(
  p_scope text, p_key text, p_period text, p_metric text, p_max numeric, p_warn_pct integer, p_mode text, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(p_key, '');
  v_old public.ai_limit%rowtype;
  v_id uuid;
begin
  perform private.ai_require_owner();
  if p_scope not in ('global', 'module', 'function', 'family', 'user') or p_period not in ('day', 'month') or p_metric not in ('cost', 'calls')
     or p_mode not in ('observe', 'warn', 'block') or p_max is null or p_max <= 0 or coalesce(p_warn_pct, 80) not between 1 and 100 then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  if p_scope = 'global' then
    v_key := '';
  elsif p_scope = 'module' and v_key not in ('compras_economia', 'comunidad', 'ayuda', 'cocina', 'mis_listas', 'eventos', 'otros') then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  elsif p_scope = 'function' and not exists (select 1 from public.ai_function f where f.purpose = v_key) then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  elsif p_scope = 'family' and not exists (select 1 from public.families fa where fa.id::text = v_key) then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  elsif p_scope = 'user' and not exists (select 1 from public.profiles p where p.id::text = v_key) then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  select * into v_old from public.ai_limit where scope = p_scope and scope_key = v_key and period = p_period and metric = p_metric;
  insert into public.ai_limit (scope, scope_key, period, metric, max_value, warn_pct, mode, note, updated_at, updated_by)
  values (p_scope, v_key, p_period, p_metric, p_max, coalesce(p_warn_pct, 80), p_mode, left(p_note, 300), now(), (select auth.uid()))
  on conflict (scope, scope_key, period, metric) do update
    set max_value = excluded.max_value, warn_pct = excluded.warn_pct, mode = excluded.mode, note = excluded.note, updated_at = now(), updated_by = excluded.updated_by
  returning id into v_id;
  perform private.ai_audit('limit_set', p_scope || ':' || v_key || ':' || p_period || ':' || p_metric,
    case when v_old.id is null then null else jsonb_build_object('max', v_old.max_value, 'warn_pct', v_old.warn_pct, 'mode', v_old.mode) end,
    jsonb_build_object('max', p_max, 'warn_pct', coalesce(p_warn_pct, 80), 'mode', p_mode));
  return v_id;
end;
$$;

create or replace function public.ai_admin_delete_limit(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.ai_limit%rowtype;
begin
  perform private.ai_require_owner();
  delete from public.ai_limit where id = p_id returning * into v_old;
  if v_old.id is not null then
    perform private.ai_audit('limit_delete', v_old.scope || ':' || v_old.scope_key || ':' || v_old.period || ':' || v_old.metric,
      jsonb_build_object('max', v_old.max_value, 'warn_pct', v_old.warn_pct, 'mode', v_old.mode), null);
  end if;
end;
$$;

create or replace function public.ai_admin_set_exception(p_family uuid, p_purpose text, p_until date, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.ai_require_owner();
  if p_family is null or not exists (select 1 from public.families fa where fa.id = p_family)
     or (p_purpose is not null and not exists (select 1 from public.ai_function f where f.purpose = p_purpose)) then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  delete from public.ai_limit_exception where family_id = p_family and coalesce(purpose, '') = coalesce(p_purpose, '');
  insert into public.ai_limit_exception (family_id, purpose, until, note, created_by) values (p_family, p_purpose, p_until, left(p_note, 300), (select auth.uid())) returning id into v_id;
  perform private.ai_audit('exception_set', p_family::text || ':' || coalesce(p_purpose, '*'), null, jsonb_build_object('until', p_until));
  return v_id;
end;
$$;

create or replace function public.ai_admin_delete_exception(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.ai_limit_exception%rowtype;
begin
  perform private.ai_require_owner();
  delete from public.ai_limit_exception where id = p_id returning * into v_old;
  if v_old.id is not null then
    perform private.ai_audit('exception_delete', v_old.family_id::text || ':' || coalesce(v_old.purpose, '*'), jsonb_build_object('until', v_old.until), null);
  end if;
end;
$$;

create or replace function public.ai_admin_alerts(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'subject', a.subject, 'severity', a.severity, 'details', a.details, 'status', a.status,
             'first_seen', a.first_seen, 'last_seen', a.last_seen, 'occurrences', a.occurrences,
             'subject_label', case a.kind
                 when 'family_outlier' then coalesce((select fa.name from public.families fa where fa.id::text = a.subject), 'Familia')
                 when 'function_growth' then coalesce((select f.label from public.ai_function f where f.purpose = a.subject), a.subject)
                 when 'excessive_retries' then coalesce((select f.label from public.ai_function f where f.purpose = a.subject), a.subject)
                 when 'possible_loop' then coalesce((select f.label from public.ai_function f where f.purpose = split_part(a.subject, '|', 1)), split_part(a.subject, '|', 1))
                 else a.subject end)
             order by case a.severity when 'critical' then 0 when 'warning' then 1 else 2 end, a.last_seen desc)
    from (select * from public.ai_alert x where p_status = 'all' or x.status = p_status order by x.last_seen desc limit 100) a), '[]'::jsonb);
end;
$$;

create or replace function public.ai_admin_alert_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  if p_status not in ('open', 'reviewed', 'dismissed') then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  update public.ai_alert set status = p_status, reviewed_by = (select auth.uid()), reviewed_at = now() where id = p_id;
  perform private.ai_audit('alert_' || p_status, p_id::text, null, null);
end;
$$;

create or replace function public.ai_admin_run_detection()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  return private.ai_detect();
end;
$$;

create or replace function public.ai_admin_set_thresholds(p_thresholds jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  k text;
  v jsonb;
  v_new jsonb;
begin
  perform private.ai_require_owner();
  if p_thresholds is null or jsonb_typeof(p_thresholds) <> 'object' then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  v_old := coalesce((select c.value from public.ai_config c where c.key = 'alert_thresholds'), '{}'::jsonb);
  v_new := v_old;
  for k, v in select * from jsonb_each(p_thresholds) loop
    if k not in ('cost_spike_factor', 'cost_min_usd', 'calls_spike_factor', 'calls_min', 'family_share_pct', 'family_min_calls', 'function_growth_factor', 'function_min_calls',
                 'retry_ratio_pct', 'retry_min_calls', 'loop_calls_10min', 'provider_errors_1h')
       or jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 1000000 then
      raise exception 'BAD_REQUEST' using errcode = 'P0001';
    end if;
    v_new := jsonb_set(v_new, array[k], v);
  end loop;
  insert into public.ai_config (key, value, updated_at) values ('alert_thresholds', v_new, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform private.ai_audit('thresholds', 'alert_thresholds', v_old, v_new);
end;
$$;

create or replace function public.ai_admin_prices()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'provider', p.provider, 'model', p.model, 'modality', p.modality, 'input_per_mtok', p.input_per_mtok,
           'output_per_mtok', p.output_per_mtok, 'currency', p.currency, 'valid_from', p.valid_from, 'valid_to', p.valid_to, 'kind', p.kind, 'source', p.source)
           order by p.provider, p.model, p.modality, p.valid_from desc) from public.ai_price p), '[]'::jsonb);
end;
$$;

-- Nueva tarifa: cierra la vigente del mismo modelo y modalidad el día anterior. Las llamadas ya anotadas conservan el coste con el que se calcularon.
create or replace function public.ai_admin_add_price(p_provider text, p_model text, p_modality text, p_in numeric, p_out numeric, p_valid_from date, p_kind text, p_source text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.ai_require_owner();
  if coalesce(p_provider, '') !~ '^[a-z0-9_-]{2,40}$' or coalesce(p_model, '') !~ '^[a-z0-9._-]{2,80}$' or p_modality not in ('text', 'image', 'audio', 'video')
     or p_in is null or p_out is null or p_in < 0 or p_out < 0 or p_valid_from is null or p_kind not in ('confirmed', 'estimated') or coalesce(length(trim(p_source)), 0) < 3 then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  update public.ai_price set valid_to = p_valid_from - 1
  where provider = p_provider and model = p_model and modality = p_modality and valid_to is null and valid_from < p_valid_from;
  insert into public.ai_price (provider, model, modality, input_per_mtok, output_per_mtok, valid_from, kind, source, created_by)
  values (p_provider, p_model, p_modality, p_in, p_out, p_valid_from, p_kind, left(p_source, 300), (select auth.uid())) returning id into v_id;
  perform private.ai_audit('price_add', p_provider || '/' || p_model || '/' || p_modality, null, jsonb_build_object('in', p_in, 'out', p_out, 'from', p_valid_from, 'kind', p_kind));
  return v_id;
end;
$$;

-- Base REAL para la proyección: consumo medio por familia activa y mes, por módulo, de los últimos p_days días.
create or replace function public.ai_admin_projection_base(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_active integer;
  v_calls bigint;
  v_data_days integer;
begin
  perform private.ai_require_owner();
  select count(distinct family_id), count(*), count(distinct (created_at at time zone 'Europe/Madrid')::date)
    into v_active, v_calls, v_data_days
    from public.ai_call_log where created_at >= now() - make_interval(days => v_days) and status <> 'cancelled' and family_id is not null;
  return jsonb_build_object(
    'days', v_days,
    'data_days', v_data_days,
    'calls', v_calls,
    'active_families', v_active,
    'total_families', (select count(*) from public.families),
    -- Hay base suficiente cuando se ha medido al menos una semana y 50 llamadas de familias.
    'enough', v_data_days >= 7 and v_calls >= 50,
    'by_module', coalesce((
      select jsonb_agg(jsonb_build_object('module', module, 'calls', n, 'cost', cst, 'tokens_in', ti, 'tokens_out', tout) order by cst desc)
      from (select module, count(*) as n, coalesce(sum(cost), 0) as cst, coalesce(sum(tokens_in), 0) as ti, coalesce(sum(tokens_out + tokens_extra), 0) as tout
            from public.ai_call_log where created_at >= now() - make_interval(days => v_days) and status <> 'cancelled' and family_id is not null group by module) s), '[]'::jsonb)
  );
end;
$$;

create or replace function public.ai_admin_audit(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  return coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'admin', coalesce(p.display_name, 'Administración'), 'action', a.action, 'subject', a.subject, 'before', a.before, 'after', a.after) order by a.at desc)
                   from (select * from public.ai_admin_log order by at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) a left join public.profiles p on p.id = a.admin_id), '[]'::jsonb);
end;
$$;

-- Planes (preparación: se pueden definir, sin efecto sobre nadie).
create or replace function public.ai_admin_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  return jsonb_build_object(
    'enforced', coalesce((select (c.value)::boolean from public.ai_config c where c.key = 'plans_enforced'), false),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'monthly_price_eur', p.monthly_price_eur, 'active', p.active, 'note', p.note,
               'quotas', coalesce((select jsonb_agg(jsonb_build_object('purpose', q.purpose, 'period', q.period, 'metric', q.metric, 'max_value', q.max_value) order by q.purpose, q.period, q.metric)
                                   from public.ai_plan_quota q where q.plan_id = p.id), '[]'::jsonb),
               'families', (select count(*) from public.ai_family_plan fp where fp.plan_id = p.id)) order by p.name) from public.ai_plan p), '[]'::jsonb));
end;
$$;

create or replace function public.ai_admin_upsert_plan(p_id text, p_name text, p_price numeric, p_active boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  if coalesce(p_id, '') !~ '^[a-z0-9_-]{2,40}$' or coalesce(length(trim(p_name)), 0) < 2 or (p_price is not null and p_price < 0) then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  insert into public.ai_plan (id, name, monthly_price_eur, active, note, updated_at) values (p_id, left(trim(p_name), 80), p_price, coalesce(p_active, true), left(p_note, 300), now())
  on conflict (id) do update set name = excluded.name, monthly_price_eur = excluded.monthly_price_eur, active = excluded.active, note = excluded.note, updated_at = now();
  perform private.ai_audit('plan_upsert', p_id, null, jsonb_build_object('name', p_name, 'price', p_price, 'active', coalesce(p_active, true)));
end;
$$;

create or replace function public.ai_admin_set_quota(p_plan text, p_purpose text, p_period text, p_metric text, p_max numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  if not exists (select 1 from public.ai_plan where id = p_plan) or p_period not in ('day', 'month') or p_metric not in ('cost', 'calls') or p_max is null or p_max < 0
     or (coalesce(p_purpose, '*') <> '*' and not exists (select 1 from public.ai_function f where f.purpose = p_purpose)) then
    raise exception 'BAD_REQUEST' using errcode = 'P0001';
  end if;
  insert into public.ai_plan_quota (plan_id, purpose, period, metric, max_value) values (p_plan, coalesce(p_purpose, '*'), p_period, p_metric, p_max)
  on conflict (plan_id, purpose, period, metric) do update set max_value = excluded.max_value;
  perform private.ai_audit('quota_set', p_plan || ':' || coalesce(p_purpose, '*'), null, jsonb_build_object('period', p_period, 'metric', p_metric, 'max', p_max));
end;
$$;

create or replace function public.ai_admin_delete_quota(p_plan text, p_purpose text, p_period text, p_metric text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  delete from public.ai_plan_quota where plan_id = p_plan and purpose = coalesce(p_purpose, '*') and period = p_period and metric = p_metric;
  perform private.ai_audit('quota_delete', p_plan || ':' || coalesce(p_purpose, '*'), null, null);
end;
$$;

-- Buscador de familias para poner un límite a CUALQUIER familia, tenga o no consumo previo. Solo devuelve id y nombre (máximo 30, por nombre).
create or replace function public.ai_admin_family_search(p_query text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.ai_require_owner();
  return coalesce((
    select jsonb_agg(jsonb_build_object('family_id', s.id, 'name', s.name) order by s.name)
    from (select fa.id, fa.name from public.families fa
          where coalesce(trim(p_query), '') = '' or fa.name ilike '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
          order by fa.name limit 30) s), '[]'::jsonb);
end;
$$;

do $$
declare
  f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'ai\_admin\_%'
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 9) Sincronización inmediata entre dispositivos de los administradores (solo ellos pueden leer estas dos tablas)
-- ---------------------------------------------------------------------------------------------
create policy ai_config_owner_read on public.ai_config for select to authenticated using (private.ai_is_owner());
create policy ai_alert_owner_read on public.ai_alert for select to authenticated using (private.ai_is_owner());
grant select on public.ai_config, public.ai_alert to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.ai_config;
  alter publication supabase_realtime add table public.ai_alert;
exception when others then
  raise warning 'ai-control: no se pudo publicar en Realtime (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 10) Revisión de anomalías: cada hora, minuto 17 (no llama a ningún proveedor; solo lee el registro)
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ai-detect') then
    perform cron.unschedule('ai-detect');
  end if;
  perform cron.schedule('ai-detect', '17 * * * *', $job$ select private.ai_detect(); $job$);
exception when others then
  raise warning 'ai-control: no se pudo programar la revisión de anomalías (%).', sqlerrm;
end $$;
