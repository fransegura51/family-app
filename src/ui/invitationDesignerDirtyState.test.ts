import { describe, expect, it } from 'vitest'

// INV-EDITOR-5 — cambios sin guardar. Mismo patrón de comprobación por código fuente que
// invitationDesignerUndo.test.ts / invitationDesignerContextualUi.test.ts (sin React Testing Library).
const SRC = (import.meta.glob('/src/ui/InvitationDesigner.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/InvitationDesigner.tsx'
]

describe('detección real de estado sucio', () => {
  it('dirty compara el snapshot actual contra el último cargado/guardado, nunca durante la carga inicial', () => {
    const idx = SRC.indexOf('const dirty =')
    expect(idx).toBeGreaterThan(-1)
    const line = SRC.slice(idx, SRC.indexOf('\n', idx))
    expect(line).toContain('savedSnapshotRef.current !== null')
    expect(line).toContain('comparableSnapshotKey(currentSnapshot())')
  })

  it('la comparación excluye backgroundImageUrl (una URL firmada nueva no es un cambio real)', () => {
    const fn = SRC.slice(SRC.indexOf('function comparableSnapshotKey'), SRC.indexOf('\n}', SRC.indexOf('function comparableSnapshotKey')))
    expect(fn).toContain('backgroundImageUrl')
    expect(fn).toContain('...rest')
  })

  it('la carga inicial fija savedSnapshotRef tanto si ya había un diseño guardado como si es la primera vez', () => {
    const occurrences = SRC.match(/savedSnapshotRef\.current = comparableSnapshotKey\(/g) ?? []
    // Al cargar un diseño existente, al cargar por primera vez (sin invitación aún) y al guardar.
    expect(occurrences.length).toBeGreaterThanOrEqual(3)
  })
})

describe('un único punto de salida, nunca se pierde en silencio', () => {
  it('requestClose muestra confirmación si hay cambios sin guardar, y cierra directo si no los hay', () => {
    const fn = SRC.slice(SRC.indexOf('function requestClose'), SRC.indexOf('\n  }', SRC.indexOf('function requestClose')))
    expect(fn).toContain('if (dirty) setConfirmingExit(true)')
    expect(fn).toContain('else onClose()')
  })

  it('tanto la X del encabezado como tocar fuera del modal pasan por requestClose, nunca por onClose directo', () => {
    expect(SRC).toContain('<div className="modal-overlay" onClick={requestClose}>')
    expect(SRC).toContain('<button type="button" className="modal-close" onClick={requestClose} aria-label="Cerrar">')
    // El único onClick={onClose} que debe quedar es el botón "Salir sin guardar" del propio diálogo de confirmación.
    const rawOnClose = (SRC.match(/onClick=\{onClose\}/g) ?? []).length
    expect(rawOnClose).toBe(1)
  })
})

describe('el diálogo de confirmación ofrece las 3 opciones sin duplicar la lógica de guardado', () => {
  it('"Seguir editando", "Guardar y salir" (reutiliza handleSave) y "Salir sin guardar"', () => {
    const idx = SRC.indexOf('Tienes cambios sin guardar')
    const block = SRC.slice(idx, SRC.indexOf('</div>\n    )}', idx))
    expect(block).toContain('Seguir editando')
    expect(block).toContain('Guardar y salir')
    expect(block).toContain('Salir sin guardar')
    expect(block).toContain('onClick={handleSave}')
    // El diálogo de confirmación es HERMANO del overlay principal, no anidado dentro — para que tocar su
    // fondo no dispare también el requestClose del editor (bug real de burbujeo si estuviera anidado).
    const dialogStart = SRC.indexOf('{confirmingExit && (')
    const editorOverlayEnd = SRC.indexOf('</div>\n    </div>\n    {/* INV-EDITOR-5')
    expect(editorOverlayEnd).toBeGreaterThan(-1)
    expect(dialogStart).toBeGreaterThan(editorOverlayEnd)
  })
})

describe('guardar correctamente deja dirty=false', () => {
  it('handleSave actualiza savedSnapshotRef con el estado recién guardado antes de avisar onSaved', () => {
    const start = SRC.indexOf('async function handleSave')
    const end = SRC.indexOf('\n  }', start)
    const body = SRC.slice(start, end)
    const saveCallIdx = body.indexOf('await saveEventInvitation(')
    const refUpdateIdx = body.indexOf('savedSnapshotRef.current = comparableSnapshotKey(currentSnapshot())')
    const onSavedIdx = body.indexOf('onSaved()')
    expect(refUpdateIdx).toBeGreaterThan(saveCallIdx)
    expect(onSavedIdx).toBeGreaterThan(refUpdateIdx)
  })
})
