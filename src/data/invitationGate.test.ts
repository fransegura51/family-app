// REQUISITO CRÍTICO (20/10/2026): PEPA sigue siendo PRIVADA. Nadie crea una cuenta, una familia ni se une a una sin una invitación válida, hasta que se decida comercializarla.
// Estas pruebas bloquean la puerta: fallan si alguien abre otro camino de alta, debilita una comprobación o mezcla los tipos de invitación. Sustituyen a las de «puerta sin tocar»:
// la puerta se ha REFORZADO con autorización (primero la invitación, bloqueo de uso simultáneo, reserva por correo, rol de la ficha) y estas pruebas fijan el nuevo estado.
// El SQL se prueba de verdad (con datos) en supabase/local-sql-tests (PostgreSQL local) y la prueba EN VIVO está en supabase/pending-migrations/invitation_gate_live_test.sql.
//
// Dos tipos de invitación, que no se mezclan:
//  · «familia nueva»: la genera SOLO una administradora de PEPA (profiles.is_app_owner, family_invites). Autoriza crear un espacio familiar.
//  · «familiar»: vincula una cuenta a una FICHA existente. La genera la administradora de ESA familia o una madre/padre vinculado (solo para su hijo menor).
// El código de 6 cifras del correo es otra cosa: confirma un correo, no da familia y no sustituye a ninguna invitación.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { INVITATION_SAMPLE, INVITATION_TEMPLATES, LOGO_URL, renderInvitation } from '../../scripts/build-email-templates.mjs'

