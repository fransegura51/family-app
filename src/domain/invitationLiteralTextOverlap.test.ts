import { describe, expect, it } from 'vitest'
import { autoArrangeLayers, estimateLayerBoxFraction, INVITATION_TEMPLATES } from '@/domain/events'
import type { InvitationLayer } from '@/domain/types'

// Bug real reportado en vivo (iPhone, plantilla "boda"): título y cuerpo se veían solapados en la app real
// aunque TODOS los tests existentes (invitationTextAreaCalibration.test.ts, invitationBackgroundReplacement
// .test.ts) seguían en verde. Causa raíz: esos tests generan el cuerpo con buildInvitationMessage(), que
// para type='boda' con ceremonia+celebración produce un mensaje de solo 2 líneas ("Nos casamos el .../
// 💍 ceremonia   🥂 celebración") — MÁS CORTO que el texto de 4 líneas que un usuario real escribe a mano
// (título + "Nos casamos el.../💍 iglesia/🥂 restaurante/¡Os esperamos!"). Con el texto corto, muchas zonas
// que en realidad estaban demasiado justas nunca llegaban a marcar overflowed=true.
//
// Este archivo prueba las 100 plantillas reales con ESE texto literal largo (título + cuerpo de 4 líneas,
// el mismo que se usó para certificar visualmente "Bodas de plata"), construyendo las capas a mano en vez de
// pasar por buildInvitationMessage — para que este tipo de bug (una plantilla que falla solo con texto largo
// real, no con el generado automáticamente) no pueda volver a colarse en silencio.
const LITERAL_TITLE = 'Bodas de plata'
const LITERAL_BODY =
  'Nos casamos el 19 de diciembre.\n💍 Iglesia de San Andrés, Almoradí\n🥂 Restaurante Trastevere, Almoradí\n¡Os esperamos!'
const EPS = 0.0001

function makeLiteralLayers(zone: { x: number; y: number; width: number; height: number }): InvitationLayer[] {
  const cx = zone.x + zone.width / 2
  const compact = zone.height < 0.45 || zone.width < 0.45
  const iconSize = compact ? 40 : 56
  const titleSize = compact ? 19 : 24
  const messageSize = compact ? 12 : 14
  return [
    { id: 'icon', type: 'emoji', x: cx, y: zone.y + zone.height * 0.14, rotation: 0, scale: 1, zIndex: 1, text: '💍', fontSize: iconSize },
    { id: 'title', type: 'text', x: cx, y: zone.y + zone.height * 0.36, rotation: 0, scale: 1, zIndex: 2, text: LITERAL_TITLE, color: '#fff', fontSize: titleSize, fontFamily: 'inherit' },
    { id: 'body', type: 'event_data', x: cx, y: zone.y + zone.height * 0.68, rotation: 0, scale: 1, zIndex: 3, text: LITERAL_BODY, color: '#fff', fontSize: messageSize, fontFamily: 'inherit' },
  ]
}

function boxOf(l: InvitationLayer, zoneWidth: number) {
  const { halfWidth, halfHeight } = estimateLayerBoxFraction(l, zoneWidth)
  return { left: l.x - halfWidth, right: l.x + halfWidth, top: l.y - halfHeight, bottom: l.y + halfHeight }
}

describe('las 100 plantillas reales no dan overflow con el texto literal largo de certificación (bug real 2026-09-26)', () => {
  it.each(INVITATION_TEMPLATES.map((t) => t.key))('%s', (key) => {
    const template = INVITATION_TEMPLATES.find((t) => t.key === key)!
    if (!template.textArea) return
    const layers = makeLiteralLayers(template.textArea)
    const { overflowed } = autoArrangeLayers(layers, template.textArea)
    expect(overflowed, `"${key}" da overflowed=true con el texto literal largo de certificación`).toBe(false)
  })
})

describe('las 100 plantillas reales: título y cuerpo no se solapan con el texto literal largo (gap real, no solo estimado)', () => {
  it.each(INVITATION_TEMPLATES.map((t) => t.key))('%s', (key) => {
    const template = INVITATION_TEMPLATES.find((t) => t.key === key)!
    if (!template.textArea) return
    const layers = makeLiteralLayers(template.textArea)
    const { layers: arranged } = autoArrangeLayers(layers, template.textArea)
    const title = arranged.find((l) => l.id === 'title')!
    const body = arranged.find((l) => l.id === 'body')!
    const titleBox = boxOf(title, template.textArea.width)
    const bodyBox = boxOf(body, template.textArea.width)
    expect(titleBox.bottom, `título y cuerpo se solapan en "${key}" con el texto literal largo`).toBeLessThanOrEqual(bodyBox.top + EPS)
  })
})
