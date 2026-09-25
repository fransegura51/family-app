import { describe, expect, it } from 'vitest'

// TURNO NOCTURNO 2B/2D — bug real confirmado (auditoría, no heurística): el <div> que pinta una capa de
// texto/mensaje ("Título"/"event_data") en InvitationLayerVisual NO fijaba line-height ninguno — heredaba
// el "normal" del navegador/fuente (variable según fontFamily, cada plantilla puede usar una tipografía
// distinta), mientras que estimateLayerBoxFraction/autoArrangeLayers (domain/events.ts) SIEMPRE asumían
// LINE_HEIGHT_RATIO=1.25 para calcular su alto y así apilar título/mensaje sin solape ni overflow falso.
// Con fuentes cuyo line-height "normal" real es mayor que 1.25, el texto pintado podía ser más alto que lo
// estimado -> "Pepa, hazla bonita" colocaba el mensaje demasiado cerca del título y acababan solapando en
// pantalla, aunque la propia caja ESTIMADA (la que comprueban los tests de events.test.ts) nunca se saliera
// de la zona. Con un line-height "normal" real MENOR que 1.25 pasaba lo contrario: se avisaba de "el texto
// no cabe entero" (overflowed=true) aunque en pantalla sobrara espacio de sobra (false overflow).
//
// La corrección es la mínima posible: fijar explícitamente lineHeight=LINE_HEIGHT_RATIO en el propio <div>
// (ahora exportada desde domain/events.ts, una sola fuente de verdad) para que el alto REAL pintado sea
// SIEMPRE el mismo que el alto que ya se estimaba — nunca un cálculo nuevo, nunca una heurística visual por
// plantilla. Cubre las dos variantes de texto: el <div> normal (word-wrap normal) y el className con
// degradado (TEXT_STYLE_CLASS, mismo <div>, mismo lineHeight). El texto curvado (SVG/textPath) queda fuera
// a propósito: su altura ya se calcula con la MISMA fórmula en el render y en la estimación (ver el propio
// componente), no depende de line-height de navegador.
const FILES = import.meta.glob(['/src/ui/InvitationDesigner.tsx', '/src/domain/events.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const DESIGNER_SRC = FILES['/src/ui/InvitationDesigner.tsx']
const EVENTS_SRC = FILES['/src/domain/events.ts']

describe('el <div> de texto (InvitationLayerVisual) fija line-height = LINE_HEIGHT_RATIO', () => {
  it('LINE_HEIGHT_RATIO está exportada desde domain/events.ts (única fuente de verdad, no un valor duplicado)', () => {
    expect(EVENTS_SRC).toContain('export const LINE_HEIGHT_RATIO = 1.25')
  })

  it('InvitationDesigner.tsx importa LINE_HEIGHT_RATIO desde @/domain/events (no redefine su propio 1.25)', () => {
    const importBlock = DESIGNER_SRC.slice(DESIGNER_SRC.indexOf('import {'), DESIGNER_SRC.indexOf("} from '@/domain/events'"))
    expect(importBlock).toContain('LINE_HEIGHT_RATIO')
  })

  it('el <div> de texto/event_data (no curvado) fija lineHeight: LINE_HEIGHT_RATIO explícitamente', () => {
    const start = DESIGNER_SRC.indexOf('const className = TEXT_STYLE_CLASS[style]')
    const end = DESIGNER_SRC.indexOf('{layer.text}', start)
    const block = DESIGNER_SRC.slice(start, end)
    expect(block).toContain('lineHeight: LINE_HEIGHT_RATIO,')
  })

  it('el texto curvado (SVG/textPath) NO se toca: su altura ya usa la misma fórmula en estimación y render, sin depender del line-height del navegador', () => {
    const curvedBlock = DESIGNER_SRC.slice(DESIGNER_SRC.indexOf("if (layer.type === 'text' && layer.curve)"), DESIGNER_SRC.indexOf('const className = TEXT_STYLE_CLASS[style]'))
    expect(curvedBlock).not.toContain('lineHeight')
    expect(curvedBlock).toContain('Math.max(80, Math.abs(bend) * 0.9 + fontSize * 1.6)')
  })
})
