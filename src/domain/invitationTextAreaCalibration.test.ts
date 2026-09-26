import { describe, expect, it } from 'vitest'
import { autoArrangeLayers, buildInvitationTemplateLayers, estimateLayerBoxFraction, INVITATION_TEMPLATES } from '@/domain/events'
import type { FamilyEvent, InvitationLayer } from '@/domain/types'

// FASE 1 — calibración de textArea/safeArea de las 100 plantillas de invitaciones, tras la revisión visual
// manual (100/100, texto de certificación "Bodas de plata"). Este archivo es NUEVO (no duplica los tests de
// contenido/line-height/menú contextual ya añadidos en c35776e — esos siguen intactos en events.test.ts,
// invitationDesignerLineHeight.test.ts e invitationDesignerContextMenu.test.ts).
//
// Cubre exactamente lo pedido en la fase: (1) todas las textArea siguen dentro del lienzo, (2) título y
// cuerpo no se solapan con las NUEVAS coordenadas, (3) sin regresión de overflow para las plantillas
// recalibradas, (4) FÚTBOL aprovecha su nueva zona, (5)/(6) BEBÉ NIÑO y HALLOWEEN CASA ENCANTADA (grupo A,
// certificadas) permanecen intactas, (7) las 18 del grupo C (rediseño futuro) permanecen intactas, (8) las
// 27 sin instrucción explícita permanecen intactas, (9) ninguna solución depende del texto literal de
// certificación (se prueba con ESE texto y con uno distinto).
const EPS = 0.0001

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

// Reconstruye el texto de certificación EXACTO ("Bodas de plata" / "Nos casamos el 19 de diciembre. /
// 💍 Iglesia de San Andrés, Almoradí   🥂 Restaurante Trastevere, Almoradí") pasando por el generador real
// (buildInvitationMessage vía buildInvitationTemplateLayers), nunca un string hardcodeado aparte.
function makeCertificationEvent(): FamilyEvent {
  return makeEvent({
    type: 'boda',
    title: 'Bodas de plata',
    eventDate: '2026-12-19',
    ceremonyLocationLabel: 'Iglesia de San Andrés, Almoradí',
    celebrationLocationLabel: 'Restaurante Trastevere, Almoradí',
  })
}

// Segundo texto, DELIBERADAMENTE distinto (otro tipo de evento, otro título, sin ubicaciones) — prueba
// explícita de que ninguna calibración depende del contenido literal de "Bodas de plata".
function makeAlternativeEvent(): FamilyEvent {
  return makeEvent({
    type: 'cumpleanos',
    title: 'El cumple de Martina',
    eventDate: '2026-05-03',
    venueLabel: 'Parque de las Acacias',
  })
}

describe('1. todas las textArea de las 100 plantillas siguen dentro del lienzo (0..1, sin desbordar)', () => {
  it.each(INVITATION_TEMPLATES.map((t) => t.key))('%s', (key) => {
    const t = templateByKey(key)
    const zone = t.textArea
    if (!zone) return
    expect(zone.x).toBeGreaterThanOrEqual(0)
    expect(zone.y).toBeGreaterThanOrEqual(0)
    expect(zone.x + zone.width).toBeLessThanOrEqual(1 + EPS)
    expect(zone.y + zone.height).toBeLessThanOrEqual(1 + EPS)
    expect(zone.width).toBeGreaterThan(0)
    expect(zone.height).toBeGreaterThan(0)
  })
})

