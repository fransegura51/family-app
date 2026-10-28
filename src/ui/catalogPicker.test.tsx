// @vitest-environment jsdom
// Selector de catálogo reutilizable: buscar, explorar sin escribir, elegir variante, solicitar un producto y comportarse bien en el móvil.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogPicker } from '@/ui/CatalogPicker'

afterEach(cleanup)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8')

const open = (props: Partial<Parameters<typeof CatalogPicker>[0]> = {}) => {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<CatalogPicker raw="LECHE ASTURIANA S" onPick={onPick} onClose={onClose} {...props} />)
  return { onPick, onClose }
}
const type = (q: string) => fireEvent.change(screen.getByLabelText('Buscar el producto'), { target: { value: q } })

describe('CatalogPicker', () => {
  it('enseña el texto del ticket y, sin escribir nada, las categorías para explorar', () => {
    open()
    expect(screen.getByText('LECHE ASTURIANA S')).toBeTruthy()
    expect(screen.getByText(/O explora por categoría/)).toBeTruthy()
    expect(screen.getAllByRole('button').some((b) => /Lácteos/.test(b.textContent ?? ''))).toBe(true)
  })
  it('explorar por categoría: sus productos A–Z agrupados por subcategoría, y volver', () => {
    const { onPick } = open()
    fireEvent.click(screen.getAllByRole('button').find((b) => /Pescado y marisco/.test(b.textContent ?? '')) as HTMLElement)
    expect(screen.getByRole('button', { name: '← Categorías' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Merluza' }))
    expect(onPick).toHaveBeenCalledWith('pes.merluza')
  })
  it('«bolsa», «bolsas» o «basura» encuentran las bolsas de basura', () => {
    for (const q of ['bolsa', 'basura']) {
      open()
      type(q)
      expect(screen.getAllByRole('button').some((b) => /Bolsas de basura/.test(b.textContent ?? '')), q).toBe(true)
      cleanup()
    }
  })
  it('tolera erratas y abreviaturas', () => {
    open()
    type('lechee semi')
    expect(screen.getAllByRole('button').some((b) => /^Leche semidesnatada/.test(b.textContent ?? ''))).toBe(true)
  })
  it('no confirma nada solo: elegir un producto con variantes pregunta cuál, y la variante se elige sin repetir la búsqueda', () => {
    const { onPick } = open()
    type('leche')
    fireEvent.click(screen.getAllByRole('button').find((b) => /^Leches*Lácteos$/.test(b.textContent ?? '')) as HTMLElement)
    expect(onPick).not.toHaveBeenCalled()
    expect(screen.getByText(/¿Qué tipo de/)).toBeTruthy()
    const chips = within(screen.getByRole('group', { name: 'Variantes de Leche' }))
    expect(chips.getByRole('button', { name: 'Leche entera' })).toBeTruthy()
    fireEvent.click(chips.getByRole('button', { name: 'Leche semidesnatada' }))
    expect(onPick).toHaveBeenCalledWith('lac.leche.v_tipoleche_semi')
  })
  it('también se puede dejar en el producto principal sin especificar', () => {
    const { onPick } = open({ initialEntryKey: 'lac.leche' })
    expect(screen.getByRole('group', { name: 'Variantes de Leche' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Dejarlo como «Leche»/ }))
    expect(onPick).toHaveBeenCalledWith('lac.leche')
  })
  it('un producto sin variantes se elige directamente', () => {
    const { onPick } = open()
    type('merluza')
    fireEvent.click(screen.getByRole('button', { name: /^Merluza/ }))
    expect(onPick).toHaveBeenCalledWith('pes.merluza')
  })
  it('si no existe lo dice y ofrece «Solicitar nuevo producto» con lo buscado', () => {
    const onRequestProduct = vi.fn()
    open({ onRequestProduct })
    type('zzzzqq')
    expect(screen.getByText(/No hay un producto así en el catálogo/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar nuevo producto' }))
    expect(onRequestProduct).toHaveBeenCalledWith('zzzzqq')
  })
  it('sin la función de solicitud no se ofrece nada que no funcione', () => {
    open()
    expect(screen.queryByRole('button', { name: 'Solicitar nuevo producto' })).toBeNull()
  })
  it('listas cortas con «Ver más» y se cierra con ✕', () => {
    const { onClose } = open()
    type('a')
    expect(screen.queryAllByRole('button', { name: /Lácteos|Despensa/ }).length).toBeLessThanOrEqual(8)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('móvil: teclado, safe areas y controles táctiles', () => {
  const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)) + 1)
  it('la hoja va pegada arriba y respeta las zonas seguras del iPhone', () => {
    expect(block('.catalog-picker-overlay {')).toMatch(/align-items:\s*flex-start/)
    expect(block('.catalog-picker-overlay {')).toContain('env(safe-area-inset-top')
    expect(block('.catalog-picker-sheet {')).toContain('env(safe-area-inset-bottom')
    expect(block('.catalog-picker-sheet {')).toMatch(/100dvh/)
  })
  it('el campo de búsqueda es de 16 px (iOS no hace zoom) y los controles miden al menos 44 px', () => {
    expect(block('.catalog-picker-input {')).toMatch(/font-size:\s*16px/)
    for (const sel of ['.catalog-picker-input {', '.catalog-picker-hit {', '.catalog-picker-cat {', '.catalog-picker-chip {']) expect(block(sel), sel).toMatch(/min-height:\s*4[0-9]px/)
  })
  it('las listas tienen su propio desplazamiento: el teclado no empuja la página', () => {
    expect(block('.catalog-picker-body {')).toMatch(/overflow-y:\s*auto/)
  })
})
