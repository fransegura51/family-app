// Pantallas de bienvenida (Bienvenido/a, Crea tu familia, Únete a tu familia): llevan el logotipo oficial de PEPA arriba, igual que la pantalla de entrada.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const onboarding = fs.readFileSync(path.resolve(__dirname, 'OnboardingScreen.tsx'), 'utf8')

describe('bienvenida: logotipo oficial', () => {
  it('usa el mismo logotipo con eslogan que la pantalla de entrada', () => {
    expect(onboarding).toContain("import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'")
    expect(onboarding).toContain('alt="Pepa Family App — Pepa te lo soluciona"')
  })

  it('sale encima del título en las TRES vistas (elegir, crear familia, unirse)', () => {
    expect((onboarding.match(/\{logo\}/g) ?? []).length).toBe(3)
    for (const title of ['<h1>Bienvenido/a</h1>', '<h1>Crea tu familia</h1>', '<h1>Únete a tu familia</h1>']) {
      const at = onboarding.indexOf(title)
      expect(at, title).toBeGreaterThan(-1)
      expect(onboarding.slice(Math.max(0, at - 40), at), title).toContain('{logo}')
    }
  })
})
