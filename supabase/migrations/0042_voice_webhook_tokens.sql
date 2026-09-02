-- Control por voz desde el coche (botón del volante -> Google
-- Assistant/Siri -> IFTTT -> este webhook), sin tocar el móvil —
-- petición real: "poder añadir cosas a la lista de la compra o crear
-- eventos en el calendario sin tocar el móvil". IFTTT no inicia sesión
-- en la app (no hay usuario de Supabase Auth detrás), así que hace
-- falta un secreto propio por familia para saber a qué familia
-- pertenece cada aviso — el mismo patrón que ya usan los códigos de
-- invitación de family_members, pero de un solo uso prolongado
-- (bearer token que IFTTT guarda en su "receta"), no de 24 horas.
create table voice_webhook_tokens (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  token text not null unique,
  label text not null default 'IFTTT',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table voice_webhook_tokens enable row level security;

-- Solo lectura y borrado desde la app (para ver y revocar) — la
-- creación pasa siempre por la función de abajo, que genera el token
-- con suficiente aleatoriedad en vez de dejar que el cliente proponga
-- uno propio (podría ser predecible).
create policy "voice_webhook_tokens: family select" on voice_webhook_tokens for select
  using (family_id = private.current_family_id());

create policy "voice_webhook_tokens: family delete" on voice_webhook_tokens for delete
  using (family_id = private.current_family_id());

create or replace function public.create_voice_webhook_token(p_label text default 'IFTTT')
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text;
  v_family_id uuid;
begin
  v_family_id := private.current_family_id();
  if v_family_id is null then
    raise exception 'No autenticado';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into voice_webhook_tokens (family_id, token, label)
  values (v_family_id, v_token, coalesce(nullif(trim(p_label), ''), 'IFTTT'));

  return v_token;
end;
$function$;

revoke all on function public.create_voice_webhook_token(text) from public, anon;
grant execute on function public.create_voice_webhook_token(text) to authenticated;

create index idx_voice_webhook_tokens_family on voice_webhook_tokens(family_id);
