import { describe, expect, it } from 'vitest'

// Bug real (confusión reportada 2026-10-08): quien ya tenía CUALQUIER código a mano tocaba "Ya tengo un
// código de invitación" directamente, sin fijarse en que es un sistema DISTINTO del código de "Crear una
// familia nueva" (que también pide uno, en su propio formulario) — ahora la pantalla de elección aclara
// cuál es cuál antes de elegir.
const SRC = (import.meta.glob('/src/ui/OnboardingScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/OnboardingScreen.tsx']

describe('Pantalla de bienvenida — distingue los dos tipos de código antes de elegir', () => {
  it('el botón de unirse deja claro que es para una familia YA existente, no para crear una', () => {
    expect(SRC).toContain('Ya tengo un código para unirme a una familia que ya existe')
    expect(SRC).not.toContain('Ya tengo un código de invitación')
  })
  it('hay una nota aparte explicando qué botón usar si el código es para crear una familia nueva', () => {
    expect(SRC).toContain('¿Tu código es para dar de alta una familia nueva')
    expect(SRC).toContain('Usa "Crear\n          una familia nueva" y pégalo ahí')
  })
  it('"Crear una familia nueva" sigue siendo el primer botón, sin cambios en su propio texto', () => {
    const chooseBlock = SRC.slice(SRC.indexOf("mode === 'choose'"), SRC.indexOf("if (mode === 'join')"))
    expect(chooseBlock).toContain(">\n            Crear una familia nueva\n          </button>")
    expect(chooseBlock).toContain("onClick={() => setMode('create')}")
    expect(chooseBlock).toContain("onClick={() => setMode('join')}")
  })
})
