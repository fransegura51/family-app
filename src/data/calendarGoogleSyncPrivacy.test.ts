import { describe, expect, it } from 'vitest'

// RETOQUE Calendario (migración 0187) — fuga de privacidad de severidad máxima encontrada en la
// auditoría: sync-calendar-to-google-cron corre con el cliente admin (bypasa RLS a propósito, como
// cualquier Edge Function de service role) y, antes de este arreglo, empujaba TODOS los eventos de la
// familia al Google personal de CADA miembro conectado sin mirar visibility — un evento/tarea "Solo
// yo" de Jennifer aparecía igual en el Google de Paco. Mismo archivo Deno puro que
// forecastGoogleSyncCertification.test.ts (no se puede ejecutar aquí directamente), así que se
// certifica por paridad de texto contra el fichero realmente desplegado.
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const CRON = FUNCTIONS['/supabase/functions/sync-calendar-to-google-cron/index.ts']

describe('sync-calendar-to-google-cron: un evento/tarea "Solo yo" de OTRO miembro nunca sale a mi Google', () => {
  it('la consulta de calendar_events pide visibility y created_by (antes no se seleccionaban en absoluto)', () => {
    expect(CRON).toContain('visibility, created_by')
  })

  it('el propietario se identifica por family_members.linked_profile_id, nunca comparando memberId (family_members.id) directamente contra created_by (profiles.id) — son espacios de id distintos', () => {
    expect(CRON).toContain('admin.from("family_members").select("id, name, linked_profile_id")')
    expect(CRON).toContain('const ownLinkedProfileId = (familyMembers ?? []).find((m) => m.id === memberId)?.linked_profile_id as string | undefined')
  })

  it('el filtro de privacidad existe y usa esa variable, nunca memberId', () => {
    expect(CRON).toContain('if (ev.visibility === "private" && ev.created_by !== ownLinkedProfileId) continue')
  })

  it('un evento "Solo yo" del PROPIO propietario (created_by === ownLinkedProfileId) no cae en el filtro — sigue sincronizando a su propio Google, igual que antes', () => {
    // El filtro es "visibility === private AND created_by !== ownLinkedProfileId" — si created_by SÍ
    // coincide, la condición completa es false y el evento atraviesa el filtro sin más comprobaciones.
    expect(CRON).not.toContain('if (ev.visibility === "private") continue')
  })

  it('el filtro de privacidad se comprueba ANTES de marcar el evento como visto (seenEventIds), igual que sync_to_google=false — si un evento pasó de familiar a privado, el bucle de huérfanos de más abajo lo borra de este Google', () => {
    const privacySkipIndex = CRON.indexOf('if (ev.visibility === "private" && ev.created_by !== ownLinkedProfileId) continue')
    const syncSkipIndex = CRON.indexOf('if (ev.sync_to_google === false) continue')
    const seenIndex = CRON.indexOf('seenEventIds.add(ev.id as string)')
    expect(privacySkipIndex).toBeGreaterThan(-1)
    expect(syncSkipIndex).toBeGreaterThan(-1)
    expect(seenIndex).toBeGreaterThan(-1)
    expect(syncSkipIndex).toBeLessThan(privacySkipIndex) // mismo orden que en el archivo real
    expect(privacySkipIndex).toBeLessThan(seenIndex)
  })

  it('el bucle de huérfanos (borra de Google lo que ya no está "visto") sigue intacto — mismo camino para borrado real, sync_to_google=false y ahora también para "se volvió privado"', () => {
    expect(CRON).toContain('if (seenEventIds.has(eventId)) continue')
  })
})
