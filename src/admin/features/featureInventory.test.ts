// Inventario de funcionalidades: que sea fiable y mantenible (nada inventado, todo con evidencia) y que la cobertura de la Ayuda se calcule de verdad contra el texto de la Ayuda.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FEATURE_INVENTORY } from '@/admin/features/featureInventory'
import { featureHelpCoverage, type HelpSource } from '@/admin/features/featureHelp'
import { filterFeatures, modulesOf, NO_FILTERS } from '@/admin/features/featureFilters'
import { FEATURE_STATE_LABEL, FEATURE_VERIFICATION_LABEL, HELP_COVERAGE_LABEL, type FeatureEntry } from '@/admin/features/featureTypes'
import { HELP_DETAILS, SUMMARIES } from '@/ui/AyudaScreen'

const root = process.cwd()
const REAL_HELP: HelpSource = { summaries: SUMMARIES, details: HELP_DETAILS }

const entry = (over: Partial<FeatureEntry> = {}): FeatureEntry => ({
  id: 'x',
  module: 'Prueba',
  name: 'Función de prueba',
  state: 'operativa',
  works: 'Hace cosas.',
  verification: 'revisada',
  verificationNote: 'Leída.',
  reviewed: '2026-10-22',
  evidence: ['package.json'],
  help: { route: '/calendario', terms: ['recordatorio'] },
  ...over,
})

