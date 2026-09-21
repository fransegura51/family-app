-- Contador de visitas de la web pública de PEPA (pepa-web), visible en /admin.
--
-- Anónimo y sin rastreo: NO se guarda IP, navegador, cookie ni identificador alguno; solo contadores por día y
-- página ('views' = páginas vistas; 'visitors' = visitantes aproximados: el propio navegador avisa una sola vez al
-- día con new_visitor = true, sin identificarse). Aislada de las tablas de negocio, como el resto de pepa_web_*.
--
-- Escritura: cualquier visitante, SOLO a través de record_pepa_web_visit (valida la ruta, ignora /admin y acota las
-- rutas distintas por día). Lectura: solo la administradora (is_pepa_web_admin) a través de funciones; la tabla no
-- tiene ningún acceso directo.
--
-- ROLLBACK: drop function record_pepa_web_visit(text, boolean); drop function get_pepa_web_visit_stats(integer);
--           drop function get_pepa_web_visit_totals(); drop table pepa_web_visits;
create table public.pepa_web_visits (
  day date not null,
  path text not null check (path ~ '^/[a-z0-9/_.-]{0,98}$'),
  views bigint not null default 0 check (views >= 0),
  visitors bigint not null default 0 check (visitors >= 0),
  primary key (day, path)
);

alter table public.pepa_web_visits enable row level security;
revoke all on public.pepa_web_visits from public, anon, authenticated;
-- Sin políticas: nadie la toca directamente (solo las funciones security definer de abajo).

create or replace function public.record_pepa_web_visit(p_path text, p_new_visitor boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text := lower(btrim(coalesce(p_path, '')));
  v_day date := (now() at time zone 'Europe/Madrid')::date;
begin
  if length(v_path) > 1 then
    v_path := regexp_replace(v_path, '/+$', '');
  end if;
  -- Rutas no válidas y el propio panel no cuentan.
  if v_path !~ '^/[a-z0-9/_.-]{0,98}$' or v_path = '/admin' or v_path like '/admin/%' then
    return;
  end if;
  -- Tope de páginas distintas por día: lo que exceda se agrupa (evita inflar la tabla con rutas inventadas).
  if not exists (select 1 from public.pepa_web_visits where day = v_day and path = v_path)
     and (select count(*) from public.pepa_web_visits where day = v_day) >= 200 then
    v_path := '/otras';
  end if;
  insert into public.pepa_web_visits (day, path, views, visitors)
  values (v_day, v_path, 1, case when coalesce(p_new_visitor, false) then 1 else 0 end)
  on conflict (day, path) do update
    set views = public.pepa_web_visits.views + 1,
        visitors = public.pepa_web_visits.visitors + excluded.visitors;
end;
$$;

-- Filas (día, página) de los últimos p_days días (1-365), solo para la administradora.
create or replace function public.get_pepa_web_visit_stats(p_days integer default 30)
returns table (day date, path text, views bigint, visitors bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_pepa_web_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    select v.day, v.path, v.views, v.visitors
    from public.pepa_web_visits v
    where v.day >= (now() at time zone 'Europe/Madrid')::date - (greatest(1, least(coalesce(p_days, 30), 365)) - 1)
    order by v.day, v.path;
end;
$$;

-- Totales desde que se empezó a contar, solo para la administradora.
create or replace function public.get_pepa_web_visit_totals()
returns table (total_views bigint, total_visitors bigint, since date)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_pepa_web_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    select coalesce(sum(v.views), 0)::bigint, coalesce(sum(v.visitors), 0)::bigint, min(v.day)
    from public.pepa_web_visits v;
end;
$$;

revoke execute on function public.record_pepa_web_visit(text, boolean) from public;
revoke execute on function public.get_pepa_web_visit_stats(integer) from public, anon;
revoke execute on function public.get_pepa_web_visit_totals() from public, anon;
grant execute on function public.record_pepa_web_visit(text, boolean) to anon, authenticated;
grant execute on function public.get_pepa_web_visit_stats(integer) to authenticated;
grant execute on function public.get_pepa_web_visit_totals() to authenticated;
