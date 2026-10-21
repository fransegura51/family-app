// Pantalla «Elige tu nueva contraseña» (se llega desde el correo de recuperar contraseña): lleva el logotipo oficial de PEPA, igual que la pantalla de entrada,
// y no el título de texto «Family App». Se lee el código fuente (la pantalla necesita Supabase para pintarse).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const reset = fs.readFileSync(path.resolve(__dirname, 'ResetPasswordScreen.tsx'), 'utf8')
const login = fs.readFileSync(path.resolve(__dirname, 'LoginScreen.tsx'), 'utf8')

describe('pantalla de contraseña nueva: logotipo oficial', () => {
  it('usa el mismo logotipo con eslogan que la pantalla de entrada, en las dos vistas (elegir contraseña y «contraseña actualizada»)', () => {
    expect(reset).toContain("import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'")
    expect(login).toContain("import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'")
    expect(reset).toContain('alt="Pepa Family App — Pepa te lo soluciona"')
    expect((reset.match(/\{logo\}/g) ?? []).length).toBe(2)
  })

  it('ya no enseña el título de texto «Family App»', () => {
    expect(reset).not.toMatch(/<h1>\s*Family App\s*<\/h1>/)
  })
})
