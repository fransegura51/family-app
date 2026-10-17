// La casilla «Avisarme cuando alguien llegue o se vaya de aquí» vive en la tarjeta de cada lugar (visible, se guarda al marcarla), no dentro de «Editar».
// «Lugares frecuentes» es una tarjeta grande y plegable, y ticar no mueve la pantalla.
import { describe, expect, it } from 'vitest'
import screen from '@/ui/LocationScreen.tsx?raw'
import { readFileSync } from 'node:fs'

const src = screen.replace(/\r\n/g, '\n')
// styles.css no se puede importar como texto (vitest lo vacía): se lee del disco.
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
// Cada tarjeta de lugar es el componente PlaceRow: su formulario de edición empieza en «if (editing)» y la tarjeta normal en el segundo «return (».
const rowStart = src.indexOf('function PlaceRow')
const rowEnd = src.indexOf('\nfunction ', rowStart + 10)
const row = src.slice(rowStart, rowEnd === -1 ? undefined : rowEnd)
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

  it('al ticar no se pone «Cargando…» (la pantalla no se mueve): se refresca en segundo plano', () => {
    expect(row).toContain('onNotifyChanged()')
    const toggle = row.slice(row.indexOf('async function handleToggleNotify'), row.indexOf('async function handleSaveEdit'))
    expect(toggle).not.toContain('onChanged()')
    expect(src).toContain('onNotifyChanged={() => reload(true)}')
  })

  it('si falla guardar, vuelve a como estaba y avisa', () => {
    expect(row).toContain('setNotifyOn(!enabled)')
    expect(row).toContain("'No se pudo cambiar el aviso'")
  })
})

describe('«Lugares frecuentes»: tarjeta grande y plegable', () => {
  it('lleva el título grande y cuántos lugares hay guardados, y sigue siendo plegable', () => {
    expect(src).toContain('className="places-toggle-card"')
    expect(src).toContain('<span className="places-toggle-title">Lugares frecuentes</span>')
    expect(src).toContain('lugares guardados')
    expect(src).toContain('aria-expanded={placesOpen}')
    expect(src).toContain('const [placesOpen, setPlacesOpen] = useState(false)')
  })

  it('el título es grande (22 px) y la tarjeta tiene borde para que no pase desapercibida', () => {
    expect(css).toMatch(/\.places-toggle-title \{\n\s*font-size: 22px;/)
    expect(css).toMatch(/\.places-toggle-card \{[^}]*border: 2px solid var\(--primary\)/)
  })
})
