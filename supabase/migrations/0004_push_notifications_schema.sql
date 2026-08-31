-- Suscripciones Web Push y registro de envíos, para recordatorios con la
-- app cerrada (Skill 24). Las claves VAPID y el secreto compartido con el
-- cron viven en Vault, no en variables de entorno de Edge Functions (no
-- disponibles vía estas herramientas) — se leen en tiempo de ejecución
-- mediante una función SECURITY DEFINER restringida a service_role.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions: own"
  on push_subscriptions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Marca qué (evento, suscripción) ya recibió su recordatorio. RLS activo
-- sin políticas: nadie accede vía API, solo la función SECURITY DEFINER.
create table reminder_deliveries (
  event_id uuid not null references calendar_events(id) on delete cascade,
  subscription_id uuid not null references push_subscriptions(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (event_id, subscription_id)
);

alter table reminder_deliveries enable row level security;

-- Lee un secreto de Vault. Solo invocable por service_role (la Edge
-- Function), nunca por anon/authenticated — evita exponer claves privadas.
create or replace function public.get_app_secret(p_name text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name
$$;

revoke all on function public.get_app_secret(text) from public, anon, authenticated;
grant execute on function public.get_app_secret(text) to service_role, postgres;

-- Reclama atómicamente los recordatorios que ya han llegado a su hora y
-- que no se han enviado todavía, devolviendo los datos de suscripción
-- necesarios para el push. Solo invocable por service_role.
-- Los OUT params de RETURNS TABLE se convierten en variables plpgsql
-- visibles en todo el cuerpo de la función. Con nombres iguales a
-- columnas reales (subscription_id, endpoint, p256dh, auth) esto produce
-- "ambiguous column reference" (42702) en runtime, aunque compile y pase
-- review estático — bug real detectado vía logs en producción. Se
-- prefijan con out_ para que no puedan colisionar con ninguna columna.
create or replace function public.claim_due_reminders()
returns table (
  out_subscription_id uuid,
  out_endpoint text,
  out_p256dh text,
  out_auth text,
  out_event_title text,
  out_event_start_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select e.id as event_id, e.title, e.start_at, ps.id as sub_id,
           ps.endpoint as ep, ps.p256dh as p256dh_key, ps.auth as auth_key
    from calendar_events e
    join calendar_event_members cem on cem.event_id = e.id
    join family_members fm on fm.id = cem.member_id
    join push_subscriptions ps on ps.profile_id = fm.linked_profile_id
    where e.reminder_minutes is not null
      and now() >= e.start_at - (e.reminder_minutes || ' minutes')::interval
      and now() < e.start_at
  ),
  claimed as (
    insert into reminder_deliveries (event_id, subscription_id)
    select event_id, sub_id from candidates
    on conflict (event_id, subscription_id) do nothing
    returning reminder_deliveries.event_id, reminder_deliveries.subscription_id
  )
  select c.sub_id, c.ep, c.p256dh_key, c.auth_key, c.title, c.start_at
  from candidates c
  join claimed cl on cl.event_id = c.event_id and cl.subscription_id = c.sub_id;
end;
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role, postgres;

-- Permite a la Edge Function borrar una suscripción caducada (push
-- devuelve 410 Gone) sin necesitar el token del propio usuario.
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from push_subscriptions where endpoint = p_endpoint
$$;

revoke all on function public.delete_push_subscription(text) from public, anon, authenticated;
grant execute on function public.delete_push_subscription(text) to service_role, postgres;

create index idx_push_subscriptions_profile on push_subscriptions(profile_id);
