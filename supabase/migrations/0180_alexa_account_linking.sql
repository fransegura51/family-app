-- Vincular Alexa a la familia (lectura por voz: lista de la compra, agenda
-- de hoy, menú de hoy, tiempo) — "Alexa, pregunta a Pepa...". Petición real:
-- "¿Se puede integrar la app de Pepa con Alexa?... Sí, móntalo, pero déjalo
-- preparado para que cuando la vendamos, la familia se puedan conectar con
-- Alexa si lo quieren" — por eso esto usa el account linking (OAuth2) de
-- verdad de Alexa desde el principio, no un atajo pensado solo para esta
-- familia: cuando se venda, cada familia nueva conecta su propia cuenta sin
-- tocar código.
--
-- Mismo patrón que calendar_export_tokens (0045/0046): un token opaco por
-- familia que identifica a quien pregunta sin sesión de usuario real — pero
-- aquí hacen falta DOS tablas, no una: calendar_export_tokens ES el
-- credential final (se reparte la URL con el token y ya); aquí el credential
-- final (access_token) solo se entrega tras canjear un `code` de un solo uso
-- y corta vida, como exige de verdad el flujo OAuth2 Authorization Code que
-- pide Alexa para el account linking.

create table alexa_links (
  family_id uuid primary key references families(id) on delete cascade,
  access_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table alexa_links enable row level security;

-- Mismo criterio que calendar_export_tokens: solo la propia familia ve su
-- estado de conexión (para pintar "Conectado desde..." / "Desconectar" en
-- FamilyScreen).
create policy "select own family alexa link"
  on alexa_links for select
  using (family_id = private.current_family_id());

-- Código de un solo uso, de muy corta vida (600s) — lo crea la pantalla
-- "Autorizar Alexa" (AlexaLinkScreen) cuando la persona confirma "Permitir",
-- lo consume alexa-oauth-token al canjearlo por el access_token de arriba.
-- RLS activo SIN políticas: nadie accede a esto por la API normal, ni
-- siquiera la propia familia — solo las funciones SECURITY DEFINER de abajo,
-- y de ahí en consumo, el service-role de la Edge Function, nunca directo.
create table alexa_auth_codes (
  code text primary key default encode(gen_random_bytes(24), 'hex'),
  family_id uuid not null references families(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '600 seconds'),
  consumed_at timestamptz
);

alter table alexa_auth_codes enable row level security;

-- Crea el code de un solo uso para la familia de quien llama (requiere
-- sesión real, ya logueada en la app). Solo admin: vincular Alexa da acceso
-- de voz de lectura sin ningún otro factor aparte del access_token, así que
-- se trata como acción sensible de familia, igual que gestionar miembros
-- (0001_init.sql).
create or replace function public.mint_alexa_auth_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_family_id uuid := private.current_family_id();
  v_code text;
begin
  if v_family_id is null then
    raise exception 'No autenticado';
  end if;
  if private.current_role_in_family() <> 'admin' then
    raise exception 'Solo un administrador de la familia puede vincular Alexa';
  end if;

  -- Un code sin usar de un intento anterior (p. ej. cancelado a medias) no
  -- debe quedar válido a la vez que uno nuevo.
  delete from alexa_auth_codes where family_id = v_family_id and consumed_at is null;

  insert into alexa_auth_codes (family_id) values (v_family_id)
  returning code into v_code;

  return v_code;
end;
$function$;

revoke execute on function public.mint_alexa_auth_code() from anon, public;
grant execute on function public.mint_alexa_auth_code() to authenticated;

-- Canjea el code (consumo atómico, de un solo uso, caduca a los 600s) y
-- devuelve/crea el access_token de la familia. SECURITY DEFINER pero NO
-- concedida a `authenticated` — quien llama es alexa-oauth-token con
-- service_role, sin JWT de usuario (Amazon no tiene uno). La verificación de
-- quién puede llamar esto la hace esa Edge Function comprobando
-- client_id/secret antes de invocar esto; aquí dentro, confiar en el `code`
-- de un solo uso es la única puerta.
create or replace function public.redeem_alexa_auth_code(p_code text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_family_id uuid;
  v_token text;
begin
  update alexa_auth_codes
  set consumed_at = now()
  where code = p_code and consumed_at is null and expires_at > now()
  returning family_id into v_family_id;

  if v_family_id is null then
    raise exception 'Código inválido, caducado o ya usado';
  end if;

  insert into alexa_links (family_id) values (v_family_id)
  on conflict (family_id) do nothing;

  select access_token into v_token from alexa_links where family_id = v_family_id;
  return v_token;
end;
$function$;

revoke execute on function public.redeem_alexa_auth_code(text) from anon, authenticated, public;
grant execute on function public.redeem_alexa_auth_code(text) to service_role, postgres;

-- Desconectar (borra el access_token — cualquier Echo que lo use deja de
-- responder de inmediato, sin esperar a ningún ciclo). Mismo criterio de
-- admin que mint_alexa_auth_code.
create or replace function public.disconnect_alexa()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_family_id uuid := private.current_family_id();
begin
  if v_family_id is null then
    raise exception 'No autenticado';
  end if;
  if private.current_role_in_family() <> 'admin' then
    raise exception 'Solo un administrador de la familia puede desconectar Alexa';
  end if;

  delete from alexa_links where family_id = v_family_id;
end;
$function$;

revoke execute on function public.disconnect_alexa() from anon, public;
grant execute on function public.disconnect_alexa() to authenticated;
