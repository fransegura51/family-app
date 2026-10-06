import { describe, expect, it } from 'vitest'

// «Menú del evento», primera tanda — cableado real (raw source, mismo patrón que el resto de tests de UI).
const MIGRATION_FILES = import.meta.glob('/supabase/migrations/0198_event_dietary_suggestion_dismissals.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATION = MIGRATION_FILES['/supabase/migrations/0198_event_dietary_suggestion_dismissals.sql']
const MENU_SRC = (import.meta.glob('/src/ui/EventMenu.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventMenu.tsx']
const DINERS_SRC = (import.meta.glob('/src/ui/EventMenuDiners.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventMenuDiners.tsx']
const ALIM_SRC = (import.meta.glob('/src/ui/AlimentacionScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/AlimentacionScreen.tsx']
const DATA_SRC = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']

describe('0198 — descartes de sugerencias: aditiva, sin tocar necesidades ni notas', () => {
  it('clave única (evento, invitado, categoría): es la misma identidad que usa suggestFromGuestNotes', () => {
    expect(MIGRATION).toContain('unique (event_id, guest_id, category)')
  })

  it('no altera event_guest_dietary_needs, ni event_guests.notes ni rsvp_note', () => {
    expect(MIGRATION).not.toMatch(/alter table event_guest_dietary_needs/)
    expect(MIGRATION).not.toMatch(/alter table event_guests\b/)
    expect(MIGRATION).not.toMatch(/\bupdate\s+\w+\s+set\b/i)
    expect(MIGRATION).not.toMatch(/\bdelete\s+from\b/i)
  })

  it('RLS familiar igual que las necesidades: family_id + has_section_access(eventos) + invitado del mismo evento', () => {
    expect(MIGRATION).toContain("family_id = private.current_family_id() and private.has_section_access('eventos')")
    expect(MIGRATION).toContain('g.event_id = event_dietary_suggestion_dismissals.event_id')
  })
})

describe('capa de datos — listar y descartar', () => {
  it('addEventDietarySuggestionDismissal trata el duplicado (23505) como ya descartado, sin error', () => {
    const start = DATA_SRC.indexOf('export async function addEventDietarySuggestionDismissal(')
    const body = DATA_SRC.slice(start, DATA_SRC.indexOf('\n}', start))
    expect(body).toContain("error.code !== '23505'")
    expect(body).toContain("from('event_dietary_suggestion_dismissals').insert(")
  })
})

describe('Comensales — sugerencias con Confirmar / Corregir / Descartar y contadores', () => {
  it('cada sugerencia ofrece Confirmar, Corregir y Descartar', () => {
    expect(DINERS_SRC).toContain('>\n                  Confirmar')
    expect(DINERS_SRC).toContain('startCorrecting(s)')
    expect(DINERS_SRC).toContain('void dismiss(s.guestId, s.category)')
  })

  it('el resumen plegado distingue confirmadas y pendientes, nunca un "(0)" engañoso', () => {
    expect(DINERS_SRC).toContain('`Necesidades alimentarias · ${needs.length} confirmada')
    expect(DINERS_SRC).toContain('pendiente${suggestions.length === 1')
  })

  it('"No se han indicado…" solo aparece si no hay confirmadas NI pendientes', () => {
    expect(DINERS_SRC).toContain('needs.length === 0 && suggestions.length === 0')
    expect(DINERS_SRC).toContain("pendingSuggestions > 0\n              ? `Ninguna confirmada todavía")
  })

  it('corregir cambia de categoría sin perder el texto original, y descarta la sugerencia de origen si cambia', () => {
    expect(DINERS_SRC).toContain('originalText: correcting.text')
    expect(DINERS_SRC).toContain("source: 'invitado_nota'")
    expect(DINERS_SRC).toContain('if (category !== correcting.originalCategory) await dismiss(correcting.guestId, correcting.originalCategory)')
  })

  it('una necesidad escrita a mano por el organizador sigue entrando con su origen propio (organizador)', () => {
    expect(DINERS_SRC).toContain("source: 'organizador' })")
  })
})

describe('Menú — la receta vinculada es un enlace real, fuera del botón del plato', () => {
  it('usa Link (no un span) hacia recipeLinkPath, y no queda anidado dentro del botón del plato', () => {
    expect(MENU_SRC).toContain('<Link to={recipeLinkPath(recipe.id, event.id)}')
    const mainStart = MENU_SRC.indexOf('className="menu-dish-main"')
    const mainEnd = MENU_SRC.indexOf('</button>', mainStart)
    expect(MENU_SRC.slice(mainStart, mainEnd)).not.toContain('recipe.title')
  })
})

describe('Alimentación — ?receta abre esa receta una sola vez y recuerda el evento de origen', () => {
  it('lee receta y volver de la URL y abre la receta pedida solo si existe', () => {
    expect(ALIM_SRC).toContain("const requestedRecipeId = searchParams.get('receta')")
    expect(ALIM_SRC).toContain("const returnEventId = searchParams.get('volver')")
    expect(ALIM_SRC).toContain('if (recipes.some((r) => r.id === requestedRecipeId)) {\n      setViewingId(requestedRecipeId)')
  })

  it('quita ?receta tras abrirla para que recargar la lista no la reabra', () => {
    expect(ALIM_SRC).toContain("next.delete('receta')")
  })

  it('una receta abierta desde el evento recibe contexto de retorno (setViewerReturnEventId(returnEventId))', () => {
    expect(ALIM_SRC).toContain('setViewerReturnEventId(returnEventId)')
  })

  it('el contexto de retorno se limpia al cerrar el visor: la X y el fondo llaman a closeViewer, nunca solo a setViewingId', () => {
    const fn = ALIM_SRC.slice(ALIM_SRC.indexOf('function closeViewer()'), ALIM_SRC.indexOf('}', ALIM_SRC.indexOf('function closeViewer()')) + 1)
    expect(fn).toContain('setViewingId(null)')
    expect(fn).toContain('setViewerReturnEventId(null)')
    expect(ALIM_SRC).toContain('onClick={() => closeViewer()} aria-label="Cerrar"')
    expect(ALIM_SRC).toContain('<div className="modal-overlay" onClick={() => closeViewer()}>')
  })

  it('el contexto solo se ENCIENDE al abrir desde ?receta y se apaga al cerrar: una receta abierta normal nunca lo recibe', () => {
    const sets = ALIM_SRC.split('setViewerReturnEventId(').length - 1
    // Exactamente dos usos: encender en la apertura desde el evento y apagar en closeViewer.
    expect(sets).toBe(2)
    expect(ALIM_SRC).toContain('setViewerReturnEventId(null)')
  })

  it('la X sigue siendo solo cerrar: su handler no navega', () => {
    const close = ALIM_SRC.slice(ALIM_SRC.indexOf('aria-label="Cerrar"') - 80, ALIM_SRC.indexOf('aria-label="Cerrar"'))
    expect(close).not.toContain('navigate(')
  })

  it('dentro del visor, «← Volver al menú del evento» solo aparece si hay contexto de retorno', () => {
    expect(ALIM_SRC).toContain('{viewerReturnEventId && (')
    expect(ALIM_SRC).toContain('← Volver al menú del evento')
  })

  it('«Volver» cierra el visor y navega con el router real (useNavigate) a eventMenuPath, sin ruta escrita a mano', () => {
    const btn = ALIM_SRC.slice(ALIM_SRC.indexOf('{viewerReturnEventId && ('), ALIM_SRC.indexOf('← Volver al menú del evento', ALIM_SRC.indexOf('{viewerReturnEventId && (')))
    expect(btn).toContain('closeViewer()')
    expect(btn).toContain('navigate(eventMenuPath(viewerReturnEventId))')
    expect(ALIM_SRC).toContain("import { eventMenuPath } from '@/domain/eventMenuHub'")
  })

  it('el enlace de la cabecera de Recetas también usa eventMenuPath (una sola fuente para el destino)', () => {
    expect(ALIM_SRC).toContain('<Link to={eventMenuPath(returnEventId)}>← Volver al menú del evento</Link>')
  })
})

// Problema 1 (móvil estrecho): el nombre no queda aplastado en una fila horizontal rígida. El reparto visual de
// anchos vive en styles.css y se comprueba a ancho de iPhone (no se puede leer CSS desde estos tests); aquí se
// fija la ESTRUCTURA que hace posible ese reparto: nombre+receta en un bloque propio, acciones en otro.
describe('Menú — un plato es un paquete: ≡ junto al bloque; nombre, receta+mandos y sección; advertencia fuera', () => {
  const at = (needle: string) => MENU_SRC.indexOf(needle)

  it('el asa ≡ está junto al bloque de contenido (no dentro de la barra de acciones)', () => {
    const handle = at('className="drag-handle"')
    const content = at('<div className="menu-dish-content">')
    const bar = at('<div className="menu-dish-actionbar">')
    expect(handle).toBeGreaterThan(-1)
    expect(handle).toBeLessThan(content)
    expect(content).toBeLessThan(bar)
  })

  it('dentro del contenido, el orden es nombre → barra de receta/mandos → sección (meta)', () => {
    const name = at('className="menu-dish-main"')
    const bar = at('<div className="menu-dish-actionbar">')
    const meta = at('className="menu-dish-meta"')
    expect(name).toBeLessThan(bar)
    expect(bar).toBeLessThan(meta)
  })

  it('la barra de receta+mandos no contiene el nombre del plato', () => {
    const bar = MENU_SRC.slice(at('<div className="menu-dish-actionbar">'), at('className="menu-dish-meta"'))
    expect(bar).not.toContain('menu-dish-name')
  })

  it('la receta va a la izquierda de la barra y los mandos (🛒 ▲ ▼ ×) en su grupo de la derecha', () => {
    const bar = MENU_SRC.slice(at('<div className="menu-dish-actionbar">'))
    expect(bar.indexOf('className="menu-dish-recipe-link"')).toBeLessThan(bar.indexOf('<div className="menu-dish-actions">'))
    const group = MENU_SRC.slice(at('<div className="menu-dish-actions">'))
    expect(group).toContain('setIngredientsFor(dish)')
    expect(group).toContain('moveItem(dish.id, -1)')
    expect(group).toContain('moveItem(dish.id, 1)')
    expect(group).toContain('onConfirm={() => void deleteDish(dish.id)}')
  })

  it('la sección/tipo (meta) es una línea propia debajo, y sigue abriendo la edición como antes', () => {
    const meta = MENU_SRC.slice(at('className="menu-dish-meta"'), at('className="menu-dish-meta"') + 200)
    expect(meta).toContain('setDishSheet({ mode: \'edit\', item: dish })')
  })

  it('la advertencia alimentaria va DESPUÉS del paquete, en su propio bloque (no altera el centrado de ≡)', () => {
    const warnings = at('<div className="menu-dish-warnings">')
    expect(warnings).toBeGreaterThan(at('className="menu-dish-meta"'))
    expect(MENU_SRC.slice(at('<div className="menu-dish-content">'), warnings)).not.toContain('menu-conflict')
  })

  it('las filas de platos llevan la clase de separación entre platos', () => {
    expect(MENU_SRC).toContain("isDishItem ? 'menu-row-dish' : ''")
  })

  it('la receta vinculada sigue siendo el enlace de siempre (navegación validada, sin cambios)', () => {
    expect(MENU_SRC).toContain('<Link to={recipeLinkPath(recipe.id, event.id)} className="menu-dish-recipe-link">')
  })
})
