// Pantalla de bienvenida: siempre hay salida («Salir y entrar con otra cuenta») y, si la cuenta de la sesión ya no existe, se cierra sola.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const onboarding = fs.readFileSync(path.resolve(__dirname, 'OnboardingScreen.tsx'), 'utf8')

describe('bienvenida: salida y cierre automático', () => {
  it('el botón de salir está en las TRES vistas (elegir, crear familia, unirse) y cierra solo este dispositivo', () => {
    expect(onboarding).toContain('Salir y entrar con otra cuenta')
    expect((onboarding.match(/<LeaveButton \/>/g) ?? []).length).toBe(3)
    expect(onboarding).toContain('void signOutThisDevice()')
    expect(onboarding).toContain('forgetPendingInvitation()')
  })

  it('si la cuenta ya no existe en el servidor, cierra la sesión sola; el fallo de red no la cierra', () => {
    expect(onboarding).toContain('accountStillExists()')
    expect(onboarding).toMatch(/if \(active && !exists\) \{[\s\S]*signOutThisDevice\(\)/)
    expect(onboarding).toContain('.catch(() => {})')
  })
})
