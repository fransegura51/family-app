import { describe, expect, it } from 'vitest'
import { reconcileOverlappingBoxes } from '@/domain/events'

// 2026-09-27 — solape real reportado en vivo (iPhone, "dinosaurios"/"espacio", imageAspect bajo ~0.43):
// tras "Pepa, hazla bonita" el icono/título/mensaje aparecían superpuestos en el dispositivo real aunque el
// cálculo de fracciones (measureText) daba hueco de sobra en todos los entornos de escritorio probados. Sin
// poder aislar la causa real, esta función es la segunda pasada defensiva: recibe el alto YA PINTADO de
// verdad (getBoundingClientRect en ui/InvitationDesigner.tsx) y separa lo que siga tocándose — corrige el
// síntoma sea cual sea la causa real, sin tocar la estimación (measureWrappedText/autoArrangeLayers).
describe('reconcileOverlappingBoxes', () => {
  it('no toca nada si ya hay hueco real de sobra entre las capas', () => {
    const shifts = reconcileOverlappingBoxes([
      { id: 'icon', top: 0.1, bottom: 0.2 },
      { id: 'title', top: 0.25, bottom: 0.3 },
      { id: 'body', top: 0.35, bottom: 0.5 },
    ])
    expect(shifts.size).toBe(0)
  })

  it('separa dos capas que se tocan de verdad (caso "dinosaurios/espacio": estimado sin solape, DOM real con solape)', () => {
    // Reproduce el síntoma real: título y cuerpo con el mismo alto REAL que predijo el estimador, pero
    // pintados por el navegador con menos separación de la esperada, hasta solaparse.
    const shifts = reconcileOverlappingBoxes([
      { id: 'icon', top: 0.1, bottom: 0.2 },
      { id: 'title', top: 0.18, bottom: 0.28 }, // empieza ANTES de que el icono termine (real, no estimado)
      { id: 'body', top: 0.26, bottom: 0.45 }, // idem con el título
    ])
    expect(shifts.has('icon')).toBe(false) // la primera capa nunca se mueve, es la referencia
    expect(shifts.get('title')).toBeGreaterThan(0)
    expect(shifts.get('body')).toBeGreaterThan(0)

    // Aplicando los desplazamientos, ninguna caja real debe quedar solapada.
    const boxes = [
      { id: 'icon', top: 0.1, bottom: 0.2 },
      { id: 'title', top: 0.18 + (shifts.get('title') ?? 0), bottom: 0.28 + (shifts.get('title') ?? 0) },
      { id: 'body', top: 0.26 + (shifts.get('body') ?? 0), bottom: 0.45 + (shifts.get('body') ?? 0) },
    ]
    expect(boxes[1].top).toBeGreaterThanOrEqual(boxes[0].bottom)
    expect(boxes[2].top).toBeGreaterThanOrEqual(boxes[1].bottom)
  })

  it('deja al menos el margen de seguridad pedido, no solo "no negativo"', () => {
    const shifts = reconcileOverlappingBoxes(
      [
        { id: 'a', top: 0, bottom: 0.1 },
        { id: 'b', top: 0.1, bottom: 0.2 }, // toca exactamente el borde, sin margen
      ],
      0.02,
    )
    expect(shifts.get('b')).toBeCloseTo(0.02, 5)
  })

  it('separación en cascada: si la del medio se mueve, la de abajo también debe respetarlo aunque no tocara a la del medio original', () => {
    const shifts = reconcileOverlappingBoxes([
      { id: 'a', top: 0, bottom: 0.3 },
      { id: 'b', top: 0.1, bottom: 0.2 }, // solapa mucho con "a"
      { id: 'c', top: 0.31, bottom: 0.4 }, // no solapaba con "b" original, pero sí con "b" ya desplazada
    ])
    const bShift = shifts.get('b') ?? 0
    const cShift = shifts.get('c') ?? 0
    const bBottomFinal = 0.2 + bShift
    const cTopFinal = 0.31 + cShift
    expect(cTopFinal).toBeGreaterThanOrEqual(bBottomFinal)
  })

  it('no reordena capas: cada id conserva su lugar, solo se desplaza hacia abajo si hace falta', () => {
    const shifts = reconcileOverlappingBoxes([
      { id: 'x', top: 0, bottom: 0.5 },
      { id: 'y', top: 0.1, bottom: 0.2 },
    ])
    // "y" se desplaza para quedar DEBAJO de "x", nunca se reordena por encima.
    expect(shifts.get('y')).toBeCloseTo(0.41, 5)
  })
})
