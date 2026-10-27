// @vitest-environment jsdom
// Correcciones visuales del Centro de Administración en iPhone (9.1 y 9.2): nada de código visible, títulos y contadores en su sitio, sin desbordes y con zonas seguras.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const { AreaAyuda } = await import('@/ui/admin/AreaAyuda')
const { AdminGroupsProvider } = await import('@/ui/admin/AdminGroups')

const html = (): string =>
  renderToStaticMarkup(
    <MemoryRouter>
      <AdminGroupsProvider>
        <AreaAyuda />
      </AdminGroupsProvider>
    </MemoryRouter>,
  )
const css = readFileSync('src/ui/admin/administration.css', 'utf8')

afterEach(cleanup)

describe('9.1 · Ayuda y documentación', () => {
  it('ninguna tarjeta enseña código sin evaluar (inventory.reduce, ${…}, {…})', () => {
    const out = html()
    const text = out.replace(/<[^>]+>/g, ' ')
    expect(text).not.toMatch(/inventory\.reduce|\$\{|=>|\.length\b/)
    expect(text).toContain('Tutoriales y vídeos')
  })
  it('el indicador de «Tutoriales y vídeos» es corto y los contadores van en el cuerpo, no en el encabezado', () => {
    const out = html()
    const head = out.slice(out.indexOf('Tutoriales y vídeos'), out.indexOf('Tutoriales y vídeos') + 600)
    expect(head).toMatch(/\d+ tutoriales<\/span>/)
    render(
      <MemoryRouter>
        <AdminGroupsProvider>
          <AreaAyuda />
        </AdminGroupsProvider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Tutoriales y vídeos/ }))
    const counts = document.querySelector('#admin-group-ayuda-tutoriales .admin-counts')!
    expect(counts.textContent).toMatch(/Visitas: \d+/)
    expect(counts.textContent).toMatch(/Explicaciones: \d+/)
    expect(counts.textContent).not.toMatch(/[{}]/)
  })
})

describe('9.1 · bloques plegables en pantallas estrechas', () => {
  it('el título ocupa su fila y el indicador pasa debajo, sin estrechar el texto ni desbordar', () => {
    expect(css).toMatch(/\.admin-group-head \{[^}]*flex-wrap: wrap/)
    expect(css).toMatch(/\.admin-group-heading \{[^}]*flex: 1 1 140px/)
    expect(css).toMatch(/\.admin-group-badge \{[^}]*white-space: normal[^}]*overflow-wrap: anywhere/s)
    expect(css).toMatch(/@media \(max-width: 520px\) \{\s*\.admin-group-badge \{[^}]*flex: 1 0 100%/)
    expect(css).toMatch(/\.admin-counts \{[^}]*flex-wrap: wrap/)
    expect(css).not.toMatch(/\.admin-group-badge \{[^}]*white-space: nowrap/)
  })
})

describe('9.2 · botones flotantes y zonas seguras', () => {
  it('una franja del color del fondo bajo los botones de Pepa y compartir, que no recibe toques y respeta la zona segura de arriba', () => {
    expect(css).toMatch(/\.screen\.admin-center::before \{[^}]*position: fixed[^}]*env\(safe-area-inset-top/s)
    expect(css).toMatch(/\.screen\.admin-center::before \{[^}]*z-index: 39[^}]*pointer-events: none/s)
  })
  it('el final de la página queda por encima de la barra inferior y del indicador de inicio del iPhone', () => {
    expect(css).toMatch(/\.screen\.admin-center \{[^}]*padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom/s)
  })
  it('los botones existentes no se tocan: siguen flotando con su capa y su comportamiento', () => {
    const styles = readFileSync('src/ui/styles.css', 'utf8')
    expect(styles).toMatch(/\.voice-fab-round \{[^}]*position: fixed[^}]*z-index: 40/s)
  })
})
