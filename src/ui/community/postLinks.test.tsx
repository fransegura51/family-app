// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const listPosts = vi.fn()
vi.mock('@/data/community', () => ({ listPosts: (...a: unknown[]) => listPosts(...a) }))

const { parseRichText, richTextToPlain } = await import('@/domain/communityRichText')
const { CommunityRichText } = await import('@/ui/community/CommunityRichText')
const { TextWithPostLinks } = await import('@/ui/community/PostLink')
const { clearPostLinkCache } = await import('@/data/communityPostLinks')

const TITLE = 'Tortilla francesa: mucho más que huevo batido'

afterEach(() => {
  cleanup()
  listPosts.mockReset()
  clearPostLinkCache()
})

describe('enlaces internos [[Título]]', () => {
  it('el texto enriquecido los reconoce y el texto plano conserva el título', () => {
    const blocks = parseRichText(`Mira [[${TITLE}]] y [web](https://ejemplo.com).`)
    expect(JSON.stringify(blocks)).toContain('"t":"post"')
    expect(richTextToPlain(`Mira [[${TITLE}]].`)).toBe(`Mira ${TITLE}.`)
  })

  it('con el artículo publicado se convierte en enlace a su página, sin marcarlo como sitio externo', async () => {
    listPosts.mockResolvedValue([{ id: 'abc-123', title: TITLE }])
    render(
      <MemoryRouter>
        <p>
          <TextWithPostLinks text={`Si queréis otra idea, mirad [[${TITLE}]]`} />
        </p>
      </MemoryRouter>,
    )
    const a = await screen.findByRole('link', { name: TITLE })
    expect(a.getAttribute('href')).toBe('/comunidad/p/abc-123')
    expect(a.textContent).not.toMatch(/sitio externo|↗/)
    expect(listPosts).toHaveBeenCalledWith({ query: TITLE, limit: 10 })
  })

  it('compara sin tildes ni mayúsculas y funciona también en el cuerpo de una publicación', async () => {
    listPosts.mockResolvedValue([{ id: 'x1', title: 'TORTILLA FRANCESA: MUCHO MAS QUE HUEVO BATIDO' }])
    render(
      <MemoryRouter>
        <CommunityRichText text={`Lee [[${TITLE}]] hoy`} />
      </MemoryRouter>,
    )
    expect((await screen.findByRole('link', { name: TITLE })).getAttribute('href')).toBe('/comunidad/p/x1')
  })

  it('si el artículo no existe o no se puede ver, queda el título como texto, nunca un enlace roto', async () => {
    listPosts.mockResolvedValue([{ id: 'otro', title: 'Otro artículo distinto' }])
    const { container } = render(
      <MemoryRouter>
        <p>
          <TextWithPostLinks text={`Mirad [[${TITLE}]]`} />
        </p>
      </MemoryRouter>,
    )
    await waitFor(() => expect(listPosts).toHaveBeenCalled())
    expect(container.textContent).toBe(`Mirad ${TITLE}`)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('si la búsqueda falla, el texto se ve igual', async () => {
    listPosts.mockRejectedValue(new Error('red'))
    const { container } = render(
      <MemoryRouter>
        <p>
          <TextWithPostLinks text={`Mirad [[${TITLE}]]`} />
        </p>
      </MemoryRouter>,
    )
    await waitFor(() => expect(listPosts).toHaveBeenCalled())
    expect(container.textContent).toBe(`Mirad ${TITLE}`)
  })
})
