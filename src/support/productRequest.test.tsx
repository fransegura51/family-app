// @vitest-environment jsdom
// «Solicitar nuevo producto»: una incidencia de Soporte de tipo «Solicitud de producto», sin datos personales ni financieros y sin sistema paralelo.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const createTicket = vi.fn(async () => 'ticket-1')
vi.mock('@/support/data', () => ({ createTicket }))
let enabled = true
vi.mock('@/support/flags', () => ({
  get SUPPORT_ENABLED() {
    return enabled
  },
}))

const { buildProductRequest } = await import('@/support/productRequest')
const { ProductRequestSheet } = await import('@/support/ui/ProductRequestSheet')
const { KIND_LABEL } = await import('@/support/labels')
const { KINDS } = await import('@/support/validate')

afterEach(() => {
  cleanup()
  createTicket.mockClear()
  enabled = true
})
const root = process.cwd()

describe('contenido de la solicitud', () => {
  it('lleva el nombre del ticket, el producto buscado, la categoría sugerida y las observaciones', () => {
    const t = buildProductRequest({ raw: 'BOLSA RAFIA', searched: 'bolsa de rafia', suggestedCategory: 'Utensilios cocina', notes: 'La compro en el Mercadona' })
    expect(t.kind).toBe('solicitud_producto')
    expect(t.section).toBe('compras')
    expect(t.subject).toBe('Solicitud de producto: bolsa de rafia')
    expect(t.body).toBe('Nombre en el ticket: BOLSA RAFIA\nProducto buscado: bolsa de rafia\nCategoría sugerida: Utensilios cocina\nObservaciones: La compro en el Mercadona')
  })
  it('no lleva nada más: solo esos cuatro campos (ni tienda, ni importes, ni personas)', () => {
    const t = buildProductRequest({ raw: 'X', searched: 'y', ...({ store: 'Mercadona', price: 12, familyId: 'f1', email: 'a@b.es' } as object) })
    expect(t.body).not.toMatch(/Mercadona|12|f1|a@b/)
    expect(Object.keys(t).sort()).toEqual(['body', 'kind', 'section', 'subject'])
  })
  it('respeta los límites de Soporte y funciona aunque falten campos', () => {
    const long = buildProductRequest({ searched: 'a'.repeat(500), notes: 'n'.repeat(5000) })
    expect(long.subject.length).toBeLessThanOrEqual(120)
    expect(long.body.length).toBeLessThanOrEqual(4000)
    expect(buildProductRequest({}).body).toBe('Falta un producto en el catálogo.')
  })
})

describe('encaje con el Soporte existente', () => {
  it('es un tipo más de incidencia, con su etiqueta, en el cliente y en la migración pendiente del servidor', () => {
    expect(KINDS).toContain('solicitud_producto')
    expect(KIND_LABEL.solicitud_producto).toBe('Solicitud de producto')
    const sql = readFileSync(join(root, 'supabase/pending-migrations/0310_support_tickets.sql'), 'utf8')
    expect((sql.match(/'solicitud_producto'/g) ?? []).length).toBeGreaterThanOrEqual(2) // la restricción de la tabla y la validación de la función
  })
  it('crea la incidencia con la función de siempre y avisa de que se contestará por Soporte', async () => {
    const onSent = vi.fn()
    render(<ProductRequestSheet context={{ raw: 'BOLSA RAFIA', searched: 'bolsa rafia', classLabel: 'Utensilios cocina' }} onClose={() => undefined} onSent={onSent} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() => expect(createTicket).toHaveBeenCalledTimes(1))
    const arg = (createTicket.mock.calls as unknown as unknown[][])[0][0] as { kind: string; section: string; body: string; context: Record<string, string> }
    expect(arg.kind).toBe('solicitud_producto')
    expect(arg.section).toBe('compras')
    expect(arg.body).toContain('Nombre en el ticket: BOLSA RAFIA')
    expect(arg.context).toEqual({ section: 'compras' }) // sin datos técnicos ni personales extra
    expect(await screen.findByText(/Solicitud enviada/)).toBeTruthy()
    expect(onSent).toHaveBeenCalledWith('ticket-1')
  })
  it('la persona ve exactamente lo que se va a enviar', () => {
    render(<ProductRequestSheet context={{ raw: 'BOLSA RAFIA', searched: 'bolsa rafia', classLabel: '' }} onClose={() => undefined} />)
    expect(screen.getByText(/Se enviará solo esto, sin datos personales ni importes/)).toBeTruthy()
    expect(screen.getByText(/Producto buscado: bolsa rafia/)).toBeTruthy()
  })
  it('con el Soporte apagado no se pinta nada', () => {
    enabled = false
    const { container } = render(<ProductRequestSheet context={{ raw: 'X', searched: 'x', classLabel: '' }} onClose={() => undefined} />)
    expect(container.textContent).toBe('')
    expect(document.body.textContent).not.toContain('Solicitar nuevo producto')
  })
  it('revisa cada solicitud individualmente: no hay ningún mínimo de solicitudes en el código', () => {
    const code = readFileSync(join(root, 'src/support/productRequest.ts'), 'utf8')
    expect(code).not.toMatch(/mínimo|minimum|threshold|umbral/i)
  })
})
