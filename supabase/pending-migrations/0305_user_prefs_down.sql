-- Deshace 0305. Antes de borrar nada, devuelve las preferencias nuevas a user_ui_prefs (la tabla antigua), para que la app anterior las siga viendo.
insert into public.user_ui_prefs (user_id, prefs)
select user_id, jsonb_object_agg(key, value #>> '{}')
  from public.user_prefs
 where jsonb_typeof(value) = 'string'
 group by user_id
on conflict (user_id) do update
  set prefs = public.user_ui_prefs.prefs || excluded.prefs, updated_at = now();

drop trigger if exists user_ui_prefs_mirror on public.user_ui_prefs;
drop function if exists private.mirror_user_ui_prefs();

do $realtime$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_prefs') then
    alter publication supabase_realtime drop table public.user_prefs;
  end if;
end
$realtime$;

drop function if exists public.set_user_pref(text, jsonb, bigint);
drop function if exists private.user_pref_key_allowed(text);
drop table if exists public.user_prefs;
drop sequence if exists public.user_prefs_rev_seq;
