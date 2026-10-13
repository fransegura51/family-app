-- Sugerencias: «la dueña de la app» deja de ser una FAMILIA escrita a mano en las reglas y pasa a ser la PERSONA (profiles.is_app_owner, igual que el panel de
-- uso y los errores de la app).
--
-- Antes, cualquier cuenta de la familia dueña (por ejemplo un hijo al que se le diera cuenta) veía las sugerencias de TODAS las familias con su nombre, podía
-- cambiarles el estado y borrarlas. Ahora solo las cuentas marcadas como dueñas de la app. Para vender PEPA a otras familias, la familia dueña deja de ser
-- «especial»: es una familia más, y quien opera la app es una persona concreta.

create or replace function public.am_i_app_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_app_owner from public.profiles p where p.id = auth.uid()), false)
$$;
revoke execute on function public.am_i_app_owner() from public, anon;
grant execute on function public.am_i_app_owner() to authenticated;

drop policy "suggestions: cada familia ve las suyas, la dueña las ve todas" on public.suggestions;
create policy "suggestions: cada familia ve las suyas, la dueña las ve todas" on public.suggestions
  for select
  using (family_id = (select private.current_family_id()) or (select public.am_i_app_owner()));

drop policy "suggestions: retirar la propia o limpiar la dueña" on public.suggestions;
create policy "suggestions: retirar la propia o limpiar la dueña" on public.suggestions
  for delete
  using (family_id = (select private.current_family_id()) or (select public.am_i_app_owner()));

drop policy "suggestions: solo la dueña cambia el estado" on public.suggestions;
create policy "suggestions: solo la dueña cambia el estado" on public.suggestions
  for update
  using ((select public.am_i_app_owner()))
  with check ((select public.am_i_app_owner()));

-- El nombre de la familia que dejó una sugerencia: solo para la dueña de la app.
create or replace function public.get_family_name_for_suggestion(p_family_id uuid)
returns text
language sql
stable
security definer
set search_path = 'public'
as $$
  select name from families
  where id = p_family_id
    and public.am_i_app_owner()
$$;