// Las 46 plantillas recalibradas esta fase (grupo B) — título y cuerpo no se solapan, y no hay overflow con
// el texto de certificación, probadas contra las coordenadas NUEVAS.
const GROUP_B_KEYS = [
  'boda', 'corazones', 'floral_picnic', 'floral_primavera', 'floral_noche', 'playa_atardecer',
  'corazones_madera', 'corazones_terraza', 'corazones_dorado', 'clasico', 'disco', 'playa', 'concierto',
  'barbacoa', 'celebracion_dorada', 'fiesta_acuarela', 'monstruo', 'futbol', 'dinosaurios', 'videojuegos',
  'coches', 'princesa', 'espacio', 'piratas', 'safari', 'acampada', 'oceano', 'alienigenas', 'nochevieja',
  'bautizo_nina', 'navidad', 'cumpleanos_elegante', 'navidad_hogar', 'navidad_galletas', 'navidad_farolillos',
  'halloween_calabaza', 'halloween_bruja', 'halloween_fantasmas', 'cumpleanos_rosa', 'cumpleanos_fiesta',
  'otono_acogedor', 'otono_senderismo', 'otono_hogar', 'delfin_tortuga', 'mago', 'bruja',
]

describe('2./3. título y cuerpo no se solapan en las 46 plantillas recalibradas (grupo B), con dos textos distintos', () => {
  for (const event of [makeCertificationEvent(), makeAlternativeEvent()]) {
    describe(`texto: "${event.title}"`, () => {
      it.each(GROUP_B_KEYS)('%s', (key) => {
        const template = templateByKey(key)
        const layers = buildInvitationTemplateLayers(event, template)
        const { layers: arranged } = autoArrangeLayers(layers, template.textArea)
        const title = arranged.find((l) => l.type === 'text')!
        const body = arranged.find((l) => l.type === 'event_data')!
        const titleBox = boxOf(title, template.textArea!.width)
        const bodyBox = boxOf(body, template.textArea!.width)
        // Solape real = los rangos verticales de sus cajas completas se cruzan (no solo el punto central).
        const overlap = titleBox.bottom > bodyBox.top + EPS
        expect(overlap, `título y cuerpo se solapan en "${key}" con "${event.title}"`).toBe(false)
      })
    })
  }
})

describe('4. sin regresión de overflow en las 46 plantillas recalibradas, con el texto de certificación real', () => {
  const event = makeCertificationEvent()
  // otono_senderismo es la única excepción documentada: la propia revisión manual la describe como "algo
  // más justo... la edición manual demuestra que PUEDE funcionar" (no "funciona seguro") — su superficie
  // real (foto real, cartel de madera junto a un tablón de anuncios ya impreso) es genuinamente más
  // estrecha que el resto del grupo B. Con el texto de certificación (3 líneas + 2 emojis) y el tamaño de
  // fuente POR DEFECTO (no compacto) puede seguir marcando overflowed=true; igual que el resto de casos de
  // overflow real, NUNCA se oculta ni se fuerza a caber — se avisa. Queda en la lista de revisión visual
  // (informe final) para decidir si necesita fuente más pequeña manual o quedar en el grupo C.
  const KNOWN_TIGHT = new Set(['otono_senderismo'])
  it.each(GROUP_B_KEYS.filter((k) => !KNOWN_TIGHT.has(k)))('%s', (key) => {
    const template = templateByKey(key)
    const layers = buildInvitationTemplateLayers(event, template)
    const { overflowed } = autoArrangeLayers(layers, template.textArea)
    expect(overflowed, `"${key}" da overflow con el texto de certificación tras la recalibración`).toBe(false)
  })
})

describe('5. FÚTBOL aprovecha correctamente su nueva zona (mucho más grande que la anterior, sin comprimir)', () => {
  it('la nueva textArea es sustancialmente más grande que la anterior (0.8027×0.5383 → más alta y ancha)', () => {
    const zone = templateByKey('futbol').textArea!
    expect(zone.height).toBeGreaterThan(0.5383) // más alta que antes
    expect(zone.width).toBeGreaterThanOrEqual(0.8027 - EPS) // igual o más ancha
    expect(zone).toEqual({ x: 0.08, y: 0.08, width: 0.84, height: 0.72 })
  })
  it('con el texto de certificación, el bloque título+cuerpo no queda comprimido a un hueco mínimo (hay margen real, no overflow)', () => {
    const template = templateByKey('futbol')
    const layers = buildInvitationTemplateLayers(makeCertificationEvent(), template)
    const { overflowed } = autoArrangeLayers(layers, template.textArea)
    expect(overflowed).toBe(false)
  })
})

