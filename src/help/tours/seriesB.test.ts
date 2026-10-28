// Series de Compras y Economía (series/b.ts): lo que las reglas generales (series.test.ts, tourDefs.test.ts) no miran. Las marcas de arranque (`readyOn`, `needs`, `keepVisible`), el primer paso,
// la regla «Comprado ≠ compra registrada», que no se enseñe lo pendiente de validación en iPhone/Android y que las explicaciones no afirmen lo que el código ya no hace.
import { describe, expect, it } from 'vitest'
import { EXPLAINER_BY_ID } from '@/help/explainers'
import { PLANNED_SERIES } from '@/help/tours/planned'
import { getTour, TOURS } from '@/help/tours/registry'
import { chaptersOf, SERIES } from '@/help/tours/series'
import { SERIES_B } from '@/help/tours/series/b'

const SOURCES = import.meta.glob(['/src/ui/**/*.tsx', '/src/help/ui/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const CORPUS = Object.values(SOURCES).join('\n')
const markExists = (id: string) => CORPUS.includes(`data-help-id="${id}"`) || CORPUS.includes(`'data-help-id': '${id}'`) || CORPUS.includes(`helpId="${id}"`)

const CHAPTERS = SERIES_B.flatMap((s) => chaptersOf(s))
const textOf = (t: { steps: Array<{ text: string; details?: Array<{ text: string }> }>; finishText: string }) => [...t.steps.flatMap((s) => [s.text, ...(s.details ?? []).map((d) => d.text)]), t.finishText].join('\n')

describe('series B: Compras y Economía', () => {
  it('son 10 series con los capítulos esperados y cada capítulo es del mismo módulo que su serie', () => {
    expect(SERIES_B.map((s) => s.id)).toEqual([
      'ser-compras-lista',
      'ser-compras-tiendas',
      'ser-compras-tickets',
      'ser-compras-comparar',
      'ser-compras-historial',
      'ser-economia-moverte',
      'ser-economia-apuntar',
      'ser-economia-cuentas',
      'ser-economia-pagos',
      'ser-economia-numeros',
    ])
    for (const s of SERIES_B) for (const c of chaptersOf(s)) expect(c.module, c.id).toBe(s.module)
    expect(SERIES.filter((s) => SERIES_B.includes(s))).toHaveLength(SERIES_B.length)
    for (const s of SERIES_B) expect(chaptersOf(s).length, `${s.id}: capítulos que no existen`).toBe(s.chapters.length)
  })

  it('los identificadores de los tutoriales que ya existían siguen siendo capítulos (o alias)', () => {
    const before = [
      'com-anadir-producto',
      'tut-compras-editar-producto',
      'tut-compras-marcar-comprado',
      'tut-compras-tiendas',
      'tut-compras-compartir',
      'tut-compras-clase-historial',
      'tut-compras-subir-ticket',
      'tut-compras-historial-precios',
      'tut-economia-apuntar-movimiento',
      'tut-economia-cambiar-categoria',
      'tut-economia-clasificar-pendientes',
      'tut-economia-crear-presupuesto',
      'tut-economia-anadir-pago-previsto',
      'tut-economia-revisar-conciliacion',
      'tut-economia-ver-estadisticas',
      'tut-economia-conectar-banco',
      'tut-economia-mes-contable',
      'tut-economia-modo-cuentas',
    ]
    for (const id of before) expect(getTour(id), id).toBeTruthy()
    expect(getTour('tut-economia-clasificar-pendientes')!.id).toBe('tut-economia-cambiar-categoria')
    expect(TOURS.some((t) => t.id === 'tut-economia-clasificar-pendientes')).toBe(false)
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

  it('un capítulo que puede terminar guardando datos reales lo dice con claridad (de verdad / al momento)', () => {
    for (const c of CHAPTERS) {
      const guarda = c.steps.some((s) => s.sensitive)
      if (!guarda) continue
      const antes = c.steps.slice(0, 2).map((s) => s.text).join(' ')
      expect(/de verdad|al momento/i.test(antes) || c.steps.filter((s) => s.sensitive).every((s) => /de verdad|al momento/i.test(s.text)), `${c.id}: no avisa de que se guarda de verdad`).toBe(true)
    }
  })

  it('los capítulos de Tickets terminan sin guardar por la persona y avisan en el primer paso de que guardar es de verdad', () => {
    for (const c of chaptersOf(SERIES_B.find((s) => s.id === 'ser-compras-tickets')!)) {
      expect(c.steps.some((s) => s.sensitive), `${c.id}: un paso sensible`).toBe(false)
      expect(/no se guarda|sal sin guardar|se guarda de verdad|Si solo practicas/i.test(c.steps[0].text) || /guardar es siempre cosa tuya/i.test(c.finishText), `${c.id}: no avisa de que guardar es de verdad`).toBe(true)
    }
  })

  it('«Finalizar compra» se señala con su propio botón (no con la cabecera de la tienda) y nunca se espera como clic', () => {
    expect(CORPUS.includes('helpId="shopping.finish-purchase"')).toBe(true)
    const t = getTour('tut-compras-finalizar-compra')!
    expect(t.steps.find((s) => s.id === 'boton')!.target).toBe('shopping.finish-purchase')
    for (const s of t.steps) expect(s.completeOn.some((c) => c.type === 'click'), s.id).toBe(false)
    for (const c of CHAPTERS) for (const s of c.steps) if (s.target === 'shopping.store-heading') expect(c.id, 'la cabecera ya no representa a «Finalizar compra»').not.toMatch(/marcar|finalizar/)
  })

  it('REGLA: «Comprado» solo cambia el estado de la lista y «Finalizar compra» solo limpia; lo que registra es guardar un ticket o una compra «Sin ticket»', () => {
    const marcar = textOf(getTour('tut-compras-marcar-comprado')!)
    expect(marcar).toMatch(/no registra compra, gasto ni precio/i)
    expect(marcar).toMatch(/Compras registradas/)
    const fin = textOf(getTour('tut-compras-finalizar-compra')!)
    expect(fin).toMatch(/no crea gasto en Econom/i)
    expect(fin).toMatch(/Historial/)
    const visita = textOf(getTour('visita-compras')!)
    expect(visita).toMatch(/solo tacha/i)
    for (const c of CHAPTERS.filter((x) => x.module === 'compras')) {
      const text = textOf(c)
      expect(text, `${c.id}: dice que se queda tachado «en su sitio»`).not.toMatch(/en su sitio/)
    }
  })

  it('lo implementado pero pendiente de validación en iPhone y Android NO se enseña: va a planificados', () => {
    const planned = PLANNED_SERIES.filter((p) => p.id === 'ser-economia-efectivo' || p.id === 'ser-compras-pagos-devoluciones')
    expect(planned.map((p) => p.id).sort()).toEqual(['ser-compras-pagos-devoluciones', 'ser-economia-efectivo'])
    for (const p of planned) expect(p.blockedBy).toMatch(/iPhone y Android/)
    const text = CHAPTERS.map(textOf).join('\n')
    for (const frase of ['Pagar con varios medios', 'Cartera de efectivo', 'Registrar devolución', 'Retirada del banco', 'Archivar cartera']) expect(text, frase).not.toContain(frase)
  })

  it('lo que no existe no se presenta como operativo (categorías sin renombrar, presupuesto solo por voz, sin cuentas manuales ni Excel)', () => {
    const cat = textOf(getTour('tut-economia-categorias-etiquetas')!)
    expect(cat).toMatch(/No se renombran ni se reordenan/)
    expect(textOf(getTour('tut-economia-crear-presupuesto')!)).toMatch(/por voz/)
    expect(textOf(getTour('tut-economia-informe')!)).toMatch(/sin exportar a Excel o CSV/)
    expect(textOf(getTour('tut-economia-ver-pendientes')!)).not.toMatch(/PEPA no recuerda/)
  })

  it('«Añadir cuenta» desde otra pestaña solo navega a Banco: ni la visita ni el tutorial prometen abrir la ventana desde fuera', () => {
    const v = textOf(getTour('visita-economia')!)
    expect(v).toMatch(/te lleva a Banco, donde se conecta un banco; si ya estás en Banco, se abre la ventana/)
    expect(getTour('tut-economia-conectar-banco')!.startDest).toBe('economia.banco')
  })

  it('lo que PEPA recuerda de tus correcciones vive en una sola explicación de nivel C; los capítulos de Economía no repiten la frase antigua «no recuerda tu corrección»', () => {
    for (const c of CHAPTERS.filter((x) => x.module === 'economia')) expect(textOf(c), c.id).not.toMatch(/no recuerda tu correcci/i)
    expect(EXPLAINER_BY_ID.get('exp-economia-correccion-aprende')).toBeTruthy()
  })

  it('la explicación de clasificación ya no dice que la lista compartida sea «pequeña y fija» ni que no enseñe a otras familias', () => {
    const e = EXPLAINER_BY_ID.get('exp-compras-clasificar-productos')!
    const text = [e.summary, ...e.sections.flatMap((s) => s.paragraphs), ...e.limits, ...e.ifWrong].join('\n')
    expect(text).not.toMatch(/pequeña y fija/i)
    expect(text).not.toMatch(/Tampoco enseña a otras familias/i)
    expect(text).toMatch(/voto/i)
    expect(e.basedOn).toContain('supabase/migrations/0308_shared_learning_all_stores.sql')
  })

  it('las explicaciones nuevas de Compras y Economía existen y enlazan con capítulos y fichas reales', () => {
    for (const id of [
      'exp-compras-comprado-finalizar',
      'exp-compras-historial-precios',
      'exp-compras-union-economia',
      'exp-economia-ingreso-gasto-ahorro',
      'exp-economia-traspasos-anulaciones',
      'exp-economia-prevision',
      'exp-economia-periodos',
      'exp-economia-presupuestos',
      'exp-economia-limites',
    ]) {
      const e = EXPLAINER_BY_ID.get(id)
      expect(e, id).toBeTruthy()
      if (e!.tour) expect(getTour(e!.tour), `${id}: tutorial ${e!.tour}`).toBeTruthy()
    }
  })
})
