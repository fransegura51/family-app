import { describe, expect, it } from 'vitest'

// Fase 3 Bloque 4 (2026-09-27) — ↪️ Rehacer. Mismo patrón de auditoría de código fuente que
// invitationDesignerUndo.test.ts (sin React Testing Library en este proyecto). La garantía clave de este
// bloque es arquitectónica: TODA operación mutadora del editor ya pasaba por pushHistory() (ver
// invitationDesignerUndo.test.ts, sección "acciones ya deshacibles" + updateSelectedDiscrete/Continuous),
// así que hacer que pushHistory() vacíe `future` basta para que Redo funcione — sin fondo importado,
// negrita, opacidad, máscara de foto, etc. — tener que tocar cada handler por separado.
const SRC = (import.meta.glob('/src/ui/InvitationDesigner.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/InvitationDesigner.tsx'
]

function fnBody(name: string): string {
  const start = SRC.indexOf(`function ${name}`)
  expect(start, `${name} debería existir`).toBeGreaterThan(-1)
  const end = SRC.indexOf('\n  }', start)
  return SRC.slice(start, end)
}

describe('estado future — pila de "deshechos", separada de history', () => {
  it('existe como su propio useState, vacío al montar', () => {
    expect(SRC).toContain('const [future, setFuture] = useState<EditorSnapshot[]>([])')
  })
})

describe('Regla fundamental: una edición nueva tras Deshacer borra la rama Redo', () => {
  it('pushHistory() vacía future en cada llamada — el único sitio que decide "hay edición nueva"', () => {
    const fn = fnBody('pushHistory')
    expect(fn).toContain('setFuture([])')
  })

  it('handleUndo y handleRedo NO llaman a pushHistory (si lo hicieran, se borrarían su propia rama contraria)', () => {
    expect(fnBody('handleUndo')).not.toContain('pushHistory()')
    expect(fnBody('handleRedo')).not.toContain('pushHistory()')
  })
})

describe('handleUndo / handleRedo — simétricos, comparten applySnapshot (sin duplicar la lista de campos)', () => {
  it('handleUndo: mueve el snapshot actual a future, aplica el último de history, y lo saca de history', () => {
    const fn = fnBody('handleUndo')
    expect(fn).toContain('if (history.length === 0) return')
    expect(fn).toContain('const prev = history[history.length - 1]')
    expect(fn).toContain('setFuture((f) => [...f.slice(-(MAX_HISTORY_ENTRIES - 1)), currentSnapshot()])')
    expect(fn).toContain('applySnapshot(prev)')
    expect(fn).toContain('setHistory((h) => h.slice(0, -1))')
  })

  it('handleRedo: mueve el snapshot actual a history, aplica el último de future, y lo saca de future', () => {
    const fn = fnBody('handleRedo')
    expect(fn).toContain('if (future.length === 0) return')
    expect(fn).toContain('const next = future[future.length - 1]')
    expect(fn).toContain('setHistory((h) => [...h.slice(-(MAX_HISTORY_ENTRIES - 1)), currentSnapshot()])')
    expect(fn).toContain('applySnapshot(next)')
    expect(fn).toContain('setFuture((f) => f.slice(0, -1))')
  })

  it('los dos respetan el mismo tope MAX_HISTORY_ENTRIES que ya usaba pushHistory (ninguna pila crece sin límite)', () => {
    expect(fnBody('handleUndo')).toContain('MAX_HISTORY_ENTRIES - 1')
    expect(fnBody('handleRedo')).toContain('MAX_HISTORY_ENTRIES - 1')
  })

  it('los dos cierran cualquier edición continua en curso, igual que ya hacía handleUndo antes de este bloque', () => {
    expect(fnBody('handleUndo')).toContain('continuousEditRef.current = null')
    expect(fnBody('handleRedo')).toContain('continuousEditRef.current = null')
  })
})

describe('Botón ↪️ Rehacer — mismo estilo que ↩️ Deshacer, estado enabled/disabled correcto', () => {
  const utilityRow = SRC.slice(SRC.indexOf('<div className="invitation-utility-row">'), SRC.indexOf('</div>', SRC.indexOf('<div className="invitation-utility-row">')))

  it('está junto a Deshacer, mismo className (sin barra nueva)', () => {
    expect(utilityRow).toContain('↩️ Deshacer')
    expect(utilityRow).toContain('↪️ Rehacer')
    expect(utilityRow).toContain('onClick={handleRedo} disabled={future.length === 0}')
    expect(utilityRow).toContain('onClick={handleUndo} disabled={history.length === 0}')
  })
})

describe('Cobertura: todo lo que ya era deshacible sigue pasando por pushHistory (por tanto también es rehacible)', () => {
  it('capas: añadir, duplicar, borrar, reordenar, restaurar plantilla y "Pepa, hazla bonita"', () => {
    for (const fnName of ['handleAddLayer', 'handleDuplicate', 'handleDeleteSelected', 'handleReorder', 'handleRestoreTemplate', 'handlePrettify']) {
      expect(fnBody(fnName)).toContain('pushHistory()')
    }
  })

  it('texto/formato: cambios discretos (color preset, fuente, efecto, tamaño, alineación, negrita, cursiva, máscara de foto) usan updateSelectedDiscrete → pushHistory', () => {
    expect(fnBody('updateSelectedDiscrete')).toContain('pushHistory()')
    // Alineación, negrita, cursiva y máscara de foto (Bloques 2 y 3) llaman a updateSelectedDiscrete.
    expect(SRC).toContain('updateSelectedDiscrete({ textAlign: opt.value })')
    expect(SRC).toContain('updateSelectedDiscrete({ bold: resolveLayerFontWeight(selected) !== 700 })')
    expect(SRC).toContain('updateSelectedDiscrete({ italic: !selected.italic })')
    expect(SRC).toContain("updateSelectedDiscrete({ photoMask: 'circle' })")
  })

  it('texto/formato continuos: escribir contenido, rueda de color y opacidad de forma usan updateSelectedContinuous → pushHistory al empezar', () => {
    expect(fnBody('updateSelectedContinuous')).toContain('pushHistory()')
    expect(SRC).toContain("updateSelectedContinuous({ text: e.target.value }, 'text')")
    expect(SRC).toContain("updateSelectedContinuous({ opacity: Number(e.target.value) / 100 }, 'opacity')")
  })

  it('mover y redimensionar/rotar (el tirador) guardan snapshot al empezar el gesto, no en cada pointermove', () => {
    expect(fnBody('handleLayerPointerDown')).toContain('pushHistory()')
    expect(fnBody('handleHandlePointerDown')).toContain('pushHistory()')
  })

  it('plantilla importada / fondo propio: subir, quitar y mover/zoom siguen siendo deshacibles (y por tanto rehacibles)', () => {
    const uploadBody = SRC.slice(SRC.indexOf('async function handleBackgroundPhotoChange'), SRC.indexOf('\n  }', SRC.indexOf('async function handleBackgroundPhotoChange')))
    expect(uploadBody).toContain('pushHistory()')
    expect(fnBody('handleRemoveBackgroundPhoto')).toContain('pushHistory()')
    expect(fnBody('handleBackgroundPointerDown')).toContain('pushHistory()')
  })

  it('cambio de plantilla sigue siendo deshacible (Bloque 4 no lo reimplementa, solo hereda Redo del mismo pushHistory)', () => {
    const body = SRC.slice(SRC.indexOf('onSelect={(t) => {'), SRC.indexOf('}}', SRC.indexOf('onSelect={(t) => {')))
    expect(body).toContain('pushHistory()')
  })
})