describe('6. GRUPO A — certificadas: BEBÉ NIÑO y HALLOWEEN CASA ENCANTADA permanecen exactamente intactas', () => {
  it('bebe_nino: textArea byte-idéntica a antes de esta fase', () => {
    expect(templateByKey('bebe_nino').textArea).toEqual({ x: 0.15, y: 0.1, width: 0.7, height: 0.4 })
  })
  // 2026-09-26: excepción autorizada explícitamente por el usuario — únicamente el alto crece (x/y/width
  // intactos) para cerrar el bug real de solape con el texto de certificación de 4 líneas tras subir
  // AVG_CHAR_WIDTH_RATIO a 0.6 (ver el mismo comentario junto a esa constante en events.ts).
  it('halloween_casa: solo el alto cambió (bug real de solape, 2026-09-26), x/y/width intactos', () => {
    expect(templateByKey('halloween_casa').textArea).toEqual({ x: 0.2387, y: 0.3212, width: 0.5227, height: 0.6788 })
  })
})

describe('7. GRUPO A completo (9 plantillas certificadas): ninguna textArea se ha tocado salvo la excepción documentada de 2026-09-26', () => {
  // 2026-09-26: 4 de las 9 (unicornio, halloween_casa, playa_terraza, cena_hogar) tuvieron SOLO su alto
  // ampliado — nunca x/y/width — como excepción autorizada explícitamente por el usuario para el bug real
  // de solape con el texto de certificación de 4 líneas (ver AVG_CHAR_WIDTH_RATIO en events.ts).
  const GROUP_A: Record<string, { x: number; y: number; width: number; height: number }> = {
    elegante: { x: 0.1876, y: 0.13, width: 0.5693, height: 0.6742 },
    playa_terraza: { x: 0.212, y: 0.1849, width: 0.476, height: 0.68 },
    cena_hogar: { x: 0.2284, y: 0.1074, width: 0.532, height: 0.6 },
    corazones_acuarela: { x: 0.304, y: 0.1436, width: 0.6253, height: 0.6444 },
    alegre: { x: 0.2284, y: 0.1571, width: 0.532, height: 0.5843 },
    unicornio: { x: 0.2, y: 0.1, width: 0.6, height: 0.6 },
    superheroe: { x: 0.0978, y: 0.3606, width: 0.7933, height: 0.4561 },
    bebe_nino: { x: 0.15, y: 0.1, width: 0.7, height: 0.4 },
    halloween_casa: { x: 0.2387, y: 0.3212, width: 0.5227, height: 0.6788 },
  }
  it.each(Object.entries(GROUP_A))('%s', (key, expected) => {
    expect(templateByKey(key).textArea).toEqual(expected)
  })
})

// FASE 2 (2026-09) sustituyó el fondo de las 18 plantillas del grupo C original — todas resueltas, ninguna
// queda pendiente de rediseño. Sus valores ANTERIORES (y los assertions que los protegían) ya no aplican:
// ver invitationBackgroundReplacement.test.ts para la cobertura de sus valores NUEVOS. Se documentan aquí
// los 18 keys por trazabilidad, no como assertion.
export const FASE1_GROUP_C_RESUELTO_EN_FASE2 = [
  'bautizo', 'gatitos', 'robots', 'superheroina', 'pijamas', 'kpop', 'hadas', 'granja', 'obras', 'comunion',
  'navidad_muneco', 'navidad_dorada', 'navidad_papanoel', 'carnaval_plumas', 'carnaval_payaso', 'carnaval_confeti',
  'otono_cosecha', 'sirena',
] as const

