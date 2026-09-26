import { describe, expect, it } from 'vitest'
import { autoArrangeLayers, buildInvitationTemplateLayers, estimateLayerBoxFraction, INVITATION_TEMPLATES } from '@/domain/events'
import type { FamilyEvent, InvitationLayer } from '@/domain/types'
import { FASE1_GROUP_C_RESUELTO_EN_FASE2, FASE1_SIN_INSTRUCCION_RESUELTO_EN_FASE2 } from './invitationTextAreaCalibration.test'

// FASE 2 (2026-09) — sustitución de 33 fondos rediseñados: las 18 plantillas del antiguo grupo C de FASE 1
// (candidatas a rediseño) + 15 de las 27 "sin instrucción explícita" que también recibieron fondo nuevo en
// esta ronda (14 en la primera tanda + "floral" en una tanda posterior, la plantilla del caso de
// certificación original "Bodas de plata" — ver events.test.ts, sigue pasando con el fondo nuevo). El asset
// se sustituyó en el MISMO archivo (misma ruta `<key>.jpg`, mismo import, mismo `key` interno — nunca se
// crea un archivo nuevo ni se renombra un ID), así que no puede haber assets huérfanos. imageAspect y
// textArea se recalcularon desde cero sobre la geometría real de cada imagen nueva (nunca reutilizando la
// textArea antigua).
const EPS = 0.0001
const REPLACED_KEYS = [...FASE1_GROUP_C_RESUELTO_EN_FASE2, ...FASE1_SIN_INSTRUCCION_RESUELTO_EN_FASE2] as const

function templateByKey(key: string) {
  const t = INVITATION_TEMPLATES.find((x) => x.key === key)
  expect(t, `plantilla "${key}" no encontrada en INVITATION_TEMPLATES`).toBeDefined()
  return t!
}

function boxOf(l: InvitationLayer, zoneWidth: number) {
  const { halfWidth, halfHeight } = estimateLayerBoxFraction(l, zoneWidth)
  return { left: l.x - halfWidth, right: l.x + halfWidth, top: l.y - halfHeight, bottom: l.y + halfHeight }
}

