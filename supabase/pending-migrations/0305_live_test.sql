-- Prueba EN VIVO de 0305 (después de aplicarla). Todo se DESHACE al final (termina con un error a propósito que enseña el resultado): no deja ninguna fila.
-- Nota: si la persona A ya tiene la clave del menú (por la copia inicial desde user_ui_prefs), la comprobación «2a primera vez» sale applied=false: es lo correcto (la fila existía) y la 2b usa la revisión vigente.
-- Se ejecuta en el editor SQL de Supabase. No toca datos reales: escribe preferencias de prueba bajo la identidad de dos personas existentes y lo revierte.
do $t$
declare
  v_res text := '';
  v_a uuid; v_b uuid;
  v_r record; v_err text; v_n int; v_rev1 bigint; v_rev2 bigint;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at desc limit 1;
  v_res := 'A=' || v_a || ' B=' || coalesce(v_b::text, '-') || E'\n';

  -- 1) objetos y permisos
  v_res := v_res || '1 funcion: auth=' || has_function_privilege('authenticated', 'public.set_user_pref(text, jsonb, bigint)', 'execute')
                 || ' anon=' || has_function_privilege('anon', 'public.set_user_pref(text, jsonb, bigint)', 'execute')
                 || ' tabla-select-anon=' || has_table_privilege('anon', 'public.user_prefs', 'select')
                 || ' tabla-insert-auth=' || has_table_privilege('authenticated', 'public.user_prefs', 'insert')
                 || ' rls=' || (select relrowsecurity from pg_class where oid = 'public.user_prefs'::regclass)
                 || ' realtime=' || exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'user_prefs') || E'\n';

  -- 2) A guarda, repite con la revisión buena, y con una antigua NO se aplica
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into v_r from public.set_user_pref('familyapp:tab-order:bottom-nav', '"prueba-1"'::jsonb, 0);
  v_rev1 := v_r.rev;
  v_res := v_res || '2a primera vez: applied=' || v_r.applied || E'\n';
  select * into v_r from public.set_user_pref('familyapp:tab-order:bottom-nav', '"prueba-2"'::jsonb, v_rev1);
  v_rev2 := v_r.rev;
  v_res := v_res || '2b con revision buena: applied=' || v_r.applied || ' rev sube=' || (v_rev2 > v_rev1) || E'\n';
  select * into v_r from public.set_user_pref('familyapp:tab-order:bottom-nav', '"prueba-antigua"'::jsonb, v_rev1);
  v_res := v_res || '2c con revision antigua: applied=' || v_r.applied || ' valor ganador=' || v_r.value::text || E'\n';

  -- 3) claves o valores no permitidos
  begin
    perform public.set_user_pref('familyapp:location-sharing-member-id', '"x"'::jsonb, 0);
    v_res := v_res || E'3a FALLO: clave ajena aceptada\n';
  exception when others then
    get stacked diagnostics v_err = message_text;
    v_res := v_res || '3a ok clave ajena: ' || v_err || E'\n';
  end;
  begin
    perform public.set_user_pref('familyapp:color-theme', '{"a":1}'::jsonb, 0);
    v_res := v_res || E'3b FALLO: valor no texto aceptado\n';
  exception when others then
    get stacked diagnostics v_err = message_text;
    v_res := v_res || '3b ok valor no texto: ' || v_err || E'\n';
  end;

  -- 4) escribir directamente en la tabla debe fallar
  begin
    insert into public.user_prefs (user_id, key, value) values (v_a, 'familyapp:color-theme', '"x"');
    v_res := v_res || E'4 FALLO: insercion directa permitida\n';
  exception when others then
    get stacked diagnostics v_err = message_text;
    v_res := v_res || '4 ok insercion directa: ' || v_err || E'\n';
  end;
  select count(*) into v_n from public.user_prefs;
  v_res := v_res || '4b A ve sus filas: ' || v_n || E'\n';
  reset role;

  -- 5) B no ve las filas de A
  if v_b is not null then
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.user_prefs where user_id = v_a;
    v_res := v_res || '5 B ve filas de A (debe ser 0): ' || v_n || E'\n';
    reset role;
  end if;

  raise exception 'RESULTADO (todo deshecho):%', E'\n' || v_res;
end
$t$;
