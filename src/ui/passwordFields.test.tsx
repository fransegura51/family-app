// Contraseñas de PEPA: ojo para verlas u ocultarlas en TODOS los campos de contraseña (también los PIN) y «Repetir contraseña» en todo formulario que cree una contraseña nueva.
// Entorno de pruebas sin navegador: se comprueba el HTML que pinta el componente, el CSS y el código de cada formulario. El aspecto real en Safari de iPhone, Android y ordenador
// se revisa a mano (docs/CUENTAS_SEGURIDAD_PLAN.md §5 bis).
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PASSWORD_MISMATCH_MESSAGE, passwordsMatch, showPasswordMismatch } from '@/domain/passwordForm'
import { NewPasswordFields, PasswordField } from '@/ui/PasswordField'
import login from '@/ui/LoginScreen.tsx?raw'
import reset from '@/ui/ResetPasswordScreen.tsx?raw'
import security from '@/ui/SecuritySettings.tsx?raw'
import changeEmail from '@/ui/ChangeEmailPanel.tsx?raw'
import reauth from '@/ui/ReauthStep.tsx?raw'
import pinRecovery from '@/ui/PinRecoveryPanel.tsx?raw'
import appLock from '@/ui/AppLockScreen.tsx?raw'
import field from '@/ui/PasswordField.tsx?raw'

const SRC = path.resolve(__dirname, '..')
const css = fs.readFileSync(path.resolve(__dirname, 'styles.css'), 'utf8')

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}

// El bloque CSS del ojo (todo lo que va después del comentario que lo presenta).
const eyeCss = css.slice(css.indexOf('/* Campo de contraseña con ojo'))

describe('regla de las dos contraseñas', () => {
  it('el mensaje es el aprobado y solo se enseña cuando ya hay algo escrito en la repetición y no es igual', () => {
    expect(PASSWORD_MISMATCH_MESSAGE).toBe('Las contraseñas no coinciden')
    expect(passwordsMatch('abcdef', 'abcdef')).toBe(true)
    expect(passwordsMatch('abcdef', 'abcdeg')).toBe(false)
    expect(passwordsMatch('abcdef', '')).toBe(false)
    expect(showPasswordMismatch('abcdef', '')).toBe(false)
    expect(showPasswordMismatch('abcdef', 'abc')).toBe(true)
    expect(showPasswordMismatch('abcdef', 'abcdef')).toBe(false)
  })
})

describe('campo de contraseña común', () => {
  const html = renderToStaticMarkup(<PasswordField label="Contraseña" value="secreto" onChange={() => {}} autoComplete="current-password" />)

  it('empieza OCULTA y con un botón de ojo accesible DENTRO de la caja del campo', () => {
    expect(html).toContain('type="password"')
    expect(html).not.toContain('type="text"')
    expect(html).toContain('aria-label="Mostrar contraseña"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('class="password-eye"')
    // El ojo es hermano del campo dentro de la misma caja (.password-field), no de la etiqueta.
    expect(html).toMatch(/<span class="password-field"><input[^>]*\/><button[^>]*class="password-eye"/)
  })

  it('mantiene el autocompletado y los gestores de contraseñas (autoComplete real) y no deja que el móvil corrija lo escrito', () => {
    expect(html).toContain('autoComplete="current-password"')
    expect(html).toContain('autoCapitalize="none"')
    expect(html).toContain('autoCorrect="off"')
    expect(html).toContain('spellcheck="false"')
  })

  it('pulsar el ojo alterna type password/text sin tocar el valor y sin robar el foco; cada campo tiene su propio estado', () => {
    expect(field).toContain("type={visible ? 'text' : 'password'}")
    expect(field).toContain('setVisible((v) => !v)')
    expect(field).toContain('onMouseDown={(e) => e.preventDefault()}')
    expect(field).toContain('onClick={() => setVisible((v) => !v)}') // el ojo solo cambia la visibilidad: no llama a onChange, así que nunca borra lo escrito
    expect(field).not.toMatch(/setVisible[^\n]*onChange/)
    expect(field).toContain("aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}")
    // El estado vive dentro de PasswordField: dos campos en el mismo formulario no comparten ojo.
    expect((field.match(/useState\(false\)/g) ?? []).length).toBe(1)
    expect(field.indexOf('useState(false)')).toBeGreaterThan(field.indexOf('export function PasswordField('))
    expect(field.indexOf('useState(false)')).toBeLessThan(field.indexOf('export function NewPasswordFields('))
  })

  it('el botón es de tipo button (no envía el formulario)', () => {
    expect(field).toContain('type="button"')
  })

  it('PIN: mismo campo con ojo, solo dígitos, teclado numérico y 6 como máximo; sin etiqueta usa aria-label (pantalla de bloqueo)', () => {
    const pin = renderToStaticMarkup(<PasswordField numeric ariaLabel="PIN" value="12" onChange={() => {}} required={false} inputClassName="app-lock-input" />)
    expect(pin).toContain('inputMode="numeric"')
    expect(pin).toContain('pattern="[0-9]*"')
    expect(pin).toContain('maxLength="6"')
    expect(pin).toContain('aria-label="PIN"')
    expect(pin).toContain('class="password-input app-lock-input"')
    expect(pin).toContain('class="password-eye"')
    expect(pin).not.toContain('<label')
    expect(field).toContain("e.target.value.replace(/\\D/g, '')")
  })
})

describe('el ojo queda dentro del campo, centrado en vertical y sin tapar el texto (CSS)', () => {
  it('la caja mide lo que el campo y el ojo se centra en ella (no en la etiqueta)', () => {
    expect(eyeCss).toMatch(/\.password-field \{[^}]*position: relative;[^}]*display: flex;[^}]*align-items: center;/)
    expect(eyeCss).toMatch(/\.password-field \.password-eye \{[^}]*position: absolute;[^}]*right: 6px;[^}]*top: 50%;[^}]*transform: translateY\(-50%\);/)
  })

  it('el campo reserva a la derecha más hueco que el ojo (40 px + 6 px de margen) para que el texto no quede debajo', () => {
    const pad = /\.password-field input\.password-input \{[^}]*padding-right: (\d+)px;/.exec(eyeCss)
    expect(pad).not.toBeNull()
    expect(Number(pad?.[1])).toBeGreaterThanOrEqual(46)
    expect(eyeCss).toMatch(/width: 40px;[^}]*height: 40px;/) // zona táctil cómoda
  })

  it('el botón no hereda el aspecto de los botones grandes y en iOS/Safari pierde su apariencia nativa', () => {
    const btn = /\.password-field \.password-eye \{[^}]*\}/.exec(eyeCss)?.[0] ?? ''
    for (const piece of ['-webkit-appearance: none;', 'appearance: none;', 'padding: 0;', 'background: transparent;', 'border: none;', 'touch-action: manipulation;', '-webkit-tap-highlight-color: transparent;']) {
      expect(btn, piece).toContain(piece)
    }
    expect(eyeCss).toMatch(/\.password-field \.password-eye svg \{[^}]*pointer-events: none;/)
  })

  it('se ocultan los botones propios del navegador (Edge y Safari) para que no tapen el ojo ni se vean dos', () => {
    expect(eyeCss).toContain('::-ms-reveal')
    expect(eyeCss).toContain('::-webkit-credentials-auto-fill-button')
    expect(eyeCss).toContain('::-webkit-contacts-auto-fill-button')
  })

  it('la pantalla de bloqueo reserva el mismo hueco a los dos lados (el PIN sigue centrado)', () => {
    expect(eyeCss).toMatch(/input\.password-input\.app-lock-input \{[^}]*padding: 10px 52px;/)
  })
})

