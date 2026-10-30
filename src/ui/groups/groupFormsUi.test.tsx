// @vitest-environment jsdom
// «Solicitar datos»: el formulario público (cabecera con quien solicita, pie de PEPA exacto en el formulario y en la confirmación, obligatorias, datos delicados con fecha y
// consentimiento, vista previa, formulario cerrado y petición de eliminación) y la página que lo carga del servidor.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormFiller, GroupFormPublicScreen, PepaFormFooter, type PublicFormView } from '@/ui/groups/GroupFormPublicScreen'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const view = (over: Partial<PublicFormView> = {}): PublicFormView => ({
  kind: 'participante',
  title: 'Datos para la excursión',
  requesterName: 'Colegio Los Álamos',
  requesterContact: 'secretaria@colegio.es',
  groupName: 'Clase de Eric',
  purpose: 'Organizar la excursión',
  intro: 'Responde antes del viernes.',
  deadline: '2026-11-20',
  closed: false,
  personName: 'Eric García',
  fields: [
    { id: 'tel', type: 'telefono', label: 'Teléfono de urgencia', help: null, required: true, options: [], sensitive: false },
    { id: 'dni', type: 'texto', label: 'DNI', help: null, required: false, options: [], sensitive: true },
  ],
  retention: { max: '2026-12-31', today: '2026-10-30' },
  answered: false,
  previous: null,
  agreedExpires: null,
  retentionChangedSinceAnswer: false,
  retentionMax: '2026-12-31',
  deletion: null,
  ...over,
})

describe('BLOQUE 6.3 · identidad del solicitante y pie de PEPA', () => {
  it('la cabecera destaca quién solicita, el grupo, la finalidad y el contacto; PEPA no es el solicitante', () => {
    render(<FormFiller view={view()} onSubmit={vi.fn()} />)
    expect(screen.getByText(/Solicita los datos:/).textContent).toContain('Colegio Los Álamos')
    expect(screen.getByText('Clase de Eric')).toBeTruthy()
    expect(screen.getByText(/Organizar la excursión/)).toBeTruthy()
    expect(screen.getByText(/secretaria@colegio.es/)).toBeTruthy()
    expect(screen.getByText('Para: Eric García')).toBeTruthy()
    // Lo primero del documento es el solicitante, no PEPA.
    const html = document.body.innerHTML
    expect(html.indexOf('Solicita los datos')).toBeLessThan(html.indexOf('Pepa Family App'))
  })
  it('el pie lleva el logotipo oficial, el texto exacto y el enlace visible', () => {
    render(<PepaFormFooter />)
    expect(screen.getByText('Formulario creado vía Pepa Family App')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'https://pepafamilyapp.es' }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://pepafamilyapp.es')
    const logo = screen.getByAltText('Pepa Family App') as HTMLImageElement
    expect(logo.getAttribute('src')).toContain('pepa-family-app-logo-slogan')
  })
  it('el pie sale también en la pantalla de confirmación, en la de cerrado y en la de enlace no válido', () => {
    const { unmount } = render(<FormFiller view={view({ answered: true, previous: { tel: '600111222' } })} onSubmit={vi.fn()} />)
    expect(screen.getByText(/Hemos recibido la respuesta/)).toBeTruthy()
    expect(screen.getByText('Formulario creado vía Pepa Family App')).toBeTruthy()
    unmount()
    render(<FormFiller view={view({ closed: true })} onSubmit={vi.fn()} />)
    expect(screen.getByText(/ya está cerrado/)).toBeTruthy()
    expect(screen.getByText('Formulario creado vía Pepa Family App')).toBeTruthy()
  })
})

