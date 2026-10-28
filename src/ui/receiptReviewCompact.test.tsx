// @vitest-environment jsdom
// Revisión de tickets compacta (NORM-3): dos renglones por línea, aviso de lo que pide revisión, controles separados de 44 px y conexión con el guardado.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLine } from '@/domain/catalog/lineReading'
import { ReceiptLineBrief, ReceiptLineReading, ReceiptLinesToolbar } from '@/ui/ReceiptLineReading'

afterEach(cleanup)
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('línea plegada', () => {
  it('en un renglón: estado, producto, variante, categoría y aviso de formato', () => {
    render(<ReceiptLineBrief reading={readLine({ name: 'LECHE SEMI P-6' })} classLabel="Lácteos" onOpen={() => undefined} />)
    const brief = screen.getByRole('button', { name: /Ver y editar: Leche semidesnatada/ })
    expect(brief.textContent).toContain('Lo entiendo')
    expect(brief.textContent).toContain('Lácteos')
    expect(brief.textContent).toContain('falta formato')
    expect(brief.textContent).not.toContain('Revisar')
  })
  it('lo dudoso o por confirmar se marca como «Revisar» y se abre con un toque', () => {
    const onOpen = vi.fn()
    render(<ReceiptLineBrief reading={readLine({ name: 'XILOFON AZUL' })} classLabel="" onOpen={onOpen} />)
    const brief = screen.getByRole('button', { name: /Ver y editar/ })
    expect(brief.textContent).toContain('No lo reconozco')
    expect(brief.textContent).toContain('Revisar')
    fireEvent.click(brief)
    expect(onOpen).toHaveBeenCalled()
  })
  it('sin nombre no pinta nada', () => {
    const { container } = render(<ReceiptLineBrief reading={readLine({ name: '' })} classLabel="" onOpen={() => undefined} />)
    expect(container.textContent).toBe('')
  })
})

describe('barra de un ticket largo', () => {
  it('cuenta las líneas por revisar, lleva a la primera y despliega o pliega todas', () => {
    const onOpen = vi.fn()
    const onExpandAll = vi.fn()
    render(<ReceiptLinesToolbar total={12} toCheck={[4, 9]} expandAll={false} onExpandAll={onExpandAll} onOpen={onOpen} />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('2 por revisar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ir a la primera' }))
    expect(onOpen).toHaveBeenCalledWith(4)
    fireEvent.click(screen.getByRole('button', { name: 'Desplegar todas' }))
    expect(onExpandAll).toHaveBeenCalledWith(true)
  })
  it('si todo se entiende lo dice y no ofrece ir a ninguna', () => {
    render(<ReceiptLinesToolbar total={5} toCheck={[]} expandAll={true} onExpandAll={() => undefined} onOpen={() => undefined} />)
    expect(screen.getByText(/todas entendidas/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ir a la primera' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Plegar todas' })).toBeTruthy()
  })
})

describe('«Es correcto» y «Cambiar producto» no se pisan', () => {
  const show = (name: string) => render(<ReceiptLineReading reading={readLine({ name })} classLabel="Lácteos" onChoose={() => undefined} />)
  it('son botones separados, no enlaces pegados', () => {
    show('LECHE INF 2')
    const [ok, change] = [screen.getByRole('button', { name: 'Es correcto' }), screen.getByRole('button', { name: 'Cambiar producto' })]
    expect(ok.className).toContain('receipt-line-reading-btn')
    expect(change.className).toContain('receipt-line-reading-btn')
    expect(ok.parentElement).toBe(change.parentElement)
  })
  it('un producto con variantes ofrece «Elegir variante» sin repetir la búsqueda', () => {
    const onChoose = vi.fn()
    render(<ReceiptLineReading reading={readLine({ name: 'LECHE ASTURIANA S' })} classLabel="Lácteos" onChoose={onChoose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Elegir variante' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leche semidesnatada' }))
    expect(onChoose).toHaveBeenCalledWith('lac.leche.v_tipoleche_semi')
  })
  it('Intro en el buscador no guarda el ticket (el selector va fuera del formulario)', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <ReceiptLineReading reading={readLine({ name: 'XILOFON AZUL' })} classLabel="" onChoose={() => undefined} />
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Elegir producto' }))
    const input = screen.getByLabelText('Buscar el producto')
    expect(input.closest('form')).toBeNull()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it('los botones miden al menos 44 px y tienen separación', () => {
    const css = src('src/ui/styles.css')
    const block = css.slice(css.indexOf('.receipt-line-reading-btn {'), css.indexOf('}', css.indexOf('.receipt-line-reading-btn {')) + 1)
    expect(block).toMatch(/min-height:\s*44px/)
    const actions = css.slice(css.lastIndexOf('.receipt-line-reading-actions {'), css.indexOf('}', css.lastIndexOf('.receipt-line-reading-actions {')) + 1)
    expect(actions).toMatch(/gap:\s*10px/)
  })
})

describe('conexión con la pantalla y el guardado', () => {
  const text = src('src/ui/FinanceScreen.tsx')
  it('los tickets largos se pliegan por defecto y se pueden desplegar de uno en uno o todos a la vez', () => {
    expect(text).toContain('const compactLines = lines.length > COMPACT_LINES_FROM')
    expect(text).toContain('data-line-compact="true"')
    expect(text).toContain('<ReceiptLinesToolbar')
    expect(text).toContain('<ReceiptLineBrief')
  })
  it('las líneas vacías o en edición siguen completas y todo lo de antes sigue accesible (nombre, cantidad, unidad, precio, formato)', () => {
    expect(text).toContain("line.name.trim() !== '' && !openLines.has(i)")
    expect(text).toContain('data-help-id="shopping.receipt-line-name"')
    expect(text).toContain('<LineFormatControl')
  })
  it('lo que pide revisión se marca (borde y aviso), sin cambiar el orden de las líneas', () => {
    expect(text).toContain("'receipt-line-card receipt-line-compact' + (needsCheck ? ' receipt-line-attention' : '')")
  })
  it('cambiar de producto o de variante lleva consigo la categoría de la familia (se ve al instante y se guarda); confirmar no la toca', () => {
    expect(text).toContain('if (key === reading.entryKey) return updateLine(i, { catalogProductKey: key })')
    expect(text).toContain('classOverride: own ? { kind: own.kind, classification: own.name } : undefined')
    expect(text).toContain('setProductCatalogKey(productId, line.catalogProductKey)')
  })
  it('«Solicitar nuevo producto» solo existe con el Soporte técnico encendido', () => {
    expect(text).toContain('const requestProduct = SUPPORT_ENABLED ? setRequestFor : undefined')
  })
})
