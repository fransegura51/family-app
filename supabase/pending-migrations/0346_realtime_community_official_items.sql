-- Centro Editorial (29/10/2026): avisar en vivo a los demás dispositivos de la administración cuando cambia un elemento oficial (aprobado, rechazado, editado, publicado…).
-- Los elementos oficiales NO son legibles directamente por ninguna cuenta (solo por funciones de servidor), así que NO se publica esa tabla. En su lugar hay una tabla mínima
-- de «señal» con UNA fila (solo una marca de tiempo, nunca contenido) que un disparador toca cuando algo cambia. Solo la administración de Comunidad puede leerla (RLS), y el
-- canal en vivo solo AVISA «algo cambió»: la pantalla vuelve a pedir sus datos con las funciones de siempre.
-- Sin esta migración el Centro Editorial sigue funcionando: se actualiza al hacer una acción, al volver a la pestaña, al recuperar el foco o la conexión.
create table if not exists public.community_editorial_signal (
  id integer primary key check (id = 1),
  changed_at timestamptz not null default now()
);
alter table public.community_editorial_signal enable row level security;
revoke all on public.community_editorial_signal from anon, authenticated;
grant select on public.community_editorial_signal to authenticated;
drop policy if exists community_editorial_signal_admin_read on public.community_editorial_signal;
-- La política se evalúa con los permisos de quien lee, y `private.community_is_admin()` no es ejecutable por las cuentas: se usa un envoltorio mínimo que solo devuelve «¿soy administración?».
-- (Dato que esa cuenta ya conoce: community_status devuelve el mismo valor.)
create or replace function private.community_signal_visible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
  select private.community_is_admin()
$f$;
revoke execute on function private.community_signal_visible() from public, anon;
grant execute on function private.community_signal_visible() to authenticated;
create policy community_editorial_signal_admin_read on public.community_editorial_signal for select to authenticated using ((select private.community_signal_visible()));
insert into public.community_editorial_signal (id) values (1) on conflict (id) do nothing;

create or replace function private.community_editorial_signal_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.community_editorial_signal set changed_at = now() where id = 1;
  return null;
end;
$$;
revoke execute on function private.community_editorial_signal_touch() from public, anon, authenticated;

drop trigger if exists community_official_items_signal on public.community_official_items;
create trigger community_official_items_signal
  after insert or update or delete on public.community_official_items
  for each statement execute function private.community_editorial_signal_touch();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_editorial_signal') then
    alter publication supabase_realtime add table public.community_editorial_signal;
  end if;
end $$;
