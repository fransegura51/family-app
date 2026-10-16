// Entrada «Comunidad PEPA» del menú ☰: solo se pinta con Comunidad visible para la persona y no añade llamadas periódicas.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import navShell from '@/ui/NavShell.tsx?raw'
import itemSrc from '@/ui/community/CommunityMenuItem.tsx?raw'

let visible: boolean | null = true
vi.mock('@/ui/community/useCommunityVisible', () => ({ useCommunityVisible: () => visible }))

import { CommunityMenuItem } from '@/ui/community/CommunityMenuItem'

describe('entrada de Comunidad en el menú ☰', () => {
  it('se pinta con Comunidad visible y lleva a /comunidad', () => {
    visible = true
    const out = renderToStaticMarkup(<CommunityMenuItem onGo={() => undefined} />)
    expect(out).toContain('Comunidad PEPA')
    expect(out).toContain('<button')
  })

  it('no se pinta si Comunidad está cerrada o aún no se sabe (no hay enlaces que no pudieran funcionar)', () => {
    visible = false
    expect(renderToStaticMarkup(<CommunityMenuItem onGo={() => undefined} />)).toBe('')
    visible = null
    expect(renderToStaticMarkup(<CommunityMenuItem onGo={() => undefined} />)).toBe('')
  })

  it('el menú la monta solo con el menú abierto y el componente no usa temporizadores ni consultas propias', () => {
    const flyout = navShell.slice(navShell.indexOf('nav-menu-flyout'))
    expect(flyout).toContain('<CommunityMenuItem onGo={go} />')
    expect(itemSrc).toContain("onGo('/comunidad')")
    expect(itemSrc).not.toMatch(/setInterval|setTimeout|supabase/)
  })
})
