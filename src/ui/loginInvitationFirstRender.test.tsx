// Entrada a PEPA con invitación primero: lo que la persona VE al abrir la pantalla (se pinta de verdad, sin navegador). PEPA es privada: crear una cuenta empieza por «Tengo una invitación».
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginScreen } from '@/ui/LoginScreen'

vi.mock('@/data/supabaseClient', () => ({ supabase: { auth: { signInWithPassword: vi.fn(), signUp: vi.fn() } } }))
vi.mock('@/data/account', () => ({
  requestPasswordRecoveryCode: vi.fn(),
  resendSignupCode: vi.fn(),
  verifyPasswordRecoveryCode: vi.fn(),
  verifySignupCode: vi.fn(),
}))
vi.mock('@/data/invitations', () => ({ checkInvitation: vi.fn() }))

function renderAt(search: string): string {
  vi.stubGlobal('window', { location: { search, origin: 'https://app.example' } })
  return renderToStaticMarkup(<LoginScreen />)
}

afterEach(() => vi.unstubAllGlobals())

describe('pantalla de entrada: primero la invitación', () => {
  it('por defecto es «Entrar», con el camino a «Tengo una invitación» y SIN formulario de crear cuenta', () => {
    const html = renderAt('')
    expect(html).toContain('Entrar')
    expect(html).toContain('¿No tienes cuenta? Tengo una invitación')
    expect(html).toContain('¿Olvidaste tu contraseña?')
    expect(html).not.toContain('Crear cuenta')
    expect(html).not.toContain('Código de invitación')
  })
  it('desde un enlace de invitación se abre en «Tengo una invitación», con el código ya puesto y sin pedir todavía correo ni contraseña', () => {
    const html = renderAt('?invitacion=K7M2QX9PTD')
    expect(html).toContain('PEPA es privada: para crear una cuenta necesitas una invitación')
    expect(html).toContain('Código de invitación')
    expect(html).toContain('value="K7M2QX9PTD"')
    expect(html).toContain('Continuar')
    expect(html).not.toContain('type="password"')
    expect(html).not.toContain('type="email"')
    expect(html).not.toContain('Crear cuenta')
    expect(html).toContain('Volver a entrar')
  })
  it('desde la demo pública de la web (?origen=demo) también empieza por la invitación, nunca directo en crear cuenta', () => {
    const html = renderAt('?origen=demo')
    expect(html).toContain('Código de invitación')
    expect(html).not.toContain('Crear cuenta')
    expect(html).not.toContain('type="password"')
  })
  it('un enlace con un código con forma rara se ignora: se ve «Entrar» de siempre', () => {
    const html = renderAt('?invitacion=<script>alert(1)</script>')
    expect(html).toContain('¿No tienes cuenta? Tengo una invitación')
    expect(html).not.toContain('<script>alert(1)')
    expect(html).not.toContain('Código de invitación')
  })
})
