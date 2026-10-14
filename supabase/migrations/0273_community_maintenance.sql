-- COMUNIDAD PEPA — mantenimiento: cola de borrado de fotos (la ejecuta la función de servidor community-maintenance con la API de Storage) y uso de IA.

create table public.community_ai_usage (
  day date not null default (now() at time zone 'Europe/Madrid')::date,
  purpose text not null check (purpose in ('summary', 'pepa_answer', 'pepa_mention', 'proposals')),
  calls integer not null default 0,
  errors integer not null default 0,
  primary key (day, purpose)
);
alter table public.community_ai_usage enable row level security;
revoke all on public.community_ai_usage from anon, authenticated;

-- Las funciones de servidor cuentan cada llamada a la IA (solo números; no se guarda ninguna frase ni respuesta).
create or replace function public.community_service_record_ai(p_purpose text, p_error boolean default false)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.community_ai_usage (day, purpose, calls, errors)
  values ((now() at time zone 'Europe/Madrid')::date, p_purpose, 1, case when p_error then 1 else 0 end)
  on conflict (day, purpose) do update set calls = public.community_ai_usage.calls + 1, errors = public.community_ai_usage.errors + case when p_error then 1 else 0 end
$$;
revoke all on function public.community_service_record_ai(text, boolean) from public, anon, authenticated;
grant execute on function public.community_service_record_ai(text, boolean) to service_role;

-- Presupuesto diario de IA de Comunidad (freno de seguridad contra bucles): 0 = sin tope.
insert into public.community_settings (key, value, description)
values ('ai_daily_cap', '300', 'Llamadas de IA de Comunidad por día (resúmenes, respuestas de Pepa y propuestas). 0 = sin tope.')
on conflict (key) do nothing;

create or replace function public.community_service_ai_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.community_launched()
     and (private.community_setting_int('ai_daily_cap', 300) = 0
          or coalesce((select sum(u.calls) from public.community_ai_usage u where u.day = (now() at time zone 'Europe/Madrid')::date), 0) < private.community_setting_int('ai_daily_cap', 300))
$$;
revoke all on function public.community_service_ai_allowed() from public, anon, authenticated;
grant execute on function public.community_service_ai_allowed() to service_role;

-- Fotos pendientes de borrar del almacenamiento (solo las que ya no usa NINGUNA publicación, comentario, receta o borrador).
create or replace function public.community_service_pending_media_deletions(p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'bucket', d.bucket, 'path', d.path)), '[]'::jsonb)
  from (
    select x.* from public.community_media_deletions x
    where x.done_at is null
      and not exists (select 1 from public.community_post_photos ph where ph.storage_path = x.path)
      and not exists (select 1 from public.community_comments c where c.photo_path = x.path and c.status = 'published')
      and not exists (select 1 from public.community_recipes r where r.photo_path = x.path)
      and not exists (select 1 from public.community_drafts dr, jsonb_array_elements_text(dr.photos) ph2 where ph2 = x.path)
    order by x.requested_at limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ) d
$$;
revoke all on function public.community_service_pending_media_deletions(integer) from public, anon, authenticated;
grant execute on function public.community_service_pending_media_deletions(integer) to service_role;

create or replace function public.community_service_mark_media_deleted(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.community_media_deletions set done_at = now() where id = any (coalesce(p_ids, '{}')) and done_at is null;
  get diagnostics v_n = row_count;
  delete from public.community_media_deletions where done_at < now() - interval '7 days';
  return v_n;
end;
$$;
revoke all on function public.community_service_mark_media_deleted(uuid[]) from public, anon, authenticated;
grant execute on function public.community_service_mark_media_deleted(uuid[]) to service_role;

-- Fotos sueltas: subidas por alguien que nunca llegó a publicar (borrador abandonado sin guardar, error…). Las de más de 2 días que no usa nada se encolan
-- (las lista la función de servidor desde el almacenamiento y las manda aquí para decidir).
create or replace function public.community_service_orphan_check(p_paths text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(coalesce(p_paths, '{}')) x
  where not exists (select 1 from public.community_post_photos ph where ph.storage_path = x)
    and not exists (select 1 from public.community_comments c where c.photo_path = x)
    and not exists (select 1 from public.community_recipes r where r.photo_path = x)
    and not exists (select 1 from public.community_drafts dr, jsonb_array_elements_text(dr.photos) ph2 where ph2 = x)
$$;
revoke all on function public.community_service_orphan_check(text[]) from public, anon, authenticated;
grant execute on function public.community_service_orphan_check(text[]) to service_role;
