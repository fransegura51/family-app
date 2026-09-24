import { describe, expect, it } from 'vitest'

// INV-EDITOR-6 — Restaurar plantilla sin sorpresas. Mismo patrón de comprobación por código fuente que
// el resto de tests de InvitationDesigner (sin React Testing Library en este proyecto).
const SRC = (import.meta.glob('/src/ui/InvitationDesigner.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/InvitationDesigner.tsx'
]

describe('"Restaurar plantilla" nunca toca la foto de fondo propia', () => {
  it('handleRestoreTemplate solo cambia las capas y la selección — ningún setBackground*', () => {
    const start = SRC.indexOf('function handleRestoreTemplate')
    const end = SRC.indexOf('\n  }', start)
    const body = SRC.slice(start, end)
    expect(body).toContain('pushHistory()')
    expect(body).toContain('setLayers(buildInvitationTemplateLayers(')
    expect(body).toContain('selectLayer(null)')
    for (const setter of ['setBackgroundImagePath', 'setBackgroundImageUrl', 'setBackgroundOffsetX', 'setBackgroundOffsetY', 'setBackgroundScale', 'setAdjustingBackground']) {
      expect(body).not.toContain(setter)
    }
  })
})

describe('"Quitar foto de fondo" es una acción separada y explícita, aparte de restaurar', () => {
  it('handleRemoveBackgroundPhoto sigue siendo su propia función, nunca llamada desde handleRestoreTemplate', () => {
    expect(SRC).toContain('function handleRemoveBackgroundPhoto')
    const restoreBody = SRC.slice(SRC.indexOf('function handleRestoreTemplate'), SRC.indexOf('\n  }', SRC.indexOf('function handleRestoreTemplate')))
    expect(restoreBody).not.toContain('handleRemoveBackgroundPhoto')
  })

  it('quitar la foto de fondo pide confirmación (ConfirmButton), como cualquier borrado de la app', () => {
    const idx = SRC.indexOf("label=\"Quitar foto de fondo\"")
    expect(idx).toBeGreaterThan(-1)
    const line = SRC.slice(SRC.lastIndexOf('<', idx), SRC.indexOf('/>', idx) + 2)
    expect(line).toContain('ConfirmButton')
    expect(line).toContain('onConfirm={handleRemoveBackgroundPhoto}')
  })
})

describe('la confirmación de "Restaurar plantilla" explica qué se conserva', () => {
  it('hay un texto visible junto al botón aclarando que la foto de fondo no se toca', () => {
    const idx = SRC.indexOf('↺ Restaurar plantilla')
    const before = SRC.slice(Math.max(0, idx - 700), idx)
    expect(before).toContain('tu foto de fondo')
    expect(before).toContain('no se toca')
  })
})

describe('restaurar sigue siendo deshacible de inmediato (INV-EDITOR-3)', () => {
  it('el snapshot de pushHistory ya incluye capas Y fondo, así que Deshacer revierte todo lo que cambió', () => {
    const idx = SRC.indexOf('interface EditorSnapshot')
    const block = SRC.slice(idx, SRC.indexOf('}', idx))
    expect(block).toContain('layers')
    expect(block).toContain('backgroundImagePath')
  })
})

describe('no se borra nada de Storage solo por restaurar/quitar la foto visualmente', () => {
  it('ni handleRestoreTemplate ni handleRemoveBackgroundPhoto llaman a storage/remove', () => {
    for (const fnName of ['handleRestoreTemplate', 'handleRemoveBackgroundPhoto']) {
      const start = SRC.indexOf(`function ${fnName}`)
      const end = SRC.indexOf('\n  }', start)
      const body = SRC.slice(start, end)
      expect(body).not.toMatch(/storage|\.remove\(/i)
    }
  })
})
