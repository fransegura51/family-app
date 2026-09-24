import { describe, expect, it } from 'vitest'

// INV-EDITOR-3 — Deshacer de verdad. No hay React Testing Library en este proyecto (ver el resto de
// src/ui/*Ui*.test.ts): las pantallas se comprueban leyendo el código fuente real y afirmando cómo está
// cableado, mismo patrón que ya usan eventosTaskCardUi.test.ts / shoppingPepaCarousel.test.ts.
const SRC = (import.meta.glob('/src/ui/InvitationDesigner.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/InvitationDesigner.tsx'
]

describe('constante nombrada, no número mágico', () => {
  it('el límite de historial es una constante con nombre, usada en pushHistory', () => {
    expect(SRC).toMatch(/const MAX_HISTORY_ENTRIES = \d+/)
    expect(SRC).toContain('h.slice(-(MAX_HISTORY_ENTRIES - 1))')
  })
})

describe('el snapshot de historial incluye el fondo, no solo las capas', () => {
  it('EditorSnapshot guarda plantilla, degradado, foto de fondo y su pan/zoom junto con las capas', () => {
    const idx = SRC.indexOf('interface EditorSnapshot')
    const block = SRC.slice(idx, SRC.indexOf('}', idx))
    for (const field of ['layers', 'templateKey', 'backgroundGradient', 'backgroundImagePath', 'backgroundImageUrl', 'backgroundOffsetX', 'backgroundOffsetY', 'backgroundScale']) {
      expect(block).toContain(field)
    }
  })

  it('handleUndo restaura TODOS los campos del snapshot, no solo las capas', () => {
    const idx = SRC.indexOf('function handleUndo')
    const block = SRC.slice(idx, SRC.indexOf('\n  }', idx))
    for (const setter of ['setLayers(prev', 'setTemplateKey(prev', 'setBackgroundGradient(prev', 'setBackgroundImagePath(prev', 'setBackgroundImageUrl(prev', 'setBackgroundOffsetX(prev', 'setBackgroundOffsetY(prev', 'setBackgroundScale(prev']) {
      expect(block).toContain(setter)
    }
  })
})

describe('cambios discretos (un clic completo) siempre son deshacibles', () => {
  it('color preset, fuente, efecto de texto y tamaño ± usan updateSelectedDiscrete (pushHistory en cada clic)', () => {
    const discreteCalls = SRC.match(/updateSelectedDiscrete\(/g) ?? []
    // color preset, fontFamily, textStyle, fontSize A-, fontSize A+ = 5 sitios como mínimo.
    expect(discreteCalls.length).toBeGreaterThanOrEqual(5)
    const fn = SRC.slice(SRC.indexOf('function updateSelectedDiscrete'), SRC.indexOf('\n  }', SRC.indexOf('function updateSelectedDiscrete')))
    expect(fn).toContain('pushHistory()')
  })
})

describe('cambios continuos (escribir, arrastrar) se agrupan en una sola operación deshacible', () => {
  it('updateSelectedContinuous solo abre historial al cambiar de campo (fieldKey), no en cada pulsación', () => {
    const fn = SRC.slice(SRC.indexOf('function updateSelectedContinuous'), SRC.indexOf('\n  }', SRC.indexOf('function updateSelectedContinuous')))
    expect(fn).toContain('continuousEditRef.current !== fieldKey')
    expect(fn).toContain('pushHistory()')
  })

  it('texto, rueda de color y curva usan updateSelectedContinuous con su propia fieldKey', () => {
    expect(SRC).toContain("updateSelectedContinuous({ text: e.target.value }, 'text')")
    expect(SRC).toContain("updateSelectedContinuous({ color: e.target.value }, 'color')")
    expect(SRC).toContain("updateSelectedContinuous({ curve: Number(e.target.value) }, 'curve')")
  })

  it('los tres cierran la sesión continua al terminar el gesto (blur/soltar), con commitContinuousEdit', () => {
    const occurrences = SRC.match(/commitContinuousEdit/g) ?? []
    // La propia función + al menos 3 sitios que la usan como manejador (texto, color, curva).
    expect(occurrences.length).toBeGreaterThanOrEqual(4)
  })
})

describe('seleccionar otro elemento cierra cualquier edición continua en curso', () => {
  it('selectLayer resetea continuousEditRef antes de cambiar la selección', () => {
    const fn = SRC.slice(SRC.indexOf('function selectLayer'), SRC.indexOf('\n  }', SRC.indexOf('function selectLayer')))
    expect(fn).toContain('continuousEditRef.current = null')
    expect(fn).toContain('setSelectedId(id)')
  })

  it('los sitios donde cambia la selección usan selectLayer, no setSelectedId directamente', () => {
    // Solo debe quedar una llamada real a setSelectedId: la de dentro de la propia selectLayer.
    const raw = (SRC.match(/[^.]setSelectedId\(/g) ?? []).length
    expect(raw).toBe(1)
  })
})

describe('acciones ya deshacibles de antes siguen pushing history (regresión)', () => {
  it('añadir capa, duplicar, borrar, reordenar, restaurar plantilla y "Pepa, hazla bonita" llaman a pushHistory', () => {
    for (const fnName of ['handleAddLayer', 'handleDuplicate', 'handleDeleteSelected', 'handleReorder', 'handleRestoreTemplate', 'handlePrettify']) {
      const start = SRC.indexOf(`function ${fnName}`)
      expect(start, `${fnName} debería existir`).toBeGreaterThan(-1)
      const end = SRC.indexOf('\n  }', start)
      expect(SRC.slice(start, end)).toContain('pushHistory()')
    }
  })
})

describe('cambios de fondo ahora sí entran en el historial (antes no)', () => {
  it('subir foto de fondo (primera vez y siguientes) es deshacible', () => {
    const start = SRC.indexOf('async function handleBackgroundPhotoChange')
    const end = SRC.indexOf('\n  }', start)
    const body = SRC.slice(start, end)
    expect(body).toContain('pushHistory()')
    // pushHistory ya no debe vivir solo dentro del "if (!backgroundImagePath)".
    const ifIdx = body.indexOf('if (!backgroundImagePath)')
    expect(body.indexOf('pushHistory()')).toBeLessThan(ifIdx)
  })

  it('quitar la foto de fondo es deshacible', () => {
    const start = SRC.indexOf('function handleRemoveBackgroundPhoto')
    const end = SRC.indexOf('\n  }', start)
    expect(SRC.slice(start, end)).toContain('pushHistory()')
  })

  it('mover/hacer zoom del fondo (pan/pinch) guarda UN solo snapshot al empezar el gesto', () => {
    const start = SRC.indexOf('function handleBackgroundPointerDown')
    const end = SRC.indexOf('\n  }', start)
    const body = SRC.slice(start, end)
    const ifIdx = body.indexOf('if (!bgDragRef.current)')
    const pushIdx = body.indexOf('pushHistory()')
    expect(pushIdx).toBeGreaterThan(ifIdx)
    expect(pushIdx).toBeLessThan(body.indexOf('bgDragRef.current = {'))
  })

  it('cambiar de plantilla es deshacible aunque las capas no cambien de sitio', () => {
    const start = SRC.indexOf('onSelect={(t) => {')
    const end = SRC.indexOf('}}', start)
    const body = SRC.slice(start, end)
    const pushIdx = body.indexOf('pushHistory()')
    const ifIdx = body.indexOf('if (layers.length === 3)')
    expect(pushIdx).toBeGreaterThan(-1)
    expect(pushIdx).toBeLessThan(ifIdx)
  })
})
