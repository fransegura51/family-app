// Campana de avisos en iPhone (17/10/2026): el panel no puede quedar bajo la barra de estado, y la campana no puede abrir un hueco encima del saludo.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const css = fs.readFileSync(path.resolve(__dirname, 'styles.css'), 'utf8')
const block = (selector: string) => {
  const i = css.indexOf(`
${selector} {`)
  expect(i, selector).toBeGreaterThan(-1)
  return css.slice(i, css.indexOf('}', i))
}

describe('panel de Avisos', () => {
  it('su cabecera (título y X) queda por debajo de la zona segura superior real del dispositivo, sin margen fijo grande', () => {
    expect(block('.notification-panel')).toContain('padding: calc(12px + env(safe-area-inset-top, 0px)) 16px')
  })

  it('el título y la X siguen en una sola cabecera alineada, y la X conserva su objetivo táctil de 44 px', () => {
    expect(block('.notification-panel-header')).toMatch(/display: flex;[\s\S]*align-items: center;[\s\S]*justify-content: space-between/)
    expect(block('.notification-close')).toContain('min-width: 44px')
    expect(block('.notification-close')).toContain('min-height: 44px')
  })
})

describe('campana en Inicio', () => {
  it('no ocupa una fila propia: altura 0, sin márgenes, así no empuja el saludo ni las tarjetas', () => {
    const row = block('.home-bell-row')
    expect(row).toContain('height: 0')
    expect(row).toContain('margin: 0')
  })

  it('el botón sigue siendo de 44 px, arriba a la derecha, y el saludo le deja sitio para no pasar por debajo', () => {
    expect(block('.home-bell-row .notification-bell')).toMatch(/position: absolute;\s*top: 0;\s*right: 0/)
    expect(block('.notification-bell')).toContain('min-width: 44px')
    expect(block('.home-header')).toContain('padding-right: 52px')
  })

  it('no se toca el hueco superior que reservan los botones flotantes (compartir y Pepa)', () => {
    expect(block('.app-content')).toContain('padding-top: calc(54px + env(safe-area-inset-top, 0px))')
  })
})
