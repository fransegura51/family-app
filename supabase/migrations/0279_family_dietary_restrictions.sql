-- ALERGIAS E INTOLERANCIAS DE CADA MIEMBRO DE LA FAMILIA (ficha PRIVADA) — DATOS DE SALUD (RGPD art. 9). Análisis: docs/comunidad/ALERGIAS_INTOLERANCIAS_ANALISIS.md.
--
-- Reglas de diseño (todas comprobadas por pruebas, ver db-tests/dietary.test.mjs y src/data/dietaryMigration.test.ts):
--   · TABLA APARTE: nunca columnas en family_members (la ficha la lee toda la familia, también niños e invitados).
--   · NADIE accede a las tablas directamente: se revoca TODO a public, anon, authenticated y service_role. La app solo usa las funciones dietary_* de abajo
--     (SECURITY DEFINER, search_path vacío, solo `authenticated`). Quitar también service_role es la barrera de base de datos contra las funciones de servidor
--     (IA, Comunidad, avisos): aunque alguien escribiera por error una consulta en una función de servidor, la base la rechazaría. Los borrados en cascada
--     (miembro, familia, cuenta) los ejecuta el PROPIETARIO de la tabla, no service_role, así que siguen funcionando (comprobado en la prueba).
--   · POR ROL REAL: administradoras y adultas leen y editan las de TODA su familia; una cuenta de niño o de invitado solo LEE las suyas y no puede escribir
--     (los menores los gestiona quien ejerce la patria potestad). Otra familia: nunca. Sin sesión: nunca. Las políticas RLS replican la misma regla como defensa
--     en profundidad (hoy no hay ningún permiso concedido, así que no se usan).
--   · CONSENTIMIENTO EXPRESO REGISTRADO (quién y cuándo) por persona antes de guardar nada; sin consentimiento activo la base rechaza el alta (también un trigger).
--     Revocarlo BORRA de verdad todas las restricciones de esa persona. La fila de consentimiento se conserva (solo dice quién y cuándo, nada de salud).
--   · SIN trigger de activity_log (lo lee toda la familia), sin Realtime, sin copia a Comunidad ni a ninguna función de IA.
--   · Las funciones NO lanzan error en los fallos esperados (devuelven {ok:false,error:'…'}): así ningún dato de salud entra en los registros de errores de
--     PostgreSQL ni en client_errors. Los fallos de restricciones se capturan dentro de la función para que el detalle de la fila no llegue a los registros.
--   · Al borrar el acceso de una persona («Borrar mi cuenta» → solo mi cuenta) se borra también lo registrado de su ficha (trigger sobre profiles); al borrar
--     el miembro o la familia, la cascada.

-- 1) Catálogo CERRADO de claves (única fuente en SQL; TypeScript: src/domain/dietaryRestrictions.ts, una prueba exige que coincidan).
create or replace function private.dietary_allergen_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'gluten', 'trigo', 'crustaceos', 'moluscos', 'huevo', 'pescado', 'cacahuete', 'soja', 'leche',
    'frutos_de_cascara', 'almendra', 'avellana', 'nuez', 'anacardo', 'pistacho', 'macadamia', 'pecana', 'nuez_de_brasil',
    'apio', 'mostaza', 'sesamo', 'sulfitos', 'altramuces',
    'lactosa', 'fructosa', 'gluten_no_celiaco'
  ]::text[]
$$;

