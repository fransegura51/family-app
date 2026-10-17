// Alta de cuentas: la fecha de nacimiento es obligatoria (crear familia y unirse con código), en el formulario y en el servidor (0286).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { birthDateError, signupBirthDateServerMessage, todayIso } from '@/domain/signupBirthDate'
import { OnboardingScreen } from '@/ui/OnboardingScreen'
import onboardingSrc from '@/ui/OnboardingScreen.tsx?raw'
import familySrc from '@/data/family.ts?raw'

vi.mock('@/data/family', () => ({ createFamily: vi.fn(), joinFamilyWithCode: vi.fn() }))

const NOW = new Date(2026, 9, 17, 12, 0, 0)

describe('validación de la fecha de nacimiento', () => {
  it('vacía, mal formada, inexistente, futura o anterior a 1900: no vale', () => {
    expect(birthDateError('', NOW)).toContain('Indica')
    expect(birthDateError('17/10/1990', NOW)).toContain('no es válida')
    expect(birthDateError('1990-02-30', NOW)).toContain('no es válida')
    expect(birthDateError('2026-10-18', NOW)).toContain('futura')
    expect(birthDateError('1899-12-31', NOW)).toContain('no es válida')
  })
  it('una fecha real sí (también hoy)', () => {
    expect(birthDateError('1985-03-09', NOW)).toBeNull()
    expect(birthDateError('2026-10-17', NOW)).toBeNull()
    expect(birthDateError('2024-02-29', NOW)).toBeNull()
    expect(todayIso(NOW)).toBe('2026-10-17')
  })
  it('los errores del servidor se explican en español', () => {
    expect(signupBirthDateServerMessage({ message: 'BIRTH_DATE_REQUIRED: Falta tu fecha de nacimiento' })).toContain('Falta tu fecha')
    expect(signupBirthDateServerMessage({ message: 'BIRTH_DATE_INVALID: x' })).toContain('no es válida')
    expect(signupBirthDateServerMessage({ message: 'Código no válido o caducado' })).toBeNull()
  })
})

describe('formularios de alta', () => {
  it('crear familia y unirse llevan el campo obligatorio y lo mandan al servidor', () => {
    expect((onboardingSrc.match(/<BirthDateField/g) ?? []).length).toBe(2)
    expect(onboardingSrc).toContain('type="date"')
    expect(onboardingSrc).toContain('required')
    expect(onboardingSrc).toContain('createFamily(familyName, displayName, accessCode, birthDate)')
    expect(onboardingSrc).toContain('joinFamilyWithCode(code, displayName, birthDate)')
    // Sin fecha válida no se llama al servidor.
    expect(onboardingSrc.indexOf('birthDateError(birthDate)')).toBeLessThan(onboardingSrc.indexOf('await createFamily('))
    expect(onboardingSrc.lastIndexOf('birthDateError(birthDate)')).toBeLessThan(onboardingSrc.indexOf('await joinFamilyWithCode('))
  })

  it('la elección inicial sigue igual (sin el campo, que va dentro de cada formulario)', () => {
    const html = renderToStaticMarkup(<OnboardingScreen onCreated={async () => undefined} />)
    expect(html).toContain('Crear una familia nueva')
    expect(html).not.toContain('type="date"')
  })

  it('el cliente pasa p_birth_date al servidor', () => {
    expect(familySrc).toContain('p_birth_date: birthDate')
    expect((familySrc.match(/p_birth_date: birthDate/g) ?? []).length).toBe(2)
  })
})

describe('servidor (migración 0286)', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0286_signup_birth_date_required.sql'), 'utf8')
  it('las dos altas exigen la fecha y la validan; las versiones antiguas se retiran para que no queden puertas sin fecha', () => {
    expect(sql).toContain('drop function if exists public.create_family(text, text, text);')
    expect(sql).toContain('drop function if exists public.join_family_with_code(text, text);')
    expect((sql.match(/BIRTH_DATE_REQUIRED/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect((sql.match(/BIRTH_DATE_INVALID/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(sql).toContain('values (v_family_id, p_display_name, \'admin\', v_user_id, p_birth_date)')
    expect(sql).toContain('birth_date = coalesce(birth_date, p_birth_date)')
    expect(sql).toContain('to authenticated')
  })
})
