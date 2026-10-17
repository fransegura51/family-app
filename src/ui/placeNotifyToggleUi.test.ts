// La casilla «Avisarme cuando alguien llegue o se vaya de aquí» vive en la tarjeta de cada lugar (visible, se guarda al marcarla), no dentro de «Editar».
import { describe, expect, it } from 'vitest'
import screen from '@/ui/LocationScreen.tsx?raw'

const src = screen.replace(/\r\n/g, '\n')
// Cada tarjeta de lugar es el componente PlaceRow: su formulario de edición empieza en «if (editing)» y la tarjeta normal en el segundo «return (».
const rowStart = src.indexOf('function PlaceRow')
const row = src.slice(rowStart, src.indexOf('\nfunction ', rowStart + 10) === -1 ? undefined : src.indexOf('\nfunction ', rowStart + 10))
const editForm = row.slice(row.indexOf('if (editing)'), row.indexOf('\n  return (\n    <div className="card task-card">'))
const card = row.slice(row.indexOf('\n  return (\n    <div className="card task-card">'))

describe('tarjeta de lugar: aviso de llegada y salida', () => {
  it('la casilla está visible en la tarjeta y se guarda al momento', () => {
    expect(card).toContain('Avisarme cuando alguien llegue o se vaya de aquí')
    expect(card).toContain('type="checkbox" checked={notifyOn}')
    expect(card).toContain('handleToggleNotify(e.target.checked)')
    expect(row).toContain('await setPlaceNotifyArrivals(place.id, enabled)')
  })

  it('«Editar» ya no la lleva (solo nombre, categoría y radio)', () => {
    expect(editForm).not.toContain('Avisarme cuando alguien llegue')
    expect(editForm).not.toContain('checkbox')
    expect(row).not.toContain('editNotify')
  })

  it('si falla guardar, vuelve a como estaba y avisa', () => {
    expect(row).toContain('setNotifyOn(!enabled)')
    expect(row).toContain("'No se pudo cambiar el aviso'")
  })
})