describe('BLOQUE 6.2 · responder', () => {
  it('una pregunta obligatoria vacía bloquea el envío y lo dice junto a la pregunta', async () => {
    const onSubmit = vi.fn()
    render(<FormFiller view={view()} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('Esta pregunta es obligatoria.')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it('un dato delicado exige aceptar la conservación; con la casilla, envía la respuesta con la fecha elegida', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, expires: '2026-12-31' })
    render(<FormFiller view={view()} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Teléfono de urgencia/), { target: { value: '600 111 222' } })
    fireEvent.change(screen.getByLabelText(/DNI/), { target: { value: '12345678Z' } })
    expect(screen.getByText(/como máximo hasta el/).textContent).toContain('31/12/2026')
    expect(screen.getByText(/Se eliminarán de PEPA el/).textContent).toContain('31/12/2026')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText(/Marca la casilla/)).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /He leído para qué se piden/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ answers: { tel: '600 111 222', dni: '12345678Z' }, consent: true })
    expect(await screen.findByText(/Hemos recibido la respuesta/)).toBeTruthy()
    expect(screen.getByText(/Tus datos protegidos se eliminarán de PEPA el/).textContent).toContain('31/12/2026')
  })
  it('sin datos delicados no se pide ninguna conservación', () => {
    render(<FormFiller view={view({ fields: [view().fields[0]], retention: null })} onSubmit={vi.fn()} />)
    expect(screen.queryByText(/Cuánto tiempo se guardan/)).toBeNull()
  })
  it('el enlace general pide el nombre de la persona a la que se refiere', async () => {
    const onSubmit = vi.fn()
    render(<FormFiller view={view({ kind: 'general', personName: null })} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Teléfono de urgencia/), { target: { value: '600 111 222' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText(/Escribe el nombre de la persona/)).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it('en la vista previa no se puede enviar nada', () => {
    render(<FormFiller view={view()} preview />)
    expect(screen.getByText(/No se envía nada desde aquí/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('BLOQUE 6.5 · eliminación y avisos de quien ya respondió', () => {
  it('muestra la fecha acordada y permite pedir la eliminación anticipada', async () => {
    const onRequestDeletion = vi.fn().mockResolvedValue(true)
    render(<FormFiller view={view({ answered: true, agreedExpires: '2026-11-09' })} onSubmit={vi.fn()} onRequestDeletion={onRequestDeletion} />)
    expect(screen.getByText(/Tus datos protegidos se eliminarán de PEPA el/).textContent).toContain('09/11/2026')
    expect(screen.getByText(/copia de seguridad/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Pedir que se eliminen antes/ }))
    fireEvent.click(screen.getByRole('button', { name: /Pedir que se eliminen ya/ }))
    await waitFor(() => expect(onRequestDeletion).toHaveBeenCalled())
    expect(await screen.findByText(/Has pedido que se eliminen antes/)).toBeTruthy()
  })
  it('avisa si quien organiza cambió la fecha máxima, sin alargar la de quien respondió', () => {
    render(<FormFiller view={view({ answered: true, agreedExpires: '2026-11-09', retentionChangedSinceAnswer: true, retentionMax: '2027-03-01' })} onSubmit={vi.fn()} />)
    expect(screen.getByText(/Ha cambiado la fecha máxima/).textContent).toContain('01/03/2027')
    expect(screen.getByText(/no se alarga/).textContent).toContain('09/11/2026')
  })
  it('si quien organiza debe conservarlos, se explica la excepción legal; si ya se eliminaron, también', () => {
    const { unmount } = render(<FormFiller view={view({ answered: true, agreedExpires: '2026-11-09', deletion: { status: 'conservado', legalReason: 'Obligación fiscal' } })} onSubmit={vi.fn()} />)
    expect(screen.getByText(/Obligación fiscal/)).toBeTruthy()
    unmount()
    render(<FormFiller view={view({ answered: true, agreedExpires: '2026-11-09', deletion: { status: 'eliminado', legalReason: null } })} onSubmit={vi.fn()} />)
    expect(screen.getByText(/ya se han eliminado/)).toBeTruthy()
  })
})

describe('página pública (carga y envío contra la función del servidor)', () => {
  it('pide el formulario por su token, lo pinta y envía con POST', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        if (!init || init.method !== 'POST') return new Response(JSON.stringify(view({ fields: [view().fields[0]], retention: null })), { status: 200 })
        return new Response(JSON.stringify({ ok: true, expires: null }), { status: 200 })
      }),
    )
    render(<GroupFormPublicScreen token="TOKEN123456789012345678" />)
    expect(await screen.findByText(/Solicita los datos:/)).toBeTruthy()
    expect(calls[0].url).toContain('group-form-public?token=TOKEN123456789012345678')
    fireEvent.change(screen.getByLabelText(/Teléfono de urgencia/), { target: { value: '600 111 222' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.init?.method === 'POST')!
    expect(JSON.parse(String(post.init!.body))).toMatchObject({ action: 'submit', answers: { tel: '600 111 222' } })
    vi.unstubAllGlobals()
  })
  it('un enlace que ya no existe lo dice con claridad (y lleva el pie)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    render(<GroupFormPublicScreen token="TOKENINEXISTENTE123456" />)
    expect(await screen.findByText(/ya no es válido/)).toBeTruthy()
    expect(screen.getByText('Formulario creado vía Pepa Family App')).toBeTruthy()
    vi.unstubAllGlobals()
  })
})