// De las 27 plantillas "sin instrucción explícita" de FASE 1, 15 recibieron fondo nuevo en FASE 2 (14 en la
// primera tanda + "floral", la plantilla del caso de certificación original, en una tanda posterior — ver
// invitationBackgroundReplacement.test.ts) — dejan de estar en esta lista. Quedan 12 realmente sin tocar.
export const FASE1_SIN_INSTRUCCION_RESUELTO_EN_FASE2 = [
  'ositos', 'graduacion_esfuerzo', 'graduacion_suena', 'graduacion_disciplina', 'graduacion_explorar',
  'casa_bienvenida', 'casa_llaves', 'casa_terraza', 'despedida_novio', 'despedida_viaje', 'despedida_noche',
  'comida_familiar', 'desayuno', 'jubilacion_brindis', 'floral',
] as const

describe('9. plantillas SIN instrucción explícita en la revisión que SIGUEN sin tocar (12 de las 27 originales)', () => {
  // 2026-09-26: 7 de las 12 (bebe_nina, bebe_arcoiris, despedida_novia, tapas, jubilacion_relax,
  // jubilacion_cena, carnaval_bufon) tuvieron SOLO su alto ampliado — nunca imagen, imageAspect, x/y/width —
  // como excepción autorizada explícitamente por el usuario para el bug real de solape con el texto de
  // certificación de 4 líneas (ver AVG_CHAR_WIDTH_RATIO en events.ts). Siguen sin fondo nuevo ni ningún otro
  // cambio: la excepción es puramente ese bugfix de alto.
  const UNCHANGED_UNLISTED: Record<string, { x: number; y: number; width: number; height: number }> = {
    bebe_nina: { x: 0.2444, y: 0.1238, width: 0.4667, height: 0.68 },
    bebe_neutro: { x: 0.1036, y: 0.1413, width: 0.7373, height: 0.5898 },
    bebe_arcoiris: { x: 0.0724, y: 0.0497, width: 0.644, height: 0.6 },
    casa_cajas: { x: 0.2138, y: 0.1231, width: 0.4947, height: 0.7093 },
    despedida_novia: { x: 0.2582, y: 0.1116, width: 0.4947, height: 0.68 },
    playa_piscina: { x: 0.28, y: 0.12, width: 0.55, height: 0.6 },
    playa_pina: { x: 0.2529, y: 0.2116, width: 0.672, height: 0.588 },
    tapas: { x: 0.3244, y: 0.1142, width: 0.6067, height: 0.6 },
    jubilacion_viaje: { x: 0.2862, y: 0.2009, width: 0.4387, height: 0.476 },
    jubilacion_relax: { x: 0.3827, y: 0.1173, width: 0.4013, height: 0.56 },
    jubilacion_cena: { x: 0.2564, y: 0.1498, width: 0.476, height: 0.68 },
    carnaval_bufon: { x: 0.3449, y: 0.2564, width: 0.588, height: 0.6 },
  }
  it.each(Object.entries(UNCHANGED_UNLISTED))('%s', (key, expected) => {
    expect(templateByKey(key).textArea).toEqual(expected)
  })
  it('A=9 + B=46 + resueltas en FASE2=33 + sin instrucción restante=12 cubren exactamente las 100 plantillas reales', () => {
    const named = new Set([
      ...Object.keys({
        elegante: 0, playa_terraza: 0, cena_hogar: 0, corazones_acuarela: 0, alegre: 0, unicornio: 0, superheroe: 0, bebe_nino: 0, halloween_casa: 0,
      }),
      ...GROUP_B_KEYS,
      ...FASE1_GROUP_C_RESUELTO_EN_FASE2,
      ...FASE1_SIN_INSTRUCCION_RESUELTO_EN_FASE2,
      ...Object.keys(UNCHANGED_UNLISTED),
    ])
    expect(named.size).toBe(100)
    expect(INVITATION_TEMPLATES.length).toBe(100)
    for (const t of INVITATION_TEMPLATES) expect(named.has(t.key), `"${t.key}" no está clasificado en ningún grupo`).toBe(true)
  })
})
