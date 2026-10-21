-- 0304 · Cada persona adulta edita SU ficha y la de sus hijos/as menores. SIN APLICAR en producción (necesita autorización).
--
-- Hasta ahora solo la administradora podía tocar fichas (política «family_members: admin update»), así que una madre/padre que no era administradora no podía poner
-- la fecha de nacimiento de su hijo/a ni cambiar su foto, y con la ficha incompleta tampoco podía darle acceso a PEPA.
--
-- Diseño: la política de la tabla NO se toca (sigue siendo solo de administración). Se añaden dos funciones SECURITY DEFINER con permisos muy acotados:
--  · update_member_card: nombre, color, fecha de nacimiento y sexo. NUNCA el tipo de ficha, ni las secciones permitidas, ni nada de invitaciones o enlaces.
--  · set_member_photo: foto de la ficha (la ruta debe estar dentro de la carpeta de la propia familia).
-- Quién puede usarlas (siempre dentro de su familia):
--  · La administradora: cualquier ficha (igual que hasta ahora).
--  · Una persona adulta (o administradora): SU propia ficha (la enlazada a su cuenta). La fecha de nacimiento propia no puede quedar vacía (decisión: obligatoria a todas las cuentas).
--  · Una madre/padre/tutor VIGENTE de un menor de 18 años (vínculo «Es mi hijo/a», 0300): la ficha de ese menor. La fecha nueva debe seguir siendo de menor de 18 años:
--    así nadie puede «hacer mayor de edad» a una ficha de menor (Comunidad PEPA calcula la edad con esta fecha).
--  · Niños e invitados con cuenta NO editan nada con estas funciones.
-- Deshacer: supabase/pending-migrations/0304_member_self_and_guardian_edit_down.sql (al aplicar, pasa a supabase/rollbacks y la migración a supabase/migrations).

create or replace function public.update_member_card(p_member uuid, p_name text, p_color text, p_birth_date date, p_sex text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text := private.current_role_in_family();
  v_fam uuid := private.current_family_id();
  m family_members%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null or v_fam is null or v_role is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into m from family_members where id = p_member and family_id = v_fam;
  if not found then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if length(v_name) < 1 or length(v_name) > 60 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'INVALID_COLOR' using errcode = '22023';
  end if;
  if p_sex is not null and p_sex not in ('female', 'male') then
    raise exception 'INVALID_SEX' using errcode = '22023';
  end if;
  if p_birth_date is not null and (p_birth_date > current_date or p_birth_date < date '1900-01-01') then
    raise exception 'INVALID_BIRTH_DATE' using errcode = '22023';
  end if;

  if v_role <> 'admin' then
    if m.linked_profile_id = auth.uid() then
      -- Su propia ficha: solo personas adultas, y la fecha de nacimiento no se puede dejar vacía.
      if v_role <> 'adult' then
        raise exception 'NOT_AUTHORIZED' using errcode = '42501';
      end if;
      if p_birth_date is null then
        raise exception 'BIRTH_DATE_REQUIRED' using errcode = '22023';
      end if;
    elsif private.is_active_guardian_of(p_member) then
      -- La ficha de su hijo/a menor: la fecha nueva debe seguir siendo de menor de 18 años.
      if p_birth_date is not null and p_birth_date <= (current_date - interval '18 years')::date then
        raise exception 'CHILD_MUST_BE_MINOR' using errcode = '22023';
      end if;
    else
      raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;
  end if;

  update family_members
     set name = v_name, color = p_color, birth_date = p_birth_date, sex = p_sex
   where id = p_member;
end;
$function$;

create or replace function public.set_member_photo(p_member uuid, p_photo_path text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text := private.current_role_in_family();
  v_fam uuid := private.current_family_id();
  m family_members%rowtype;
begin
  if auth.uid() is null or v_fam is null or v_role is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into m from family_members where id = p_member and family_id = v_fam;
  if not found then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  -- La foto debe estar guardada en la carpeta de la propia familia (así nadie apunta a archivos de otra).
  if p_photo_path is null or p_photo_path !~ ('^' || v_fam::text || '/[^/]+$') then
    raise exception 'INVALID_PHOTO_PATH' using errcode = '22023';
  end if;
  if v_role <> 'admin' then
    -- coalesce: una ficha sin cuenta tiene linked_profile_id nulo y, sin él, la comparación sería NULL y el «not» dejaría pasar a cualquiera.
    if not (coalesce(v_role = 'adult' and m.linked_profile_id = auth.uid(), false) or coalesce(private.is_active_guardian_of(p_member), false)) then
      raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;
  end if;
  update family_members set photo_path = p_photo_path where id = p_member;
end;
$function$;

revoke all on function public.update_member_card(uuid, text, text, date, text) from public, anon;
revoke all on function public.set_member_photo(uuid, text) from public, anon;
grant execute on function public.update_member_card(uuid, text, text, date, text) to authenticated;
grant execute on function public.set_member_photo(uuid, text) to authenticated;
