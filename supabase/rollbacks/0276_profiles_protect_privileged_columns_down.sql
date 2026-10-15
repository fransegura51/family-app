-- Deshace 0276: devuelve el permiso de actualizar todas las columnas (el comportamiento INSEGURO anterior). Solo para emergencias.
grant update on public.profiles to anon, authenticated;
drop policy if exists "profiles: update own row" on public.profiles;
create policy "profiles: update own row" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()));
grant insert, delete, truncate on public.profiles to anon, authenticated;
grant insert, delete, truncate on public.families to anon, authenticated;
drop trigger if exists family_members_check_link on public.family_members;
drop function if exists private.family_members_check_link();
