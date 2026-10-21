// Cuentas y seguridad (PEPA-CUENTAS): la migración 0292 (solo funciones nuevas), el endurecimiento pendiente 0296 y las plantillas de correo.
// Son pruebas sobre el texto del SQL y de las plantillas; la prueba EN VIVO del SQL está en supabase/pending-migrations/0292_live_test.sql y se ejecuta
// después de aplicar 0292 (no se ha ejecutado todavía).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOGO_URL, TEMPLATES } from '../../scripts/build-email-templates.mjs'

const root = path.resolve(__dirname, '../..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
const sql = read('supabase/migrations/0292_account_security.sql')
const down = read('supabase/rollbacks/0292_account_security_down.sql')
const lockdown = read('supabase/pending-migrations/0296_account_security_lockdown.sql')
const lockdownDown = read('supabase/pending-migrations/0296_account_security_lockdown_down.sql')
const liveTest = read('supabase/pending-migrations/0292_live_test.sql')

describe('migración 0292: aditiva (solo funciones nuevas, nada destructivo)', () => {
  it('no borra ni cambia nada existente: ni drop, ni alter, ni delete/update de tablas, ni cambia funciones que ya existen', () => {
    const code = sql.replace(/^--.*$/gm, '')
    expect(code).not.toMatch(/\bdrop\b/i)
    expect(code).not.toMatch(/\balter\s+table\b/i)
    expect(code).not.toMatch(/\btruncate\b/i)
    for (const existing of ['set_own_pin', 'clear_own_pin', 'verify_own_pin', 'admin_reset_profile_pin', 'has_own_pin']) {
      expect(code).not.toMatch(new RegExp(`create or replace function public\\.${existing}\\(`))
    }
  })
  it('crea exactamente las funciones previstas', () => {
    const names = [...sql.matchAll(/create or replace function ((?:public|private)\.\w+)\(/g)].map((m) => m[1]).sort()
    expect(names).toEqual(
      ['private.has_recent_strong_auth', 'public.change_own_pin', 'public.clear_own_pin_with_pin', 'public.list_family_account_emails', 'public.reset_own_pin_after_recent_auth'].sort(),
    )
  })
  it('todas son SECURITY DEFINER con search_path fijo y, las públicas, sin acceso para anon', () => {
    const defs = sql.split('create or replace function').slice(1)
    expect(defs.length).toBe(5)
    for (const d of defs) {
      expect(d).toMatch(/security definer/)
      expect(d).toMatch(/set search_path = public(, extensions)?\b/)
    }
    for (const fn of ['change_own_pin(text, text)', 'clear_own_pin_with_pin(text)', 'reset_own_pin_after_recent_auth()', 'list_family_account_emails()']) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon;`)
      expect(sql).toContain(`grant execute on function public.${fn} to authenticated;`)
    }
    expect(sql).toContain('revoke all on function private.has_recent_strong_auth(int) from public, anon, authenticated;')
  })
  it('un PIN actual mal NO lanza error (devuelve texto): si lanzara, se revertiría el contador de intentos y se podría probar PIN sin límite', () => {
    for (const fn of ['change_own_pin', 'clear_own_pin_with_pin']) {
      const body = sql.slice(sql.indexOf(`create or replace function public.${fn}(`), sql.indexOf('$function$;', sql.indexOf(`create or replace function public.${fn}(`)))
      expect(body).toContain('public.verify_own_pin(')
      expect(body).toContain("return 'wrong_pin';")
      // Después de la comprobación del PIN no hay ningún «raise exception».
      const afterVerify = body.slice(body.indexOf('public.verify_own_pin('))
      expect(afterVerify).not.toMatch(/raise exception/)
    }
  })
  it('cambiar el PIN valida el formato y exige que haya uno', () => {
    expect(sql).toContain("p_new !~ '^[0-9]{4,6}$'")
    expect(sql).toContain("return 'no_pin';")
  })
  it('quitar el PIN con el PIN borra también las huellas (la huella es una capa sobre el PIN)', () => {
    const body = sql.slice(sql.indexOf('create or replace function public.clear_own_pin_with_pin('))
    expect(body).toContain('delete from profile_locks where profile_id = auth.uid()')
    expect(body).toContain('delete from profile_webauthn_credentials where profile_id = auth.uid()')
  })
  it('recuperar el PIN: exige identificación reciente (menos de 5 min) ANTES de borrar nada y borra PIN, huellas y retos', () => {
    const body = sql.slice(sql.indexOf('create or replace function public.reset_own_pin_after_recent_auth('), sql.indexOf('create or replace function public.list_family_account_emails('))
    expect(body.indexOf('has_recent_strong_auth(300)')).toBeGreaterThan(-1)
    expect(body.indexOf('has_recent_strong_auth(300)')).toBeLessThan(body.indexOf('delete from profile_locks'))
    expect(body).toContain("raise exception 'RECENT_AUTH_REQUIRED'")
    expect(body).toContain('delete from profile_webauthn_credentials where profile_id = auth.uid()')
    expect(body).toContain('delete from profile_webauthn_challenges where profile_id = auth.uid()')
    // Solo toca a quien llama; nunca recibe un identificador de otra persona.
    expect(body).not.toMatch(/p_profile_id|p_user_id/)
  })
  it('la «identificación reciente» sale de cómo y cuándo se abrió la sesión (claim amr), con tope de 15 minutos y solo métodos que prueban la identidad', () => {
    const body = sql.slice(sql.indexOf('create or replace function private.has_recent_strong_auth('), sql.indexOf('revoke all on function private.has_recent_strong_auth'))
    expect(body).toContain("auth.jwt() -> 'amr'")
    expect(body).toContain("in ('password', 'otp', 'magiclink', 'recovery')")
    expect(body).toContain('least(greatest(coalesce(p_max_age_seconds, 300), 30), 900)')
    expect(body).toContain("jsonb_typeof(auth.jwt() -> 'amr') = 'array'")
    expect(body).toContain('coalesce(bool_or(')
  })
  it('correos de las fichas: solo la propia familia, la administradora ve todos y las demás solo el suyo; nunca de otra familia', () => {
    const body = sql.slice(sql.indexOf('create or replace function public.list_family_account_emails('))
    expect(body).toContain('p.family_id = private.current_family_id()')
    expect(body).toContain("(p.id = auth.uid() or private.current_role_in_family() = 'admin')")
    expect(body).toContain('join auth.users u on u.id = p.id')
    // No expone la dirección nueva de un cambio pendiente, solo que hay uno.
    expect(body).toContain("(coalesce(u.email_change, '') <> '')")
    expect(body).not.toMatch(/select[^;]*\bu\.email_change\b[^;]*,\s*\(/)
  })
  it('el rollback quita solo las funciones nuevas', () => {
    const lines = down.split('\n').filter((l) => !l.startsWith('--') && l.trim())
    expect(lines.length).toBe(5)
    for (const l of lines) expect(l).toMatch(/^drop function if exists (public|private)\.\w+\(/)
    expect(lines.join(String.fromCharCode(10))).not.toMatch(/\b(set_own_pin|clear_own_pin|verify_own_pin|admin_reset_profile_pin)\(/)
  })
})

describe('endurecimiento 0296: pendiente a propósito (no está en supabase/migrations)', () => {
  it('no se aplica solo: vive en supabase/pending-migrations, con su motivo y su rollback', () => {
    const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
    expect(migrations.some((f) => f.startsWith('0296'))).toBe(false)
    expect(lockdown).toContain('PENDIENTE DE APLICAR')
    expect(lockdown).toContain('docs/CUENTAS_SEGURIDAD_PLAN.md')
  })
  it('retira a las cuentas autenticadas el reinicio por administradora y el «quitar PIN» sin comprobar, y protege set_own_pin de sobrescribir', () => {
    expect(lockdown).toContain('revoke execute on function public.admin_reset_profile_pin(uuid) from authenticated;')
    expect(lockdown).toContain('revoke execute on function public.clear_own_pin() from authenticated;')
    expect(lockdown).toContain("raise exception 'PIN_ALREADY_SET'")
  })
  it('su rollback devuelve los permisos y deja set_own_pin como estaba (0084)', () => {
    expect(lockdownDown).toContain('grant execute on function public.admin_reset_profile_pin(uuid) to authenticated;')
    expect(lockdownDown).toContain('grant execute on function public.clear_own_pin() to authenticated;')
    expect(lockdownDown).not.toContain('PIN_ALREADY_SET')
  })
})

describe('prueba en vivo de 0292 (preparada, sin ejecutar)', () => {
  it('se revierte siempre (termina con un error a propósito) y cubre PIN, recuperación, correos y aislamiento entre familias', () => {
    expect(liveTest).toContain("raise exception 'PRUEBA_0292_OK")
    for (const part of ['change_own_pin', 'clear_own_pin_with_pin', 'reset_own_pin_after_recent_auth', 'list_family_account_emails', 'PIN_LOCKED', 'RECENT_AUTH_REQUIRED']) {
      expect(liveTest).toContain(part)
    }
    expect(liveTest).toContain('OTRA familia')
    expect(liveTest).toContain("set local role anon")
  })
})

describe('plantillas de correo de acceso (identidad oficial de PEPA)', () => {
  it('asuntos aprobados, tal cual', () => {
    expect(TEMPLATES.confirmation.subject).toBe('Confirma tu correo electrónico en PEPA')
    expect(TEMPLATES.recovery.subject).toBe('Recupera tu contraseña de PEPA')
    expect(TEMPLATES.email_change.subject).toBe('Confirma tu nuevo correo electrónico en PEPA')
  })
  it('solo las plantillas que PEPA usa: no hay «invite» (las invitaciones son códigos propios de PEPA, no correos de Supabase Auth)', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(['confirmation', 'email_change', 'magic_link', 'reauthentication', 'recovery'])
  })
  it('todas llevan el código de seis cifras de Supabase y NINGUNA el enlace de un solo uso (los antivirus de correo lo gastarían)', () => {
    for (const [name, t] of Object.entries(TEMPLATES)) {
      expect(t.html, name).toContain('{{ .Token }}')
      expect(t.html, name).not.toContain('ConfirmationURL')
      expect(t.html, name).not.toContain('TokenHash')
      expect(t.html, name).not.toMatch(/href="\{\{/)
    }
  })
  it('en español, con el logotipo oficial alojado en el dominio propio, adaptable a móvil y sin nada de terceros', () => {
    expect(LOGO_URL).toBe('https://pepafamilyapp.es/email/pepa-logo-email.jpg')
    for (const [name, t] of Object.entries(TEMPLATES)) {
      expect(t.html, name).toContain('<html lang="es">')
      expect(t.html, name).toContain(`src="${LOGO_URL}"`)
      expect(t.html, name).toContain('alt="PEPA · Tu familia organizada"')
      expect(t.html, name).toContain('name="viewport"')
      expect(t.html, name).toContain('max-width:560px')
      expect(t.html, name).not.toMatch(/<script/i)
      expect(t.html, name).not.toMatch(/https?:\/\/(?!pepafamilyapp\.es)[a-z0-9.-]+\//i)
      expect(t.html, name).toContain('no compartas este código con nadie')
      expect(t.html, name).toContain('info@pepafamilyapp.es')
    }
  })
  it('confirmación, recuperación y cambio de correo dicen lo aprobado y avisan de qué hacer si no fuiste tú', () => {
    expect(TEMPLATES.confirmation.html).toContain('¡Bienvenido a la familia!')
    expect(TEMPLATES.confirmation.html).toContain('Solo falta confirmar tu correo electrónico para empezar a disfrutar de PEPA.')
    expect(TEMPLATES.recovery.html).toContain('Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de PEPA.')
    expect(TEMPLATES.recovery.html).toContain('Si no has solicitado el cambio, puedes ignorar este mensaje')
    expect(TEMPLATES.confirmation.html).toContain('puedes ignorar este mensaje')
  })
  it('el cambio de correo nombra solo la dirección NUEVA: no enseña la antigua (podría llegar a quien escribió mal la dirección)', () => {
    expect(TEMPLATES.email_change.html).toContain('{{ .NewEmail }}')
    expect(TEMPLATES.email_change.html).not.toContain('{{ .Email }}')
    expect(TEMPLATES.email_change.html).not.toContain('OldEmail')
  })
  it('el código caduca en el mismo tiempo que Supabase (por defecto 3600 s = una hora)', () => {
    for (const t of Object.values(TEMPLATES)) expect(t.html).toContain('caduca en una hora')
  })
  it('los archivos guardados en supabase/email-templates son exactamente los que genera el script (nadie los ha tocado a mano)', () => {
    for (const [name, t] of Object.entries(TEMPLATES)) expect(read(`supabase/email-templates/${name}.html`), name).toBe(t.html)
  })
  it('el logotipo de los correos es una copia ligera (no el archivo maestro) y el maestro sigue intacto', () => {
    const logo = path.join(root, 'supabase/email-templates/assets/pepa-logo-email.jpg')
    expect(fs.statSync(logo).size).toBeLessThan(100 * 1024)
    // El maestro no se ha modificado respecto a master: un cambio aquí rompería la identidad oficial de marca.
    expect(fs.existsSync(path.join(root, 'src/assets/brand/master/pepa-family-app-logo-master.png'))).toBe(true)
  })
})
