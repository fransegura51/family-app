import { describe, expect, it } from 'vitest'

// INV-EDITOR-4 — reforma UX móvil del diseñador. Igual que invitationDesignerUndo.test.ts: sin React
// Testing Library en este proyecto, se comprueba leyendo el código fuente real. styles.css no se
// comprueba aquí por el mismo motivo (Vitest no expone su texto vía import.meta.glob(?raw) como sí hace
// con .tsx, y este proyecto no tiene @types/node para leerlo con fs) — .invitation-toolbar (safe-area) y
// .invitation-canvas-wrap (flex:1) se han verificado a mano en el propio archivo.
const SRC = (import.meta.glob('/src/ui/InvitationDesigner.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/InvitationDesigner.tsx'
]

describe('el antiguo bloque fijo "Elemento seleccionado" ha desaparecido', () => {
  it('ya no existe ese texto ni la tarjeta permanente con todos los controles', () => {
    expect(SRC).not.toContain('Elemento seleccionado')
  })
})

describe('barra SIN selección: exactamente las 6 acciones pedidas', () => {
  it('Texto, Datos, Foto, Emoji, Forma y Plantilla, nada de controles de texto/color', () => {
    const idx = SRC.indexOf('{!selected ? (')
    const block = SRC.slice(idx, SRC.indexOf(') : isTextLike ? (', idx))
    for (const label of ['Texto', 'Datos', 'Foto', 'Emoji', 'Forma', 'Plantilla']) {
      expect(block).toContain(`<span>${label}</span>`)
    }
    expect(block).not.toContain("togglePanel('color')")
    expect(block).not.toContain("togglePanel('efecto')")
  })
})

describe('barra CON texto/datos seleccionados: solo herramientas de texto', () => {
  it('Editar, Color, Fuente, Efecto, Tamaño y Más — nunca Plantilla/Emoji/Forma', () => {
    const start = SRC.indexOf(') : isTextLike ? (')
    const block = SRC.slice(start, SRC.indexOf(") : selected.type === 'shape' ? (", start))
    for (const label of ['Editar', 'Color', 'Fuente', 'Efecto', 'Tamaño', 'Más']) {
      expect(block).toContain(`<span>${label}</span>`)
    }
    expect(block).not.toContain("togglePanel('plantilla')")
    expect(block).not.toContain("togglePanel('emoji')")
    expect(block).not.toContain("togglePanel('forma')")
  })
})

describe('barra CON foto o emoji seleccionados: nunca controles de texto', () => {
  it('solo Tamaño y Más — ni Editar, ni Color, ni Fuente, ni Efecto', () => {
    const start = SRC.indexOf('// foto | emoji — sin controles de texto/color.')
    expect(start).toBeGreaterThan(-1)
    const block = SRC.slice(start, SRC.indexOf('</>\n                )}', start))
    expect(block).toContain('<span>Tamaño</span>')
    expect(block).toContain('<span>Más</span>')
    expect(block).not.toContain('<span>Editar</span>')
    expect(block).not.toContain('<span>Color</span>')
    expect(block).not.toContain('<span>Fuente</span>')
    expect(block).not.toContain('<span>Efecto</span>')
  })
})

describe('barra CON forma seleccionada: Color + Tamaño, sin controles de texto', () => {
  it('incluye Color (las formas sí tienen color) pero no Fuente/Efecto/Editar', () => {
    const start = SRC.indexOf(") : selected.type === 'shape' ? (")
    const block = SRC.slice(start, SRC.indexOf(') : (', start))
    expect(block).toContain('<span>Color</span>')
    expect(block).toContain('<span>Tamaño</span>')
    expect(block).not.toContain('<span>Fuente</span>')
    expect(block).not.toContain('<span>Efecto</span>')
    expect(block).not.toContain('<span>Editar</span>')
  })
})

describe('un único panel secundario a la vez', () => {
  it('el panel se renderiza como mucho una vez por selección de tipo (guardas mutuamente excluyentes)', () => {
    // Cada bloque "panel === 'x' && ..." está protegido por el mismo `panel` — nunca dos a la vez porque
    // `panel` es un único valor (DesignerPanel | null), nunca una lista.
    expect(SRC).toContain('const [panel, setPanel] = useState<DesignerPanel | null>(null)')
    const panelChecks = SRC.match(/panel === '\w+' &&/g) ?? []
    expect(panelChecks.length).toBeGreaterThanOrEqual(9) // plantilla, emoji, forma, texto, color, fuente, efecto, tamano, mas
  })

  it('togglePanel cierra el panel si ya estaba abierto (nunca dos abiertos)', () => {
    const fn = SRC.slice(SRC.indexOf('function togglePanel'), SRC.indexOf('\n  }', SRC.indexOf('function togglePanel')))
    expect(fn).toContain("cur === p ? null : p")
  })
})

describe('todos los efectos de texto se conservan (ninguno se ha quitado para simplificar)', () => {
  it('3D, purpurina, arcoíris fijo, arcoíris animado, iridiscente y metalizado siguen en TEXT_STYLE_OPTIONS', () => {
    const start = SRC.indexOf('const TEXT_STYLE_OPTIONS')
    const arrayOpen = SRC.indexOf('= [', start) + 2
    const block = SRC.slice(arrayOpen, SRC.indexOf(']', arrayOpen))
    for (const value of ['3d', 'sparkle', 'rainbow_static', 'rainbow_animated', 'iridescent', 'metallic']) {
      expect(block).toContain(`'${value}'`)
    }
  })
})

describe('el lienzo y la barra contextual usan las clases nuevas (CSS verificado a mano en styles.css)', () => {
  it('el lienzo usa .invitation-canvas-wrap y la barra .invitation-toolbar-wrap/.invitation-toolbar', () => {
    expect(SRC).toContain('className="invitation-canvas-wrap"')
    expect(SRC).toContain('className="invitation-toolbar-wrap"')
    expect(SRC).toContain('className="invitation-toolbar"')
  })
})