-- Normaliza un texto libre para evitar duplicados («Kiwi», « kiwi », «KIWÍ»).
create or replace function private.dietary_norm(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(translate(lower(p), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'), '\s+', ' ', 'g'))
$$;

-- 2) Tablas privadas.
create table public.member_health_consent (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  notice_version text not null check (char_length(notice_version) between 1 and 40),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  check (revoked_at is null or revoked_at >= granted_at)
);
-- Como mucho UN consentimiento activo por persona (los revocados quedan como historial de quién y cuándo).
create unique index member_health_consent_one_active on public.member_health_consent (member_id) where revoked_at is null;
create index idx_member_health_consent_family on public.member_health_consent (family_id);

create table public.member_dietary_restrictions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  kind text not null check (kind in ('alergia', 'intolerancia', 'restriccion')),
  -- O una clave del catálogo cerrado, O un texto libre corto (nunca los dos).
  allergen_key text check (allergen_key = any (private.dietary_allergen_keys())),
  custom_label text check (custom_label is null or (char_length(custom_label) between 1 and 60 and custom_label = btrim(custom_label))),
  severity text check (severity in ('leve', 'moderada', 'grave')),
  note text check (note is null or (char_length(note) between 1 and 200 and note = btrim(note))),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((allergen_key is null) <> (custom_label is null))
);
create unique index member_dietary_restrictions_key_unique on public.member_dietary_restrictions (member_id, allergen_key) where allergen_key is not null;
create unique index member_dietary_restrictions_label_unique on public.member_dietary_restrictions (member_id, private.dietary_norm(custom_label)) where custom_label is not null;
create index idx_member_dietary_restrictions_family on public.member_dietary_restrictions (family_id);

alter table public.member_health_consent enable row level security;
alter table public.member_dietary_restrictions enable row level security;
-- NADIE (ni la app ni las funciones de servidor) toca estas tablas: solo las funciones dietary_* y las cascadas.
revoke all on public.member_health_consent from public, anon, authenticated, service_role;
revoke all on public.member_dietary_restrictions from public, anon, authenticated, service_role;

-- Defensa en profundidad: la misma regla por rol, por si un día se concediera lectura por error. Sin políticas de escritura (denegado siempre).
create policy "member_health_consent: read by role" on public.member_health_consent for select to authenticated
  using (family_id = (select private.current_family_id())
    and ((select private.current_role_in_family()) in ('admin', 'adult') or member_id = (select private.current_member_id())));
create policy "member_dietary_restrictions: read by role" on public.member_dietary_restrictions for select to authenticated
  using (family_id = (select private.current_family_id())
    and ((select private.current_role_in_family()) in ('admin', 'adult') or member_id = (select private.current_member_id())));

-- 3) Triggers de seguridad: sin consentimiento activo no entra nada; la familia debe ser la del miembro; tope por persona; no se cambia de dueña.
create or replace function private.dietary_restrictions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.family_members fm where fm.id = new.member_id and fm.family_id = new.family_id) then
      raise exception 'DIET_BAD_MEMBER';
    end if;
    if not exists (select 1 from public.member_health_consent c where c.member_id = new.member_id and c.revoked_at is null) then
      raise exception 'DIET_NO_CONSENT';
    end if;
    if (select count(*) from public.member_dietary_restrictions r where r.member_id = new.member_id) >= 40 then
      raise exception 'DIET_LIMIT';
    end if;
  else
    if new.member_id is distinct from old.member_id or new.family_id is distinct from old.family_id then
      raise exception 'DIET_IMMUTABLE';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger member_dietary_restrictions_guard before insert or update on public.member_dietary_restrictions
  for each row execute function private.dietary_restrictions_guard();

-- Revocar el consentimiento borra TODO lo registrado de esa persona, sea cual sea el camino.
create or replace function private.dietary_purge_on_revoke()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.member_dietary_restrictions where member_id = new.member_id;
  return new;
end;
$$;
create trigger member_health_consent_purge after update of revoked_at on public.member_health_consent
  for each row when (new.revoked_at is not null and old.revoked_at is null) execute function private.dietary_purge_on_revoke();

-- Al borrar el acceso de una persona se borra lo registrado de SU ficha (la ficha de familiar se queda, sin datos de salud).
create or replace function private.dietary_purge_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.member_dietary_restrictions r using public.family_members fm where fm.linked_profile_id = old.id and r.member_id = fm.id;
  delete from public.member_health_consent c using public.family_members fm where fm.linked_profile_id = old.id and c.member_id = fm.id;
  return old;
end;
$$;
create trigger dietary_purge_on_profile_delete before delete on public.profiles
  for each row execute function private.dietary_purge_on_profile_delete();

revoke all on function private.dietary_allergen_keys() from public, anon, authenticated, service_role;
revoke all on function private.dietary_norm(text) from public, anon, authenticated, service_role;
revoke all on function private.dietary_restrictions_guard() from public, anon, authenticated, service_role;
revoke all on function private.dietary_purge_on_revoke() from public, anon, authenticated, service_role;
revoke all on function private.dietary_purge_on_profile_delete() from public, anon, authenticated, service_role;
-- Las restricciones CHECK y los índices usan estas dos funciones con el rol de quien escribe (el propietario), no hace falta nada más.

