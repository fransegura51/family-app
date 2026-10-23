// @vitest-environment jsdom
// Sugerencias mientras se escribe en el buscador de la Ayuda: salen del catálogo verificado (mismo índice y mismos permisos que la búsqueda normal), toleran mayúsculas, tildes y erratas,
// ordenan por relevancia, son pocas, abren directamente la respuesta y no sustituyen a «Preguntar». Sin IA ni servidor.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/domain/types'

const calls = vi.hoisted(() => ({ supabase: 0 }))
vi.mock('@/services/voice', () => ({ isSpeechSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        calls.supabase++
        return () => {
          throw new Error('Las sugerencias no deben llamar a Supabase')
        }
      },
    },
  ),
}))
vi.mock('@/data/communityStatusCache', () => ({ communityStatusCache: { peek: () => null, get: async () => null, prime: () => undefined, clear: () => undefined } }))

const { buildIndex, suggestHelp } = await import('@/help/search/searchEngine')
const { HELP_CARDS, LEGACY_ENTRIES, HELP_MODULE_BY_ID } = await import('@/help/catalog')
const { cardAccess } = await import('@/help/access')
const { HelpProvider } = await import('@/help/ui/HelpProvider')
const { HelpPanel } = await import('@/help/ui/HelpPanel')
const { HelpHint } = await import('@/help/ui/HelpHint')

afterEach(cleanup)

const index = buildIndex(HELP_CARDS, LEGACY_ENTRIES)
const ctx = (role: 'admin' | 'adult' | 'child' = 'adult') => ({ role, allowedSections: null, platform: 'web' as const, community: 'no' as const })
const suggest = (text: string, role: 'admin' | 'adult' | 'child' = 'adult') =>
  suggestHelp(index, text, { access: (doc) => (doc.kind === 'legacy' ? { status: 'allowed' } : cardAccess(doc.card, HELP_MODULE_BY_ID.get(doc.card.module), ctx(role))) })
const ids = (text: string, role: 'admin' | 'adult' | 'child' = 'adult') => suggest(text, role).map((h) => h.doc.id)

describe('motor de sugerencias', () => {
  it('«Añadir miem» sugiere añadir un miembro a la familia (y fichas relacionadas con miembros), en primer lugar la más relevante', () => {
    const r = ids('Añadir miem')
    expect(r[0]).toBe('fam-anadir-miembro')
    expect(r.length).toBeLessThanOrEqual(4)
    expect(r.every((id) => HELP_CARDS.some((c) => c.id === id))).toBe(true) // solo fichas verificadas
  })

  it('se actualiza conforme cambia el texto', () => {
    expect(ids('crear')).toContain('cal-crear-evento')
    expect(ids('crear even')[0]).toBe('cal-crear-evento')
    expect(ids('crear tar')[0]).toBe('cal-crear-tarea')
  })

  it('tolera mayúsculas, tildes y pequeñas erratas', () => {
    expect(ids('AÑADIR MIEM')[0]).toBe('fam-anadir-miembro')
    expect(ids('anadir miem')[0]).toBe('fam-anadir-miembro')
    expect(ids('añadir miemrbo')[0]).toBe('fam-anadir-miembro') // transposición
    expect(ids('menu seman')).toContain('coc-menu-semanal')
  })

  it('encuentra por coincidencias parciales de palabra y por palabras relacionadas (sinónimos)', () => {
    expect(ids('lista de la comp')).toEqual(expect.arrayContaining(['com-anadir-producto']))
    expect(ids('dentis')).toContain('cal-crear-evento') // «dentista» es sinónimo de la ficha de crear evento
    expect(ids('contrase')).toContain('cue-correo-contrasena')
  })

  it('pocas y útiles: nunca más de 4, nada con menos de 2 letras y nada para textos sin relación', () => {
    expect(suggest('a')).toEqual([])
    expect(suggest('')).toEqual([])
    expect(suggest('crear').length).toBeLessThanOrEqual(4)
    expect(suggest('xqzwv')).toEqual([])
  })

  it('respeta los permisos: no sugiere lo que esa persona no puede ver (Comunidad cerrada) ni lo oculto', () => {
    expect(ids('comunidad')).not.toContain('com2-publicar')
    for (const id of ids('alias')) {
      const card = HELP_CARDS.find((c) => c.id === id)!
      expect(cardAccess(card, HELP_MODULE_BY_ID.get(card.module), ctx()).status).not.toBe('hidden')
    }
  })

  it('no devuelve apartados de la explicación ampliada, solo fichas', () => {
    for (const t of ['calendario', 'compra', 'receta', 'puntos']) expect(suggest(t).every((h) => h.doc.kind === 'card')).toBe(true)
  })

  it('ordena por relevancia (rank descendente)', () => {
    const hits = suggest('añadir mie')
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1].rank).toBeGreaterThanOrEqual(hits[i].rank)
  })
})

