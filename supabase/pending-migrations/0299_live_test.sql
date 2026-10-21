-- PRUEBA EN VIVO de la migración 0299 (NO ejecutada todavía: hace falta aplicar 0299 primero y tener permiso de escritura en la base de datos).
-- Se ejecuta de una vez (SQL editor o execute_sql). Crea datos de mentira DENTRO de una transacción y termina con un error a propósito
-- («PRUEBA_0299_OK…»), de modo que no queda NADA guardado. Si sale cualquier otro error, esa comprobación ha fallado: el mensaje dice cuál.
-- Qué demuestra:
--   1) change_own_pin: con el PIN actual mal NO cambia y SÍ cuenta el intento; con el bueno cambia; tras 5 fallos se bloquea.
--   2) clear_own_pin_with_pin: igual, y al quitar el PIN se borran las huellas.
--   3) reset_own_pin_after_recent_auth: con una sesión de hace horas se NIEGA; con una identificación de hace segundos quita el PIN y las huellas.
--   4) list_family_account_emails: la administradora ve los correos de su familia; una adulta solo el suyo; nadie ve los de OTRA familia.
do $test$
declare
  fam_a uuid := gen_random_uuid();
  fam_c uuid := gen_random_uuid();
  ua uuid := gen_random_uuid();   -- administradora de la familia A
  ub uuid := gen_random_uuid();   -- adulta de la familia A
  uc uuid := gen_random_uuid();   -- administradora de OTRA familia
  r text;
  n int;
  ok boolean;
  old_amr text;
  new_amr text;
