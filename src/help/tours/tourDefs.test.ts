// AYUDA-01 para los tutoriales «Enséñame»: cada recorrido apunta a controles y avisos que EXISTEN de verdad en el código de las pantallas reales, los pasos sensibles nunca avanzan con
// un clic, y cada tutorial registrado cuelga de una ficha de Ayuda. Si alguien renombra o quita una marca `data-help-id` (o el aviso de «guardado»), falla aquí.
import { describe, expect, it } from 'vitest'
import { HELP_CARD_BY_ID, HELP_CARDS } from '@/help/catalog'
import { KNOWN_APP_ROUTES } from '@/help/routes'
import { HELP_ID_PATTERN } from '@/help/tours/domTargets'
import { getTour, TOUR_IDS, TOURS } from '@/help/tours/registry'
import type { TourDef, TourSignal } from '@/help/tours/types'
import busSource from '@/help/tours/helpBus.ts?raw'

const SOURCES = import.meta.glob(['/src/ui/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const CORPUS = Object.values(SOURCES).join('\n')

function markExists(id: string): boolean {
  if (CORPUS.includes(`data-help-id="${id}"`) || CORPUS.includes(`'data-help-id': '${id}'`)) return true
  // Componentes que reciben la marca por la propiedad `helpId` y la pintan como data-help-id en su contenedor.
  if (CORPUS.includes(`helpId="${id}"`)) return true
  // Marcas calculadas por plantilla (una por sección de la barra): nav.tab.<sección>
  if (id.startsWith('nav.tab.')) return CORPUS.includes('data-help-id={`nav.tab.')
  return false
}

const targetsOf = (t: TourDef): string[] =>
  t.steps.flatMap((s) => [...(s.target ? [s.target] : []), ...(s.completeOn as TourSignal[]).flatMap((c) => ('target' in c ? [c.target] : [])), ...(s.skipIf ?? []).flatMap((c) => ('target' in c ? [c.target] : []))])

describe('tutoriales registrados', () => {
  it('hay tutoriales, con identificadores únicos, y los tres pilotos pedidos están', () => {
    expect(new Set(TOUR_IDS).size).toBe(TOUR_IDS.length)
    for (const id of ['cal-crear-evento', 'com-anadir-producto', 'fam-anadir-miembro']) expect(TOUR_IDS, id).toContain(id)
  })

  it('cada tutorial cuelga de una ficha de Ayuda que lo ofrece («Enséñame»), y cada «Enséñame» de una ficha lleva a un tutorial registrado', () => {
    for (const t of TOURS) {
      const card = HELP_CARD_BY_ID.get(t.cardId)
      expect(card, `${t.id}: la ficha ${t.cardId} no existe`).toBeTruthy()
      expect(HELP_CARDS.some((c) => c.tour === t.id), `${t.id}: ninguna ficha lo ofrece`).toBe(true)
    }
    for (const c of HELP_CARDS) if (c.tour) expect(getTour(c.tour), `${c.id}: el tutorial ${c.tour} no está registrado`).toBeTruthy()
  })

  it('las fichas que ofrecen «Enséñame» no son de funciones desactivadas', () => {
    for (const c of HELP_CARDS.filter((x) => x.tour)) expect(c.state, c.id).not.toBe('desactivada')
  })

  for (const tour of TOURS) {
    describe(`«${tour.id}»`, () => {
      it('pantallas de partida reales y sugerencias finales que existen', () => {
        expect(KNOWN_APP_ROUTES).toContain(tour.startPath)
        for (const p of tour.paths ?? []) expect(KNOWN_APP_ROUTES, p).toContain(p)
        for (const n of tour.next ?? []) expect(HELP_CARD_BY_ID.has(n), `${tour.id}: sugerencia ${n}`).toBe(true)
        expect(tour.durationSec).toBeLessThanOrEqual(120)
      })

      it('pasos breves, con identificador único y una forma de avanzar', () => {
        const ids = tour.steps.map((s) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const s of tour.steps) {
          expect(s.text.trim().length, s.id).toBeGreaterThan(10)
          expect(s.text.length, `${s.id}: texto demasiado largo`).toBeLessThanOrEqual(300)
          if (!s.manualNext) expect(s.completeOn.length, `${s.id}: sin forma de avanzar`).toBeGreaterThan(0)
        }
      })

      it('SEGURIDAD: un paso sensible no avanza con clics, no ofrece «Siguiente» y solo espera el aviso de que la aplicación guardó', () => {
        for (const s of tour.steps.filter((x) => x.sensitive)) {
          expect(s.completeOn.some((c) => c.type === 'click'), `${s.id}: clic en un paso sensible`).toBe(false)
          expect(s.manualNext, `${s.id}: «Siguiente» en un paso sensible`).toBeFalsy()
          expect(s.completeOn.length > 0 && s.completeOn.every((c) => c.type === 'event'), `${s.id}: debe esperar un evento de guardado`).toBe(true)
        }
      })

      it('REALES: cada control que señala existe en el código de las pantallas (marca data-help-id) con un identificador válido', () => {
        for (const id of targetsOf(tour)) {
          expect(HELP_ID_PATTERN.test(id), `${id} no es un identificador válido`).toBe(true)
          expect(markExists(id), `${tour.id}: no existe ninguna pantalla con data-help-id="${id}"`).toBe(true)
        }
      })

      it('REALES: cada aviso de «guardado» que espera lo emite la pantalla real tras confirmar el guardado', () => {
        for (const s of tour.steps)
          for (const c of s.completeOn)
            if (c.type === 'event') {
              expect(CORPUS.includes(`emitHelpEvent('${c.name}')`), `${tour.id}: nadie emite «${c.name}»`).toBe(true)
              expect(busSource.includes(`'${c.name}'`), `${c.name} no está declarado en helpBus`).toBe(true)
            }
      })
    })
  }

  it('el recorrido de bienvenida es solo informativo: ningún paso sensible, ningún aviso de guardado, ningún dato se crea', () => {
    const w = getTour('bienvenida')!
    for (const s of w.steps) {
      expect(s.sensitive).toBeFalsy()
      expect(s.completeOn.some((c) => c.type === 'event')).toBe(false)
    }
    expect(w.durationSec).toBeLessThanOrEqual(120)
    expect(w.steps.length).toBeGreaterThanOrEqual(4)
  })

  it('el recorrido de bienvenida cubre Inicio, navegación, Calendario, Compras y Ayuda', () => {
    const w = getTour('bienvenida')!
    const targets = w.steps.map((s) => s.target)
    for (const t of ['inicio.carrusel', 'nav.menu', 'nav.tab.calendario', 'nav.tab.compras', 'nav.help']) expect(targets).toContain(t)
  })

  it('el tutorial de Familia no envía invitaciones: el texto lo dice y el último paso solo espera la ficha creada', () => {
    const t = getTour('fam-anadir-miembro')!
    expect(t.finishText).toMatch(/no envío ninguna invitación/i)
    expect(t.steps[t.steps.length - 1].completeOn).toEqual([{ type: 'event', name: 'family.member-added' }])
  })
})

describe('B4-UX01..06 · reglas de calidad de los recorridos', () => {
  it('toda propiedad `helpId` que usan las pantallas se pinta como data-help-id (la marca llega al DOM)', () => {
    const calendar = SOURCES['/src/ui/CalendarScreen.tsx']
    expect(calendar.match(/data-help-id=\{helpId\}/g)?.length ?? 0).toBeGreaterThanOrEqual(4) // FieldDropdown, WhoDropdown, CategoryDropdown, EventExtrasFields
  })

  it('los grupos de opciones solo tienen pasos opcionales o informativos, nunca sensibles, y «¿Para quién?» queda fuera de ellos', () => {
    for (const t of TOURS)
      for (const s of t.steps) {
        if (s.group) {
          expect(s.sensitive, `${t.id}/${s.id}`).toBeFalsy()
          expect(s.manualNext || s.optional, `${t.id}/${s.id}`).toBeTruthy()
        }
        if (s.id === 'quien') expect(s.group, `${t.id}: «¿Para quién?» no es una opción secundaria`).toBeUndefined()
      }
  })

  it('cada paso de opción con control que puede no existir es opcional (se omite solo, sin marco huérfano)', () => {
    for (const id of ['cal-crear-evento', 'cal-crear-tarea']) {
      const t = getTour(id)!
      for (const s of t.steps.filter((x) => x.group || x.id === 'puntos')) expect(s.optional, `${id}/${s.id}`).toBe(true)
    }
  })

  it('los tutoriales de evento y tarea explican persona, puntos y «Toda la familia», y piden los puntos solo para una persona', () => {
    for (const id of ['cal-crear-evento', 'cal-crear-tarea']) {
      const t = getTour(id)!
      const who = t.steps.find((s) => s.id === 'quien')!
      expect(who.text).toMatch(/una persona/)
      expect(who.text).toMatch(/puntos/)
      expect(who.text).toMatch(/Toda la familia/)
      expect(t.steps.find((s) => s.id === 'puntos')!.text).toMatch(/una sola persona/)
    }
  })

  it('el paso de la fecha avanza al confirmar la selección y también se puede pasar con «Siguiente»', () => {
    for (const id of ['cal-crear-evento', 'cal-crear-tarea']) {
      const f = getTour(id)!.steps.find((s) => s.id === 'fecha')!
      expect(f.completeOn).toEqual([{ type: 'confirmed', target: f.target }])
      expect(f.manualNext).toBe(true)
    }
  })

  it('el recorrido del evento enseña, cuando existen, todas las opciones reales del formulario', () => {
    const targets = getTour('cal-crear-evento')!.steps.map((s) => s.target)
    for (const t of ['calendar.event-time', 'calendar.event-allday', 'calendar.event-private', 'calendar.event-repeat', 'calendar.event-reminder', 'calendar.event-who', 'calendar.event-points', 'calendar.event-category', 'calendar.event-extras'])
      expect(targets).toContain(t)
    // ningún paso apunta al título por error (era el fallo del paso de «opciones»)
    expect(getTour('cal-crear-evento')!.steps.filter((s) => s.target === 'calendar.event-title')).toHaveLength(1)
  })
})

describe('FAM-TUT-05 · fecha de nacimiento y Comunidad: el texto del tutorial dice lo mismo que la regla efectiva', () => {
  it('Comunidad es solo para mayores de 18 y una fecha desconocida NUNCA cuenta como mayoría de edad (regla del servidor reflejada en el dominio)', async () => {
    const { accessFromStatus, unavailableReasonText } = await import('@/domain/communityAccess')
    expect(accessFromStatus({ access: 'none', accessReason: 'age_unknown' }).level).toBe('none') // sin fecha, sin acceso
    expect(unavailableReasonText('age_unknown')).toMatch(/fecha de nacimiento/)
    expect(unavailableReasonText('under_18')).toMatch(/18 años/)
    const step = getTour('fam-anadir-miembro')!.steps.find((s) => s.id === 'nacimiento')!
    expect(step.text).toMatch(/18 años/)
    expect(step.text).toMatch(/sin fecha no se entra en Comunidad/)
    expect(step.text).not.toMatch(/sea cual sea la edad|se supone que es adulto(?!\))/)
  })
})