-- 4) Funciones de la app. Todas devuelven jsonb {ok: true, …} o {ok: false, error: 'forbidden'|'not_found'|'no_consent'|'invalid'|'duplicate'|'limit'}.

-- Ver: administradoras y adultas todo lo de su familia; niño o invitado solo lo suyo (y sin poder escribir).
create or replace function public.dietary_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_role text;
  v_me uuid;
  v_manage boolean;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  v_role := private.current_role_in_family();
  v_me := private.current_member_id();
  v_manage := coalesce(v_role in ('admin', 'adult'), false);
  return jsonb_build_object(
    'ok', true,
    'can_manage', v_manage,
    'my_member_id', v_me,
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', c.member_id, 'granted_by', c.granted_by, 'granted_at', c.granted_at, 'notice_version', c.notice_version) order by c.granted_at)
      from public.member_health_consent c
      where c.family_id = v_family and c.revoked_at is null and (v_manage or c.member_id = v_me)), '[]'::jsonb),
    'restrictions', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'member_id', r.member_id, 'kind', r.kind, 'allergen_key', r.allergen_key, 'custom_label', r.custom_label,
        'severity', r.severity, 'note', r.note, 'created_at', r.created_at, 'updated_at', r.updated_at) order by r.created_at, r.id)
      from public.member_dietary_restrictions r
      where r.family_id = v_family and (v_manage or r.member_id = v_me)), '[]'::jsonb)
  );
end;
$$;

