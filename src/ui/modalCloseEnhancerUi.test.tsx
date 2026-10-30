// @vitest-environment jsdom
// UI-POP-01 — X en toda ventana emergente que se puede cerrar: se añade sola, no se duplica, cierra por el camino de siempre (toque en la capa), no aparece en confirmaciones que no
// se pueden cerrar tocando fuera y avisa si hay algo escrito sin guardar.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModalCloseEnhancer, hasCloseControl } from '@/ui/ModalCloseEnhancer'

afterEach(cleanup)

function Demo({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <ModalCloseEnhancer />
      {open && (
        <div
          className="modal-overlay"
          onClick={() => {
            onClose?.()
            setOpen(false)
          }}
        >
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            {children}
          </div>
        </div>
      )}
    </>
  )
}

describe('UI-POP-01 · X automática', () => {
  it('una ventana sin X recibe la suya (con nombre accesible y zona táctil) y al pulsarla se cierra como al tocar fuera', async () => {
    const onClose = vi.fn()
    render(
      <Demo onClose={onClose}>
        <h3>Elegir algo</h3>
        <p>contenido</p>
      </Demo>,
    )
    const x = await screen.findByRole('button', { name: 'Cerrar' })
    expect(x.className).toContain('auto-modal-close')
    fireEvent.click(x)
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('Elegir algo')).toBeNull())
  })

  it('no duplica una X que ya existe (botón modal-close, ✕ o «Cerrar» de icono)', async () => {
    const { container, unmount } = render(
      <Demo>
        <button type="button" className="modal-close" aria-label="Cerrar">
          ✕
        </button>
      </Demo>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(container.ownerDocument.querySelectorAll('[data-testid="auto-modal-close"]')).toHaveLength(0)
    unmount()
    expect(hasCloseControl(document.createRange().createContextualFragment('<div><button>✕</button></div>').firstElementChild as Element)).toBe(true)
    expect(hasCloseControl(document.createRange().createContextualFragment('<div><button>Guardar</button></div>').firstElementChild as Element)).toBe(false)
  })

  it('una confirmación que no se cierra tocando fuera (alertdialog / sin manejador) NO recibe X: no se salta nada', async () => {
    render(
      <>
        <ModalCloseEnhancer />
        <div className="modal-overlay" role="alertdialog" aria-label="Borrar compra">
          <div className="modal-sheet">
            <p>¿Seguro?</p>
          </div>
        </div>
        <div className="modal-overlay">
          <div className="modal-sheet">
            <p>sin manejador</p>
          </div>
        </div>
      </>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull()
  })

  it('con algo escrito sin guardar pregunta antes de cerrar; si se cancela, la ventana sigue y no se pierde nada', async () => {
    const onClose = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <Demo onClose={onClose}>
        <input aria-label="Nombre" defaultValue="" />
      </Demo>,
    )
    const x = await screen.findByRole('button', { name: 'Cerrar' })
    fireEvent.input(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
    fireEvent.click(x)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nombre')).toBeTruthy()
    confirm.mockReturnValue(true)
    fireEvent.click(x)
    expect(onClose).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })

  it('escribir en un buscador no cuenta como cambios sin guardar', async () => {
    const onClose = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    render(
      <Demo onClose={onClose}>
        <input type="search" aria-label="Buscar" />
      </Demo>,
    )
    const x = await screen.findByRole('button', { name: 'Cerrar' })
    fireEvent.input(screen.getByLabelText('Buscar'), { target: { value: 'leche' } })
    fireEvent.click(x)
    expect(confirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('con dos ventanas apiladas, cada X cierra solo la suya', async () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    function Stack() {
      const [a, setA] = useState(true)
      const [b, setB] = useState(true)
      return (
        <>
          <ModalCloseEnhancer />
          {a && (
            <div
              className="modal-overlay"
              onClick={() => {
                closeA()
                setA(false)
              }}
            >
              <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
                <p>ventana A</p>
              </div>
            </div>
          )}
          {b && (
            <div
              className="modal-overlay"
              onClick={() => {
                closeB()
                setB(false)
              }}
            >
              <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
                <p>ventana B</p>
              </div>
            </div>
          )}
        </>
      )
    }
    render(<Stack />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(2))
    const xs = screen.getAllByRole('button', { name: 'Cerrar' })
    fireEvent.click(xs[1])
    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).not.toHaveBeenCalled()
  })
})