function makeEvent(overrides: Partial<FamilyEvent>): FamilyEvent {
  return {
    id: 'e1',
    familyId: 'f1',
    type: 'cumpleanos',
    subtype: null,
    title: 'Evento',
    dateStatus: 'confirmada',
    eventDate: null,
    eventTime: null,
    venueLabel: null,
    venueType: null,
    venueLatitude: null,
    venueLongitude: null,
    ceremonyLocationLabel: null,
    ceremonyLocationLatitude: null,
    ceremonyLocationLongitude: null,
    ceremonyTime: null,
    celebrationLocationLabel: null,
    celebrationLocationLatitude: null,
    celebrationLocationLongitude: null,
    theme: null,
    details: {},
    enabledModules: [],
    status: 'planificacion',
    tagId: null,
    calendarEventId: null,
    rsvpDeadline: null,
    rsvpDeadlineCalendarEventId: null,
    openRsvpToken: null,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// Mismo texto de certificación real usado en toda esta ronda de revisión.
function makeCertificationEvent(): FamilyEvent {
  return makeEvent({
    type: 'boda',
    title: 'Bodas de plata',
    eventDate: '2026-12-19',
    ceremonyLocationLabel: 'Iglesia de San Andrés, Almoradí',
    celebrationLocationLabel: 'Restaurante Trastevere, Almoradí',
  })
}

describe('1./2. las 32 plantillas sustituidas siguen existiendo con su ID (key) y nombre visible (label) exactos', () => {
  const EXPECTED_LABELS: Record<string, string> = {
    bautizo: 'Celeste',
    gatitos: 'Gatitos',
    robots: 'Robots',
    superheroina: 'Superheroína',
    pijamas: 'Estrellitas',
    kpop: 'Kpop',
    hadas: 'Hadas',
    granja: 'Granja',
    obras: 'Obras',
    comunion: 'Comunión',
    navidad_muneco: 'Navidad muñeco de nieve',
    navidad_dorada: 'Navidad dorada',
    navidad_papanoel: 'Navidad Papá Noel',
    carnaval_plumas: 'Carnaval plumas',
    carnaval_payaso: 'Carnaval payaso',
    carnaval_confeti: 'Carnaval confeti',
    otono_cosecha: 'Otoño cosecha',
    sirena: 'Sirena',
    floral: 'Floral',
    ositos: 'Ositos',
    graduacion_esfuerzo: 'Graduación esfuerzo',
    graduacion_suena: 'Graduación sueña',
    graduacion_disciplina: 'Graduación disciplina',
    graduacion_explorar: 'Graduación explorar',
    casa_bienvenida: 'Nueva casa bienvenida',
    casa_llaves: 'Nueva casa llaves',
    casa_terraza: 'Nueva casa terraza',
    despedida_novio: 'Despedida de soltero',
    despedida_viaje: 'Despedida de viaje',
    despedida_noche: 'Despedida de noche',
    comida_familiar: 'Comida familiar',
    desayuno: 'Desayuno / Brunch',
    jubilacion_brindis: 'Jubilación brindis',
  }
  expect(REPLACED_KEYS.length).toBe(33)
  it.each(REPLACED_KEYS)('%s', (key) => {
    const t = templateByKey(key)
    expect(t.key).toBe(key) // el ID interno NUNCA cambia por un cambio cosmético de fondo (caso ositos/Perrito)
    expect(t.label).toBe(EXPECTED_LABELS[key])
  })
})

describe('3. cada plantilla sustituida referencia su imagen (el import sigue resolviendo, el asset no quedó vacío/roto)', () => {
  it.each(REPLACED_KEYS)('%s', (key) => {
    const t = templateByKey(key)
    expect(t.image, `"${key}" no tiene imagen asignada`).toBeTruthy()
    expect(typeof t.image === 'string' || typeof t.image === 'object').toBe(true)
  })
})

describe('4.-10. textArea de las 32 sustituidas: dentro de límites, sin solape título/cuerpo, sin falso overflow evidente', () => {
  it.each(REPLACED_KEYS)('%s', (key) => {
    const t = templateByKey(key)
    const zone = t.textArea!
    expect(zone.x).toBeGreaterThanOrEqual(0)
    expect(zone.y).toBeGreaterThanOrEqual(0)
    expect(zone.width).toBeGreaterThan(0)
    expect(zone.height).toBeGreaterThan(0)
    expect(zone.x + zone.width).toBeLessThanOrEqual(1 + EPS)
    expect(zone.y + zone.height).toBeLessThanOrEqual(1 + EPS)
    // Ninguna zona "absurdamente pequeña" (regla explícita: no desperdiciar la nueva superficie).
    expect(zone.width * zone.height).toBeGreaterThan(0.12)
  })

  it.each(REPLACED_KEYS)('%s: título y cuerpo no se solapan con el texto de certificación', (key) => {
    const template = templateByKey(key)
    const layers = buildInvitationTemplateLayers(makeCertificationEvent(), template)
    const { layers: arranged } = autoArrangeLayers(layers, template.textArea)
    const title = arranged.find((l) => l.type === 'text')!
    const body = arranged.find((l) => l.type === 'event_data')!
    const titleBox = boxOf(title, template.textArea!.width)
    const bodyBox = boxOf(body, template.textArea!.width)
    expect(titleBox.bottom, `título y cuerpo se solapan en "${key}"`).toBeLessThanOrEqual(bodyBox.top + EPS)
  })

  // BUG REAL encontrado tras esta fase (reportado en vivo, iPhone): 4 de las 33 zonas nuevas (casa_bienvenida,
  // comida_familiar, carnaval_payaso, otono_cosecha) daban overflowed=true con el texto de certificación —
  // el "no se solapan" de arriba NUNCA lo detectaba porque, cuando overflowed=true, autoArrangeLayers coloca
  // título y cuerpo TOCÁNDOSE exactamente (gap comprimido a 0) según su propia estimación de alto: la
  // comprobación de solape usa esa MISMA estimación para verificar, así que nunca puede detectar que la
  // estimación se quede corta frente al ancho/alto REAL ya renderizado (el mismo tipo de problema que
  // LINE_HEIGHT_RATIO cerró para el alto de línea, pero aquí para cuántas líneas ocupa realmente el ancho
  // disponible — ver estimateWrappedLineCount, aproximación deliberada y documentada en el propio código).
  // Corrección real: ampliar esas 4 zonas hasta que overflowed sea false (gap real >0, no solo "no se tocan
  // en la estimación") — nunca tocar el motor compartido para esto, es un problema de calibración de esas
  // 4 plantillas en concreto. Este test cierra el hueco de cobertura que dejó pasar el bug.
  it.each(REPLACED_KEYS)('%s: NO da overflowed=true con el texto de certificación (gap real, no solo "sin solape estimado")', (key) => {
    const template = templateByKey(key)
    const layers = buildInvitationTemplateLayers(makeCertificationEvent(), template)
    const { overflowed } = autoArrangeLayers(layers, template.textArea)
    expect(overflowed, `"${key}" da overflowed=true con el texto de certificación`).toBe(false)
  })
})

describe('11. imageAspect recalculado desde cero (nunca reutiliza la proporción de la imagen anterior)', () => {
  const EXPECTED_ASPECT: Record<string, number> = { ositos: 1.2192, bautizo: 1.2736 }
  it.each(REPLACED_KEYS)('%s', (key) => {
    const t = templateByKey(key)
    const expected = EXPECTED_ASPECT[key] ?? 0.6667
    expect(t.imageAspect).toBeCloseTo(expected, 3)
  })
})

describe('12. plantillas certificadas (grupo A) permanecen exactamente intactas — ninguna recibió fondo nuevo esta fase', () => {
  const CERTIFIED: Record<string, { x: number; y: number; width: number; height: number }> = {
    elegante: { x: 0.1876, y: 0.13, width: 0.5693, height: 0.6742 },
    playa_terraza: { x: 0.212, y: 0.1849, width: 0.476, height: 0.5413 },
    cena_hogar: { x: 0.2284, y: 0.1074, width: 0.532, height: 0.5747 },
    corazones_acuarela: { x: 0.304, y: 0.1436, width: 0.6253, height: 0.6444 },
    alegre: { x: 0.2284, y: 0.1571, width: 0.532, height: 0.5843 },
    unicornio: { x: 0.2, y: 0.1, width: 0.6, height: 0.5 },
    superheroe: { x: 0.0978, y: 0.3606, width: 0.7933, height: 0.4561 },
    bebe_nino: { x: 0.15, y: 0.1, width: 0.7, height: 0.4 },
    halloween_casa: { x: 0.2387, y: 0.3212, width: 0.5227, height: 0.4809 },
  }
  it.each(Object.entries(CERTIFIED))('%s', (key, expectedTextArea) => {
    const t = templateByKey(key)
    expect(t.textArea).toEqual(expectedTextArea)
    expect(REPLACED_KEYS as readonly string[]).not.toContain(key)
  })
})

describe('13. no cambia el número total de plantillas (siguen siendo exactamente 100)', () => {
  it('100 plantillas, ninguna añadida ni eliminada', () => {
    expect(INVITATION_TEMPLATES.length).toBe(100)
  })
})
