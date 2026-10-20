// Cuentas y seguridad (PEPA-CUENTAS): piezas puras — mensajes de error de acceso, código de seis cifras, correos y cuándo vuelve a pedirse el PIN.
import { describe, expect, it } from 'vitest'
import { isPlausibleEmail, normalizeEmail, sameEmail } from '@/domain/accountEmail'
import { APP_LOCK_CHANGED_EVENT, RELOCK_AFTER_BACKGROUND_MS, shouldRelockAfterBackground } from '@/domain/appLockPolicy'
import { authErrorMessage } from '@/domain/authErrors'
import { cleanOtpInput, isCompleteOtp, OTP_LENGTH, RESEND_COOLDOWN_SECONDS } from '@/domain/otpCode'

describe('código de seis cifras', () => {
  it('deja solo las cifras y corta a seis (admite pegar «482 913» o «482-913» del correo)', () => {
    expect(OTP_LENGTH).toBe(6)
    expect(cleanOtpInput('482 913')).toBe('482913')
    expect(cleanOtpInput('482-913')).toBe('482913')
    expect(cleanOtpInput(' 12ab34 ')).toBe('1234')
    expect(cleanOtpInput('12345678')).toBe('123456')
    expect(cleanOtpInput('')).toBe('')
  })
  it('solo se da por completo con exactamente seis cifras', () => {
    expect(isCompleteOtp('482913')).toBe(true)
    expect(isCompleteOtp('48291')).toBe(false)
    expect(isCompleteOtp('4829133')).toBe(false)
    expect(isCompleteOtp('48291a')).toBe(false)
  })
  it('el reenvío espera lo mismo que exige Supabase (60 s por cuenta)', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60)
  })
})

describe('mensajes de error de acceso', () => {
  it('un código incorrecto y uno caducado dan el mismo mensaje (no se da pista de cuál de los dos es)', () => {
    const m = authErrorMessage({ code: 'otp_expired', message: 'Token has expired or is invalid' }, 'x')
    expect(m).toContain('no es correcto o ha caducado')
  })
  it('usa el código estable de Supabase y nunca enseña el inglés', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'x')).toBe('El correo o la contraseña no son correctos.')
    expect(authErrorMessage({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, 'x')).toContain('demasiados correos')
    expect(authErrorMessage({ code: 'same_password', message: 'New password should be different from the old password.' }, 'x')).toContain('distinta')
    expect(authErrorMessage({ code: 'weak_password', message: 'Password is known to be weak' }, 'x')).toContain('demasiado fácil')
    expect(authErrorMessage({ code: 'email_exists', message: 'A user with this email address has already been registered' }, 'x')).toContain('ya está en uso')
  })
  it('reconoce por el texto los casos frecuentes de versiones antiguas y, si no reconoce nada, usa el mensaje de quien llama', () => {
    expect(authErrorMessage({ message: 'Invalid login credentials' }, 'x')).toContain('no son correctos')
    expect(authErrorMessage({ message: 'Token has expired or is invalid' }, 'x')).toContain('caducado')
    expect(authErrorMessage({ message: 'something nobody expected' }, 'No se pudo.')).toBe('No se pudo.')
    expect(authErrorMessage(null, 'No se pudo.')).toBe('No se pudo.')
    expect(authErrorMessage('boom', 'No se pudo.')).toBe('No se pudo.')
  })
})

describe('correo de la cuenta', () => {
  it('normaliza y compara sin importar mayúsculas ni espacios', () => {
    expect(normalizeEmail('  Jennifer@Live.COM ')).toBe('jennifer@live.com')
    expect(sameEmail('Jennifer@live.com', ' jennifer@LIVE.com')).toBe(true)
    expect(sameEmail('a@b.es', 'c@d.es')).toBe(false)
    expect(sameEmail(null, 'a@b.es')).toBe(false)
  })
  it('descarta lo que claramente no es un correo (la validación de verdad la hace Supabase)', () => {
    for (const ok of ['a@b.es', 'nombre.apellido+etiqueta@dominio.co.uk']) expect(isPlausibleEmail(ok)).toBe(true)
    for (const bad of ['', 'sin-arroba', 'a@b', 'a@@b.es', 'a b@c.es', '@b.es', 'a@.es']) expect(isPlausibleEmail(bad)).toBe(false)
    expect(isPlausibleEmail('a@' + 'x'.repeat(260) + '.es')).toBe(false)
  })
})

describe('cuándo vuelve a pedirse el PIN', () => {
  const t0 = 1_000_000
  it('con PIN y un minuto o más fuera de la pantalla, al volver se bloquea', () => {
    expect(RELOCK_AFTER_BACKGROUND_MS).toBe(60_000)
    expect(shouldRelockAfterBackground({ hiddenAtMs: t0, nowMs: t0 + 60_000, hasPin: true })).toBe(true)
    expect(shouldRelockAfterBackground({ hiddenAtMs: t0, nowMs: t0 + 8 * 3_600_000, hasPin: true })).toBe(true)
  })
  it('menos de un minuto (contestar un mensaje, hacer una foto) no bloquea', () => {
    expect(shouldRelockAfterBackground({ hiddenAtMs: t0, nowMs: t0 + 59_999, hasPin: true })).toBe(false)
    expect(shouldRelockAfterBackground({ hiddenAtMs: t0, nowMs: t0, hasPin: true })).toBe(false)
  })
  it('sin PIN no se bloquea nunca (la comodidad de abrir sin pedir nada se conserva)', () => {
    expect(shouldRelockAfterBackground({ hiddenAtMs: t0, nowMs: t0 + 3_600_000, hasPin: false })).toBe(false)
  })
  it('sin saber cuándo se ocultó, o con el reloj hacia atrás, no se bloquea por error', () => {
    expect(shouldRelockAfterBackground({ hiddenAtMs: null, nowMs: t0, hasPin: true })).toBe(false)
    expect(shouldRelockAfterBackground({ hiddenAtMs: t0, nowMs: t0 - 5_000, hasPin: true })).toBe(false)
  })
  it('se puede cambiar el umbral', () => {
    expect(shouldRelockAfterBackground({ hiddenAtMs: t0, nowMs: t0 + 5_000, hasPin: true, thresholdMs: 5_000 })).toBe(true)
  })
  it('el aviso interno tiene nombre propio', () => {
    expect(APP_LOCK_CHANGED_EVENT).toBe('pepa:app-lock-changed')
  })
})
