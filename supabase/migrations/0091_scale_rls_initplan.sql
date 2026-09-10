-- Preparación de escala, parte 2: políticas RLS evaluadas una vez por
-- consulta en vez de una vez por fila.
--
-- Las 71 políticas llaman las funciones auxiliares "a pelo":
--   family_id = private.current_family_id()
-- Esas funciones son STABLE SECURITY DEFINER (correcto), pero al ser
-- SECURITY DEFINER Postgres no puede "inlinearlas", y una llamada suelta
-- en el WHERE se vuelve a ejecutar para cada fila que la política
-- comprueba (cada una es un SELECT sobre profiles). Envuelta en un
-- subselect escalar —(select private.current_family_id())— el
-- planificador la convierte en un InitPlan: se ejecuta UNA vez por
-- sentencia y el resultado se reutiliza. Es la recomendación oficial
-- de Supabase para RLS ("Use (select auth.uid()) instead of auth.uid()"),
-- con mejoras de un orden de magnitud en tablas grandes.
--
-- Se hace de forma mecánica desde pg_policies (no a mano, 71 políticas
-- son demasiadas para no colarse un error): para cada política se
-- reescriben sus expresiones y se recrea idéntica salvo por el
-- envoltorio. Se envuelven solo las llamadas SIN argumentos de fila
-- (current_family_id, current_role_in_family, current_member_id,
-- has_section_access('x'), auth.uid()); member_in_current_family(
-- member_id) y place_in_current_family(place_id) dependen de la fila y
-- no ganan nada envueltas.
--
-- Idempotente: primero desenvuelve lo ya envuelto y luego envuelve, así
-- una segunda ejecución deja el mismo resultado.

create or replace function private.wrap_rls_expr(expr text) returns text
language sql immutable as $$
  select
    -- 2) envolver
    regexp_replace(
      replace(
        replace(
          replace(
            replace(unwrapped,
              'private.current_family_id()', '(select private.current_family_id())'),
            'private.current_role_in_family()', '(select private.current_role_in_family())'),
          'private.current_member_id()', '(select private.current_member_id())'),
        'auth.uid()', '(select auth.uid())'),
      -- has_section_access lleva argumento constante: capturarlo
      'private\.has_section_access\(([^)]*)\)',
      '(select private.has_section_access(\1))',
      'g'
    )
  from (
    -- 1) desenvolver lo ya envuelto (idempotencia). Postgres no soporta
    --    lookbehind en regex, así que se normaliza primero y se envuelve
    --    después, en vez de intentar "envolver solo lo no envuelto".
    select regexp_replace(
      replace(replace(replace(replace(replace(expr,
        '(select private.current_family_id())', 'private.current_family_id()'),
        '(select private.current_role_in_family())', 'private.current_role_in_family()'),
        '(select private.current_member_id())', 'private.current_member_id()'),
        '(select auth.uid())', 'auth.uid()'),
        '(SELECT auth.uid())', 'auth.uid()'),
      '\(select private\.has_section_access\(([^)]*)\)\)',
      'private.has_section_access(\1)',
      'g'
    ) as unwrapped
  ) s
$$;

do $$
declare
  p record;
  new_qual text;
  new_check text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  loop
    new_qual  := case when p.qual       is null then null else private.wrap_rls_expr(p.qual) end;
    new_check := case when p.with_check is null then null else private.wrap_rls_expr(p.with_check) end;

    -- Nada que cambiar: dejarla como está.
    if new_qual is not distinct from p.qual and new_check is not distinct from p.with_check then
      continue;
    end if;

    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);

    stmt := format('create policy %I on %I.%I as %s for %s to %s',
      p.policyname, p.schemaname, p.tablename,
      lower(p.permissive), lower(p.cmd),
      array_to_string(p.roles, ', '));
    if new_qual is not null then
      stmt := stmt || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;
    execute stmt;
  end loop;
end $$;

-- Solo hacía falta durante la migración.
drop function private.wrap_rls_expr(text);
