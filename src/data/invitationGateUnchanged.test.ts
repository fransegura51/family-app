// REQUISITO CRÍTICO (20/10/2026): PEPA sigue en fase privada. NADIE puede crear una familia ni unirse a una sin un código de invitación válido, y esa
// puerta NO se toca con el trabajo de cuentas y seguridad (PEPA-CUENTAS). Estas pruebas fallan si alguien (una migración, una pantalla, una función de
// servidor) abre otro camino de alta o cambia la puerta actual. La prueba EN VIVO (con base de datos real) está en
// supabase/pending-migrations/invitation_gate_live_test.sql y debe pasar ANTES y DESPUÉS de desplegar cualquier cambio de autenticación.
//
// Cómo funciona hoy (comprobado en el código):
//  · Crear el LOGIN (auth.signUp: correo y contraseña) está abierto a nivel de Supabase Auth, pero un login sin familia no sirve de nada: no tiene perfil.
//  · Para tener perfil solo hay dos caminos, los dos con código y los dos en el SERVIDOR (SECURITY DEFINER):
//      create_family(...)         → código maestro (Vault) o invitación de UN uso, caducable, que solo genera una administradora DE PEPA (profiles.is_app_owner).
//      join_family_with_code(...) → código de UN uso (24 h) de una ficha concreta, que genera la administradora DE ESA FAMILIA.
//  · El cliente no puede insertar en profiles (0276 le retira INSERT).
//  · El verificar el correo con código de 6 cifras es otra cosa: confirma el login, no da familia.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrations = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
const stripComments = (sql: string) => sql.replace(/^\s*--.*$/gm, '')

// Archivos de migración que YA definen o cambian la puerta (historia). Si aparece uno nuevo, esta lista deja de coincidir y la prueba falla a propósito.
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
]

describe('la puerta por invitación en la base de datos no se ha tocado', () => {
  it('ninguna migración nueva redefine create_family, join_family_with_code, generate_family_invite ni generate_member_invite_code', () => {
    const files = migrations.filter((f) => /function public\.(create_family|join_family_with_code|generate_family_invite|generate_member_invite_code)\b/.test(read(`supabase/migrations/${f}`)))
    expect(files).toEqual(GATE_FUNCTION_FILES)
  })
  it('ninguna migración nueva inserta en profiles (la única forma de tener perfil sigue siendo pasar por la puerta) ni en family_invites', () => {
    const profiles = migrations.filter((f) => /insert into (public\.)?profiles\b/i.test(stripComments(read(`supabase/migrations/${f}`))))
    expect(profiles).toEqual(INSERT_PROFILES_FILES)
    const invites = migrations.filter((f) => /insert into (public\.)?family_invites\b/i.test(stripComments(read(`supabase/migrations/${f}`))))
    expect(invites).toEqual(['0093_family_invites.sql'])
  })
  it('crear familia: sin código maestro ni invitación vigente y sin usar → «Código de acceso incorrecto» (caducidad y un solo uso intactos)', () => {
    const sql = read('supabase/migrations/0286_signup_birth_date_required.sql')
    const fn = sql.slice(sql.indexOf('create or replace function public.create_family('), sql.indexOf('create or replace function public.join_family_with_code('))
    expect(fn).toContain("if v_user_id is null then\n    raise exception 'No autenticado';")
    expect(fn).toContain("where code = v_invite_code and used_at is null and expires_at > now()")
    expect(fn).toContain("raise exception 'Código de acceso incorrecto';")
    expect(fn).toContain("update family_invites set used_by_family = v_family_id, used_at = now() where code = v_used_invite;")
    // El código se comprueba ANTES de crear nada.
    expect(fn.indexOf("raise exception 'Código de acceso incorrecto';")).toBeLessThan(fn.indexOf('insert into families'))
  })
  it('unirse a una familia: solo con el código vigente de una ficha sin cuenta (un solo uso)', () => {
    const sql = read('supabase/migrations/0286_signup_birth_date_required.sql')
    const fn = sql.slice(sql.indexOf('create or replace function public.join_family_with_code('))
    expect(fn).toContain('where invite_code = upper(p_code)')
    expect(fn).toContain('and invite_code_expires_at > now()')
    expect(fn).toContain('and linked_profile_id is null')
    expect(fn).toContain("raise exception 'Código no válido o caducado';")
    expect(fn).toContain('set linked_profile_id = v_user_id, invite_code = null, invite_code_expires_at = null')
  })
  it('las invitaciones de familia nueva las genera solo una administradora DE PEPA (profiles.is_app_owner); las de unirse, la administradora DE ESA familia', () => {
    const invites = read('supabase/migrations/0093_family_invites.sql')
    const gen = invites.slice(invites.indexOf('create or replace function public.generate_family_invite('))
    expect(gen).toContain('from profiles where id = auth.uid() and is_app_owner')
    expect(gen).toContain("raise exception 'Solo la dueña de la app puede generar códigos'")
    expect(invites).toContain("expires_at timestamptz not null default now() + interval '30 days'")
    const member = read('supabase/migrations/0032_member_invite_codes.sql')
    expect(member).toContain("private.current_role_in_family() <> 'admin'")
    expect(member).toContain('v_family_id <> private.current_family_id()')
    expect(member).toContain("now() + interval '24 hours'")
  })
  it('el cliente no puede insertar en profiles (0276) ni ejecutar las funciones de alta sin sesión', () => {
    expect(read('supabase/migrations/0276_profiles_protect_privileged_columns.sql')).toContain('revoke insert, delete, truncate on public.profiles from anon, authenticated;')
    expect(read('supabase/migrations/0286_signup_birth_date_required.sql')).toContain('revoke all on function public.create_family(text, text, text, date) from public, anon;')
    expect(read('supabase/migrations/0286_signup_birth_date_required.sql')).toContain('revoke all on function public.join_family_with_code(text, text, date) from public, anon;')
  })
})