-- Dar el consentimiento expreso de UNA persona (lo da una administradora o adulta de la familia: la propia persona o quien ejerce la patria potestad).
create or replace function public.dietary_grant_consent(p_member_id uuid, p_notice_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_version text := btrim(coalesce(p_notice_version, ''));
  v_row public.member_health_consent;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  v_family := private.current_family_id();
  if v_family is null or coalesce(private.current_role_in_family() not in ('admin', 'adult'), true) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_member_id is null or not exists (select 1 from public.family_members fm where fm.id = p_member_id and fm.family_id = v_family) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if char_length(v_version) not between 1 and 40 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_row from public.member_health_consent c where c.member_id = p_member_id and c.revoked_at is null;
  if not found then
    insert into public.member_health_consent (family_id, member_id, notice_version, granted_by)
    values (v_family, p_member_id, v_version, (select auth.uid()))
    returning * into v_row;
  end if;
  return jsonb_build_object('ok', true, 'consent', jsonb_build_object('member_id', v_row.member_id, 'granted_by', v_row.granted_by, 'granted_at', v_row.granted_at, 'notice_version', v_row.notice_version));
end;
$$;

-- Retirar el consentimiento: BORRA de verdad todo lo registrado de esa persona.
create or replace function public.dietary_revoke_consent(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_deleted integer := 0;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  v_family := private.current_family_id();
  if v_family is null or coalesce(private.current_role_in_family() not in ('admin', 'adult'), true) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_member_id is null or not exists (select 1 from public.family_members fm where fm.id = p_member_id and fm.family_id = v_family) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  with d as (delete from public.member_dietary_restrictions r where r.member_id = p_member_id and r.family_id = v_family returning 1)
  select count(*) into v_deleted from d;
  update public.member_health_consent c set revoked_at = now(), revoked_by = (select auth.uid()) where c.member_id = p_member_id and c.revoked_at is null;
  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

-- Añadir una restricción (clave del catálogo O texto libre corto).
create or replace function public.dietary_add(p_member_id uuid, p_kind text, p_allergen_key text, p_custom_label text, p_severity text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_label text := nullif(regexp_replace(btrim(coalesce(p_custom_label, '')), '\s+', ' ', 'g'), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row public.member_dietary_restrictions;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  v_family := private.current_family_id();
  if v_family is null or coalesce(private.current_role_in_family() not in ('admin', 'adult'), true) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_member_id is null or not exists (select 1 from public.family_members fm where fm.id = p_member_id and fm.family_id = v_family) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not exists (select 1 from public.member_health_consent c where c.member_id = p_member_id and c.revoked_at is null) then
    return jsonb_build_object('ok', false, 'error', 'no_consent');
  end if;
  if p_kind is null or p_kind not in ('alergia', 'intolerancia', 'restriccion')
     or (p_allergen_key is null) = (v_label is null)
     or (p_allergen_key is not null and not (p_allergen_key = any (private.dietary_allergen_keys())))
     or (v_label is not null and char_length(v_label) > 60)
     or (p_severity is not null and p_severity not in ('leve', 'moderada', 'grave'))
     or (v_note is not null and char_length(v_note) > 200) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  begin
    insert into public.member_dietary_restrictions (family_id, member_id, kind, allergen_key, custom_label, severity, note, created_by)
    values (v_family, p_member_id, p_kind, p_allergen_key, v_label, p_severity, v_note, (select auth.uid()))
    returning * into v_row;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'duplicate');
    when check_violation then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    when raise_exception then
      return jsonb_build_object('ok', false, 'error', case sqlerrm when 'DIET_LIMIT' then 'limit' when 'DIET_NO_CONSENT' then 'no_consent' else 'invalid' end);
  end;
  return jsonb_build_object('ok', true, 'restriction', jsonb_build_object('id', v_row.id, 'member_id', v_row.member_id, 'kind', v_row.kind, 'allergen_key', v_row.allergen_key,
    'custom_label', v_row.custom_label, 'severity', v_row.severity, 'note', v_row.note, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at));
end;
$$;

-- Editar (sustituye tipo, gravedad y nota; el texto libre solo en las de texto libre). La clave del catálogo no se cambia: se borra y se añade otra.
create or replace function public.dietary_update(p_id uuid, p_kind text, p_custom_label text, p_severity text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_cur public.member_dietary_restrictions;
  v_label text := nullif(regexp_replace(btrim(coalesce(p_custom_label, '')), '\s+', ' ', 'g'), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row public.member_dietary_restrictions;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  v_family := private.current_family_id();
  if v_family is null or coalesce(private.current_role_in_family() not in ('admin', 'adult'), true) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into v_cur from public.member_dietary_restrictions r where r.id = p_id and r.family_id = v_family;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_kind is null or p_kind not in ('alergia', 'intolerancia', 'restriccion')
     or (v_cur.custom_label is not null and (v_label is null or char_length(v_label) > 60))
     or (p_severity is not null and p_severity not in ('leve', 'moderada', 'grave'))
     or (v_note is not null and char_length(v_note) > 200) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  begin
    update public.member_dietary_restrictions r
      set kind = p_kind,
          custom_label = case when r.custom_label is not null then v_label else null end,
          severity = p_severity,
          note = v_note
      where r.id = p_id
      returning * into v_row;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'duplicate');
    when check_violation then
      return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  return jsonb_build_object('ok', true, 'restriction', jsonb_build_object('id', v_row.id, 'member_id', v_row.member_id, 'kind', v_row.kind, 'allergen_key', v_row.allergen_key,
    'custom_label', v_row.custom_label, 'severity', v_row.severity, 'note', v_row.note, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at));
end;
$$;

create or replace function public.dietary_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_n integer;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  v_family := private.current_family_id();
  if v_family is null or coalesce(private.current_role_in_family() not in ('admin', 'adult'), true) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  with d as (delete from public.member_dietary_restrictions r where r.id = p_id and r.family_id = v_family returning 1)
  select count(*) into v_n from d;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dietary_list() from public, anon, service_role;
revoke all on function public.dietary_grant_consent(uuid, text) from public, anon, service_role;
revoke all on function public.dietary_revoke_consent(uuid) from public, anon, service_role;
revoke all on function public.dietary_add(uuid, text, text, text, text, text) from public, anon, service_role;
revoke all on function public.dietary_update(uuid, text, text, text, text) from public, anon, service_role;
revoke all on function public.dietary_delete(uuid) from public, anon, service_role;
grant execute on function public.dietary_list() to authenticated;
grant execute on function public.dietary_grant_consent(uuid, text) to authenticated;
grant execute on function public.dietary_revoke_consent(uuid) to authenticated;
grant execute on function public.dietary_add(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.dietary_update(uuid, text, text, text, text) to authenticated;
grant execute on function public.dietary_delete(uuid) to authenticated;

comment on table public.member_dietary_restrictions is 'DATOS DE SALUD (RGPD art. 9). Privada: sin permisos para nadie; solo funciones dietary_*. Sin activity_log, sin Realtime, sin IA, sin Comunidad.';
comment on table public.member_health_consent is 'Consentimiento expreso (quién y cuándo) para registrar datos de salud de una persona. No contiene datos de salud.';