describe('sugerencias en el buscador del panel', () => {
  const ADULT: Pick<Profile, 'role' | 'allowedSections'> = { role: 'adult', allowedSections: null }
  function open() {
    render(
      <MemoryRouter initialEntries={['/familia']}>
        <HelpProvider profile={ADULT}>
          <HelpHint label="Ayuda sobre este módulo" />
          <HelpPanel />
        </HelpProvider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ayuda sobre este módulo' }))
    return screen.getByRole('complementary')
  }
  const input = (panel: HTMLElement) => within(panel).getByLabelText('¿Qué quieres hacer o saber?') as HTMLInputElement

  it('al escribir aparecen sugerencias encima del cuadro; sin escribir no hay ninguna', async () => {
    const panel = open()
    expect(within(panel).queryByRole('listbox')).toBeNull()
    fireEvent.change(input(panel), { target: { value: 'Añadir miem' } })
    const list = await within(panel).findByRole('listbox', { name: 'Sugerencias de la Ayuda' })
    const options = within(list).getAllByRole('option')
    expect(options.length).toBeGreaterThanOrEqual(1)
    expect(options.length).toBeLessThanOrEqual(4)
    expect(options[0].textContent).toContain('Añadir un miembro a la familia')
    // encima del cuadro de escritura
    expect(list.compareDocumentPosition(input(panel)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('las sugerencias cambian al seguir escribiendo y desaparecen al borrar', async () => {
    const panel = open()
    fireEvent.change(input(panel), { target: { value: 'crear even' } })
    expect((await within(panel).findAllByRole('option'))[0].textContent).toContain('Crear un evento')
    fireEvent.change(input(panel), { target: { value: 'crear tar' } })
    expect((await within(panel).findAllByRole('option'))[0].textContent).toContain('Crear una tarea')
    fireEvent.change(input(panel), { target: { value: '' } })
    expect(within(panel).queryByRole('listbox')).toBeNull()
  })

  it('tocar una sugerencia abre directamente su respuesta, vacía el cuadro y cierra el teclado', async () => {
    const panel = open()
    input(panel).focus()
    fireEvent.change(input(panel), { target: { value: 'Añadir miem' } })
    fireEvent.click((await within(panel).findAllByRole('option'))[0])
    expect(within(panel).getByRole('article', { name: 'Añadir un miembro a la familia' })).toBeTruthy()
    expect(input(panel).value).toBe('')
    expect(document.activeElement).not.toBe(input(panel))
    expect(within(panel).queryByRole('listbox')).toBeNull()
  })

  it('«Preguntar» y la búsqueda normal siguen funcionando igual con sugerencias visibles', async () => {
    const panel = open()
    fireEvent.change(input(panel), { target: { value: 'crear un evento' } })
    await within(panel).findAllByRole('option')
    fireEvent.click(within(panel).getByRole('button', { name: 'Preguntar' }))
    expect(within(panel).getByRole('log').querySelectorAll('.help-bubble-user').length).toBe(1)
    expect(within(panel).getAllByRole('article').length).toBeGreaterThan(0)
  })

  it('no llama a Supabase ni a ninguna IA para sugerir', async () => {
    const before = calls.supabase
    const panel = open()
    fireEvent.change(input(panel), { target: { value: 'menu seman' } })
    await within(panel).findAllByRole('option')
    expect(calls.supabase).toBe(before)
  })

  it('accesibilidad básica: el cuadro es un combobox con lista asociada y cada sugerencia un botón de al menos 44 px de alto (CSS)', async () => {
    const panel = open()
    fireEvent.change(input(panel), { target: { value: 'Añadir miem' } })
    await within(panel).findByRole('listbox')
    expect(input(panel).getAttribute('role')).toBe('combobox')
    expect(input(panel).getAttribute('aria-controls')).toBe('help-suggestions')
    expect(input(panel).getAttribute('aria-expanded')).toBe('true')
    const css = (await import('node:fs')).readFileSync('src/help/ui/help.css', 'utf8')
    expect(css).toMatch(/\.help-suggestion \{[^}]*min-height: 44px/s)
  })
})
