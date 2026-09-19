-- Preparación de escala, parte 3: las políticas RLS creadas DESPUÉS de la
-- 0091 (módulo Eventos, cuentas compartidas/privadas, tipos de alimento)
-- también evalúan las funciones auxiliares una vez por consulta.
--
-- Misma idea que 0091 (ver ese archivo): envolver las llamadas sin
-- argumentos de fila —current_family_id, current_role_in_family,
-- current_member_id, has_section_access('x'), auth.uid()— en un subselect
-- escalar para que Postgres las convierta en un InitPlan (una vez por
-- sentencia en vez de una vez por fila). Cambia SOLO la forma de escribir
-- la regla, no lo que permite.
--
-- Diferencias con 0091 (a propósito):
--  * Solo toca políticas que TODAVÍA tienen la llamada suelta y ninguna
--    envuelta. Las ~100 ya envueltas se dejan como están (pg_policies las
--    muestra como "( SELECT ... AS ...)": volver a envolverlas las dejaría
--    con un subselect doble inútil).
--  * Dos comprobaciones que anulan TODA la migración (es transaccional) si
--    algo no cuadra: que el número de políticas no cambie, y que no quede
--    ninguna con la llamada suelta.
--  * No envuelve current_accounts_mode() ni current_member_joined_at()
--    (fuera de alcance, igual que en 0091).
--
-- Comprobado antes de aplicarla: impersonando perfiles reales (solo
-- recuentos) y 0 filas visibles de otras familias.

create or replace function private.wrap_rls_expr(expr text) returns text
language sql immutable as $$
  select regexp_replace(
    replace(
      replace(
        replace(
          replace(expr,
            'private.current_family_id()', '(select private.current_family_id())'),
          'private.current_role_in_family()', '(select private.current_role_in_family())'),
        'private.current_member_id()', '(select private.current_member_id())'),
      'auth.uid()', '(select auth.uid())'),
    'private\.has_section_access\(([^)]*)\)',
    '(select private.has_section_access(\1))',
    'g'
  )
$$;

do $$
declare
  p record;
  new_qual text;
  new_check text;
  stmt text;
  before_count int;
  after_count int;
  still_loose int;
begin
  select count(*) into before_count from pg_policies where schemaname = 'public';

  for p in
    select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      -- tiene alguna llamada suelta...
      and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
          ~* 'private\.(current_family_id|current_role_in_family|current_member_id)\(\)'
      -- ...y ninguna envuelta todavía
      and not (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
          ~* '\(\s*select\s+private\.'
    order by tablename, policyname
  loop
    new_qual  := case when p.qual       is null then null else private.wrap_rls_expr(p.qual) end;
    new_check := case when p.with_check is null then null else private.wrap_rls_expr(p.with_check) end;

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

  select count(*) into after_count from pg_policies where schemaname = 'public';
  if after_count <> before_count then
    raise exception 'RLS: cambió el número de políticas (% -> %); se anula la migración', before_count, after_count;
  end if;

  -- Ninguna debe conservar una llamada suelta (tras quitar las envueltas).
  select count(*) into still_loose
  from pg_policies
  where schemaname = 'public'
    and regexp_replace(
          coalesce(qual, '') || ' ' || coalesce(with_check, ''),
          '\(\s*select\s+private\.(current_family_id|current_role_in_family|current_member_id)\(\)',
          '', 'gi')
        ~* 'private\.(current_family_id|current_role_in_family|current_member_id)\(\)';
  if still_loose > 0 then
    raise exception 'RLS: quedan % políticas con la llamada suelta; se anula la migración', still_loose;
  end if;
end $$;

-- Solo hacía falta durante la migración.
drop function private.wrap_rls_expr(text);
