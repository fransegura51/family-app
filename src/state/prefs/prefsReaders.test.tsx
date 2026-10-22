// @vitest-environment jsdom
// Los lectores de preferencias se repintan cuando una preferencia cambia (por esta persona o por otro de sus dispositivos), y cada pantalla que lee una preferencia
// sincronizada una sola vez al montar tiene su escucha.
import fs from 'node:fs'
import path from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { announcePrefChange, prefSet } from '@/state/prefs/prefsWrite'
import { setPrefsV2ForTests } from '@/state/prefs/flags'
import { usePrefChange } from '@/state/prefs/usePrefChange'

afterEach(() => {
  cleanup()
  setPrefsV2ForTests(null)
  localStorage.clear()
})

function Reader({ prefKey }: { prefKey: string }) {
  const [v, setV] = useState(() => localStorage.getItem(prefKey) ?? 'vacío')
  usePrefChange(prefKey, () => setV(localStorage.getItem(prefKey) ?? 'vacío'))
  return <span data-testid="v">{v}</span>
}

describe('usePrefChange', () => {
  it('repinta cuando se avisa de un cambio de SU clave y no por otras', async () => {
    localStorage.setItem('familyapp:home-card-order', 'a')
    render(<Reader prefKey="familyapp:home-card-order" />)
    expect(screen.getByTestId('v').textContent).toBe('a')
    localStorage.setItem('familyapp:home-card-order', 'b')
    announcePrefChange(['familyapp:compras-menu-layout']) // otra clave: no cambia
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('v').textContent).toBe('a')
    announcePrefChange(['familyapp:home-card-order'])
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('v').textContent).toBe('b')
  })

  it('prefSet (con la sincronización apagada o sin motor arrancado) guarda en el dispositivo y repinta a los lectores', async () => {
    render(<Reader prefKey="familyapp:movement-color-mode" />)
    prefSet('familyapp:movement-color-mode', 'etiqueta')
    await act(async () => {
      await Promise.resolve()
    })
    expect(localStorage.getItem('familyapp:movement-color-mode')).toBe('etiqueta')
    expect(screen.getByTestId('v').textContent).toBe('etiqueta')
  })

  it('con la sincronización nueva encendida y el motor aún sin arrancar, el cambio no se pierde: queda guardado y en cola para subirse', async () => {
    setPrefsV2ForTests(true)
    const spy = vi.fn()
    const { setEngineWriter, drainQueuedPrefs } = await import('@/state/prefs/prefsWrite')
    prefSet('familyapp:color-theme', 'vivo')
    expect(localStorage.getItem('familyapp:color-theme')).toBe('vivo')
    setEngineWriter(spy) // el motor arranca después
    drainQueuedPrefs()
    expect(spy).toHaveBeenCalledWith('familyapp:color-theme', 'vivo')
    setEngineWriter(null)
  })
})

describe('pantallas que leen una preferencia sincronizada al montar: todas escuchan los cambios', () => {
  const SRC = path.resolve(__dirname, '../..')
  const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8')
  const cases: Array<[string, string[]]> = [
    ['ui/HomeScreen.tsx', ['familyapp:home-card-order']],
    ['ui/AlimentacionScreen.tsx', ['familyapp:alimentacion-menu-layout', 'familyapp:alimentacion-pinned-tabs']],
    ['ui/CalendarScreen.tsx', ['familyapp:calendario-menu-layout', 'familyapp:calendario-pinned-tabs']],
    ['ui/ShoppingScreen.tsx', ['familyapp:compras-menu-layout', 'familyapp:compras-pinned-tabs']],
    ['ui/FinanceScreen.tsx', ['familyapp:economia-menu-layout', 'familyapp:economia-pinned-tabs']],
    ['ui/LocationScreen.tsx', ['familyapp:ubicacion-menu-layout', 'familyapp:ubicacion-pinned-tabs']],
    ['ui/community/CommunityLayout.tsx', ['familyapp:community-menu-order', 'familyapp:community-pinned-tabs']],
    ['ui/VoiceCapture.tsx', ['familyapp:voice-response-mode']],
    ['ui/EventMenu.tsx', ['MENU_VIEW_KEY']],
    ['ui/KidsMeterView.tsx', ['themeKey(member.id)', 'spriteKey(member.id)']],
  ]
  for (const [file, keys] of cases) {
    it(`${file} escucha ${keys.join(' y ')}`, () => {
      const src = read(file)
      for (const key of keys) expect(src).toMatch(new RegExp(`usePrefChange\\(\\s*['"]?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?`))
    })
  }
  it('los lectores con aviso propio (menú inferior, modo de color de movimientos, botones clásicos, carrusel) reciben el aviso al llegar un cambio remoto', () => {
    const rt = read('state/prefs/prefsRuntime.ts')
    for (const ev of ['family-app:tab-order-changed', 'family-app:movement-color-mode-changed', 'family-app:classic-buttons-changed', 'pepa:home-carousel-changed']) expect(rt).toContain(ev)
  })
})
