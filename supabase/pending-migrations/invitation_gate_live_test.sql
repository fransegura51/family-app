-- PRUEBA EN VIVO DE LA PUERTA POR INVITACIÓN (NO ejecutada todavía: hace falta permiso de escritura en la base de datos).
-- REQUISITO CRÍTICO: antes de desplegar CUALQUIER cambio de autenticación (y otra vez después) hay que ejecutarla y debe terminar con «PRUEBA_PUERTA_OK».
-- Se ejecuta de una vez (SQL editor o execute_sql). Crea datos de mentira DENTRO de una transacción y termina con un error a propósito, así que no queda NADA
-- guardado. Si sale cualquier otro error, esa comprobación ha fallado: el mensaje dice cuál. No toca datos reales ni el código maestro del Vault.
-- Qué demuestra:
--   1) Un login SIN invitación (sin perfil) no puede crear una familia: ni sin código, ni con uno equivocado (WRONGCODE), ni con uno caducado, ni con uno ya usado.
--   2) Con una invitación válida SÍ se crea la familia, y solo UNA vez: la segunda persona con el mismo código es rechazada.
--   3) Sin invitación de una ficha tampoco se puede entrar en una familia con join_family_with_code (código inventado o caducado); con el bueno, solo una vez.
--   4) Un login no puede insertar en profiles a mano (permiso retirado) ni crear familias directamente.
--   5) Administradoras de PEPA (is_app_owner) y de FAMILIA son distintas: solo las de PEPA generan invitaciones de familia nueva; las de familia solo códigos de las fichas de SU familia.
--   6) Las funciones nuevas de cuentas y seguridad (0299) no crean perfiles ni dan acceso a quien no tiene invitación.
--   7) (Con la 0302 aplicada) check_invitation no da por válido un código inventado y el gancho de alta rechaza un alta sin invitación o con una inventada.
do $test$
declare
  nb uuid[] := array(select gen_random_uuid() from generate_series(1, 6));  -- 6 logins SIN invitación (sin perfil)
  owner_id uuid := gen_random_uuid();      -- administradora DE PEPA (is_app_owner), en la familia A
  admin_a uuid := gen_random_uuid();       -- administradora de la familia A (NO de PEPA)
  adult_a uuid := gen_random_uuid();       -- adulta de la familia A
  admin_b uuid := gen_random_uuid();       -- administradora de OTRA familia
  fam_a uuid := gen_random_uuid();
  fam_b uuid := gen_random_uuid();
  member_a uuid := gen_random_uuid();      -- ficha sin cuenta de la familia A
  member_a2 uuid := gen_random_uuid();     -- otra ficha sin cuenta de la familia A
  member_b uuid := gen_random_uuid();      -- ficha de la familia B
  code_ok text := 'TESTOK01';
  code_expired text := 'TESTEXP1';
  code_used text := 'TESTUSE1';
  c text;
  r text;
  n int;
  fams_before int;
  profs_before int;
  fresh_amr text := json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint))::text;
