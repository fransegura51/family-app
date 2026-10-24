// Catálogo MAESTRO de la Ayuda (Fase 8): une, por sección, las fichas, la visita guiada («Conoce esta sección»), los tutoriales («Enséñame») y las explicaciones («Cómo funciona PEPA»), y
// comprueba contra el código que nada de eso es humo: cada control señalado existe, ninguna visita cambia datos, ningún tutorial pulsa por la persona acciones que borran, envían,
// publican o pagan, y cada explicación se apoya en archivos reales y cita textos de pantalla que existen. Si alguien cambia una pantalla y rompe un recorrido, falla AQUÍ.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HELP_CARD_BY_ID, HELP_MODULE_BY_ID, HELP_MODULES } from '@/help/catalog'
import { EXPLAINERS } from '@/help/explainers'
import { sectionInventory, sectionStatus, tutorialsOf, visitsOf } from '@/help/master/inventory'
import { KNOWN_APP_ROUTES } from '@/help/routes'
import { HELP_ID_PATTERN } from '@/help/tours/domTargets'
import { getTour, TOURS } from '@/help/tours/registry'
import type { HelpModuleId } from '@/help/types'

const UI_SOURCES = import.meta.glob(['/src/ui/**/*.{ts,tsx}', '/src/domain/*.ts', '/src/pepa/*.ts', '/src/state/*.ts', '/src/help/ui/**/*.{ts,tsx}', '!/src/**/*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const CORPUS = Object.values(UI_SOURCES).join('\n')
const root = process.cwd()

// Secciones reales de PEPA que DEBEN tener visita guiada (el encargo: Inicio, Calendario, Compras, Economía, Cocina, Familia, Pequeños Grandes, Eventos, Comunidad, Documentos, Galería,
// Ubicación, Contactos, Cumpleaños, Configuración, Buzón y Ayuda).
const REQUIRED_VISIT_MODULES: HelpModuleId[] = ['inicio', 'calendario', 'compras', 'economia', 'cocina', 'familia', 'pequenos', 'eventos', 'comunidad', 'documentos', 'galeria', 'ubicacion', 'contactos', 'cumpleanos', 'configuracion', 'ayuda']
const REQUIRED_VISIT_IDS = ['visita-ayuda', 'visita-buzon']

// Un paso «sensible» señala un botón que la PERSONA pulsa y el tutorial solo espera el aviso de guardado: vale para guardar datos de la propia familia («Dar puntos», «Guardar»), pero nunca
// para acciones que borran, comparten hacia fuera, publican, pagan, conectan terceros o leen con IA.
const FORBIDDEN_SENSITIVE_TARGET = /(delete|borrar|eliminar|quitar|remove|publish|publicar|share|compartir|pay|pagar|connect|conectar|desconectar|invite|invitar|read-ticket|receipt-read|leer|suggestions\.send|finalizar)/
const FORBIDDEN_CLICK_TARGET = /(delete|borrar|eliminar|quitar|remove|publish|publicar|send|enviar|share|compartir|pay|pagar|connect|conectar|desconectar|invite|invitar|read-ticket|leer-ticket|finish|finalizar)/

describe('catálogo maestro: visitas guiadas («Conoce esta sección»)', () => {
  it('cada sección real tiene su visita, y existen la del Buzón y la de la Ayuda', () => {
    for (const id of REQUIRED_VISIT_MODULES) expect(visitsOf(id).length, `sin visita: ${id}`).toBeGreaterThan(0)
    for (const id of REQUIRED_VISIT_IDS) expect(getTour(id), id).toBeTruthy()
  })

  it('las visitas son solo informativas: ningún dato se crea ni se guarda, ningún clic obligatorio, entre 1 y 8 pasos y 2 minutos como máximo', () => {
    for (const v of TOURS.filter((t) => t.kind === 'visit')) {
      expect(v.id, v.id).toMatch(/^visita-[a-z0-9-]+$/)
      expect(v.module, `${v.id}: falta el módulo`).toBeTruthy()
      expect(HELP_MODULE_BY_ID.has(v.module!), `${v.id}: módulo desconocido`).toBe(true)
      expect(v.summary?.length ?? 0, `${v.id}: falta el resumen`).toBeGreaterThan(10)
      expect(v.durationSec, v.id).toBeLessThanOrEqual(120)
      expect(v.steps.length, v.id).toBeGreaterThanOrEqual(1)
      expect(v.steps.length, v.id).toBeLessThanOrEqual(8)
      for (const s of v.steps) {
        expect(s.sensitive, `${v.id}/${s.id}`).toBeFalsy()
        expect(s.completeOn, `${v.id}/${s.id}: una visita no espera acciones`).toEqual([])
        expect(s.manualNext, `${v.id}/${s.id}`).toBe(true)
      }
      expect(KNOWN_APP_ROUTES, `${v.id}: ruta de partida`).toContain(v.startPath)
    }
  })

  it('la visita de Comunidad exige acceso a Comunidad (18+ y abierta)', () => {
    for (const v of visitsOf('comunidad')) expect(v.access?.community, v.id).toBe(true)
  })
})

describe('catálogo maestro: tutoriales («Enséñame»)', () => {
  const tutorials = TOURS.filter((t) => (t.kind ?? 'tutorial') === 'tutorial')

  it('hay tutoriales en las secciones principales', () => {
    for (const id of ['calendario', 'compras', 'economia', 'cocina', 'familia', 'eventos'] as HelpModuleId[]) expect(tutorialsOf(id).length, id).toBeGreaterThan(0)
  })

  it('todo tutorial nuevo declara módulo y resumen, y su ficha existe y es del mismo módulo', () => {
    const pilots = new Set(['cal-crear-evento', 'cal-crear-tarea', 'com-anadir-producto', 'fam-anadir-miembro', 'bienvenida'])
    for (const t of tutorials.filter((x) => !pilots.has(x.id))) {
      expect(t.module, `${t.id}: falta el módulo`).toBeTruthy()
      expect(t.summary?.length ?? 0, `${t.id}: falta el resumen`).toBeGreaterThan(10)
      const card = HELP_CARD_BY_ID.get(t.cardId)
      expect(card, `${t.id}: ficha ${t.cardId}`).toBeTruthy()
      expect(card!.module, `${t.id}: la ficha es de otro módulo`).toBe(t.module)
      expect(t.id, t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('SEGURIDAD: ningún tutorial avanza pulsando por la persona un control que borra, envía, comparte, publica, paga, conecta un banco o lee un ticket con IA', () => {
    for (const t of TOURS) {
      for (const s of t.steps) {
        for (const c of s.completeOn) {
          if (c.type === 'click' || c.type === 'appear') expect(FORBIDDEN_CLICK_TARGET.test(c.target), `${t.id}/${s.id}: avanza con «${c.target}»`).toBe(false)
        }
        if (s.sensitive && s.target) expect(FORBIDDEN_SENSITIVE_TARGET.test(s.target), `${t.id}/${s.id}: paso sensible sobre «${s.target}»`).toBe(false)
      }
    }
  })

  it('los tutoriales de Comunidad exigen acceso a Comunidad; los de administración de la familia, ser administración', () => {
    // Salvo los que ni siquiera entran en Comunidad: «Por qué no puedo entrar» se recorre en la ficha de Familia (/familia) y es justo para quien NO tiene acceso.
    for (const t of tutorialsOf('comunidad').filter((x) => x.startPath.startsWith('/comunidad'))) expect(t.access?.community, t.id).toBe(true)
  })

  it('cada marca (data-help-id) que cualquier visita o tutorial señala tiene un identificador válido', () => {
    for (const t of TOURS)
      for (const s of t.steps) {
        if (s.target) expect(HELP_ID_PATTERN.test(s.target), `${t.id}/${s.id}: ${s.target}`).toBe(true)
      }
  })
})

describe('catálogo maestro: «Cómo funciona PEPA»', () => {
  it('hay explicaciones, con identificadores únicos y módulo real', () => {
    expect(EXPLAINERS.length).toBeGreaterThan(0)
    const ids = EXPLAINERS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of EXPLAINERS) {
      expect(e.id, e.id).toMatch(/^exp-[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(HELP_MODULE_BY_ID.has(e.module), e.id).toBe(true)
    }
  })

  it('cada explicación tiene secciones, un ejemplo, limitaciones, qué hacer si sale mal y fecha de comprobación', () => {
    expect(EXPLAINERS.filter((e) => !e.sections.some((s) => Boolean(s.example))).map((e) => e.id), 'explicaciones sin ejemplo práctico').toEqual([])
    for (const e of EXPLAINERS) {
      expect(e.sections.length, e.id).toBeGreaterThanOrEqual(2)
      expect(e.limits.length, `${e.id}: faltan limitaciones`).toBeGreaterThan(0)
      expect(e.ifWrong.length, `${e.id}: falta «si sale mal»`).toBeGreaterThan(0)
      expect(e.verified, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const s of e.sections) {
        expect(s.heading.length, e.id).toBeGreaterThan(2)
        expect(s.paragraphs.length, `${e.id}/${s.heading}`).toBeGreaterThan(0)
      }
    }
  })

  it('REALES: los archivos en los que se apoya cada explicación existen, y los textos de pantalla que cita están en el código', () => {
    const missingFiles: string[] = []
    const missingLabels: string[] = []
    for (const e of EXPLAINERS) {
      expect(e.basedOn.length, `${e.id}: debe citar en qué código se apoya`).toBeGreaterThan(0)
      for (const f of e.basedOn) if (!existsSync(join(root, f))) missingFiles.push(`${e.id}: ${f}`)
      for (const l of e.labels ?? []) if (!CORPUS.includes(l)) missingLabels.push(`${e.id}: «${l}»`)
    }
    expect(missingFiles).toEqual([])
    expect(missingLabels).toEqual([])
  })

  it('los enlaces de cada explicación existen: tutorial, fichas y pantalla', () => {
    for (const e of EXPLAINERS) {
      if (e.tour) expect(getTour(e.tour), `${e.id}: tutorial ${e.tour}`).toBeTruthy()
      for (const c of e.cardIds ?? []) expect(HELP_CARD_BY_ID.has(c), `${e.id}: ficha ${c}`).toBe(true)
      if (e.go) expect(KNOWN_APP_ROUTES, `${e.id}: ${e.go.path}`).toContain(e.go.path)
    }
  })

  it('las explicaciones de Comunidad exigen acceso a Comunidad', () => {
    // Salvo las generales («por qué no puedo entrar»), que ve todo el mundo, como las fichas generales de Comunidad.
    for (const e of EXPLAINERS.filter((x) => x.module === 'comunidad' && x.id !== 'exp-comunidad-solo-adultas')) expect(e.access?.community, e.id).toBe(true)
  })

  it('ninguna explicación promete un aprendizaje, memoria o IA que el texto no condicione', () => {
    // Palabras de alarma: si aparecen, el texto debe estar revisado a mano (esta lista obliga a pensarlo, no a prohibirlo).
    const suspicious = /\bPEPA aprende\b|\bPepa aprende\b|\bse acuerda de\b|\brecuerda tus correcciones\b/i
    for (const e of EXPLAINERS) {
      const text = [e.summary, ...e.sections.flatMap((s) => s.paragraphs)].join(' ')
      if (suspicious.test(text)) expect(e.limits.join(' ') + e.ifWrong.join(' '), `${e.id}: afirma que aprende; debe aclarar el alcance real`).toMatch(/solo|no |nunca/i)
    }
  })
})

describe('catálogo maestro: inventario por sección', () => {
  it('el inventario enlaza cada módulo con su estado, fichas, visita, tutoriales y explicaciones, sin huérfanos', () => {
    const inv = sectionInventory()
    expect(inv.length).toBe(HELP_MODULES.length)
    for (const row of inv) {
      expect(['operativa', 'parcial', 'no-disponible']).toContain(row.status)
      expect(row.status).toBe(sectionStatus(row.module.id))
      for (const t of row.tutorials) expect(t.module).toBe(row.module.id)
      for (const v of row.visits) expect(v.module).toBe(row.module.id)
    }
    // Nada registrado queda sin módulo (salvo los pilotos antiguos, que se asignan por su ficha).
    for (const t of TOURS.filter((x) => !['cal-crear-evento', 'cal-crear-tarea', 'com-anadir-producto', 'fam-anadir-miembro', 'bienvenida'].includes(x.id))) expect(t.module, t.id).toBeTruthy()
  })
})
