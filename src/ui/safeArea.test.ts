// En el iPhone la app se dibuja por debajo de la barra del sistema (hora, batería, isla dinámica): los botones redondos de arriba y el hueco que se les
// reserva tienen que empezar DEBAJO de esa barra. Bug real (16/10/2026): quedaban tapados y no se podían tocar. Sin barra (Android, escritorio) todo igual.
import { describe, expect, it } from 'vitest'
import { FAB_SAFE_GAP_PX, fabTopCss, safeAreaTopPx } from '@/ui/safeArea'
import voiceCapture from '@/ui/VoiceCapture.tsx?raw'
import socialFab from '@/ui/SocialMenuFab.tsx?raw'
import { readFileSync } from 'node:fs'
import indexHtml from '../../index.html?raw'

// Los estilos se leen del disco: con `?raw` la herramienta de pruebas devuelve el CSS vacío.
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('fabTopCss', () => {
  it('nunca deja un botón por encima de la zona segura + un margen, y sin barra queda en la posición pedida', () => {
    expect(fabTopCss(8)).toBe('calc(max(8px, env(safe-area-inset-top, 0px) + 8px) + 0px)')
    expect(FAB_SAFE_GAP_PX).toBe(8)
  })

  it('suma el desplazamiento del arrastre y respeta una posición guardada más abajo', () => {
    expect(fabTopCss(120, -15)).toBe('calc(max(120px, env(safe-area-inset-top, 0px) + 8px) + -15px)')
  })
})

describe('safeAreaTopPx', () => {
  it('si no se puede medir (sin pantalla, como en las pruebas) devuelve 0 en vez de romper', () => {
    expect(safeAreaTopPx()).toBe(0)
  })
})

describe('los botones de arriba y su hueco respetan la barra del sistema', () => {
  it('la app ocupa toda la pantalla del iPhone, por eso hace falta respetar la zona segura', () => {
    expect(indexHtml).toContain('viewport-fit=cover')
  })

  it('los botones de Pepa y el de redes se colocan con fabTopCss, también el desplegable de redes y lo que se arrastra', () => {
    expect(voiceCapture).toContain('top: fabTopCss(pos.top, isDragging ? buttonDragOffset.y : 0)')
    expect(voiceCapture).toContain('Math.max(safeAreaTopPx() + FAB_SAFE_GAP_PX, rect.top)')
    expect(socialFab).toContain('top: fabTopCss(position.top, dragging ? dragOffset.y : 0)')
    expect(socialFab).toContain('top: fabTopCss(position.top, FAB_SIZE + 8)')
    expect(socialFab).toContain('Math.max(safeAreaTopPx() + FAB_SAFE_GAP_PX, rect.top)')
    // Nada vuelve a poner el top a pelo, sin zona segura.
    expect(voiceCapture).not.toMatch(/top: pos\.top \+/)
    expect(socialFab).not.toMatch(/top: position\.top \+/)
  })

  it('el hueco que se reserva arriba para la fila empieza debajo de la barra del sistema', () => {
    expect(css).toContain('padding-top: calc(54px + env(safe-area-inset-top, 0px));')
  })
})