begin
  -- ---- datos de mentira
  insert into auth.users (id, email)
    select u, 'prueba-puerta-' || i || '@example.invalid' from unnest(nb) with ordinality t(u, i);
  insert into auth.users (id, email) values
    (owner_id, 'prueba-puerta-owner@example.invalid'), (admin_a, 'prueba-puerta-admin-a@example.invalid'),
    (adult_a, 'prueba-puerta-adult-a@example.invalid'), (admin_b, 'prueba-puerta-admin-b@example.invalid');
  insert into families (id, name) values (fam_a, 'PRUEBA PUERTA A'), (fam_b, 'PRUEBA PUERTA B');
  insert into profiles (id, family_id, role, display_name, is_app_owner) values
    (owner_id, fam_a, 'admin', 'Owner PEPA', true), (admin_a, fam_a, 'admin', 'Admin A', false),
    (adult_a, fam_a, 'adult', 'Adulta A', false), (admin_b, fam_b, 'admin', 'Admin B', false);
  insert into family_members (id, family_id, name, member_type) values
    (member_a, fam_a, 'Ficha A', 'adult'), (member_a2, fam_a, 'Ficha A2', 'adult'), (member_b, fam_b, 'Ficha B', 'adult');
  insert into family_invites (code, created_by, note) values (code_ok, owner_id, 'prueba válido');
  insert into family_invites (code, created_by, note, expires_at) values (code_expired, owner_id, 'prueba caducado', now() - interval '1 day');
  insert into family_invites (code, created_by, note, used_at) values (code_used, owner_id, 'prueba usado', now());
  select count(*) into fams_before from families;
  select count(*) into profs_before from profiles;

  -- ---- 1) sin invitación válida NO se crea familia
  perform set_config('request.jwt.claims', json_build_object('sub', nb[1]::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach c in array array['', 'WRONGCODE', code_expired, code_used] loop
    begin
      perform public.create_family('F', 'Sin invitación', c, date '1990-01-01');
      raise exception 'FALLO 1a: con el código "%" (ausente, equivocado, caducado o usado) se pudo crear una familia SIN invitación válida', c;
    exception when others then
      if sqlerrm <> 'Código de acceso incorrecto' then raise; end if;
    end;
  end loop;
  execute 'reset role';
  select count(*) into n from profiles where id = nb[1];
  if n <> 0 then raise exception 'FALLO 1b: apareció un perfil para un login sin invitación'; end if;
  select count(*) into n from families;
  if n <> fams_before then raise exception 'FALLO 1c: se creó una familia sin invitación válida'; end if;

  -- ---- 2) con invitación válida SÍ, y solo una vez
  perform set_config('request.jwt.claims', json_build_object('sub', nb[2]::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.create_family('F', 'Con invitación', code_ok, date '1990-01-01');
  execute 'reset role';
  if not exists (select 1 from profiles where id = nb[2] and role = 'admin') then raise exception 'FALLO 2a: la invitación válida no creó la familia'; end if;
  if not exists (select 1 from family_invites where code = code_ok and used_at is not null and used_by_family is not null) then raise exception 'FALLO 2b: la invitación no se marcó como usada'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', nb[3]::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.create_family('F', 'Reutiliza', code_ok, date '1990-01-01');
    raise exception 'FALLO 2c: una invitación ya usada volvió a valer';
  exception when others then
    if sqlerrm <> 'Código de acceso incorrecto' then raise; end if;
  end;
  execute 'reset role';

  -- ---- 3) unirse a una familia: sin código de una ficha, no
  perform set_config('request.jwt.claims', json_build_object('sub', nb[4]::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.join_family_with_code('ZZZZZZZZ', 'Sin código', date '1990-01-01');
    raise exception 'FALLO 3a: un código inventado dejó unirse a una familia';
  exception when others then
    if sqlerrm <> 'Código no válido o caducado' then raise; end if;
  end;
  execute 'reset role';
  update family_members set invite_code = 'MEMBEXP1', invite_code_expires_at = now() - interval '1 hour' where id = member_a;
  execute 'set local role authenticated';
  begin
    perform public.join_family_with_code('MEMBEXP1', 'Caducado', date '1990-01-01');
    raise exception 'FALLO 3b: un código de ficha caducado dejó unirse';
  exception when others then
    if sqlerrm <> 'Código no válido o caducado' then raise; end if;
  end;
  execute 'reset role';
  select count(*) into n from profiles where id = nb[4];
  if n <> 0 then raise exception 'FALLO 3c: apareció un perfil sin código válido'; end if;
  update family_members set invite_code = 'MEMBOK01', invite_code_expires_at = now() + interval '24 hours' where id = member_a;
  execute 'set local role authenticated';
  perform public.join_family_with_code('MEMBOK01', 'Con código', date '1990-01-01');
  execute 'reset role';
  if not exists (select 1 from profiles p join family_members m on m.linked_profile_id = p.id where p.id = nb[4] and m.id = member_a) then raise exception 'FALLO 3d: el código válido no enlazó la cuenta a su ficha'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', nb[5]::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.join_family_with_code('MEMBOK01', 'Reutiliza', date '1990-01-01');
    raise exception 'FALLO 3e: un código de ficha ya usado volvió a valer';
  exception when others then
    if sqlerrm <> 'Código no válido o caducado' then raise; end if;
  end;

  -- ---- 4) un login no puede darse de alta a mano
  begin
    insert into profiles (id, family_id, role, display_name) values (nb[5], fam_a, 'admin', 'A mano');
    raise exception 'FALLO 4a: un login pudo insertar un perfil a mano';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into families (name) values ('A mano');
    raise exception 'FALLO 4b: un login pudo crear una familia a mano';
  exception when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FALLO%' then raise; end if;   -- cualquier otro rechazo (política de filas) también vale
  end;
  execute 'reset role';

  -- ---- 5) administradoras de PEPA y de familia
  perform set_config('request.jwt.claims', json_build_object('sub', admin_a::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.generate_family_invite('no debería poder');
    raise exception 'FALLO 5a: una administradora de FAMILIA (no de PEPA) generó una invitación de familia nueva';
  exception when others then
    if sqlerrm <> 'Solo la dueña de la app puede generar códigos' then raise; end if;
  end;
  begin
    perform public.generate_member_invite_code(member_b);   -- ficha de OTRA familia
    raise exception 'FALLO 5b: una administradora generó un código para una ficha de OTRA familia';
  exception when others then
    if sqlerrm <> 'Miembro no encontrado' then raise; end if;
  end;
  r := public.generate_member_invite_code(member_a2);       -- ficha de SU familia: sí
  if r is null or length(r) <> 8 then raise exception 'FALLO 5c: la administradora de familia debía poder generar el código de una ficha suya'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', adult_a::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.generate_member_invite_code(member_a2);
    raise exception 'FALLO 5d: una adulta sin ser administradora generó un código';
  exception when others then
    if sqlerrm <> 'Solo el administrador puede generar códigos' then raise; end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.generate_family_invite('prueba dueña');        -- administradora DE PEPA: sí
  if r is null or length(r) <> 8 then raise exception 'FALLO 5e: la administradora de PEPA debía poder generar una invitación'; end if;
  execute 'reset role';

  -- ---- 6) lo nuevo (0299) no crea perfiles ni da acceso a quien no tiene invitación
  perform set_config('request.jwt.claims', json_build_object('sub', nb[6]::text, 'role', 'authenticated', 'amr', fresh_amr::json)::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.list_family_account_emails();
  if n <> 0 then raise exception 'FALLO 6a: un login sin perfil vio correos (%)', n; end if;
  if public.change_own_pin('0000', '1234') <> 'no_pin' then raise exception 'FALLO 6b: change_own_pin debía responder no_pin a quien no tiene PIN'; end if;
  perform public.reset_own_pin_after_recent_auth();           -- identificación reciente: no debe crear nada
  execute 'reset role';
  select count(*) into n from profiles where id = nb[6];
  if n <> 0 then raise exception 'FALLO 6c: una función de cuentas y seguridad creó un perfil'; end if;

  -- ---- 7) (solo si ya está aplicada la 0302) primero la invitación: la comprobación pública y el gancho de alta
  if to_regprocedure('public.check_invitation(text)') is not null then
    execute 'set local role anon';
    if (public.check_invitation('ZZZZZZZZZZ') ->> 'valid') <> 'false' then raise exception 'FALLO 7a: check_invitation dio por válido un código inventado'; end if;
    if (public.check_invitation('') ->> 'valid') <> 'false' then raise exception 'FALLO 7b: check_invitation dio por válido un código vacío'; end if;
    execute 'reset role';
    if (public.hook_before_user_created('{"user":{"email":"sin-codigo@example.invalid","app_metadata":{"provider":"email"},"user_metadata":{}}}'::jsonb) -> 'error' ->> 'message') not like 'INVITATION_REQUIRED%' then
      raise exception 'FALLO 7c: el gancho de alta dejó pasar un alta sin invitación';
    end if;
    if (public.hook_before_user_created('{"user":{"email":"inventado@example.invalid","app_metadata":{"provider":"email"},"user_metadata":{"invite_code":"ZZZZZZZZZZ"}}}'::jsonb) -> 'error' ->> 'message') not like 'INVITATION_INVALID%' then
      raise exception 'FALLO 7d: el gancho de alta dejó pasar un alta con una invitación inventada';
    end if;
  end if;

  raise exception 'PRUEBA_PUERTA_OK: sin invitación válida no se crea familia ni se entra en una; solo las administradoras de PEPA generan invitaciones nuevas (se revierte todo a propósito)';
end
$test$;
