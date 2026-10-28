-- Deshace 0346: quita el disparador, la tabla de señal y su canal en vivo. No toca ningún elemento oficial.
drop trigger if exists community_official_items_signal on public.community_official_items;
drop function if exists private.community_editorial_signal_touch();
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_editorial_signal') then
    alter publication supabase_realtime drop table public.community_editorial_signal;
  end if;
end $$;
drop table if exists public.community_editorial_signal;
