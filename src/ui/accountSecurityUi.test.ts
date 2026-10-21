// Cuentas y seguridad (PEPA-CUENTAS): lo que las pantallas prometen, comprobado sobre su código. Complementa a accountSecurity.test.ts (piezas puras) y
// a accountSecurityMigration.test.ts (SQL y plantillas de correo).
import { describe, expect, it } from 'vitest'
import account from '@/data/account.ts?raw'
import appLock from '@/data/appLock.ts?raw'
import app from '@/App.tsx?raw'
import gate from '@/ui/AppLockGate.tsx?raw'
import lockScreen from '@/ui/AppLockScreen.tsx?raw'
import changeEmail from '@/ui/ChangeEmailPanel.tsx?raw'
import family from '@/ui/FamilyScreen.tsx?raw'
import login from '@/ui/LoginScreen.tsx?raw'
import recovery from '@/ui/PinRecoveryPanel.tsx?raw'
import resetPassword from '@/ui/ResetPasswordScreen.tsx?raw'
import security from '@/ui/SecuritySettings.tsx?raw'
import settings from '@/ui/MenuSettingsScreen.tsx?raw'

describe('Familia: correos en las fichas y fuera «Reiniciar PIN»', () => {
  it('ya no hay botón «Reiniciar PIN» ni nada que lo llame (cada persona gestiona su PIN)', () => {
    expect(family).not.toContain('Reiniciar PIN')
    expect(family).not.toContain('ResetPinButton')
    expect(family).not.toContain('adminResetProfilePin')
    expect(appLock).not.toContain('adminResetProfilePin')
    expect(appLock).not.toContain('admin_reset_profile_pin')
  })
  it('la ficha enseña el correo solo de quien tiene cuenta propia (linkedProfileId) y los datos salen de la base de datos / de la sesión', () => {
    expect(family).toContain('m.linkedProfileId && emails[m.linkedProfileId]?.email')
    expect(family).toContain("import { getMyAccount, listFamilyAccountEmails, type FamilyAccountEmail } from '@/data/account'")
  })
  it('la administradora pide los correos de la familia; el resto solo el suyo, sin llamada a la base de datos (cuesta lo mismo que antes para quien no es administradora)', () => {
    expect(family).toMatch(/if \(isAdmin\) \{\s*listFamilyAccountEmails\(\)/)
    expect(family).toMatch(/\} else \{\s*getMyAccount\(\)/)
  })
  it('«Cambiar correo» solo sale en la ficha PROPIA, nunca en la de otra persona (ni siquiera para la administradora)', () => {
    expect((family.match(/<ChangeEmailPanel/g) ?? []).length).toBe(1)
    expect(family).toContain('{m.linkedProfileId === profile.id && <ChangeEmailPanel compact onChanged={loadEmails} />}')
  })
  it('conserva lo suyo (miembros, código de invitación para quien aún no tiene cuenta, borrar)', () => {
    expect(family).toContain('<InviteCodeButton')
    expect(family).toContain('+ Añadir miembro')
    expect(family).toContain('🗑 Borrar')
  })
})

describe('Cambiar correo (Supabase Auth, mismo identificador de usuario)', () => {
  it('pide la contraseña actual, manda el cambio con updateUser y confirma con códigos (type email_change)', () => {
    expect(changeEmail).toContain('await confirmCurrentPassword(password)')
    expect(changeEmail).toContain('await requestEmailChange(newEmail)')
    expect(account).toContain('supabase.auth.updateUser({ email: normalizeEmail(newEmail) }')
    expect(account).toContain("type: 'email_change'")
  })
  it('enseña «cambio pendiente» y admite los dos códigos (cambio de correo seguro: uno por cada dirección)', () => {
    expect(changeEmail).toContain('Cambio pendiente')
    expect(changeEmail).toContain('Código enviado a tu correo de siempre')
    expect(changeEmail).toContain("handleConfirm('new', e)")
    expect(changeEmail).toContain("handleConfirm('current', e)")
  })
  it('no crea cuentas ni toca datos: solo Supabase Auth, nada de escribir en profiles ni en family_members', () => {
    expect(account).not.toMatch(/\.from\('(profiles|family_members)'\)/)
    expect(account).not.toContain('admin.updateUserById')
  })
})

describe('Contraseña: cambiar, recuperar con código y pantalla con la marca de PEPA', () => {
  it('Entrar: recuperar con código de 6 cifras, confirmar el correo con código y reenviar con cuenta atrás', () => {
    expect(login).toContain('requestPasswordRecoveryCode(email)')
    expect(login).toContain('verifyPasswordRecoveryCode(email, code)')
    expect(login).toContain('verifySignupCode(email, code)')
    expect(login).toContain('resendSignupCode(email)')
    expect(login).toContain('Reenviar código (en ${cooldown.left} s)')
    expect(login).toContain('<OtpCodeField')
  })
  it('un registro sin confirmar que intenta entrar pasa a escribir el código (y se le manda uno nuevo)', () => {
    expect(login).toContain("error.code === 'email_not_confirmed'")
  })
  it('no se pierde ninguna protección: el mensaje de «Si ese email tiene una cuenta…» no revela si existe', () => {
    expect(login).toContain('Si ese email tiene una cuenta')
  })
  it('al confirmar el código de recuperación la app enseña «elige tu contraseña nueva» (aviso recoveryFlow) y los enlaces antiguos siguen valiendo', () => {
    expect(login).toContain('recoveryFlow.begin()')
    expect(login).toContain('recoveryFlow.end()')
    expect(app).toContain('const recoveringPassword = useRecoveryFlowActive()')
    expect(app).toContain('if (recoveringPassword) return <ResetPasswordScreen />')
    expect(app).toContain("window.location.hash.includes('type=recovery')")
    expect(account).toContain('redirectTo: window.location.origin + import.meta.env.BASE_URL')
  })
  it('la pantalla de nueva contraseña ya no dice «Family App»: lleva el logotipo oficial de PEPA', () => {
    expect(resetPassword).not.toContain('<h1>Family App</h1>')
    expect(resetPassword).toContain("import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'")
    expect(resetPassword).toContain('<img src={pepaLogoSlogan}')
  })
  it('Cambiar contraseña (Seguridad): pide la actual y, si no se recuerda, ofrece el código al correo; nunca depende de otra persona', () => {
    expect(security).toContain('changePasswordWithCurrent(current, next)')
    expect(security).toContain('No recuerdo mi contraseña actual')
    expect(security).toContain('verifyPasswordRecoveryCode(email, code)')
    expect(account).toContain('await confirmCurrentPassword(current)')
  })
})

describe('Seguridad: dos apartados (Correo y contraseña, Bloqueo personal); Cerrar sesión se queda en Mi cuenta', () => {
  it('la pantalla de Configuración usa SecuritySettings y ya no tiene el bloqueo antiguo', () => {
    expect(settings).toContain('<SecuritySettings />')
    expect(settings).not.toContain('AppLockSection')
    expect(settings).not.toContain('clearOwnPin')
  })
  it('«Cerrar sesión» NO se ha movido ni duplicado (decisión 20/10/2026): sigue en Configuración → Mi cuenta, como en producción, y Seguridad no tiene nada de sesiones', () => {
    expect(settings).toContain('<SignOutCard displayName={profile.displayName} />')
    expect(settings).toMatch(/title="Mi cuenta"[\s\S]*?<SignOutCard displayName=\{profile\.displayName\} \/>\s*<DeleteAccountCard/)
    expect(settings).toMatch(/await disableNativeUpload\(\)[\s\S]*?await supabase\.auth\.signOut\(\{ scope: 'local' \}\)/)
    expect((settings.match(/Cerrar sesión/g) ?? []).length).toBeGreaterThanOrEqual(1)
    const securityCode = security.replace(/^\s*\/\/.*$/gm, '')
    expect(securityCode).not.toContain('signOut')
    expect(securityCode).not.toContain('Cerrar sesión')
    expect(securityCode).not.toContain('Sesiones')
    expect(account).not.toContain('signOut')
  })
  it('los dos apartados con su encabezado (el primero no se llama «Mi cuenta» para no chocar con el tema de Configuración)', () => {
    for (const h of ['🔐 Correo y contraseña', '🔒 Bloqueo personal']) expect(security).toContain(h)
    expect(security).not.toContain('<Heading>🔐 Mi cuenta</Heading>')
    expect(security).toContain('<MyAccountCard />')
    expect(security).toContain('<PersonalLockCard />')
  })
  it('Correo y contraseña: correo de acceso, confirmado o no, cambiar correo y cambiar contraseña', () => {
    expect(security).toContain('Correo de acceso')
    expect(security).toContain('✓ Correo confirmado')
    expect(security).toContain('⚠️ Correo sin confirmar')
    expect(security).toContain('<ChangeEmailPanel')
    expect(security).toContain('🔑 Cambiar contraseña')
  })
  it('Bloqueo personal: según el estado — desactivado ofrece activar; activado ofrece cambiar, desactivar y recuperar', () => {
    expect(security).toMatch(/enabled \? \(\s*<>[\s\S]*?Cambiar PIN[\s\S]*?Desactivar PIN[\s\S]*?He olvidado mi PIN[\s\S]*?<\/>\s*\) : \(\s*<button[^>]*onClick=\{\(\) => open\('setup'\)\}/)
  })
  it('cambiar o desactivar el PIN pide el PIN actual; ya no se quita con un simple «¿seguro?»', () => {
    expect(security).toContain('changeOwnPin(currentPin, pin)')
    expect(security).toContain('clearOwnPinWithPin(currentPin)')
    expect(security).not.toContain('clearOwnPin()')
    expect(security).toContain('Escribe tu PIN para desactivarlo')
  })
  it('el PIN actual mal NO es un error en la base de datos (así cuenta el intento): la pantalla solo lo traduce', () => {
    expect(security).toContain("setError('El PIN actual no es correcto')")
    expect(appLock).toContain("data === 'ok' || data === 'no_pin' ? data : 'wrong_pin'")
  })
  it('huella / Face ID solo con el PIN activado, como antes', () => {
    expect(security).toMatch(/\{enabled && \(\s*<div[^>]*>\s*<strong[^>]*>👆 Huella \/ Face ID<\/strong>/)
  })
  it('activar, cambiar o quitar el PIN avisa al bloqueo para que lo sepa sin recargar', () => {
    expect((security.match(/announcePinChanged\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(security).toContain('window.dispatchEvent(new Event(APP_LOCK_CHANGED_EVENT))')
  })
})

describe('Bloqueo: recuperar el PIN y volver de segundo plano', () => {
  it('la pantalla de bloqueo tiene «¿Has olvidado tu PIN?» y ya no manda a pedírselo a un administrador', () => {
    expect(lockScreen).toContain('¿Has olvidado tu PIN?')
    expect(lockScreen).toContain('<PinRecoveryPanel')
    expect(lockScreen).not.toContain('Pide a un administrador')
  })
  it('recuperar exige identificarse AHORA con la cuenta (contraseña o código del correo) y lo comprueba el servidor; sin administradores', () => {
    expect(recovery).toContain('await confirmCurrentPassword(password)')
    expect(recovery).toContain('await verifyIdentityCode(email, code)')
    expect(recovery).toContain('await resetOwnPinAfterRecentAuth()')
    expect(appLock).toContain("supabase.rpc('reset_own_pin_after_recent_auth')")
    // La identificación se hace ANTES de quitar el PIN, nunca después (y quitarlo solo se hace en removePin).
    expect(recovery).toMatch(/await confirmCurrentPassword\(password\)\s*setPassword\(''\)\s*await removePin\(\)/)
    expect(recovery).toMatch(/await verifyIdentityCode\(email, code\)\s*await removePin\(\)/)
    expect((recovery.match(/await resetOwnPinAfterRecentAuth\(\)/g) ?? []).length).toBe(1)
  })
  it('al recuperar se avisa de que huellas y Face ID se han borrado y se ofrece un PIN nuevo (opcional)', () => {
    expect(recovery).toContain('se han borrado las huellas y Face ID anteriores')
    expect(recovery).toContain('Ahora no')
  })
  it('al volver de segundo plano con PIN se vuelve a pedir; sin PIN no cambia nada', () => {
    expect(gate).toContain("document.addEventListener('visibilitychange', onVisibility)")
    expect(gate).toContain('shouldRelockAfterBackground({ hiddenAtMs: hiddenAtRef.current, nowMs: Date.now(), hasPin })')
    expect(gate).toContain('if (relock) setLocked(true)')
  })
  it('la puerta se entera de que el PIN cambió (y activar un PIN NO bloquea al instante a quien lo acaba de crear)', () => {
    expect(gate).toContain('window.addEventListener(APP_LOCK_CHANGED_EVENT, onChanged)')
    expect(gate).toContain('if (!has) setLocked(false)')
    expect(gate).not.toMatch(/setHasPin\(has\)\s*setLocked\(true\)/)
  })
  it('conserva el comportamiento de siempre: sin PIN pasa directo; desbloqueado vive solo en memoria', () => {
    expect(gate).toContain('setLocked(has)')
    const gateCode = gate.replace(/\/\/.*$/gm, '') // sin comentarios
    expect(gateCode).not.toContain('localStorage')
    expect(gateCode).not.toContain('sessionStorage')
  })
})

describe('Acceso con código de seis cifras (todo con Supabase Auth, ningún sistema propio)', () => {
  it('registro, recuperación, cambio de correo y verificación de identidad usan verifyOtp / signInWithOtp de Supabase', () => {
    expect(account).toContain("type: 'signup'")
    expect(account).toContain("type: 'recovery'")
    expect(account).toContain("type: 'email'")
    expect(account).toContain('supabase.auth.signInWithOtp')
    expect(account).toContain('shouldCreateUser: false')
    expect(account).toContain('supabase.auth.resend({ type: \'signup\'')
  })
  it('no hay tablas ni funciones propias de códigos en el código del cliente', () => {
    expect(account).not.toMatch(/rpc\('(mint|redeem|verify)_.*code/)
    expect(account).not.toContain('.from(')
  })
})