begin
  insert into auth.users (id, email) values (ua, 'prueba-a@example.invalid'), (ub, 'prueba-b@example.invalid'), (uc, 'prueba-c@example.invalid');
  insert into families (id, name) values (fam_a, 'PRUEBA A'), (fam_c, 'PRUEBA C');
  insert into profiles (id, family_id, role, display_name) values (ua, fam_a, 'admin', 'A'), (ub, fam_a, 'adult', 'B'), (uc, fam_c, 'admin', 'C');

  old_amr := json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now() - interval '2 hours')::bigint))::text;
  new_amr := json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint))::text;

  -- ---- 1) cambiar el PIN
  perform set_config('request.jwt.claims', json_build_object('sub', ua::text, 'role', 'authenticated', 'amr', old_amr::json)::text, true);
  execute 'set local role authenticated';
  perform public.set_own_pin('1234');
  r := public.change_own_pin('0000', '5678');
  if r <> 'wrong_pin' then raise exception 'FALLO 1a: con el PIN actual mal debía devolver wrong_pin y devolvió %', r; end if;
  execute 'reset role';
  select failed_attempts into n from profile_locks where profile_id = ua;
  if n <> 1 then raise exception 'FALLO 1b: el intento fallido no se ha contado (failed_attempts=%)', n; end if;
  execute 'set local role authenticated';
  if public.verify_own_pin('5678') then raise exception 'FALLO 1c: el PIN nuevo no debía valer todavía'; end if;
  r := public.change_own_pin('1234', '5678');
  if r <> 'ok' then raise exception 'FALLO 1d: con el PIN actual bueno debía cambiar y devolvió %', r; end if;
  if not public.verify_own_pin('5678') then raise exception 'FALLO 1e: el PIN nuevo debía valer'; end if;
  if public.verify_own_pin('1234') then raise exception 'FALLO 1f: el PIN viejo ya no debía valer'; end if;
  begin
    perform public.change_own_pin('x', 'abc');
    raise exception 'FALLO 1g: un PIN nuevo con letras debía rechazarse';
  exception when others then
    if sqlerrm not like '%entre 4 y 6%' then raise; end if;
  end;
  -- bloqueo a los 5 fallos seguidos (ya hay 1 apuntado por el FALLO 1f de arriba: faltan 4)
  for i in 1..4 loop
    perform public.change_own_pin('0000', '1111');
  end loop;
  begin
    perform public.change_own_pin('5678', '1111');
    raise exception 'FALLO 1h: tras 5 fallos debía estar bloqueado (PIN_LOCKED)';
  exception when others then
    if sqlerrm <> 'PIN_LOCKED' then raise; end if;
  end;
  execute 'reset role';
  update profile_locks set failed_attempts = 0, locked_until = null where profile_id = ua;

  -- ---- 2) quitar el PIN con el PIN
  insert into profile_webauthn_credentials (profile_id, credential_id, public_key) values (ua, 'cred-prueba-1', 'pk');
  execute 'set local role authenticated';
  r := public.clear_own_pin_with_pin('0000');
  if r <> 'wrong_pin' then raise exception 'FALLO 2a: con el PIN mal debía devolver wrong_pin y devolvió %', r; end if;
  execute 'reset role';
  if not exists (select 1 from profile_locks where profile_id = ua and pin_hash is not null) then raise exception 'FALLO 2b: el PIN no debía haberse quitado'; end if;
  execute 'set local role authenticated';
  r := public.clear_own_pin_with_pin('5678');
  if r <> 'ok' then raise exception 'FALLO 2c: con el PIN bueno debía quitarse y devolvió %', r; end if;
  execute 'reset role';
  if exists (select 1 from profile_locks where profile_id = ua) then raise exception 'FALLO 2d: la fila del PIN debía desaparecer'; end if;
  if exists (select 1 from profile_webauthn_credentials where profile_id = ua) then raise exception 'FALLO 2e: las huellas debían borrarse con el PIN'; end if;

  -- ---- 3) recuperar el PIN con identificación reciente
  execute 'set local role authenticated';
  perform public.set_own_pin('2468');
  execute 'reset role';
  insert into profile_webauthn_credentials (profile_id, credential_id, public_key) values (ua, 'cred-prueba-2', 'pk');
  execute 'set local role authenticated';
  begin
    perform public.reset_own_pin_after_recent_auth();   -- sesión de hace 2 horas: debe negarse
    raise exception 'FALLO 3a: con una sesión antigua NO debía dejar recuperar el PIN';
  exception when others then
    if sqlerrm <> 'RECENT_AUTH_REQUIRED' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', ua::text, 'role', 'authenticated', 'amr', new_amr::json)::text, true);
  perform public.reset_own_pin_after_recent_auth();       -- identificación de hace segundos: debe dejar
  execute 'reset role';
  if exists (select 1 from profile_locks where profile_id = ua) then raise exception 'FALLO 3b: el PIN debía quitarse'; end if;
  if exists (select 1 from profile_webauthn_credentials where profile_id = ua) then raise exception 'FALLO 3c: las huellas debían invalidarse'; end if;
  -- sin ninguna marca de identificación (token raro): se niega
  perform set_config('request.jwt.claims', json_build_object('sub', ua::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.reset_own_pin_after_recent_auth();
    raise exception 'FALLO 3d: sin marca de identificación debía negarse';
  exception when others then
    if sqlerrm <> 'RECENT_AUTH_REQUIRED' then raise; end if;
  end;
  execute 'reset role';

  -- ---- 4) correos: aislamiento entre familias y por rol
  perform set_config('request.jwt.claims', json_build_object('sub', ua::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.list_family_account_emails();
  if n <> 2 then raise exception 'FALLO 4a: la administradora debía ver 2 correos (los de su familia) y vio %', n; end if;
  if exists (select 1 from public.list_family_account_emails() where email like 'prueba-c@%') then raise exception 'FALLO 4b: se ha visto el correo de OTRA familia'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ub::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.list_family_account_emails();
  if n <> 1 then raise exception 'FALLO 4c: una adulta debía ver solo el suyo y vio %', n; end if;
  if not exists (select 1 from public.list_family_account_emails() where profile_id = ub) then raise exception 'FALLO 4d: debía ver su propio correo'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uc::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.list_family_account_emails() where email like 'prueba-a@%' or email like 'prueba-b@%') then raise exception 'FALLO 4e: la administradora de otra familia ve correos ajenos'; end if;
  execute 'reset role';

  -- sin sesión: no hay nada que ver ni que cambiar
  execute 'set local role anon';
  begin
    perform public.list_family_account_emails();
    raise exception 'FALLO 4f: anon no debía poder ejecutar list_family_account_emails';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';

  raise exception 'PRUEBA_0299_OK: todas las comprobaciones han pasado (se revierte todo a propósito)';
end
$test$;
