// @vitest-environment jsdom
// Sección «Solicitudes de datos» de la ficha del grupo, estados y mensaje de WhatsApp con el dominio oficial.
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { FormSummary } from '@/data/groupForms'
import { formShareUrl, formStatusLabel, inviteText, type FormItem } from '@/domain/groupForms'
import { FormsSection } from '@/ui/groups/GroupFormsSection'

afterEach(cleanup)

const form = (over: Partial<FormItem>): FormItem => ({
  id: 'f1',
  groupId: 'g1',
  createdBy: 'u',
  title: 'Correo para compartir carpetas',
  requesterName: 'Jennifer',
  requesterContact: null,
  purpose: 'Compartir carpetas',
  intro: null,
  fields: [],
  status: 'abierto',
  deadline: '2026-11-02',
  retentionMax: null,
  retentionHistory: [],
  publishedAt: null,
  createdAt: '2026-10-30',
  ...over,
})

describe('estados', () => {
  it('borrador, activo, caducado (pasó la fecha límite) y cerrado', () => {
    expect(formStatusLabel(form({ status: 'borrador' }), '2026-10-30')).toBe('Borrador')
    expect(formStatusLabel(form({}), '2026-11-02')).toBe('Activo') // el último día aún se puede responder
    expect(formStatusLabel(form({ deadline: null }), '2030-01-01')).toBe('Activo')
    expect(formStatusLabel(form({}), '2026-11-03')).toBe('Caducado')
    expect(formStatusLabel(form({ status: 'cerrado' }), '2026-10-30')).toBe('Cerrado')
  })
})

describe('«Solicitudes de datos» en la ficha del grupo', () => {
  const render1 = (summaries: FormSummary[]) =>
    render(
      <MemoryRouter>
        <FormsSection groupId="g1" summaries={summaries} />
      </MemoryRouter>,
    )
  it('sin solicitudes no pinta nada', () => {
    const { container } = render1([])
    expect(container.textContent).toBe('')
  })
  it('cada solicitud enseña título, estado, fecha límite, respuestas y pendientes, y enlaza al formulario real', () => {
    render1([
      { form: form({}), responses: 12, pending: 6 },
      { form: form({ id: 'f2', title: 'Tallas', status: 'cerrado', deadline: null }), responses: 1, pending: null },
    ])
    expect(screen.getByText('Solicitudes de datos')).toBeTruthy()
    expect(screen.getByText(/Fecha límite 02\/11\/2026 · 12 respuestas · 6 pendientes/)).toBeTruthy()
    expect(screen.getByText(/^1 respuesta$/)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Correo para compartir carpetas/ }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/grupos/g1/formularios/f1')
    expect(screen.getAllByRole('link', { name: 'Respuestas' }).map((a) => a.getAttribute('href'))).toContain('/grupos/g1/formularios/f1?pestana=respuestas')
    // Un formulario cerrado no ofrece editar ni compartir.
    expect(screen.getAllByRole('link', { name: 'Editar' })).toHaveLength(1)
  })
})

describe('enlace y mensaje de WhatsApp', () => {
  it('el enlace usa el dominio oficial y no el de GitHub', () => {
    const u = formShareUrl('abcDEF123_-xyz')
    expect(u).toBe('https://pepafamilyapp.es/f/?formulario=abcDEF123_-xyz')
    expect(u).not.toMatch(/github\.io/)
  })
  it('el mensaje empieza por quien solicita y el grupo, sin descripción genérica de PEPA', () => {
    const t = inviteText(
      { title: 'Correo para compartir carpetas', requesterName: 'Jennifer', purpose: 'Necesitamos un correo electrónico por familia para compartir las carpetas y documentos del grupo.', deadline: '2026-11-02' },
      'Clase de Eric 4C Infantil',
      formShareUrl('TOKEN1234'),
      null,
      (d) => d.split('-').reverse().join('/'),
    )
    expect(t).toBe(
      'Jennifer — Clase de Eric 4C Infantil\n\nCorreo para compartir carpetas\n\nNecesitamos un correo electrónico por familia para compartir las carpetas y documentos del grupo.\n\nFecha límite: 02/11/2026\n\nhttps://pepafamilyapp.es/f/?formulario=TOKEN1234',
    )
    expect(t).not.toMatch(/PEPA Family App|Organiza/)
  })
})