const root = path.resolve(__dirname, '../..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
const stripComments = (sql: string) => sql.replace(/^\s*--.*$/gm, '')
const slice = (s: string, from: string, to?: string) => {
  const a = s.indexOf(from)
  expect(a, `no se encontró «${from}»`).toBeGreaterThan(-1)
  const b = to ? s.indexOf(to, a + from.length) : s.length
  expect(b).toBeGreaterThan(a)
  return s.slice(a, b)
}

const GATE_FUNCTION_FILES = [
  '0002_create_family_bootstrap.sql',
  '0003_harden_create_family_grants.sql',
  '0032_member_invite_codes.sql',
  '0033_restrict_invite_code_functions.sql',
  '0067_family_signup_access_code.sql',
  '0070_guest_users.sql',
  '0093_family_invites.sql',
  '0094_revoke_anon_create_family.sql',
  '0097_child_section_restrictions.sql',
  '0117_seed_new_families_from_template.sql',
  '0118_seed_new_families_product_classifications.sql',
  '0131_fix_create_family_delete_no_where.sql',
  '0141_catalog_link_families.sql',
  '0217_join_family_code_mismatch_hint.sql',
  '0286_signup_birth_date_required.sql',
  '0294_invitation_hardening.sql',
]
const INSERT_PROFILES_FILES = [
  '0002_create_family_bootstrap.sql',
  '0032_member_invite_codes.sql',
  '0067_family_signup_access_code.sql',
  '0070_guest_users.sql',
  '0093_family_invites.sql',
  '0097_child_section_restrictions.sql',
  '0117_seed_new_families_from_template.sql',
  '0118_seed_new_families_product_classifications.sql',
  '0131_fix_create_family_delete_no_where.sql',
  '0141_catalog_link_families.sql',
  '0217_join_family_code_mismatch_hint.sql',
  '0286_signup_birth_date_required.sql',
  '0294_invitation_hardening.sql',
]

describe('base de datos: solo estos archivos definen la puerta y crean perfiles (cualquier otro camino hace fallar la prueba)', () => {
  it('ninguna migración fuera de la lista redefine create_family, join_family_with_code, generate_family_invite ni generate_member_invite_code', () => {
    const files = migrations.filter((f) => /function public\.(create_family|join_family_with_code|generate_family_invite|generate_member_invite_code)\b/.test(read(`supabase/migrations/${f}`)))
    expect(files).toEqual(GATE_FUNCTION_FILES)
  })
  it('solo esas migraciones insertan en profiles (única forma de tener perfil) y solo 0093 inserta invitaciones de familia nueva', () => {
    expect(migrations.filter((f) => /insert into (public\.)?profiles\b/i.test(stripComments(read(`supabase/migrations/${f}`))))).toEqual(INSERT_PROFILES_FILES)
    expect(migrations.filter((f) => /insert into (public\.)?family_invites\b/i.test(stripComments(read(`supabase/migrations/${f}`))))).toEqual(['0093_family_invites.sql'])
  })
  it('el cliente no puede insertar en profiles ni crear familias a mano (0276) ni ejecutar las funciones de alta sin sesión', () => {
    expect(read('supabase/migrations/0276_profiles_protect_privileged_columns.sql')).toContain('revoke insert, delete, truncate on public.profiles from anon, authenticated;')
    expect(read('supabase/migrations/0276_profiles_protect_privileged_columns.sql')).toContain('revoke insert, delete, truncate on public.families from anon, authenticated;')
    expect(read('supabase/migrations/0286_signup_birth_date_required.sql')).toContain('revoke all on function public.create_family(text, text, text, date) from public, anon;')
    expect(read('supabase/migrations/0286_signup_birth_date_required.sql')).toContain('revoke all on function public.join_family_with_code(text, text, date) from public, anon;')
  })
})

describe('crear una familia nueva (0294): misma puerta, más firme', () => {
  const sql = read('supabase/migrations/0294_invitation_hardening.sql')
  const fn = slice(sql, 'create or replace function public.create_family(')
  it('conserva firma y mensajes; exige sesión, fecha de nacimiento válida y que quien crea la familia sea mayor de edad', () => {
    expect(fn).toContain('create or replace function public.create_family(p_family_name text, p_display_name text, p_access_code text, p_birth_date date default null)')
    expect(fn).toContain("raise exception 'No autenticado';")
    expect(fn).toContain('BIRTH_DATE_REQUIRED')
    expect(fn).toContain('BIRTH_DATE_INVALID')
    expect(fn).toContain('ADULT_REQUIRED')
  })
  it('sin código maestro ni invitación vigente y sin usar → «Código de acceso incorrecto», ANTES de crear nada', () => {
    expect(fn).toContain("where code = v_invite_code and used_at is null and expires_at > now()")
    expect(fn).toContain("raise exception 'Código de acceso incorrecto';")
    expect(fn.indexOf("raise exception 'Código de acceso incorrecto';")).toBeLessThan(fn.indexOf('insert into families'))
    expect(fn).toContain('v_expected_code is not null and p_access_code = v_expected_code') // código maestro, como antes
  })
  it('la invitación se BLOQUEA al leerla (dos personas a la vez no pueden usar la misma), respeta la reserva por correo y se gasta al terminar', () => {
    expect(fn).toMatch(/where code = v_invite_code and used_at is null and expires_at > now\(\)\s*for update;/)
    expect(fn).toContain('private.invitation_reserved_for_other(v_email, v_inv.reserved_email, v_inv.reserved_until)')
    expect(fn).toContain('update family_invites set used_by_family = v_family_id, used_at = now(), reserved_email = null, reserved_until = null where code = v_used_invite;')
  })
})

describe('unirse a una familia (0294): rol y secciones de la ficha, fecha de la ficha, bloqueo y reserva', () => {
  const sql = read('supabase/migrations/0294_invitation_hardening.sql')
  const fn = slice(sql, 'create or replace function public.join_family_with_code(', 'create or replace function public.create_family(')
  it('solo con el código vigente de una ficha SIN cuenta, bloqueado al leerlo, con la reserva por correo y sin bebés', () => {
    expect(fn).toContain('where invite_code = v_code')
    expect(fn).toContain('and invite_code_expires_at > now()')
    expect(fn).toContain('and linked_profile_id is null')
    expect(fn).toMatch(/linked_profile_id is null\s*for update;/)
    expect(fn).toContain('private.invitation_reserved_for_other(v_email, m.invite_reserved_email, m.invite_reserved_until)')
    expect(fn).toContain("if m.member_type = 'baby' then")
    expect(fn).toContain("raise exception 'Código no válido o caducado';")
  })
  it('conserva el aviso de «este código es para crear una familia nueva»', () => {
    expect(fn).toContain('Este código es para crear una familia nueva')
  })
  it('el rol y las secciones salen de la FICHA (admin, invitado, niño o adulto), no de lo que escriba la persona', () => {
    expect(fn).toMatch(/when 'admin' then 'admin'\s*when 'guest' then 'guest'\s*when 'child' then 'child'\s*else 'adult'/)
    expect(fn).toContain('insert into profiles (id, family_id, role, display_name, allowed_sections)')
    expect(fn).toContain('values (v_user_id, m.family_id, v_role, p_display_name, m.allowed_sections);')
    expect(fn).not.toMatch(/v_role\s*:=\s*[^;]*p_/) // el rol nunca depende de un parámetro
  })
  it('la fecha de la ficha manda; un niño exige fecha en la ficha; una cuenta de adulto no se crea con fecha de menor', () => {
    expect(fn).toContain('v_birth := coalesce(m.birth_date, p_birth_date);')
    expect(fn).toContain("if m.member_type = 'child' and m.birth_date is null then")
    expect(fn).toContain('BIRTH_DATE_REQUIRED_ON_PROFILE')
    expect(fn).toContain("if m.member_type in ('admin', 'adult') and v_birth > (current_date - interval '18 years')::date then")
    expect(fn).toContain('ADULT_REQUIRED')
  })
  it('al terminar, la ficha queda enlazada, el código gastado y la reserva limpia', () => {
    expect(fn).toContain('set linked_profile_id = v_user_id, invite_code = null, invite_code_expires_at = null')
    expect(fn).toContain('invite_reserved_email = null, invite_reserved_until = null')
  })
})

describe('«Dar acceso a PEPA» (0294): quién puede, a quién y cómo', () => {
  const sql = read('supabase/migrations/0294_invitation_hardening.sql')
  const fn = slice(sql, 'create or replace function public.create_member_invitation(', 'create or replace function public.join_family_with_code(')
  it('la administradora de la familia (como hasta ahora) o una madre/padre VINCULADO solo para la ficha de su hijo menor; el servidor lo decide, no el botón', () => {
    expect(fn).toContain("if v_role = 'admin' then")
    expect(fn).toContain("elsif v_role = 'adult' and m.member_type = 'child' and private.is_active_guardian_of(m.id) then")
    expect(fn).toContain("raise exception 'NOT_AUTHORIZED';")
    expect(fn).toContain('where id = p_member_id and family_id = v_family for update')
  })
  it('no sirve para fichas con cuenta, ni bebés, y un niño exige fecha de nacimiento en su ficha', () => {
    expect(fn).toContain('Ese miembro ya tiene una cuenta')
    expect(fn).toContain("if m.member_type = 'baby' then")
    expect(fn).toContain('MEMBER_NOT_INVITABLE')
    expect(fn).toContain("if m.member_type = 'child' and m.birth_date is null then")
  })
  it('reutiliza la invitación vigente (no duplica), caduca a las 24 h y es de un solo uso (se gasta en join_family_with_code)', () => {
    expect(fn).toContain('if m.invite_code is not null and m.invite_code_expires_at > now() and not coalesce(p_regenerate, false) then')
    expect(fn).toContain("invite_code_expires_at = now() + interval '24 hours'")
  })
  it('solo para personas con sesión; nada para anon', () => {
    expect(sql).toContain('revoke all on function public.create_member_invitation(uuid, boolean) from public, anon;')
    expect(sql).toContain('grant execute on function public.create_member_invitation(uuid, boolean) to authenticated;')
  })
  it('las columnas del código y del enlace con la cuenta ya no se escriben desde la app, ni siquiera siendo administradora (disparador)', () => {
    expect(sql).toContain("if current_user in ('authenticated', 'anon') then")
    expect(sql).toContain('create trigger family_members_protect_invitation_columns')
    expect(sql).toContain('before insert or update on public.family_members')
  })
  it('las invitaciones de familia nueva siguen siendo SOLO de las administradoras de PEPA, y las de ficha de la administradora de ESA familia (funciones antiguas intactas)', () => {
    const invites = read('supabase/migrations/0093_family_invites.sql')
    expect(slice(invites, 'create or replace function public.generate_family_invite(')).toContain('from profiles where id = auth.uid() and is_app_owner')
    const member = read('supabase/migrations/0032_member_invite_codes.sql')
    expect(member).toContain("private.current_role_in_family() <> 'admin'")
    expect(member).toContain('v_family_id <> private.current_family_id()')
  })
})

describe('primero la invitación, después la cuenta (0295 y pantalla de entrada)', () => {
  const sql = read('supabase/migrations/0295_signup_gate_invitation_first.sql')
  const login = read('src/ui/LoginScreen.tsx')

  it('check_invitation es pública (la usa quien aún no tiene cuenta) y limitada por IP, y solo devuelve si vale, el tipo, la caducidad y si pedir la fecha', () => {
    const fn = slice(sql, 'create or replace function public.check_invitation(', 'create or replace function public.hook_before_user_created(')
    expect(fn).toContain("private.invitation_throttle('check:' || v_ip, 30)")
    expect(fn).toContain("'throttled', true")
    const keys = [...fn.matchAll(/jsonb_build_object\(([^;]*?)\)/g)].flatMap((m) => [...m[1].matchAll(/'([a-z_]+)'(?=\s*,)/g)].map((k) => k[1]))
    // («family» y «member» son los VALORES posibles de «kind», no claves.)
    expect(new Set(keys.filter((k) => k !== 'family' && k !== 'member'))).toEqual(new Set(['valid', 'throttled', 'kind', 'expires_at', 'needs_birth_date']))
    for (const secret of ['family_id', 'name', 'display_name', 'email', 'linked_profile_id', 'used_by_family', 'created_by', 'birth_date,']) {
      expect(fn.slice(fn.indexOf('jsonb_build_object')), secret).not.toMatch(new RegExp(`'${secret.replace(',', '')}'\\s*,`))
    }
    expect(sql).toContain('grant execute on function public.check_invitation(text) to anon, authenticated;')
  })
  it('el gancho de Supabase Auth rechaza TODA alta sin invitación válida (anónima, con proveedor externo, sin código, inventado, caducado o usada) y reserva la válida para ese correo', () => {
    const fn = slice(sql, 'create or replace function public.hook_before_user_created(', 'revoke all on function public.hook_before_user_created')
    expect(fn).toContain("v_provider <> 'email'")
    expect(fn).toContain("(v_user ->> 'is_anonymous')")
    expect(fn).toContain("if v_code = '' then")
    expect((fn.match(/INVITATION_(REQUIRED|INVALID|IN_USE)/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(fn).toContain('used_at is null and expires_at > now() for update')
    expect(fn).toContain("invite_code_expires_at > now() and linked_profile_id is null and member_type <> 'baby' for update")
    expect(fn).toContain("reserved_until = now() + interval '2 hours'")
    // El gancho NO gasta la invitación: la gasta create_family / join_family_with_code al terminar.
    expect(fn).not.toMatch(/used_at\s*=\s*now\(\)/)
    // Termina rechazando por defecto.
    expect(fn.trimEnd().endsWith("'INVITATION_INVALID: La invitación no es válida o ha caducado'))\nend;\n$function$;") || fn.includes("return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'INVITATION_INVALID")).toBe(true)
  })
  it('el gancho solo lo ejecuta Supabase Auth; la app no puede llamarlo', () => {
    expect(sql).toContain('revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;')
    expect(sql).toContain('grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;')
    expect(sql).not.toMatch(/grant execute on function public\.hook_before_user_created[^;]*(authenticated|anon)/)
  })
  it('esta migración NO activa el gancho ni cambia la configuración de Supabase, y la limpieza de huérfanos no se programa sola ni es llamable desde la app', () => {
    const code = stripComments(sql)
    expect(code).not.toMatch(/cron\.schedule|auth\.config|set_config\('auth\./i)
    expect(sql).toContain('revoke all on function private.purge_orphan_logins(interval) from public, anon, authenticated;')
    expect(slice(sql, 'create or replace function private.purge_orphan_logins(')).toContain('and not exists (select 1 from public.profiles p where p.id = u.id)')
  })
  it('la pantalla de entrada pide la invitación ANTES del formulario de cuenta y la valida en el servidor sin gastarla', () => {
    expect(login).toContain("type Mode = 'signin' | 'invite' | 'signup' | 'signup-code' | 'reset' | 'reset-code'")
    expect(login).toContain('const res = await checkInvitation(normalized)')
    expect(login).toContain("goTo('signup')")
    // El formulario de crear cuenta solo existe con una invitación ya validada; sin ella vuelve a pedirla.
    const signUpBranch = slice(login, "      // Mode «signup»: solo se llega aquí con una invitación ya validada.", 'if (!error) forgetSignupOrigin()')
    expect(signUpBranch).toContain('if (!invitation) {')
    expect(signUpBranch).toContain("goTo('invite')")
    expect(signUpBranch).toContain('invite_code: invitation.code')
    expect(login.indexOf('checkInvitation(normalized)')).toBeLessThan(login.indexOf('supabase.auth.signUp('))
  })
  it('quien llega de la demo o de un enlace de invitación entra en «Tengo una invitación», nunca directo en crear cuenta', () => {
    expect(login).toContain("(linkedCode || parseSignupOrigin(window.location.search) ? 'invite' : 'signin')")
    expect(login).not.toMatch(/\? 'signup' : 'signin'/)
  })
  it('el código de 6 cifras del correo y la invitación son procesos distintos: variables, funciones y casillas separadas', () => {
    expect(login).toContain('await verifySignupCode(email, code)')
    expect(login).toContain('<OtpCodeField')
    expect(login).toContain('checkInvitation(normalized)')
    expect(login).not.toContain('verifySignupCode(email, inviteCode)')
    expect(login).not.toMatch(/checkInvitation\(code\)/)
    expect(login).toContain('Código de invitación')
  })
})

describe('los flujos de acceso no son un camino de alta sin invitación', () => {
  const srcFiles: string[] = []
  function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) srcFiles.push(p)
    }
  }
  walk(path.join(root, 'src'))
  walk(path.join(root, 'supabase/functions'))
  const rel = (p: string) => path.relative(root, p).replace(/\\/g, '/')
  // Sin los comentarios de línea entera (hablan de signUp() y compañía sin llamarlo).
  const withText = srcFiles.map((p) => ({ file: rel(p), text: fs.readFileSync(p, 'utf8').replace(/^\s*\/\/.*$/gm, '') }))

  it('el único signUp de toda la app es el de la pantalla de entrada, y nadie crea usuarios por otra vía', () => {
    expect(withText.filter((f) => /auth\.signUp\(/.test(f.text)).map((f) => f.file)).toEqual(['src/ui/LoginScreen.tsx'])
    for (const banned of ['auth.admin.createUser', 'inviteUserByEmail', 'generateLink', 'signInAnonymously', 'signInWithOAuth', 'signInWithIdToken', 'signInWithSSO']) {
      expect(withText.filter((f) => f.text.includes(banned)).map((f) => f.file), banned).toEqual([])
    }
  })
  it('todo código de acceso por correo (signInWithOtp) lleva shouldCreateUser: false: no puede crear cuentas', () => {
    const uses = withText.filter((f) => f.text.includes('signInWithOtp'))
    expect(uses.map((f) => f.file)).toEqual(['src/data/account.ts'])
    expect(uses[0].text).toMatch(/signInWithOtp\(\{ email: normalizeEmail\(email\), options: \{ shouldCreateUser: false \} \}\)/)
    expect((uses[0].text.match(/signInWithOtp/g) ?? []).length).toBe(1)
  })
  it('recuperar contraseña, cambiar correo y recuperar PIN solo actúan sobre cuentas que ya existen', () => {
    const account = read('src/data/account.ts')
    expect(account).toContain('supabase.auth.resetPasswordForEmail(')
    expect(account).toContain('supabase.auth.updateUser(')
    expect(account).not.toMatch(/\.from\(/)
    for (const f of ['src/data/account.ts', 'src/data/appLock.ts']) {
      expect(read(f), f).not.toMatch(/rpc\('(create_family|join_family_with_code|generate_family_invite|generate_member_invite_code|create_member_invitation|declare_guardianship)'/)
    }
  })
  it('crear familia y unirse con código solo se llaman desde la pantalla de alta, que es lo que ve quien entra sin perfil, antes de la app y del bloqueo', () => {
    const callers = withText.filter((f) => /\bcreateFamily\(|\bjoinFamilyWithCode\(/.test(f.text) && f.file !== 'src/data/family.ts').map((f) => f.file)
    expect(callers).toEqual(['src/ui/OnboardingScreen.tsx'])
    const app = read('src/App.tsx')
    const gate = app.indexOf('if (!profile) {')
    expect(gate).toBeGreaterThan(-1)
    expect(app.indexOf('<OnboardingScreen', gate)).toBeGreaterThan(gate)
    expect(app.indexOf('<AppLockGate profileId={profile.id}')).toBeGreaterThan(gate)
  })
  it('las pantallas de cuenta y seguridad no llaman a crear familia ni a unirse, ni a invitaciones', () => {
    for (const f of ['src/ui/ResetPasswordScreen.tsx', 'src/ui/SecuritySettings.tsx', 'src/ui/ChangeEmailPanel.tsx', 'src/ui/PinRecoveryPanel.tsx', 'src/data/account.ts']) {
      const text = read(f)
      for (const w of ['createFamily', 'joinFamilyWithCode', "'@/data/family'", 'createMemberInvitation', 'checkInvitation']) expect(text, `${f} ${w}`).not.toContain(w)
    }
    expect(read('src/ui/LoginScreen.tsx')).not.toContain("'@/data/family'")
  })
  it('la alta recuerda la invitación solo para rellenar: el servidor la vuelve a comprobar al terminar y no se guarda nada que dé permisos', () => {
    const onboarding = read('src/ui/OnboardingScreen.tsx')
    expect(onboarding).toContain('const check = await checkInvitation(code)')
    expect(onboarding).toContain('fixedCode ?? accessCode')
    expect(onboarding).toContain('fixedCode ?? code')
    expect(onboarding).not.toContain('OtpCodeField')
    const pending = read('src/domain/pendingInvitation.ts')
    expect(pending).toContain('sessionStorage')
    expect(pending).not.toContain('localStorage')
  })
})

describe('administradoras de PEPA, de familia, madres/padres y personas adultas: permisos distintos', () => {
  it('ninguna migración nueva de cuentas usa is_app_owner (solo las administradoras de PEPA generan invitaciones de familia nueva, y ya lo hace 0093)', () => {
    for (const f of ['0292_account_security.sql', '0293_family_member_guardians.sql', '0294_invitation_hardening.sql', '0295_signup_gate_invitation_first.sql']) {
      expect(stripComments(read(`supabase/migrations/${f}`)), f).not.toContain('is_app_owner')
    }
  })
  it('el vínculo parental solo se declara sobre uno mismo, sobre menores y con identificación reciente; una persona adulta nunca puede ser «el hijo»', () => {
    const sql = read('supabase/migrations/0293_family_member_guardians.sql')
    const fn = slice(sql, 'create or replace function public.declare_guardianship(', 'create or replace function public.revoke_own_guardianship(')
    expect(fn).toContain("v_role not in ('admin', 'adult')")
    expect(fn).toContain('private.has_recent_strong_auth(300)')
    expect(fn).toContain('not coalesce(p_declaration_accepted, false)')
    expect(fn).toContain('CHILD_MUST_BE_MINOR')
    expect(fn).toContain('CANNOT_DECLARE_SELF')
    expect(fn).toContain('values (v_family, p_child_member, v_me, p_relationship, v_user, trim(p_declaration_version))') // el tutor es siempre quien llama (v_me)
    expect(sql).toContain("m.member_type in ('child', 'baby')")
    expect(sql).toContain("and not exists (select 1 from profiles p where p.id = m.linked_profile_id and p.role in ('admin', 'adult'))")
  })
  it('no hay límite fijo de tutores por menor; se evitan duplicados y se conserva el historial', () => {
    const sql = read('supabase/migrations/0293_family_member_guardians.sql')
    expect(sql).toContain('create unique index family_member_guardians_active_unique on public.family_member_guardians (child_member_id, guardian_member_id) where status = \'active\'')
    expect(stripComments(sql)).not.toMatch(/count\(\*\)\s*[<>]=?\s*\d/)
    expect(sql).toContain("status text not null default 'active' check (status in ('active', 'revoked'))")
    expect(sql).toContain('create table public.family_guardian_events')
  })
  it('nada se escribe desde la app en las tablas del vínculo; revocar el propio vínculo está creado pero NO habilitado hasta revisar el mecanismo', () => {
    const sql = read('supabase/migrations/0293_family_member_guardians.sql')
    expect(sql).toContain('revoke all on public.family_member_guardians from anon, authenticated;')
    expect(sql).toContain('grant select on public.family_member_guardians to authenticated;')
    expect(sql).toContain('revoke all on public.family_guardian_events from anon, authenticated;')
    expect(sql).toContain('revoke all on function public.revoke_own_guardianship(uuid, text) from public, anon, authenticated;')
    expect(sql).not.toMatch(/grant execute on function public\.revoke_own_guardianship/)
    expect(read('src/data/invitations.ts')).not.toContain('revoke_own_guardianship')
  })
  it('Fase B aplazada: no hay ninguna función privilegiada para cambiar el correo de otra cuenta', () => {
    for (const f of ['0292_account_security.sql', '0293_family_member_guardians.sql', '0294_invitation_hardening.sql', '0295_signup_gate_invitation_first.sql']) {
      expect(stripComments(read(`supabase/migrations/${f}`)), f).not.toMatch(/update\s+auth\.users|updateUserById|email_change\s*=/i)
    }
    expect(read('src/data/account.ts')).not.toContain('admin.updateUserById')
  })
})

describe('plantillas de invitación (preparadas, sin enviar nada)', () => {
  it('hay dos y no se mezclan: familia nueva (administradoras de PEPA) y miembro de una familia (administradora de familia o madre/padre vinculado)', () => {
    expect(Object.keys(INVITATION_TEMPLATES).sort()).toEqual(['invitation_member', 'invitation_new_family'])
    expect(INVITATION_TEMPLATES.invitation_new_family.subject).toBe('Te han invitado a crear tu familia en PEPA')
    expect(INVITATION_TEMPLATES.invitation_member.subject).toBe('Te han invitado a unirte a tu familia en PEPA')
    expect(INVITATION_TEMPLATES.invitation_new_family.html).toContain('crear el espacio de tu familia')
    expect(INVITATION_TEMPLATES.invitation_member.html).toContain('unirte a tu familia')
  })
  it('un solo correo con logotipo oficial, remitente, código, caducidad, instrucciones, enlace de registro y ayuda', () => {
    for (const [name, t] of Object.entries(INVITATION_TEMPLATES)) {
      expect(t.html, name).toContain(`src="${LOGO_URL}"`)
      expect(t.html, name).toContain('PEPA · Tu familia organizada')
      for (const ph of ['{{invite_code}}', '{{expires_text}}', '{{register_url}}']) expect(t.html, `${name} ${ph}`).toContain(ph)
      expect(t.html, name).toContain('Para crear tu cuenta:')
      expect(t.html, name).toContain('código de 6 cifras')
      expect(t.html, name).toContain('Es un código distinto del de invitación')
      expect(t.html, name).toContain('info@pepafamilyapp.es')
      expect(t.html, name).not.toMatch(/<script/i)
      expect(t.html, name).not.toMatch(/https?:\/\/(?!pepafamilyapp\.es)[a-z0-9.-]+\//i)
    }
  })
  it('al rellenarlas se escapa todo (un nombre con HTML no puede inyectar nada) y salen el código, la caducidad y el enlace', () => {
    const out = renderInvitation(INVITATION_TEMPLATES.invitation_member.html, { ...INVITATION_SAMPLE, inviter_name: '<img src=x onerror=1>', recipient_name: 'A&B"' })
    expect(out).not.toContain('<img src=x')
    expect(out).toContain('&lt;img src=x onerror=1&gt;')
    expect(out).toContain('A&amp;B&quot;')
    expect(out).toContain(INVITATION_SAMPLE.invite_code)
    expect(out).toContain(INVITATION_SAMPLE.register_url)
    expect(out).not.toMatch(/\{\{(invite_code|expires_text|register_url|inviter_name|recipient_name)\}\}/)
  })
  it('los archivos guardados son los que genera el script', () => {
    for (const [name, t] of Object.entries(INVITATION_TEMPLATES)) expect(read(`supabase/email-templates/${name}.html`), name).toBe(t.html)
  })
})

describe('pruebas preparadas', () => {
  it('la prueba en vivo de la puerta existe y las pruebas locales con datos cubren la puerta, el gancho, las reservas, los vínculos y las invitaciones', () => {
    expect(read('supabase/pending-migrations/invitation_gate_live_test.sql')).toContain("raise exception 'PRUEBA_PUERTA_OK")
    const local = read('supabase/local-sql-tests/tests.mjs')
    for (const part of ['el gancho rechaza el alta SIN código', 'reserva por correo', 'SIN límite de tutores', 'NUNCA sobre una persona adulta', 'arregla el fallo 0217', 'NO duplica', 'un login sin invitación no puede crear familia']) {
      expect(local, part).toContain(part)
    }
  })
})
