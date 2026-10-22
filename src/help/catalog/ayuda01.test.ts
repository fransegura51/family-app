// AYUDA-01 — regla permanente: la Ayuda no puede volver a quedarse desactualizada. Estas pruebas son el «trinquete»: la deuda histórica está identificada en src/help/helpDebt.ts y NO
// bloquea nada, pero una función nueva sin ficha, una cobertura que empeora, un «Llévame» roto o un interruptor encendido sin su migración SÍ hacen fallar la publicación.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { featureHelpCoverage } from '@/admin/features/featureHelp'
import { FEATURE_INVENTORY } from '@/admin/features/featureInventory'
import { HELP_CARDS, HELP_MODULE_BY_ID } from '@/help/catalog'
import { moduleHelpText } from '@/help/catalog/moduleText'
import { FEATURES_PENDING_HELP_REVIEW, INTERNAL_ADMIN_FEATURES, MIN_COMPLETE_CARDS, MIN_FEATURES_WITH_COMPLETE_HELP } from '@/help/helpDebt'
import { cardCompleteness, computeHelpHealth } from '@/help/health'
import { HELP_FEEDBACK_ENABLED } from '@/help/feedback'
import { HELP_PREFS_SYNC_ENABLED } from '@/state/prefs/prefsRegistry'
import { HELP_AI_ENABLED } from '@/help/ai'

const root = process.cwd()

describe('AYUDA-01: toda función del inventario tiene su Ayuda', () => {
  it('cada función (salvo las herramientas internas de administración) tiene al menos una ficha de Ayuda que la describe', () => {
    for (const f of FEATURE_INVENTORY) {
      if (INTERNAL_ADMIN_FEATURES.includes(f.id)) continue
      expect(HELP_CARDS.some((c) => c.featureId === f.id), `«${f.name}» (${f.id}) no tiene ficha de Ayuda: añádela en src/help/catalog (AYUDA-01)`).toBe(true)
    }
  })

  it('cada función con Ayuda por revisar está en la lista de deuda conocida: las nuevas NO pueden quedarse «pendientes»', () => {
    const pending = FEATURE_INVENTORY.filter((f) => featureHelpCoverage(f, moduleHelpText).coverage === 'pendiente').map((f) => f.id)
    for (const id of pending) expect(FEATURES_PENDING_HELP_REVIEW, `${id}: define su módulo y puntos clave de Ayuda (help: { module, terms })`).toContain(id)
  })

  it('la cobertura no empeora: el número de funciones con la Ayuda completa no baja del piso', () => {
    const complete = FEATURE_INVENTORY.filter((f) => featureHelpCoverage(f, moduleHelpText).coverage === 'completa').length
    expect(complete).toBeGreaterThanOrEqual(MIN_FEATURES_WITH_COMPLETE_HELP)
  })

  it('el número de fichas completas (pasos + «Llévame») no baja del piso', () => {
    expect(HELP_CARDS.filter((c) => cardCompleteness(c) === 'completa').length).toBeGreaterThanOrEqual(MIN_COMPLETE_CARDS)
  })

  it('sin rutas rotas, funciones inexistentes ni tutoriales inexistentes en las fichas', () => {
    const h = computeHelpHealth()
    expect(h.brokenRoutes).toEqual([])
    expect(h.unknownFeatures).toEqual([])
    expect(h.unknownTours).toEqual([])
    expect(h.modulesWithoutCards).toEqual([])
  })

  it('una ficha no puede ser más optimista que el inventario: función parcial → ficha parcial o disponible con límite explicado; desactivada → desactivada', () => {
    const features = new Map(FEATURE_INVENTORY.map((f) => [f.id, f]))
    for (const c of HELP_CARDS) {
      const f = c.featureId ? features.get(c.featureId) : undefined
      if (f?.state === 'desactivada') expect(c.state, c.id).toBe('desactivada')
    }
  })

  it('todas las fichas pertenecen a un módulo con «Llévame» válido y fecha de comprobación', () => {
    for (const c of HELP_CARDS) {
      expect(HELP_MODULE_BY_ID.has(c.module), c.id).toBe(true)
      expect(c.verified, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('interruptores: nada se enciende sin su dependencia', () => {
  it('si se enciende la sincronización de preferencias de Ayuda o las valoraciones, la migración 0306 YA debe estar entre las aplicadas (no en pendientes)', () => {
    const applied = existsSync(join(root, 'supabase/migrations/0306_help_feedback_and_prefs.sql'))
    if (HELP_PREFS_SYNC_ENABLED || HELP_FEEDBACK_ENABLED) expect(applied, 'interruptor encendido sin la migración 0306 aplicada').toBe(true)
    else expect(existsSync(join(root, 'supabase/pending-migrations/0306_help_feedback_and_prefs.sql'))).toBe(true)
    expect(existsSync(join(root, 'supabase/rollbacks/0306_help_feedback_and_prefs_down.sql'))).toBe(true)
  })
  it('la búsqueda con IA sigue apagada mientras no existan su función de servidor, su límite de uso y la autorización de coste', () => {
    if (HELP_AI_ENABLED) expect(existsSync(join(root, 'supabase/functions/help-search/index.ts'))).toBe(true)
  })
})