describe('los flujos nuevos de acceso NO son un camino de alta sin invitación', () => {
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

  it('el único signUp de toda la app sigue siendo el de la pantalla de entrada (el de siempre), y nadie crea usuarios por otra vía', () => {
    const signUps = withText.filter((f) => /auth\.signUp\(/.test(f.text)).map((f) => f.file)
    expect(signUps).toEqual(['src/ui/LoginScreen.tsx'])
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
  it('recuperar contraseña, cambiar correo y recuperar PIN solo actúan sobre cuentas que ya existen (resetPasswordForEmail, updateUser, funciones de la propia sesión)', () => {
    const account = read('src/data/account.ts')
    expect(account).toContain('supabase.auth.resetPasswordForEmail(')
    expect(account).toContain('supabase.auth.updateUser(')
    expect(account).not.toMatch(/\.from\(/)
    expect(account).not.toMatch(/rpc\('(create_family|join_family_with_code|generate_family_invite|generate_member_invite_code)'/)
    const lock = read('src/data/appLock.ts')
    expect(lock).not.toMatch(/rpc\('(create_family|join_family_with_code|generate_family_invite|generate_member_invite_code)'/)
  })
  it('las pantallas nuevas de acceso nunca llaman a crear familia ni a unirse con código (eso sigue siendo solo la pantalla de alta, tras entrar)', () => {
    for (const f of ['src/ui/LoginScreen.tsx', 'src/ui/ResetPasswordScreen.tsx', 'src/ui/SecuritySettings.tsx', 'src/ui/ChangeEmailPanel.tsx', 'src/ui/PinRecoveryPanel.tsx', 'src/data/account.ts']) {
      const text = read(f)
      expect(text, f).not.toContain('createFamily')
      expect(text, f).not.toContain('joinFamilyWithCode')
      expect(text, f).not.toContain("'@/data/family'")
    }
    const callers = withText.filter((f) => /\bcreateFamily\(|\bjoinFamilyWithCode\(/.test(f.text) && !/^src\/data\/family\.ts$/.test(f.file)).map((f) => f.file)
    expect(callers).toEqual(['src/ui/OnboardingScreen.tsx'])
  })
  it('quien entra sin perfil (login sin invitación) sigue yendo a la pantalla de alta, que exige el código, ANTES de la app y del bloqueo', () => {
    const app = read('src/App.tsx')
    const gate = app.indexOf('if (!profile) {')
    expect(gate).toBeGreaterThan(-1)
    expect(app.indexOf('<OnboardingScreen', gate)).toBeGreaterThan(gate)
    expect(app.indexOf('<AppLockGate profileId={profile.id}')).toBeGreaterThan(gate)
    const onboarding = read('src/ui/OnboardingScreen.tsx')
    expect(onboarding).toContain('await createFamily(familyName, displayName, accessCode, birthDate)')
    expect(onboarding).toContain('await joinFamilyWithCode(code, displayName, birthDate)')
    expect(onboarding).not.toContain('OtpCodeField')
  })
  it('el código de 6 cifras del correo y el código de invitación son cosas separadas: la entrada no pide ni acepta uno por el otro', () => {
    const login = read('src/ui/LoginScreen.tsx')
    expect(login).not.toContain('Código de acceso')
    expect(login).not.toContain('Código de invitación')
    expect(login).not.toContain('accessCode')
    const onboarding = read('src/ui/OnboardingScreen.tsx')
    expect(onboarding).toContain('Código de acceso')
    expect(onboarding).toContain('Código de invitación')
  })
  it('las plantillas de correo no ofrecen enlaces de alta: solo un código de verificación para una cuenta que ya existe', () => {
    for (const name of ['confirmation', 'recovery', 'email_change', 'reauthentication', 'magic_link']) {
      const html = read(`supabase/email-templates/${name}.html`)
      expect(html, name).not.toMatch(/href="https?:/)
      expect(html, name).not.toContain('{{ .SiteURL }}')
    }
  })
})

describe('administradoras de PEPA y de cada familia: permisos distintos, y lo nuevo no los mezcla', () => {
  const sql = stripComments(read('supabase/migrations/0292_account_security.sql'))
  it('la migración 0292 no usa is_app_owner: ninguna función nueva da poderes a las administradoras de PEPA', () => {
    expect(sql).not.toContain('is_app_owner')
  })
  it('la administradora de FAMILIA solo ve los correos de SU familia; nunca de otra', () => {
    expect(sql).toContain("private.current_role_in_family() = 'admin'")
    expect(sql).toContain('p.family_id = private.current_family_id()')
  })
  it('lo nuevo no inserta, no crea invitaciones y no toca profiles ni families (solo borra el PIN y las huellas de quien llama)', () => {
    expect(sql).not.toMatch(/\binsert\s+into\b/i)
    expect(sql).not.toMatch(/\bupdate\s+(public\.)?(profiles|families|family_members|family_invites)\b/i)
    expect(sql).not.toMatch(/\bdelete\s+from\s+(public\.)?(profiles|families|family_members|family_invites)\b/i)
    for (const t of ['family_invites', 'create_family', 'join_family_with_code', 'generate_family_invite', 'generate_member_invite_code', 'invite_code']) {
      expect(sql, t).not.toContain(t)
    }
  })
  it('el panel de uso de las administradoras de PEPA sigue siendo solo para is_app_owner (no cambia)', () => {
    const usage = read('supabase/migrations/0085_app_owner_usage_panel.sql')
    expect(usage).toContain('where exists (select 1 from profiles me where me.id = auth.uid() and me.is_app_owner)')
  })
})

describe('la prueba en vivo de la puerta está preparada', () => {
  const live = read('supabase/pending-migrations/invitation_gate_live_test.sql')
  it('se revierte siempre y cubre código ausente, equivocado, caducado y usado; unirse sin código; insertar a mano; quién genera códigos; y que lo nuevo no crea perfiles', () => {
    expect(live).toContain("raise exception 'PRUEBA_PUERTA_OK")
    for (const part of [
      "create_family('F', 'Sin invitación'",
      'WRONGCODE',
      'caducado',
      'usado',
      'join_family_with_code',
      'insert into profiles',
      'generate_family_invite',
      'generate_member_invite_code',
      'change_own_pin',
      'reset_own_pin_after_recent_auth',
      'list_family_account_emails',
    ]) {
      expect(live, part).toContain(part)
    }
  })
})
