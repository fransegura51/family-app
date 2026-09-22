import { describe, expect, it } from 'vitest'

// Fase 1B.1 — certificación de sync_to_google (calendar_events) contra
// supabase/functions/sync-calendar-to-google-cron/index.ts. Ese archivo es Deno puro
// (Deno.env, imports npm:/jsr:) y no se puede ejecutar directamente en Vitest, así que aquí se
// extrae y se prueba de verdad la lógica mínima de decisión (no solo "el código parece hacerlo"),
// y además se verifica por comparación de texto que el archivo desplegado sigue conteniendo
// exactamente esa misma condición — si alguien la cambia sin tocar este test, el test avisa.
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const CRON = FUNCTIONS['/supabase/functions/sync-calendar-to-google-cron/index.ts']

// Reimplementación exacta de la condición real del cron (ver más abajo la prueba de paridad de
// fuente): `delRes.ok || delRes.status === 404 || delRes.status === 410`. `Response.ok` de la Fetch
// API es true para cualquier 2xx (200-299), no solo 200/204.
function isGoogleDeleteEffective(status: number): boolean {
  const ok = status >= 200 && status < 300
  return ok || status === 404 || status === 410
}

describe('paridad de fuente: la condición probada es la condición real desplegada', () => {
  it('el cron contiene exactamente la misma condición que se prueba aquí', () => {
    expect(CRON).toContain('if (delRes.ok || delRes.status === 404 || delRes.status === 410) {')
  })

  it('el borrado del mapping ocurre SOLO dentro de esa condición (el fix no se ha revertido ni se ha mezclado mal)', () => {
    const guardIndex = CRON.indexOf('if (delRes.ok || delRes.status === 404 || delRes.status === 410) {')
    const deleteIndex = CRON.indexOf('await admin.from("calendar_event_google_sync").delete().eq("event_id", eventId).eq("member_id", memberId)')
    expect(guardIndex).toBeGreaterThan(-1)
    expect(deleteIndex).toBeGreaterThan(guardIndex) // el delete vive DENTRO del if, no antes ni fuera
  })
})

describe('GOOGLE DELETE → mapping local (evento previamente sincronizado, sync_to_google pasa a false)', () => {
  it.each([
    [200, true, 'OK'],
    [204, true, 'No Content'],
    [404, true, 'ya no existía en Google'],
    [410, true, 'Gone'],
    [500, false, 'error de servidor de Google'],
    [401, false, 'no autorizado (token caducado, etc.)'],
    [403, false, 'prohibido'],
  ])('status %i (%s) → mapping eliminado = %s', (status, expectedDeleted) => {
    expect(isGoogleDeleteEffective(status)).toBe(expectedDeleted)
  })

  it('GOOGLE DELETE OK → MAPPING LOCAL ELIMINADO', () => {
    expect(isGoogleDeleteEffective(200)).toBe(true)
    expect(isGoogleDeleteEffective(204)).toBe(true)
    expect(isGoogleDeleteEffective(404)).toBe(true)
    expect(isGoogleDeleteEffective(410)).toBe(true)
  })

  it('GOOGLE DELETE FAIL → MAPPING LOCAL CONSERVADO (para poder reintentar en la siguiente pasada)', () => {
    expect(isGoogleDeleteEffective(500)).toBe(false)
    expect(isGoogleDeleteEffective(401)).toBe(false)
    expect(isGoogleDeleteEffective(403)).toBe(false)
  })
})

describe('TRUE→FALSE: el evento queda excluido del push saliente y entra en el camino de huérfanos', () => {
  it('sync_to_google=false se comprueba ANTES de marcar el evento como visto (seenEventIds)', () => {
    const skipIndex = CRON.indexOf('if (ev.sync_to_google === false) continue')
    const seenIndex = CRON.indexOf('seenEventIds.add(ev.id as string)')
    expect(skipIndex).toBeGreaterThan(-1)
    expect(seenIndex).toBeGreaterThan(-1)
    expect(skipIndex).toBeLessThan(seenIndex) // se salta ANTES de marcarlo visto -> si tenía mapping, el bucle de huérfanos lo procesa
  })

  it('la comprobación es estricta (=== false), nunca "falsy" genérico', () => {
    expect(CRON).toContain('if (ev.sync_to_google === false) continue')
  })

  it('el bucle de huérfanos borra del mapping cualquier evento no visto — mismo camino para "borrado en la app" y para "sync_to_google=false"', () => {
    expect(CRON).toContain('if (seenEventIds.has(eventId)) continue')
  })
})

describe('FALSE→TRUE: vuelve a ser elegible para POST/PATCH normal sin limpieza manual', () => {
  it('con sync_to_google=true el evento NO entra en el "continue" — sigue el flujo normal de creación/actualización', () => {
    // La única condición de exclusión es "=== false"; cualquier otro valor (true, o ausencia tras el
    // default de la columna) atraviesa el filtro sin más comprobaciones ni estado especial que limpiar.
    expect(CRON).toContain('if (ev.sync_to_google === false) continue')
    expect(CRON).not.toContain('sync_to_google === true')
    expect(CRON).not.toContain('!ev.sync_to_google')
  })

  it('la creación/actualización normal (POST si no hay mapeo, PATCH si lo hay) no depende de sync_to_google', () => {
    expect(CRON).toContain('const existingGoogleId = mappingByEvent.get(ev.id as string)')
  })
})