describe('el inventario no inventa nada: estructura y evidencia', () => {
  it('hay funciones y los identificadores no se repiten', () => {
    expect(FEATURE_INVENTORY.length).toBeGreaterThan(30)
    const ids = FEATURE_INVENTORY.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('cada función tiene nombre, módulo, qué funciona, verificación y fecha de revisión', () => {
    for (const e of FEATURE_INVENTORY) {
      expect(e.name.trim(), e.id).not.toBe('')
      expect(e.module.trim(), e.id).not.toBe('')
      expect(e.works.trim().length, e.id).toBeGreaterThan(20)
      expect(e.verificationNote.trim(), e.id).not.toBe('')
      expect(e.reviewed, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Object.keys(FEATURE_STATE_LABEL), e.id).toContain(e.state)
      expect(Object.keys(FEATURE_VERIFICATION_LABEL), e.id).toContain(e.verification)
    }
  })

  it('toda función parcial o desactivada explica QUÉ le falta (no se inventa un estado sin motivo)', () => {
    for (const e of FEATURE_INVENTORY.filter((f) => f.state !== 'operativa')) {
      expect((e.missing ?? '').trim().length, `${e.id} (${e.state}) sin «missing»`).toBeGreaterThan(10)
    }
  })

  it('todos los archivos citados como evidencia existen de verdad en el repositorio', () => {
    for (const e of FEATURE_INVENTORY) {
      expect(e.evidence.length, `${e.id} sin evidencia`).toBeGreaterThan(0)
      for (const f of e.evidence) expect(existsSync(join(root, f)), `${e.id}: no existe ${f}`).toBe(true)
    }
  })

  it('una función «probada» cita pruebas automáticas y todas existen', () => {
    for (const e of FEATURE_INVENTORY) {
      for (const t of e.tests ?? []) expect(existsSync(join(root, t)), `${e.id}: no existe la prueba ${t}`).toBe(true)
      if (e.verification === 'probada') expect((e.tests ?? []).length, `${e.id} dice «probada» sin pruebas`).toBeGreaterThan(0)
    }
  })

  it('lo que depende de producción nunca se da por verificado: las apagadas por interruptor en vivo son «no verificable»', () => {
    for (const id of ['comunidad-ia', 'comunidad-publica']) {
      const e = FEATURE_INVENTORY.find((f) => f.id === id)!
      expect(e.state).toBe('desactivada')
      expect(e.verification).toBe('no_verificable')
    }
  })

  it('las secciones de Ayuda citadas existen en la Ayuda real; sin sección no hay puntos clave (queda pendiente de revisión)', () => {
    for (const e of FEATURE_INVENTORY) {
      if (e.help.route === null) {
        expect(e.help.terms, e.id).toEqual([])
      } else {
        expect(Object.keys(HELP_DETAILS), `${e.id}: la Ayuda no tiene ${e.help.route}`).toContain(e.help.route)
        expect(e.help.terms.length, e.id).toBeGreaterThan(0)
      }
    }
  })

  it('«Invitar amigos» consta como desactivada y NO se ha activado nada', () => {
    const e = FEATURE_INVENTORY.find((f) => f.id === 'invitar-amigos')!
    expect(e.state).toBe('desactivada')
    expect(e.missing).toMatch(/No hay infraestructura/)
  })
})

describe('cobertura de la Ayuda: se calcula, no se escribe, y es independiente del estado de la función', () => {
  const help: HelpSource = {
    summaries: { '/calendario': 'Eventos de todos' },
    details: { '/calendario': [{ title: 'Recordatorios', text: 'Avisos antes del Evento. También «Todavía pendiente».' }] },
  }

  it('todos los puntos clave en la Ayuda → completa (sin importar acentos ni mayúsculas)', () => {
    expect(featureHelpCoverage(entry({ help: { route: '/calendario', terms: ['recordatorio', 'todavia pendiente'] } }), help).coverage).toBe('completa')
  })
  it('solo algunos → parcial, y dice cuáles faltan', () => {
    const r = featureHelpCoverage(entry({ help: { route: '/calendario', terms: ['recordatorio', 'google calendar'] } }), help)
    expect(r.coverage).toBe('parcial')
    expect(r.missing).toEqual(['google calendar'])
    expect(r.found).toEqual(['recordatorio'])
  })
  it('ninguno → inexistente', () => {
    expect(featureHelpCoverage(entry({ help: { route: '/calendario', terms: ['nevera'] } }), help).coverage).toBe('inexistente')
  })
  it('sin sección o sin puntos clave → pendiente de revisión', () => {
    expect(featureHelpCoverage(entry({ help: { route: null, terms: [] } }), help).coverage).toBe('pendiente')
    expect(featureHelpCoverage(entry({ help: { route: '/calendario', terms: [] } }), help).coverage).toBe('pendiente')
  })
  it('una Ayuda incompleta NO cambia el estado de la función: operativa con Ayuda inexistente y parcial con Ayuda completa son posibles', () => {
    const a = entry({ state: 'operativa', help: { route: '/calendario', terms: ['nevera'] } })
    const b = entry({ state: 'parcial', missing: 'Le falta algo concreto del producto.', help: { route: '/calendario', terms: ['recordatorio'] } })
    expect(featureHelpCoverage(a, help).coverage).toBe('inexistente')
    expect(a.state).toBe('operativa')
    expect(featureHelpCoverage(b, help).coverage).toBe('completa')
    expect(b.state).toBe('parcial')
  })
  it('con la Ayuda real, cada función tiene una cobertura válida y hay de todo tipo (no es un resultado fijo)', () => {
    const results = FEATURE_INVENTORY.map((e) => featureHelpCoverage(e, REAL_HELP).coverage)
    for (const c of results) expect(Object.keys(HELP_COVERAGE_LABEL)).toContain(c)
    expect(new Set(results).size).toBeGreaterThanOrEqual(3)
  })
  it('un hecho conocido: la Ayuda no cuenta las preguntas de Cocina por ingredientes ni la fotografía de la nevera', () => {
    const nevera = FEATURE_INVENTORY.find((e) => e.id === 'cocina-nevera-foto')!
    expect(featureHelpCoverage(nevera, REAL_HELP).coverage).toBe('inexistente')
  })
})

describe('búsqueda y filtros', () => {
  const cov = () => 'completa' as const
  it('sin filtros devuelve todo; la búsqueda ignora acentos y mayúsculas y exige todas las palabras', () => {
    expect(filterFeatures(FEATURE_INVENTORY, NO_FILTERS, cov)).toHaveLength(FEATURE_INVENTORY.length)
    const a = filterFeatures(FEATURE_INVENTORY, { ...NO_FILTERS, query: 'ALERGIAS' }, cov)
    expect(a.map((e) => e.id)).toContain('cocina-alergias')
    const b = filterFeatures(FEATURE_INVENTORY, { ...NO_FILTERS, query: 'alergias zzzz' }, cov)
    expect(b).toHaveLength(0)
  })
  it('los filtros se combinan (módulo + estado)', () => {
    const r = filterFeatures(FEATURE_INVENTORY, { ...NO_FILTERS, module: 'Comunidad', state: 'desactivada' }, cov)
    expect(r.length).toBeGreaterThan(0)
    for (const e of r) {
      expect(e.module).toBe('Comunidad')
      expect(e.state).toBe('desactivada')
    }
  })
  it('el filtro de Ayuda usa la cobertura calculada, no el estado', () => {
    const r = filterFeatures(FEATURE_INVENTORY, { ...NO_FILTERS, help: 'inexistente' }, (e) => (e.id === 'inicio-portada' ? 'inexistente' : 'completa'))
    expect(r.map((e) => e.id)).toEqual(['inicio-portada'])
  })
  it('hay lista de módulos para el desplegable', () => {
    expect(modulesOf(FEATURE_INVENTORY)).toContain('Comunidad')
  })
})
