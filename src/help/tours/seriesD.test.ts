// Series de Eventos, Documentos, Galería, Contactos y Cumpleaños (series/d.ts): lo que las reglas generales (series.test.ts, tourDefs.test.ts) no miran. Las marcas de arranque
// (`readyOn`, `needs`, `keepVisible`), los destinos, la cobertura de TODAS las partes de un evento en el mapa de Ayuda (recorrido o planificado) y las promesas que la Ayuda no puede hacer.
import { describe, expect, it } from 'vitest'
import { EVENT_MODULES } from '@/domain/events'
import { PLANNED_SERIES } from '@/help/tours/planned'
import { getTour, TOURS } from '@/help/tours/registry'
import { chaptersOf, SERIES } from '@/help/tours/series'
import { SERIES_D } from '@/help/tours/series/d'

const SOURCES = import.meta.glob(['/src/ui/**/*.tsx', '/src/help/ui/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const CORPUS = Object.values(SOURCES).join('\n')
const markExists = (id: string) => CORPUS.includes(`data-help-id="${id}"`) || CORPUS.includes(`'data-help-id': '${id}'`)

const CHAPTERS = SERIES_D.flatMap((s) => chaptersOf(s))
const textOf = (t: { steps: Array<{ text: string; details?: Array<{ text: string }> }>; finishText: string }) => [...t.steps.flatMap((s) => [s.text, ...(s.details ?? []).map((d) => d.text)]), t.finishText].join('\n')

describe('series D: Eventos, Documentos, Galería, Contactos y Cumpleaños', () => {
  it('son 8 series con los capítulos esperados y cada capítulo es del mismo módulo que su serie', () => {
    expect(SERIES_D.map((s) => s.id)).toEqual([
      'ser-eventos-crear',
      'ser-eventos-invitados',
      'ser-eventos-menu-plan',
      'ser-documentos-guardar',
      'ser-galeria-fotos',
      'ser-contactos-agenda',
      'ser-contactos-importar-compartir',
      'ser-cumpleanos-favoritos',
    ])
    for (const s of SERIES_D) for (const c of chaptersOf(s)) expect(c.module, c.id).toBe(s.module)
    expect(SERIES.filter((s) => SERIES_D.includes(s))).toHaveLength(SERIES_D.length)
  })

  it('el primer paso de cada capítulo nunca es opcional y las marcas de arranque, de datos y de «no tapar» existen en las pantallas', () => {
    for (const c of CHAPTERS) {
      expect(c.steps[0].optional, `${c.id}: el primer paso es opcional`).toBeFalsy()
      for (const m of c.readyOn ?? []) expect(markExists(m), `${c.id}: readyOn «${m}»`).toBe(true)
      for (const n of c.needs ?? []) {
        expect(markExists(n.target), `${c.id}: needs «${n.target}»`).toBe(true)
        expect(n.message.length, `${c.id}: needs sin mensaje`).toBeGreaterThan(20)
      }
      for (const s of c.steps) for (const k of s.keepVisible ?? []) expect(markExists(k), `${c.id}/${s.id}: keepVisible «${k}»`).toBe(true)
    }
  })

  it('un capítulo que puede terminar guardando datos reales lo dice en el primer paso (o el paso sensible lo dice de forma clara)', () => {
    for (const c of CHAPTERS) {
      const guarda = c.steps.some((s) => s.sensitive)
      if (!guarda) continue
      const antes = c.steps.slice(0, 2).map((s) => s.text).join(' ')
      expect(/de verdad|al momento/i.test(antes) || c.steps.filter((s) => s.sensitive).every((s) => /de verdad|al momento/i.test(s.text)), `${c.id}: no avisa de que se guarda de verdad`).toBe(true)
    }
  })

  it('los capítulos de Eventos que trabajan dentro de un evento arrancan de la lista (destino que la pantalla atiende) y avisan si falta un evento', () => {
    expect(CORPUS.includes("'eventos.lista'")).toBe(true)
    expect(CORPUS.includes('<HelpDestMark id="eventos.lista" />')).toBe(true)
    for (const s of SERIES_D.filter((x) => x.module === 'eventos'))
      for (const c of chaptersOf(s)) {
        expect(c.startDest, c.id).toBe('eventos.lista')
        if (c.id !== 'tut-eventos-crear-evento') expect(c.needs?.[0]?.target, `${c.id}: necesita un evento`).toBe('eventos.event-card')
      }
  })

  it('CONDICIÓN ESPECIAL de Eventos: la visita nombra TODAS las partes y las 8 sin recorrido están planificadas con un motivo concreto', () => {
    const visita = getTour('visita-eventos')!
    const texto = visita.steps.map((s) => s.text).join(' ')
    for (const m of EVENT_MODULES) expect(texto.includes(m.label), `la visita no nombra «${m.label}»`).toBe(true)
    expect(texto).toContain('Compras')
    const sinRecorrido = ['ser-eventos-pagos-fianzas', 'ser-eventos-decoracion', 'ser-eventos-actividades', 'ser-eventos-mesas', 'ser-eventos-ceremonia', 'ser-eventos-proveedores', 'ser-eventos-detalles-recuerdos', 'ser-eventos-regalos-recibidos']
    const planificados = PLANNED_SERIES.filter((p) => p.module === 'eventos').map((p) => p.id)
    expect(planificados).toEqual(sinRecorrido)
    for (const p of PLANNED_SERIES.filter((x) => x.module === 'eventos')) {
      expect(SERIES.some((s) => s.id === p.id), `${p.id} ya es una serie`).toBe(false)
      expect(p.blockedBy.length, p.id).toBeGreaterThan(80)
    }
    // Y los 6 módulos con recorrido tienen su capítulo.
    for (const id of ['tut-eventos-anadir-invitado', 'tut-eventos-crear-invitacion', 'tut-eventos-anadir-tarea', 'tut-eventos-anadir-partida', 'tut-eventos-anadir-plato', 'tut-eventos-anadir-momento']) expect(getTour(id), id).toBeTruthy()
  })

  it('el Plan del día no promete compartir el plan (esa función no existe) y los envíos de Eventos los hace siempre la persona', () => {
    for (const c of chaptersOf(SERIES_D.find((s) => s.id === 'ser-eventos-menu-plan')!)) expect(textOf(c), c.id).not.toMatch(/compart\w* (el|este|tu|vuestro) plan|plan que compart|saldrá en el plan/i)
    const momento = getTour('tut-eventos-anadir-momento')!
    expect(momento.steps.find((s) => s.target === 'eventos.moment-share')!.text).toMatch(/solo para vosotros/)
    for (const c of chaptersOf(SERIES_D.find((s) => s.id === 'ser-eventos-invitados')!))
      for (const s of c.steps) {
        expect(s.sensitive && /compart|enviar|mandar/i.test(s.target ?? ''), `${c.id}/${s.id}: paso sensible sobre un envío`).toBeFalsy()
        for (const sig of s.completeOn) if ('target' in sig) expect(/share|compartir|send|enviar|invite|invitar/.test(sig.target), `${c.id}/${s.id}: avanza con un envío`).toBe(false)
      }
  })

  it('Cumpleaños: la serie es solo para administración, los dos capítulos también, y los avisos diarios de las 09:00 figuran en la visita y en la explicación', () => {
    const serie = SERIES_D.find((s) => s.id === 'ser-cumpleanos-favoritos')!
    expect(serie.access).toEqual({ familyAdmin: true })
    for (const c of chaptersOf(serie)) expect(c.access, c.id).toEqual({ familyAdmin: true })
    const visita = getTour('visita-cumpleanos')!
    expect(visita.steps.map((s) => s.text).join(' ')).toMatch(/09:00/)
    expect(visita.steps.map((s) => s.text).join(' ')).not.toMatch(/Tampoco hay avisos/)
  })

  it('Documentos: la visita y el capítulo de visibilidad hablan del candado y de la privacidad por persona', () => {
    expect(getTour('visita-documentos')!.steps.map((s) => s.text).join(' ')).toMatch(/🔒/)
    const q = getTour('tut-documentos-quien-ve')!
    const texto = textOf(q)
    expect(texto).toMatch(/Solo yo/)
    expect(texto).toMatch(/Elegir personas/)
    expect(texto).toMatch(/solo lo cambia o borra quien lo subió/)
    expect(q.steps.every((s) => !s.sensitive)).toBe(true)
  })

  it('Contactos: el capítulo de añadir avisa de que «Colegio» viene preseleccionada y del aviso diario de cumpleaños', () => {
    const a = getTour('tut-contactos-anadir')!
    expect(a.steps.find((s) => s.id === 'categoria')!.text).toMatch(/viene ya puesta «Colegio»/)
    expect(a.steps.find((s) => s.id === 'cumpleanos')!.text).toMatch(/09:00/)
  })

  it('Galería: la descripción se puede cambiar después (ya no se dice lo contrario) y se guarda con un aviso real', () => {
    const subir = getTour('tut-galeria-subir-foto')!
    expect(subir.finishText).not.toMatch(/no se puede cambiar/i)
    const ampliar = getTour('tut-galeria-ampliar')!
    expect(ampliar.steps[ampliar.steps.length - 1].completeOn).toEqual([{ type: 'event', name: 'gallery.caption-saved' }])
  })

  it('todos los tutoriales de estos módulos están en alguna serie y ninguno quedó con un identificador viejo', () => {
    const mios = TOURS.filter((t) => (t.kind ?? 'tutorial') === 'tutorial' && ['eventos', 'documentos', 'galeria', 'contactos', 'cumpleanos'].includes(t.module ?? ''))
    expect(mios.length).toBe(CHAPTERS.length)
    for (const t of mios) expect(CHAPTERS.some((c) => c.id === t.id), t.id).toBe(true)
  })
})
