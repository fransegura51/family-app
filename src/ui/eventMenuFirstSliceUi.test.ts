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

describe('Alimentación — ?receta abre esa receta una sola vez; ?volver enlaza al menú del evento', () => {
  it('lee receta y volver de la URL y abre la receta pedida solo si existe', () => {
    expect(ALIM_SRC).toContain("const requestedRecipeId = searchParams.get('receta')")
    expect(ALIM_SRC).toContain("const returnEventId = searchParams.get('volver')")
    expect(ALIM_SRC).toContain('if (recipes.some((r) => r.id === requestedRecipeId)) setViewingId(requestedRecipeId)')
  })

  it('quita ?receta tras abrirla para que recargar la lista no la reabra', () => {
    expect(ALIM_SRC).toContain("next.delete('receta')")
  })

  it('con ?volver muestra «Volver al menú del evento» hacia el módulo de Menú', () => {
    expect(ALIM_SRC).toContain('← Volver al menú del evento')
    expect(ALIM_SRC).toContain('/eventos?event=${encodeURIComponent(returnEventId)}&modulo=menu_compra')
  })
})