describe('Contraseña + Repetir contraseña', () => {
  const mk = (password: string, confirm: string) =>
    renderToStaticMarkup(<NewPasswordFields password={password} confirm={confirm} onPasswordChange={() => {}} onConfirmChange={() => {}} />)

  it('son DOS campos, cada uno con su ojo y con autocompletado de contraseña nueva', () => {
    const html = mk('', '')
    expect((html.match(/<input/g) ?? []).length).toBe(2)
    expect((html.match(/class="password-eye"/g) ?? []).length).toBe(2)
    expect((html.match(/autoComplete="new-password"/g) ?? []).length).toBe(2)
    expect(html).toContain('Contraseña')
    expect(html).toContain('Repetir contraseña')
  })

  it('si no coinciden enseña «Las contraseñas no coinciden»; si coinciden o aún no se ha escrito la repetición, no', () => {
    expect(mk('abcdef', 'abcdeg')).toContain('Las contraseñas no coinciden')
    expect(mk('abcdef', 'abcdef')).not.toContain('no coinciden')
    expect(mk('abcdef', '')).not.toContain('no coinciden')
  })
})

describe('formularios', () => {
  it('crear cuenta, elegir contraseña nueva y cambiar contraseña piden la repetición y NO envían hasta que coincidan', () => {
    for (const [name, src] of [['login', login], ['reset', reset], ['security', security]] as const) {
      expect(src, name).toContain('NewPasswordFields')
      expect(src, name).toContain('passwordsMatch(')
      expect(src, name).toContain('PASSWORD_MISMATCH_MESSAGE')
    }
    // En crear cuenta la comprobación va ANTES de llamar a Supabase.
    expect(login.indexOf('passwordsMatch(password, confirm)')).toBeLessThan(login.indexOf('supabase.auth.signUp('))
    expect(reset.indexOf('passwordsMatch(password, confirm)')).toBeLessThan(reset.indexOf('setNewPassword(password)'))
    expect(security.indexOf('passwordsMatch(next, confirm)')).toBeLessThan(security.indexOf('changePasswordWithCurrent('))
  })

  it('entrar pide UNA sola contraseña (con ojo), sin repetirla', () => {
    expect(login).toContain("{mode === 'signin' && <PasswordField")
    expect(login).toMatch(/mode === 'signup' && <NewPasswordFields/)
  })

  it('SIN EXCEPCIONES: ninguna pantalla de la app pinta <input type="password"> por su cuenta; todas pasan por el campo común (contraseñas y PIN)', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) && !f.endsWith('PasswordField.tsx'))
      .filter((f) => /type=(["'{]\s*["']?)password/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f))
    expect(offenders).toEqual([])
    for (const [name, src] of [['login', login], ['reset', reset], ['security', security], ['changeEmail', changeEmail], ['reauth', reauth], ['pinRecovery', pinRecovery], ['appLock', appLock]] as const) {
      expect(src, name).toContain("from '@/ui/PasswordField'")
      expect(src, name).toMatch(/<(New)?PasswordFields?\b/)
    }
  })

  it('no se tocan las reglas de seguridad: se conserva la longitud mínima de 6', () => {
    expect(field).toContain('PASSWORD_MIN_LENGTH')
    expect(login).toContain('minLength={6}')
  })
})

describe('pantalla de bloqueo con PIN', () => {
  it('lleva el logotipo oficial arriba, igual que la pantalla de entrada', () => {
    expect(appLock).toContain("import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'")
    expect(appLock).toContain('alt="Pepa Family App — Pepa te lo soluciona"')
    expect(appLock.indexOf('<img src={pepaLogoSlogan}')).toBeLessThan(appLock.indexOf('App bloqueada'))
  })
})
