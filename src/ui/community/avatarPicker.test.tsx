// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyCommunityProfile } from '@/domain/community'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
const setAlias = vi.hoisted(() => vi.fn())
vi.mock('@/data/community', () => ({ setCommunityAlias: setAlias }))

import { AvatarDialog } from '@/ui/community/AvatarDialog'
import { AvatarPicker } from '@/ui/community/AvatarPicker'
import { ALL_AVATARS, AVATAR_CATEGORIES } from '@/domain/communityAvatars'

const me = { hasProfile: true, id: 'p1', alias: 'CroquetaViajera', avatarEmoji: '🐶', rulesAccepted: true } as unknown as MyCommunityProfile

beforeEach(() => {
  vi.clearAllMocks()
  setAlias.mockResolvedValue(me)
})
afterEach(() => cleanup())

function Harness({ start = null as string | null }) {
  const [v, setV] = useState<string | null>(start)
  return (
    <>
      <AvatarPicker value={v} onChange={setV} />
      <output data-testid="value">{v ?? 'ninguno'}</output>
    </>
  )
}

describe('Comunidad — selector de iconos (≈100, por categorías)', () => {
  it('seis pestañas compactas, una por categoría, y la cuadrícula enseña los iconos de la pestaña elegida', () => {
    render(<Harness />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent?.replace(/^\S+\s/, ''))).toEqual(AVATAR_CATEGORIES.map((c) => c.label))
    expect(screen.getAllByRole('button', { name: /^Icono / }).length).toBe(AVATAR_CATEGORIES[0].icons.length)
    fireEvent.click(screen.getByRole('tab', { name: /Animales/ }))
    expect(screen.getByRole('button', { name: 'Icono 🦊' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Icono 🥰' })).toBeNull()
  })

  it('entre todas las pestañas se pueden elegir los ~100 iconos, incluidos los 20 de siempre', () => {
    render(<Harness />)
    const seen = new Set<string>()
    for (const c of AVATAR_CATEGORIES) {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(c.label) }))
      screen.getAllByRole('button', { name: /^Icono / }).forEach((b) => seen.add((b.getAttribute('aria-label') ?? '').replace('Icono ', '')))
    }
    expect(seen.size).toBe(ALL_AVATARS.length)
    expect(seen.size).toBeGreaterThanOrEqual(95)
  })

  it('elegir un icono lo marca (aria-pressed y «Icono elegido») y pulsar el elegido lo quita', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Icono 🙂' }))
    expect(screen.getByRole('button', { name: 'Icono 🙂' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('value').textContent).toBe('🙂')
    expect(screen.getByText(/Icono elegido/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Icono 🙂' }))
    expect(screen.getByTestId('value').textContent).toBe('ninguno')
    expect(screen.getByText(/Sin icono/)).toBeTruthy()
  })

  it('se abre en la pestaña del icono ya elegido', () => {
    render(<Harness start="🤖" />)
    expect(screen.getByRole('tab', { name: /Personajes/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('button', { name: 'Icono 🤖' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('Comunidad — «Cambiar solo el icono»', () => {
  it('guarda el icono nuevo con el MISMO alias (sin pedir alias ni normas) y avisa al terminar', async () => {
    const onDone = vi.fn()
    render(<AvatarDialog current={me} onDone={onDone} onCancel={() => undefined} />)
    expect((screen.getByRole('button', { name: 'Guardar icono' }) as HTMLButtonElement).disabled).toBe(true) // sin cambios no hay nada que guardar
    fireEvent.click(screen.getByRole('tab', { name: /Comida/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Icono 🍕' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar icono' }))
    await waitFor(() => expect(setAlias).toHaveBeenCalledWith('CroquetaViajera', '🍕', true))
    expect(onDone).toHaveBeenCalled()
    expect(screen.queryByLabelText('Alias público')).toBeNull() // no hay campo de alias: no se puede tocar por error
  })

  it('un error del servidor se enseña y no cierra la ventana', async () => {
    setAlias.mockRejectedValue(new Error('red'))
    const onDone = vi.fn()
    render(<AvatarDialog current={me} onDone={onDone} onCancel={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Icono 🐱' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar icono' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('el diálogo enseña el alias (solo lectura) y la ventana se puede cancelar', () => {
    const onCancel = vi.fn()
    render(<AvatarDialog current={me} onDone={() => undefined} onCancel={onCancel} />)
    expect(within(screen.getByRole('dialog')).getAllByText('CroquetaViajera').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
