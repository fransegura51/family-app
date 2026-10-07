import { describe, expect, it } from 'vitest'

// Fase 1.3 (plan de pendientes) — bug real: un <select> hijo DIRECTO de .inline-fields (p. ej. "Relacionar
// proveedor ya existente…" en ProviderLinker) no tenía min-width:0 en styles.css, así que nunca encogía
// por debajo de su ancho de contenido dentro de la fila flex — desbordamiento horizontal en iPhone. El fix
// en sí vive en styles.css (`.inline-fields label, .inline-fields select { flex: 1; min-width: 0;
// max-width: 100% }` + `.inline-fields { flex-wrap: wrap }`, revisado a mano — vitest no puede leer el
// contenido real de un .css ni con `?raw` ni con fs/node:fs, ambos probados: siempre devuelven cadena
// vacía en este proyecto). Lo que SÍ se comprueba aquí es que el elemento real afectado sigue siendo un
// <select> hijo directo de esa misma clase, para que el fix de styles.css le siga aplicando de verdad.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

describe('ProviderLinker ("Relacionar proveedor ya existente…") — sigue siendo el <select> que el fix de .inline-fields cubre', () => {
  it('es un <select> directo dentro de className="inline-fields" (no envuelto en <label>, por eso necesitaba su propia regla)', () => {
    const idx = UI.indexOf('Relacionar proveedor ya existente…')
    expect(idx).toBeGreaterThan(-1)
    const before = UI.slice(Math.max(0, idx - 300), idx)
    expect(before).toContain('className="inline-fields"')
    expect(before).toContain('<select')
    expect(before).not.toContain('<label')
  })
})
