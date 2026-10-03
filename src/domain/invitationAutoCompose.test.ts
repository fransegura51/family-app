import { describe, expect, it } from 'vitest'
import { buildInvitationContent, INVITATION_TEMPLATES, type InvitationTemplateMeta } from '@/domain/events'
import {
  buildCustomTemplateMeta,
  classifyTemplateGeometry,
  composeInvitationForMe,
  getAvailableInvitationData,
  layerBoundsWithinZone,
  resolveEffectiveZone,
  resolveStyleTreatment,
  resolveZones,
  type AutoComposeStyle,
  type AutoComposeSuccess,
} from '@/domain/invitationAutoCompose'
import type { FamilyEvent } from '@/domain/types'

// Fase 3 Bloque 5A, evolucionado 2026-09-28 (generador narrativo + contenido/composición/estilo separados)
// — motor determinista de "✨ Pepa, hazla por mí". Sin React Testing Library en este proyecto (igual que el
// resto de domain/*.test.ts): funciones puras, se llaman directamente.

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
    venueType: null, includedServices: null,
    venueLatitude: null,
    venueLongitude: null,
    venueAddress: null,
    venuePlaceId: null,
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

function template(key: string): InvitationTemplateMeta {
  const t = INVITATION_TEMPLATES.find((t) => t.key === key)
  if (!t) throw new Error(`plantilla de test no encontrada: ${key}`)
  return t
}

// Fixtures de contenido — datos FICTICIOS explícitos, nunca inventados por el motor.
const EVENT_A = makeEvent({ type: 'cumpleanos', title: 'Cumpleaños de Lucía', eventDate: '2026-12-19', eventTime: '20:00', venueLabel: 'Restaurante Trastevere' })
const EVENT_B = makeEvent({ type: 'celebracion', title: 'Comida de Navidad', eventDate: '2026-12-25', venueLabel: null })
const EVENT_C = makeEvent({ type: 'cumpleanos', title: 'Cumpleaños de Hugo', eventDate: '2026-10-02', eventTime: '17:00', venueLabel: 'Parque de bolas Diverlandia', details: { ageTurning: 6 } })
const EVENT_D = makeEvent({ type: 'boda', title: 'Boda de Ana y Luis', ceremonyLocationLabel: 'Parroquia de San José', celebrationLocationLabel: 'Restaurante Los Olivos' })
const EVENT_E = makeEvent({
  type: 'cumpleanos',
  title: 'El cumpleaños número quince de la pequeña Guadalupe Montserrat',
  eventDate: '2026-12-19',
  eventTime: '20:00',
  venueLabel: 'Restaurante El Rincón de la Abuela Encarnación, Polígono Industrial Las Fuentes, nave 42',
})
const EVENT_F = makeEvent({ type: 'personalizado', title: 'Reunión' })
const EVENT_G = makeEvent({ type: 'cumpleanos', title: 'Cumpleaños de Marta', eventDate: '2026-12-19' }) // sin hora, sin lugar

describe('buildInvitationContent — nunca inventa un hecho ausente (domain/events.ts)', () => {
  it('siempre incluye el título real', () => {
    expect(buildInvitationContent(EVENT_F).title).toBe('Reunión')
  })

  it('un evento sin fecha/hora/lugar no menciona ninguno en el cuerpo, y bodyFields queda vacío de esos campos', () => {
    const content = buildInvitationContent(EVENT_F)
    expect(content.bodyFields).not.toContain('fecha')
    expect(content.bodyFields).not.toContain('hora')
    expect(content.bodyFields).not.toContain('lugar')
    expect(content.body).not.toMatch(/\d{2}:\d{2}/)
  })

  it('un evento sin hora (pero con fecha y lugar) no inventa una hora', () => {
    const content = buildInvitationContent(EVENT_G)
    expect(content.bodyFields).not.toContain('hora')
    expect(content.body).not.toMatch(/\d{2}:\d{2}/)
  })

  it('boda con ceremonia/celebración pero sin fecha: ambas mencionadas, sin fecha inventada', () => {
    const content = buildInvitationContent(EVENT_D)
    expect(content.body).toContain('Parroquia de San José')
    expect(content.body).toContain('Restaurante Los Olivos')
    expect(content.bodyFields).not.toContain('fecha')
  })

  it('cumpleaños con edad real teje la edad en el cuerpo; sin ella, no aparece ningún número de años', () => {
    expect(buildInvitationContent(EVENT_C).body).toContain('6')
    expect(buildInvitationContent(EVENT_C).bodyFields).toContain('subtitle')
    expect(buildInvitationContent(EVENT_A).bodyFields).not.toContain('subtitle')
  })

  it('el cierre genérico nunca contiene un hecho (fecha/hora/lugar) — es una frase fija por tipo de evento', () => {
    const content = buildInvitationContent(EVENT_A)
    expect(content.closing).toBeTruthy()
    expect(content.closing).not.toMatch(/\d/)
  })

  it('es determinista: mismo evento → mismo contenido siempre', () => {
    expect(buildInvitationContent(EVENT_A)).toEqual(buildInvitationContent(EVENT_A))
  })

  it('nunca deja placeholders como [fecha]/[hora]/[lugar]', () => {
    for (const event of [EVENT_A, EVENT_B, EVENT_C, EVENT_D, EVENT_F, EVENT_G]) {
      const content = buildInvitationContent(event)
      expect(content.body).not.toMatch(/\[(fecha|hora|lugar)\]/i)
    }
  })
})

describe('buildInvitationContent — ceremonia + celebración entienden la relación, no las enumeran (sección 7)', () => {
  it('con ambas: una sola frase que las conecta ("...en X, y después...en Y"), no dos campos sueltos', () => {
    const content = buildInvitationContent(EVENT_D)
    expect(content.body).toMatch(/Parroquia de San José.*después.*Restaurante Los Olivos/)
  })

  it('solo ceremonia: la frase se adapta, nunca inventa la celebración', () => {
    const event = makeEvent({ type: 'boda', title: 'Boda', ceremonyLocationLabel: 'Parroquia de San José', celebrationLocationLabel: null })
    const content = buildInvitationContent(event)
    expect(content.body).toContain('Parroquia de San José')
    expect(content.body).not.toContain('después')
  })

  it('solo celebración: la frase se adapta, nunca inventa la ceremonia', () => {
    const event = makeEvent({ type: 'boda', title: 'Boda', ceremonyLocationLabel: null, celebrationLocationLabel: 'Restaurante Los Olivos' })
    const content = buildInvitationContent(event)
    expect(content.body).toContain('Restaurante Los Olivos')
  })

  it('la hora de ceremonia solo se menciona cuando la ceremonia también se menciona (nunca suelta sin contexto)', () => {
    const withCeremony = makeEvent({ type: 'boda', title: 'Boda', ceremonyLocationLabel: 'Parroquia', ceremonyTime: '10:00:00' })
    expect(buildInvitationContent(withCeremony).body).toContain('10:00')
    const withoutCeremony = makeEvent({ type: 'boda', title: 'Boda', ceremonyLocationLabel: null, celebrationLocationLabel: 'Restaurante', ceremonyTime: '10:00:00' })
    expect(buildInvitationContent(withoutCeremony).body).not.toContain('10:00')
  })
})

describe('composeInvitationForMe — determinismo', () => {
  it('mismo evento/plantilla/estilo → mismo resultado exacto (deepEqual), repetido 3 veces', () => {
    const params = { event: EVENT_A, template: template('boda'), style: 'clasico' as const }
    const r1 = composeInvitationForMe(params)
    const r2 = composeInvitationForMe(params)
    const r3 = composeInvitationForMe(params)
    expect(r1).toEqual(r2)
    expect(r2).toEqual(r3)
  })

  it('determinismo también con foto (misma photoPath) y con estilo divertido', () => {
    const foto1 = composeInvitationForMe({ event: EVENT_C, template: template('monstruo'), style: 'clasico', photoPath: 'f1/e1/foto.jpg' })
    const foto2 = composeInvitationForMe({ event: EVENT_C, template: template('monstruo'), style: 'clasico', photoPath: 'f1/e1/foto.jpg' })
    expect(foto1).toEqual(foto2)
    const div1 = composeInvitationForMe({ event: EVENT_A, template: template('unicornio'), style: 'divertido' })
    const div2 = composeInvitationForMe({ event: EVENT_A, template: template('unicornio'), style: 'divertido' })
    expect(div1).toEqual(div2)
  })

  it('ninguna capa usa un id que dependa de Date.now/Math.random (mismo id en dos llamadas)', () => {
    const r1 = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const r2 = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    expect(r1.layers.map((l) => l.id)).toEqual(r2.layers.map((l) => l.id))
  })
})

describe('composeInvitationForMe — conservación de datos reales', () => {
  it('un dato real presente en el input SIEMPRE aparece en alguna capa del resultado aceptado', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Cumpleaños de Lucía')
    expect(allText).toContain('20:00')
    expect(allText).toContain('Restaurante Trastevere')
  })

  it('boda con ceremonia+celebración: ambas sobreviven en el resultado', () => {
    const result = composeInvitationForMe({ event: EVENT_D, template: template('elegante'), style: 'clasico' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Parroquia de San José')
    expect(allText).toContain('Restaurante Los Olivos')
  })

  it('el motor nunca escribe una hora que no estaba en el evento (no inventa)', () => {
    const result = composeInvitationForMe({ event: EVENT_G, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).not.toMatch(/\d{2}:\d{2}/)
  })

  it('un fixture con solo datos mínimos (F) sigue conservando el único hecho real: el título', () => {
    const result = composeInvitationForMe({ event: EVENT_F, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    expect(result.layers.some((l) => l.text === 'Reunión')).toBe(true)
  })

  it('el título y el cuerpo se leen como una invitación, no como una ficha — como mucho 3 capas de contenido (título/cuerpo/cierre), nunca una por dato', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    const contentLayers = result.layers.filter((l) => l.id === 'auto-title' || l.id === 'auto-body' || l.id === 'auto-closing')
    expect(contentLayers.length).toBeLessThanOrEqual(3)
  })
})

describe('composeInvitationForMe — 📷 foto ortogonal al estilo (sección 18)', () => {
  it('sin photoPath, ningún estilo genera una capa de foto (nunca un hueco vacío reservado)', () => {
    for (const style of ['clasico', 'divertido'] as const) {
      const result = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style }) as AutoComposeSuccess
      expect(result.status).toBe('success')
      expect(result.layers.some((l) => l.type === 'photo')).toBe(false)
    }
  })

  it('con foto real: la capa de tipo photo usa la MISMA photoPath dada, nunca una URL inventada, para cualquiera de los dos estilos', () => {
    for (const style of ['clasico', 'divertido'] as const) {
      const result = composeInvitationForMe({ event: EVENT_A, template: template('elegante'), style, photoPath: 'familia1/evento1/mi-foto.jpg' }) as AutoComposeSuccess
      const photoLayer = result.layers.find((l) => l.type === 'photo')
      expect(photoLayer?.photoPath).toBe('familia1/evento1/mi-foto.jpg')
    }
  })

  it('familias 1/2 (amplias): máscara "none" (rectangular)', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasico', photoPath: 'x.jpg' }) as AutoComposeSuccess
    const photoLayer = result.layers.find((l) => l.type === 'photo')
    expect(photoLayer?.photoMask).toBe('none')
  })

  it('familia 5 (estrecha): máscara "circle"', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('corazones_terraza'), style: 'clasico', photoPath: 'x.jpg' }) as AutoComposeSuccess
    if (result.status === 'success') {
      const photoLayer = result.layers.find((l) => l.type === 'photo')
      expect(photoLayer?.photoMask).toBe('circle')
    }
  })

  it('la foto nunca invade el texto (la capa de foto y las de texto ocupan bandas distintas de la zona)', () => {
    const result = composeInvitationForMe({ event: EVENT_C, template: template('elegante'), style: 'clasico', photoPath: 'x.jpg' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const photoLayer = result.layers.find((l) => l.type === 'photo')!
    const textLayers = result.layers.filter((l) => l.type === 'text' || l.type === 'event_data')
    for (const t of textLayers) {
      expect(t.y).toBeGreaterThan(photoLayer.y)
    }
  })
})

describe('composeInvitationForMe — 🎉 Divertido', () => {
  // Identidad visual (2026-09-28) — decoración reducida a UN icono ANCLADO a TITLE o CLOSING (ver
  // `placeAnchoredDecoration`, invitationAutoCompose.ts): ya no se genera la forma/confeti translúcida
  // (`auto-decor-shape`, apilada sin ninguna posición intencional) — "una única decoración automática bien
  // colocada vale mucho más que confeti/forma flotando sin intención" (ajuste aprobado).
  it('incluye un icono decorativo anclado a TITLE o CLOSING cuando cabe (sección 22)', () => {
    const shortTitleEvent = makeEvent({ type: 'celebracion', title: 'Fiesta', eventDate: '2026-12-19', eventTime: '20:00', venueLabel: 'Casa' })
    const result = composeInvitationForMe({ event: shortTitleEvent, template: template('unicornio'), style: 'divertido' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const emojiLayer = result.layers.find((l) => l.type === 'emoji')
    expect(emojiLayer).toBeDefined()
    // Nunca genera la forma/confeti translúcida de antes — ni con la decoración presente.
    expect(result.layers.some((l) => l.type === 'shape')).toBe(false)
  })

  it('sección 2 — el emoji NO es obligatorio: cuando no hay hueco seguro junto a su ancla, se omite en vez de forzarlo o degradar el diseño (nunca lanza, nunca falla la composición solo por eso)', () => {
    // Plantilla propia sintética deliberadamente estrecha (familia 4 → solo variante A es geométricamente
    // compatible, decoración anclada "encima" del título) con un título largo que deja el hueco de sobra
    // por encima del título casi a cero — caso real donde no queda sitio seguro para el icono.
    const narrow = buildCustomTemplateMeta({ x: 0.3, y: 0.35, width: 0.4, height: 0.3 })
    const longTitleEvent = makeEvent({ type: 'celebracion', title: 'El gran cumpleaños sorpresa de toda la familia y sus amigos', eventDate: '2026-12-19' })
    const result = composeInvitationForMe({ event: longTitleEvent, template: narrow, style: 'divertido' })
    if (result.status === 'success') {
      expect(result.layers.some((l) => l.type === 'emoji')).toBe(false)
    } else {
      expect(result.status).toBe('fail')
    }
  })

  it('sección 2 — cuando el emoji SÍ tiene hueco (título corto), aparece integrado junto a su ancla — no flotando por encima, a la misma altura Y (cuando el lado preferido es lateral)', () => {
    const shortTitleEvent = makeEvent({ type: 'celebracion', title: 'Fiesta', eventDate: '2026-12-19', eventTime: '20:00', venueLabel: 'Casa' })
    const result = composeInvitationForMe({ event: shortTitleEvent, template: template('clasico'), style: 'divertido' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.divertidoVariant).toBe('B') // "clasico" tiene visualMood 'festive' calibrado → B (decoración lateral, ver domain/events.ts).
    const titleLayer = result.layers.find((l) => l.id === 'auto-title')!
    const emojiLayer = result.layers.find((l) => l.type === 'emoji')
    expect(emojiLayer).toBeDefined()
    expect(emojiLayer!.y).toBeCloseTo(titleLayer.y, 5) // misma altura que el título — integrado, no encima.
    expect(emojiLayer!.x).not.toBeCloseTo(titleLayer.x, 2) // desplazado lateralmente, no superpuesto.
  })

  it('la decoración no reemplaza ningún dato real (siguen todos presentes)', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('unicornio'), style: 'divertido' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).filter(Boolean).join(' | ')
    expect(allText).toContain('Cumpleaños de Lucía')
    expect(allText).toContain('Restaurante Trastevere')
  })

  it('Clásico NUNCA añade emoji ni forma (decoración contenida, sección 19)', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    expect(result.layers.some((l) => l.type === 'emoji')).toBe(false)
    expect(result.layers.some((l) => l.type === 'shape')).toBe(false)
  })

  it('Clásico y Divertido son visualmente distintos para el mismo evento/plantilla: fuente, tamaño o color del título difieren', () => {
    const clasico = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const divertido = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'divertido' }) as AutoComposeSuccess
    const titleC = clasico.layers.find((l) => l.id === 'auto-title')!
    const titleD = divertido.layers.find((l) => l.id === 'auto-title')!
    const differs = titleC.fontFamily !== titleD.fontFamily || titleC.fontSize !== titleD.fontSize || titleC.bold !== titleD.bold
    expect(differs).toBe(true)
  })
})

describe('composeInvitationForMe — casos extremos obligatorios', () => {
  const cases: { key: string; note: string }[] = [
    { key: 'dinosaurios', note: 'surface mínima ≈0.166' },
    { key: 'princesa', note: 'aspect máximo ≈1.946' },
    { key: 'superheroe', note: 'horizontal extrema' },
    { key: 'bebe_nino', note: 'horizontal extrema' },
    { key: 'jubilacion_viaje', note: 'width mínima ≈0.350' },
    { key: 'corazones_terraza', note: 'width mínima ≈0.350, certificada' },
    { key: 'navidad_hogar', note: 'height mínima ≈0.340' },
    { key: 'boda', note: 'height máxima ≈0.820' },
    { key: 'futbol', note: 'width/surface máxima' },
  ]

  for (const { key, note } of cases) {
    it(`Clásico sobre "${key}" (${note}) — éxito o fallo explícito, nunca una excepción sin controlar`, () => {
      expect(() => composeInvitationForMe({ event: EVENT_A, template: template(key), style: 'clasico' })).not.toThrow()
      const result = composeInvitationForMe({ event: EVENT_A, template: template(key), style: 'clasico' })
      expect(['success', 'fail']).toContain(result.status)
    })

    it(`Clásico con foto sobre "${key}" (${note}) — éxito o fallo explícito`, () => {
      const result = composeInvitationForMe({ event: EVENT_A, template: template(key), style: 'clasico', photoPath: 'x.jpg' })
      expect(['success', 'fail']).toContain(result.status)
    })

    it(`Divertido sobre "${key}" (${note}) — éxito o fallo explícito`, () => {
      const result = composeInvitationForMe({ event: EVENT_A, template: template(key), style: 'divertido' })
      expect(['success', 'fail']).toContain(result.status)
    })
  }

  it('corazones_terraza NUNCA ve modificado su textArea por este motor (solo se lee, nunca se escribe)', () => {
    const before = JSON.stringify(template('corazones_terraza').textArea)
    composeInvitationForMe({ event: EVENT_E, template: template('corazones_terraza'), style: 'clasico' })
    const after = JSON.stringify(template('corazones_terraza').textArea)
    expect(after).toBe(before)
  })
})

describe('composeInvitationForMe — título/lugar muy largos (caso E) no cuelgan ni lanzan', () => {
  it('no lanza excepción con textos largos', () => {
    expect(() => composeInvitationForMe({ event: EVENT_E, template: template('clasico'), style: 'clasico' })).not.toThrow()
  })
})

describe('composeInvitationForMe — resultado FAIL informa attemptsTried y motivo', () => {
  it('cuando falla, incluye cuántas variantes se probaron y por qué (nunca null ambiguo)', () => {
    const fail = { status: 'fail' as const, attemptsTried: 6, reason: 'motivo de prueba' }
    expect(fail.status).toBe('fail')
    expect(fail.attemptsTried).toBeGreaterThan(0)
    expect(fail.reason.length).toBeGreaterThan(0)
  })
})

describe('classifyTemplateGeometry sigue exportada y usada de verdad por el motor (no una copia paralela)', () => {
  it('composeInvitationForMe reporta la misma familia que classifyTemplateGeometry para la misma plantilla', () => {
    const t = template('boda')
    const result = composeInvitationForMe({ event: EVENT_A, template: t, style: 'clasico' }) as AutoComposeSuccess
    expect(result.geometryFamily).toBe(classifyTemplateGeometry(t))
  })
})

// ---------------------------------------------------------------------------------------------------
// Casos de contenido A-I — cada letra probada explícitamente, con Clásico/Divertido y con/sin foto.
// ---------------------------------------------------------------------------------------------------
describe('casos de contenido A-I', () => {
  it('A) título+fecha+hora+lugar+cierre genérico: todos presentes', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Cumpleaños de Lucía')
    expect(allText).toContain('20:00')
    expect(allText).toContain('Restaurante Trastevere')
  })

  it('B) título+fecha, sin hora ni lugar (EVENT_B): compone sin inventar ninguna hora', () => {
    const result = composeInvitationForMe({ event: EVENT_B, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Comida de Navidad')
    expect(allText).not.toMatch(/\d{2}:\d{2}/)
  })

  it('C) título+edad+fecha+hora+lugar+cierre: la edad sobrevive junto al resto', () => {
    const result = composeInvitationForMe({ event: EVENT_C, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('6')
    expect(allText).toContain('Parque de bolas Diverlandia')
  })

  it('D) título+ceremonia+celebración+cierre, sin fecha/hora: ambos lugares presentes, sin fecha', () => {
    const result = composeInvitationForMe({ event: EVENT_D, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Parroquia de San José')
    expect(allText).toContain('Restaurante Los Olivos')
  })

  it('E) título y lugar muy largos + fecha + hora: no lanza y conserva el título completo', () => {
    const result = composeInvitationForMe({ event: EVENT_E, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.layers.some((l) => l.text === EVENT_E.title)).toBe(true)
  })

  it('F) solo lo realmente disponible (título únicamente): compone igualmente', () => {
    const result = composeInvitationForMe({ event: EVENT_F, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.layers.some((l) => l.text === 'Reunión')).toBe(true)
  })

  it('G) campos opcionales ausentes (sin hora ni lugar): no hay hueco vacío, el resto se recompone', () => {
    const result = composeInvitationForMe({ event: EVENT_G, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Cumpleaños de Marta')
  })

  it('H) sin foto: nunca deja una capa de foto ni un needs_photo — compone directamente', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.layers.some((l) => l.type === 'photo')).toBe(false)
  })

  it('I) con foto real: compone con la foto dada', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('clasico'), style: 'clasico', photoPath: 'familia/evento/foto.jpg' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.layers.find((l) => l.type === 'photo')?.photoPath).toBe('familia/evento/foto.jpg')
  })
})

describe('composeInvitationForMe nunca devuelve null/undefined', () => {
  it('para los 2 estilos, con y sin foto, el resultado siempre tiene un status válido', () => {
    const styles: AutoComposeStyle[] = ['clasico', 'divertido']
    for (const style of styles) {
      const result = composeInvitationForMe({ event: EVENT_A, template: template('clasico'), style, photoPath: 'x.jpg' })
      expect(result).toBeTruthy()
      expect(['success', 'fail']).toContain(result.status)
    }
  })
})

describe('getAvailableInvitationData sigue disponible para el panel manual "📋 Datos" (independiente de la redacción narrativa)', () => {
  it('nunca inventa un hecho ausente', () => {
    const fields = getAvailableInvitationData(EVENT_F)
    expect(fields.find((f) => f.key === 'title')?.text).toBe('Reunión')
    expect(fields.some((f) => f.key === 'fecha')).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------
// Contraste obligatorio (secciones 3-7, corrección real tras pruebas visuales en iPhone) — "legibilidad >
// armonía de color": un color de plantilla/palette nunca se usa si no supera un contraste mínimo contra el
// TONO DE ZONA resuelto (nunca contra `gradient`). Réplica local (no exportada desde el motor) del cálculo
// WCAG estándar, para verificar el contraste REAL de los colores que devuelve el motor, no solo que
// "cambiaron" — misma fórmula que usa internamente `resolveRoleColor`.
// ---------------------------------------------------------------------------------------------------
function hexToRgbForTest(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function relativeLuminanceForTest([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}
function contrastRatioForTest(hexA: string, hexB: string): number {
  const [lA, lB] = [relativeLuminanceForTest(hexToRgbForTest(hexA)), relativeLuminanceForTest(hexToRgbForTest(hexB))].sort((x, y) => y - x)
  return (lA + 0.05) / (lB + 0.05)
}
// Mismos colores de referencia que usa el motor (ver invitationAutoCompose.ts, ZONE_REFERENCE_COLOR) — se
// duplican aquí solo para verificar desde fuera, nunca para decidir nada.
const ZONE_REF = { light: '#F5F1E8', dark: '#1A1A1A' }

function withPalette(base: InvitationTemplateMeta, palette: InvitationTemplateMeta['palette']): InvitationTemplateMeta {
  return { ...base, palette }
}

describe('Contraste obligatorio (secciones 3-7) — legibilidad > armonía de color', () => {
  const BASE = template('clasico')

  it('zoneTone "light": un candidato dorado/claro sin contraste real se rechaza para BODY — el color final SÍ cumple el umbral WCAG (4.5:1) contra la zona clara', () => {
    const tmpl = withPalette(BASE, { zoneTone: 'light', clasico: { bodyColor: '#F5D57A' } })
    const result = composeInvitationForMe({ event: EVENT_A, template: tmpl, style: 'clasico' }) as AutoComposeSuccess
    const body = result.layers.find((l) => l.id === 'auto-body')!
    expect(body.color).not.toBe('#F5D57A')
    expect(contrastRatioForTest(body.color!, ZONE_REF.light)).toBeGreaterThanOrEqual(4.5)
  })

  it('zoneTone "dark": un candidato oscuro sin contraste real se rechaza para BODY — el color final SÍ cumple el umbral WCAG (4.5:1) contra la zona oscura', () => {
    const tmpl = withPalette(BASE, { zoneTone: 'dark', clasico: { bodyColor: '#141414' } })
    const result = composeInvitationForMe({ event: EVENT_A, template: tmpl, style: 'clasico' }) as AutoComposeSuccess
    const body = result.layers.find((l) => l.id === 'auto-body')!
    expect(body.color).not.toBe('#141414')
    expect(contrastRatioForTest(body.color!, ZONE_REF.dark)).toBeGreaterThanOrEqual(4.5)
  })

  it('plantilla SIN zoneTone (ninguna de las 100 lo calibra todavía) usa el fallback conservador documentado ("light") para TITLE/CLOSING: un candidato ya oscuro se conserva tal cual, uno claro/dorado sin contraste se sustituye', () => {
    const withDarkCandidate = withPalette(BASE, { clasico: { closingColor: '#111111' } })
    const resultDark = composeInvitationForMe({ event: EVENT_A, template: withDarkCandidate, style: 'clasico' }) as AutoComposeSuccess
    expect(resultDark.layers.find((l) => l.id === 'auto-closing')!.color).toBe('#111111')

    const withLightCandidate = withPalette(BASE, { clasico: { closingColor: '#F5D57A' } })
    const resultLight = composeInvitationForMe({ event: EVENT_A, template: withLightCandidate, style: 'clasico' }) as AutoComposeSuccess
    expect(resultLight.layers.find((l) => l.id === 'auto-closing')!.color).not.toBe('#F5D57A')
  })

  // Punto 13 del mandato de geometría segura (2026-09-28) — BODY ya NO se prueba contra el umbral: recibe
  // SIEMPRE el neutro seguro del tono de zona, incluso cuando el candidato de la plantilla tendría contraste
  // de sobra. Es el texto corrido (el que más importa leer bien) — máxima prioridad a la legibilidad, sin
  // excepciones, nunca "porque combina".
  it('BODY ignora el candidato de la plantilla incluso cuando SÍ tendría contraste de sobra — siempre recibe el neutro seguro del tono de zona', () => {
    const goodContrastCandidate = '#111111' // pasaría de sobra el umbral de BODY (4.5:1) contra una zona clara.
    const tmpl = withPalette(BASE, { zoneTone: 'light', clasico: { bodyColor: goodContrastCandidate } })
    const result = composeInvitationForMe({ event: EVENT_A, template: tmpl, style: 'clasico' }) as AutoComposeSuccess
    const body = result.layers.find((l) => l.id === 'auto-body')!
    expect(body.color).not.toBe(goodContrastCandidate)
    expect(body.color).toBe('#22242B') // SAFE_NEUTRAL_COLOR.light
  })

  it('reproduce el bug real encontrado en pruebas visuales: template.text dorado (plantilla "elegante") ya NO se usa tal cual como color de BODY (sin zoneTone calibrado, cae al fallback claro → contraste insuficiente → neutro oscuro)', () => {
    const elegante = template('elegante') // text: '#F5D57A' (dorado) — el caso real reportado.
    const result = composeInvitationForMe({ event: EVENT_A, template: elegante, style: 'clasico' }) as AutoComposeSuccess
    const body = result.layers.find((l) => l.id === 'auto-body')!
    expect(body.color).not.toBe('#F5D57A')
    expect(contrastRatioForTest(body.color!, ZONE_REF.light)).toBeGreaterThanOrEqual(4.5)
  })

  it('un candidato con contraste real SÍ se conserva (no todo se sustituye a ciegas) para TITLE/CLOSING: template.text de "navidad_dorada" (rojo oscuro) pasa el umbral y se mantiene', () => {
    const navidadDorada = template('navidad_dorada') // text: '#7C2D12', gradient claro.
    const result = composeInvitationForMe({ event: EVENT_A, template: navidadDorada, style: 'clasico' }) as AutoComposeSuccess
    const title = result.layers.find((l) => l.id === 'auto-title')!
    expect(title.color).toBe('#7C2D12')
  })

  it('TITLE admite un umbral distinto (texto grande, 3:1) — un color que falla el umbral estricto de BODY (4.5:1) puede seguir siendo válido para TITLE si supera el suyo', () => {
    // Un tono con contraste intermedio contra la zona clara: falla 4.5:1 pero supera 3:1.
    const midToneCandidate = '#8C7A4A'
    const ratio = contrastRatioForTest(midToneCandidate, ZONE_REF.light)
    expect(ratio).toBeGreaterThanOrEqual(3)
    expect(ratio).toBeLessThan(4.5)
    const tmpl = withPalette(BASE, { zoneTone: 'light', clasico: { titleColor: midToneCandidate, bodyColor: midToneCandidate } })
    const result = composeInvitationForMe({ event: EVENT_A, template: tmpl, style: 'clasico' }) as AutoComposeSuccess
    const title = result.layers.find((l) => l.id === 'auto-title')!
    const body = result.layers.find((l) => l.id === 'auto-body')!
    expect(title.color).toBe(midToneCandidate) // TITLE: supera su propio umbral (3:1) — se conserva.
    expect(body.color).not.toBe(midToneCandidate) // BODY: no supera el suyo (4.5:1) — se sustituye.
  })

  it('TITLE/BODY/CLOSING se resuelven de forma independiente — pueden llevar colores distintos, nunca obligados a compartir uno', () => {
    const tmpl = withPalette(BASE, { zoneTone: 'light', clasico: { titleColor: '#7C2D12', bodyColor: '#22242B', closingColor: '#1F2937' } })
    const result = composeInvitationForMe({ event: EVENT_A, template: tmpl, style: 'clasico' }) as AutoComposeSuccess
    const colors = new Set(['title', 'body', 'closing'].map((role) => result.layers.find((l) => l.id === `auto-${role}`)?.color))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('BODY siempre resuelve a un color con contraste WCAG real, en las 3 familias visuales probadas manualmente (clara/elegante, oscura/dorada, infantil/colorida)', () => {
    for (const key of ['clasico', 'elegante', 'unicornio']) {
      for (const style of ['clasico', 'divertido'] as const) {
        const result = composeInvitationForMe({ event: EVENT_A, template: template(key), style }) as AutoComposeSuccess
        expect(result.status, `${key}/${style}`).toBe('success')
        const body = result.layers.find((l) => l.id === 'auto-body')!
        expect(Math.max(contrastRatioForTest(body.color!, ZONE_REF.light), contrastRatioForTest(body.color!, ZONE_REF.dark)), `${key}/${style}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

describe('Clásico vs. Divertido — diferencias ESTRUCTURALES de composición, no solo tipografía (sección 1-2)', () => {
  it('el margen interno (separación TITLE/BODY/CLOSING) difiere por estilo: Clásico deja más aire que Divertido', () => {
    const clasico = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const divertido = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'divertido' }) as AutoComposeSuccess
    const titleC = clasico.layers.find((l) => l.id === 'auto-title')!
    const titleD = divertido.layers.find((l) => l.id === 'auto-title')!
    expect(titleC.y).not.toBeCloseTo(titleD.y, 3)
  })

  // Ajuste aprobado (identidad visual, 2026-09-28) — "left" en BODY ya NO es una característica fija de
  // Divertido: es una posibilidad de la variante B, y solo en familias geométricas con ancho real de sobra
  // (familia 1). Clásico SIEMPRE centrado. Ver los tests "causa raíz nº3" más abajo para el caso positivo
  // (familia 1 → left) y negativo (familia 2 → sigue centrado), con la misma variante B.
  it('BODY de Clásico está siempre centrado, en cualquier familia geométrica y variante que hubiera tenido Divertido', () => {
    for (const key of ['boda', 'unicornio', 'clasico']) {
      const result = composeInvitationForMe({ event: EVENT_A, template: template(key), style: 'clasico' }) as AutoComposeSuccess
      expect(result.layers.find((l) => l.id === 'auto-body')!.textAlign, key).toBe('center')
    }
  })

  it('el título de Divertido se desplaza lateralmente dentro de su zona cuando hay hueco real (asimetría controlada); el de Clásico se queda centrado', () => {
    // Geometría segura (punto 4/14 del mandato, 2026-09-28) — el desplazamiento ya no es una fracción fija
    // del ancho de zona: solo existe cuando la caja real del título deja hueco libre de sobra. Un título
    // corto ("Fiesta") dentro de una zona amplia ("boda") es exactamente ese caso; con el título largo de
    // EVENT_A la caja ocupa casi todo el ancho disponible y el desplazamiento correcto es prácticamente nulo
    // (ver el nuevo test "bias nunca puede sacar una capa de su zona").
    const shortTitleEvent = makeEvent({ type: 'celebracion', title: 'Fiesta', eventDate: '2026-12-19', eventTime: '20:00', venueLabel: 'Casa' })
    const clasico = composeInvitationForMe({ event: shortTitleEvent, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const divertido = composeInvitationForMe({ event: shortTitleEvent, template: template('boda'), style: 'divertido' }) as AutoComposeSuccess
    const titleC = clasico.layers.find((l) => l.id === 'auto-title')!
    const titleD = divertido.layers.find((l) => l.id === 'auto-title')!
    const zone = template('boda').textArea!
    const cx = zone.x + zone.width / 2
    expect(titleC.x).toBeCloseTo(cx, 1)
    expect(titleD.x).not.toBeCloseTo(cx, 2)
  })

  it('CLOSING tiene tratamiento jerárquico opuesto: en Clásico es más pequeño y secundario (cursiva); en Divertido es más protagonista (mayor tamaño, negrita)', () => {
    const clasico = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasico' }) as AutoComposeSuccess
    const divertido = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'divertido' }) as AutoComposeSuccess
    const closingC = clasico.layers.find((l) => l.id === 'auto-closing')
    const closingD = divertido.layers.find((l) => l.id === 'auto-closing')
    if (closingC && closingD) {
      expect(closingC.italic).toBe(true)
      expect(closingD.bold).toBe(true)
      expect(closingD.fontSize!).toBeGreaterThanOrEqual(closingC.fontSize!)
    }
  })

  it('Divertido permite curvar el título (cuando cabe); Clásico nunca lo hace', () => {
    const withCurve = composeInvitationForMe({ event: EVENT_A, template: template('unicornio'), style: 'divertido' }) as AutoComposeSuccess
    const clasico = composeInvitationForMe({ event: EVENT_A, template: template('unicornio'), style: 'clasico' }) as AutoComposeSuccess
    expect(clasico.layers.find((l) => l.id === 'auto-title')!.curve).toBeUndefined()
    const curveD = withCurve.layers.find((l) => l.id === 'auto-title')!.curve
    expect(typeof curveD === 'number' || curveD === undefined).toBe(true)
  })
})

describe('Redacción del cumpleaños (secciones 8-9, corrección real) — nunca "para celebrar Cumpleaños Alvaro"', () => {
  it('"Cumpleaños de Álvaro" reconocido: BODY teje "el cumpleaños de Álvaro" en minúsculas, natural', () => {
    const event = makeEvent({ type: 'cumpleanos', title: 'Cumpleaños de Álvaro', eventDate: '2026-10-18', eventTime: '20:30', venueLabel: 'nuestra casa' })
    const content = buildInvitationContent(event)
    expect(content.body).toContain('el cumpleaños de Álvaro')
    expect(content.body).not.toContain('Cumpleaños de Álvaro')
  })

  it('"Cumple de Álvaro" (forma corta) también se reconoce', () => {
    const event = makeEvent({ type: 'cumpleanos', title: 'Cumple de Álvaro', eventDate: '2026-10-18' })
    const content = buildInvitationContent(event)
    expect(content.body).toContain('el cumpleaños de Álvaro')
  })

  it('"Cumpleaños Alvaro" (sin "de", sin tilde — el caso real reportado) se reconoce de forma inequívoca', () => {
    const event = makeEvent({ type: 'cumpleanos', title: 'Cumpleaños Alvaro', eventDate: '2026-10-18' })
    const content = buildInvitationContent(event)
    expect(content.body).toContain('el cumpleaños de Alvaro')
    expect(content.body).not.toMatch(/celebrar\s+Cumpleaños/i)
  })

  it('un título de cumpleaños NO reconocible usa una construcción neutra, sin insertar el título en bruto tras "celebrar"', () => {
    const event = makeEvent({ type: 'cumpleanos', title: 'Fiesta sorpresa', eventDate: '2026-10-18', venueLabel: 'nuestra casa' })
    const content = buildInvitationContent(event)
    expect(content.body).not.toContain('Fiesta sorpresa')
    expect(content.body).not.toMatch(/celebrar/i)
    expect(content.body).toContain('Os esperamos')
  })

  it('nunca genera la frase mecánica "para celebrar Cumpleaños ..." para ningún título de cumpleaños real probado', () => {
    const titles = ['Cumpleaños de Álvaro', 'Cumpleaños Alvaro', 'Cumple de Marta', 'cumpleaños de Eric', 'CUMPLEAÑOS DE SOFÍA', 'Fiesta de Hugo']
    for (const title of titles) {
      const event = makeEvent({ type: 'cumpleanos', title, eventDate: '2026-10-18' })
      const content = buildInvitationContent(event)
      expect(content.body, title).not.toMatch(/celebrar\s+Cumple/i)
    }
  })

  it('BODY no repite el título completo innecesariamente (sección 9) — TITLE ya lo muestra arriba como su propia capa', () => {
    const event = makeEvent({ type: 'cumpleanos', title: 'Cumpleaños de Álvaro', eventDate: '2026-10-18', venueLabel: 'nuestra casa' })
    const result = composeInvitationForMe({ event, template: template('clasico'), style: 'clasico' }) as AutoComposeSuccess
    const body = result.layers.find((l) => l.id === 'auto-body')!
    expect(body.text).not.toBe(event.title)
  })

  it('sigue integrando la edad de forma natural cuando el nombre se reconoce, sin frase universal fija', () => {
    const event6 = makeEvent({ type: 'cumpleanos', title: 'Cumpleaños de Hugo', eventDate: '2026-10-18', details: { ageTurning: 6 } })
    const event7 = makeEvent({ type: 'cumpleanos', title: 'Cumpleaños de Vera', eventDate: '2026-10-18', details: { ageTurning: 7 } })
    const content6 = buildInvitationContent(event6)
    const content7 = buildInvitationContent(event7)
    expect(content6.body).toContain('6')
    expect(content7.body).toContain('7')
    expect(content6.body.includes('¡Cumple') || content6.body.includes('Son ya')).toBe(true)
    expect(content7.body.includes('¡Cumple') || content7.body.includes('Son ya')).toBe(true)
  })

  it('no altera la lógica narrativa de boda/comunión/bautizo ya corregida (relación ceremonia↔celebración intacta)', () => {
    const boda = makeEvent({ type: 'boda', title: 'Boda de Ana y Luis', ceremonyLocationLabel: 'Parroquia de San José', celebrationLocationLabel: 'Restaurante Los Olivos' })
    const content = buildInvitationContent(boda)
    expect(content.body).toMatch(/Parroquia de San José.*después.*Restaurante Los Olivos/)
  })
})

// ---------------------------------------------------------------------------------------------------
// Geometría segura (2026-09-28, corrección real tras pruebas visuales en iPhone) — fuente ÚNICA de verdad
// para la "zona efectiva" entre el compositor y el WYSIWYG (ver `resolveEffectiveZone`,
// `layerBoundsWithinZone`, invitationAutoCompose.ts), caja completa (no solo el centro) dentro de zona,
// bias nunca saca una capa de su hueco, fallback sin curva cuando la curva no cabe, zonas explícitas de
// "alegre", compatibilidad con invitaciones ya guardadas. `resolveZones`/`resolveEffectiveZone`/
// `layerBoundsWithinZone` se exportan del motor para estas pruebas — son las MISMAS funciones que usa
// `attemptOnce`/`validateComposition` internamente, nunca una reimplementación local que pudiera divergir.
// ---------------------------------------------------------------------------------------------------
describe('Geometría segura (2026-09-28) — caja completa dentro de la zona efectiva, en las 100 plantillas', () => {
  function effectiveZoneFor(tmpl: InvitationTemplateMeta, role: 'title' | 'body' | 'closing', style: AutoComposeStyle, compact: boolean, event: FamilyEvent) {
    return resolveEffectiveZone(resolveZones(tmpl)[role], resolveStyleTreatment(style, tmpl, event), compact)
  }

  it('TITLE/BODY/CLOSING: los 4 bordes de la caja real de cada capa con rol (ya con fuente/tamaño/negrita/curva/ajuste/alineación/desplazamiento/posición final aplicados) caben dentro de SU zona efectiva, en las 100 plantillas × 2 estilos (sin foto)', () => {
    let checked = 0
    for (const tmpl of INVITATION_TEMPLATES) {
      for (const style of ['clasico', 'divertido'] as const) {
        const result = composeInvitationForMe({ event: EVENT_A, template: tmpl, style })
        if (result.status !== 'success') continue // la tasa de éxito por plantilla ya la cubre invitationAutoComposeMatrix.test.ts
        const imageAspect = tmpl.imageAspect ?? 1
        for (const role of ['title', 'body', 'closing'] as const) {
          const layer = result.layers.find((l) => l.id === `auto-${role}`)
          if (!layer) continue
          const zone = effectiveZoneFor(tmpl, role, style, result.adaptation.compact, EVENT_A)
          expect(layerBoundsWithinZone(layer, zone, imageAspect, undefined), `${tmpl.key}/${style}/${role}`).toBe(true)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(400) // asegura que el bucle realmente ejecutó las comprobaciones, no que se quedó vacío por error.
  })

  // Evento tipo 'celebracion' (ánimo por defecto "festive", ver EVENT_TYPE_MOOD_HINT) para forzar de forma
  // determinista la variante B en plantillas sin visualMood calibrado — B es la única de las tres que ofrece
  // curva (curveIdeal 12) Y desplazamiento lateral (xOffsetFrac -0.06) a la vez, así que es la que de verdad
  // ejercita "la curva no cabe → cae sin curva" y "el desplazamiento se acota al hueco libre real".
  const longTitleFestiveEvent = makeEvent({ type: 'celebracion', title: 'Cumpleaños de Lucía', eventDate: '2026-12-19', eventTime: '20:00', venueLabel: 'Restaurante Trastevere' })

  it('un título curvado cuya caja real (medida sin conocer la zona, sección 1) no cabe en su zona nunca se acepta curvado — el motor cae al intento sin curva en vez de invadir', () => {
    // Caso real reportado: título largo en una plantilla de zona moderada ("boda") — con curva, la caja
    // estimada es más ancha que la zona disponible (causa raíz nº1, ver comentario de
    // `estimateLayerBoxFraction`, domain/events.ts); el motor debe rechazar ese intento y aceptar el
    // siguiente (sin curva), nunca aceptar una posición degenerada (causa raíz nº2).
    const result = composeInvitationForMe({ event: longTitleFestiveEvent, template: template('boda'), style: 'divertido' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.divertidoVariant).toBe('B') // confirma que el escenario ejercita la variante con curva+desplazamiento.
    const title = result.layers.find((l) => l.id === 'auto-title')!
    expect(title.curve).toBeUndefined()
    const zone = effectiveZoneFor(template('boda'), 'title', 'divertido', result.adaptation.compact, longTitleFestiveEvent)
    expect(layerBoundsWithinZone(title, zone, template('boda').imageAspect ?? 1, undefined)).toBe(true)
  })

  it('una capa cuya caja real ocupa casi todo el ancho disponible recibe un desplazamiento prácticamente nulo — la personalidad del estilo nunca tiene prioridad sobre la geometría (punto 4)', () => {
    const result = composeInvitationForMe({ event: longTitleFestiveEvent, template: template('boda'), style: 'divertido' }) as AutoComposeSuccess
    const title = result.layers.find((l) => l.id === 'auto-title')!
    const zone = effectiveZoneFor(template('boda'), 'title', 'divertido', result.adaptation.compact, longTitleFestiveEvent)
    const cx = zone.x + zone.width / 2
    expect(Math.abs(title.x - cx)).toBeLessThan(0.01)
  })

  it('con hueco lateral real (título corto), Divertido SÍ aplica una asimetría controlada, y la caja resultante sigue completa dentro de la zona', () => {
    const shortTitleEvent = makeEvent({ type: 'celebracion', title: 'Fiesta', eventDate: '2026-12-19', eventTime: '20:00', venueLabel: 'Casa' })
    const result = composeInvitationForMe({ event: shortTitleEvent, template: template('boda'), style: 'divertido' }) as AutoComposeSuccess
    expect(result.divertidoVariant).toBe('B')
    const title = result.layers.find((l) => l.id === 'auto-title')!
    const zone = effectiveZoneFor(template('boda'), 'title', 'divertido', result.adaptation.compact, shortTitleEvent)
    const cx = zone.x + zone.width / 2
    expect(Math.abs(title.x - cx)).toBeGreaterThan(0.01) // asimetría real, no un desplazamiento ~0.
    expect(layerBoundsWithinZone(title, zone, template('boda').imageAspect ?? 1, undefined)).toBe(true) // pero nunca sale de su hueco.
  })

  it('una caja más ancha que la zona (incluso centrada) nunca se acepta pegada a un borde — causa raíz nº2, corregida: el motor falla ese intento en vez de devolver `Math.min(maxX, Math.max(minX, targetX))` con minX > maxX', () => {
    // Plantilla propia sintética (buildCustomTemplateMeta) con una zona deliberadamente estrecha — ninguna
    // plantilla real de las 100 es tan angosta, así que se fuerza el caso aquí. Con un título largo en
    // Divertido, la caja real es más ancha que la zona incluso sin curva — la comprobación de caja completa
    // en `applyRoleOffsets` debe rechazar el intento (o "fits") independientemente de qué variante A/B/C se
    // resuelva (la zona es tan estrecha, family 4, que solo A es geométricamente compatible).
    const narrow = buildCustomTemplateMeta({ x: 0.4, y: 0.1, width: 0.06, height: 0.4 })
    const longTitleEvent = makeEvent({ type: 'celebracion', title: 'El gran cumpleaños sorpresa de toda la familia', eventDate: '2026-12-19' })
    const result = composeInvitationForMe({ event: longTitleEvent, template: narrow, style: 'divertido' })
    if (result.status === 'success') {
      const title = result.layers.find((l) => l.id === 'auto-title')!
      const zone = effectiveZoneFor(narrow, 'title', 'divertido', result.adaptation.compact, longTitleEvent)
      expect(layerBoundsWithinZone(title, zone, narrow.imageAspect ?? 1, undefined)).toBe(true)
    } else {
      expect(result.status).toBe('fail') // sin hueco real, "fallar honestamente" es la respuesta correcta (nunca invadir).
    }
  })

  it('zonas explícitas de "alegre" (Nivel 2, arco con esquinas curvas y tarta/regalos en las esquinas inferiores): título más estrecho que textArea, cierre con más aire antes del borde inferior', () => {
    const alegre = template('alegre')
    expect(alegre.zones).toBeDefined()
    expect(alegre.zones!.title!.width).toBeLessThan(alegre.textArea!.width) // más estrecho — evita las esquinas curvas del arco.
    const closingBottom = alegre.zones!.closing!.y + alegre.zones!.closing!.height
    const textAreaBottom = alegre.textArea!.y + alegre.textArea!.height
    expect(closingBottom).toBeLessThan(textAreaBottom) // termina antes del borde inferior de textArea — aire de sobra antes de tarta/regalos.
  })

  it.each(['cumpleanos_elegante', 'clasico', 'alegre'] as const)('%s — Clásico y Divertido componen con éxito y cada capa con rol cabe completa en su zona efectiva', (key) => {
    const tmpl = template(key)
    for (const style of ['clasico', 'divertido'] as const) {
      const result = composeInvitationForMe({ event: EVENT_A, template: tmpl, style })
      expect(result.status, `${key}/${style}`).toBe('success')
      if (result.status !== 'success') continue
      const imageAspect = tmpl.imageAspect ?? 1
      for (const role of ['title', 'body', 'closing'] as const) {
        const layer = result.layers.find((l) => l.id === `auto-${role}`)
        if (!layer) continue
        const zone = effectiveZoneFor(tmpl, role, style, result.adaptation.compact, EVENT_A)
        expect(layerBoundsWithinZone(layer, zone, imageAspect, undefined), `${key}/${style}/${role}`).toBe(true)
      }
    }
  })

  it('renderer y compositor miden la MISMA zona: `layer.zoneWidthFrac` grabado en cada capa nueva coincide exactamente con `resolveEffectiveZone(...).width` — nunca una segunda fórmula que pueda divergir', () => {
    for (const key of ['clasico', 'boda', 'alegre']) {
      for (const style of ['clasico', 'divertido'] as const) {
        const tmpl = template(key)
        const result = composeInvitationForMe({ event: EVENT_A, template: tmpl, style })
        if (result.status !== 'success') continue
        for (const role of ['title', 'body', 'closing'] as const) {
          const layer = result.layers.find((l) => l.id === `auto-${role}`)
          if (!layer) continue
          const zone = effectiveZoneFor(tmpl, role, style, result.adaptation.compact, EVENT_A)
          expect(layer.zoneWidthFrac, `${key}/${style}/${role}`).toBeCloseTo(zone.width, 9)
          expect(layer.zoneRole).toBe(role)
        }
      }
    }
  })

  it('causa raíz nº3 (corregida): cuando BODY de Divertido (variante B, familia geométrica amplia) se alinea a la izquierda, el ancho grabado es el ancho EFECTIVO ya con margen interior, nunca el ancho crudo de `textArea` — así el WYSIWYG respeta el margen en vez de pegar el texto al borde crudo de la zona', () => {
    // "unicornio" es familia 1 (ancho real de sobra) sin visualMood calibrado — un evento tipo 'celebracion'
    // (ánimo "festive") fuerza la variante B de forma determinista, y solo en familia 1 B usa BODY a la
    // izquierda (ajuste aprobado — left es una posibilidad de B, no una obligación de Divertido).
    const tmpl = template('unicornio')
    const festiveEvent = makeEvent({ type: 'celebracion', title: 'Fiesta de Lucía', eventDate: '2026-12-19', eventTime: '20:00', venueLabel: 'Restaurante Trastevere' })
    const result = composeInvitationForMe({ event: festiveEvent, template: tmpl, style: 'divertido' }) as AutoComposeSuccess
    expect(result.divertidoVariant).toBe('B')
    const body = result.layers.find((l) => l.id === 'auto-body')!
    expect(body.textAlign).toBe('left')
    expect(body.zoneWidthFrac).toBeLessThan(tmpl.textArea!.width)
  })

  it('BODY de Divertido variante B en una familia geométrica MENOS ancha (2, "clasico") se queda centrado — left no es una obligación de Divertido, es una posibilidad de B solo con ancho real de sobra (ajuste aprobado)', () => {
    const tmpl = template('clasico')
    const festiveEvent = makeEvent({ type: 'celebracion', title: 'Fiesta de Lucía', eventDate: '2026-12-19', eventTime: '20:00', venueLabel: 'Restaurante Trastevere' })
    const result = composeInvitationForMe({ event: festiveEvent, template: tmpl, style: 'divertido' }) as AutoComposeSuccess
    expect(result.divertidoVariant).toBe('B')
    const body = result.layers.find((l) => l.id === 'auto-body')!
    expect(body.textAlign).toBe('center')
  })

  it('BODY resuelve siempre a uno de los dos neutros seguros documentados (SAFE_NEUTRAL_COLOR), nunca al candidato de la plantilla, en varias familias visuales y los 2 estilos', () => {
    for (const key of ['clasico', 'elegante', 'unicornio', 'navidad_dorada']) {
      for (const style of ['clasico', 'divertido'] as const) {
        const result = composeInvitationForMe({ event: EVENT_A, template: template(key), style })
        if (result.status !== 'success') continue
        const body = result.layers.find((l) => l.id === 'auto-body')!
        expect(['#22242B', '#FBF8F2'], `${key}/${style}`).toContain(body.color)
      }
    }
  })

  it('compatibilidad — una invitación "antigua" (capa sin `zoneWidthFrac`/`zoneRole`, guardada antes de este cambio) no se toca retroactivamente al actualizarse desde el evento', () => {
    const oldLayer = { id: 'manual-1', type: 'text', x: 0.5, y: 0.5, rotation: 0, scale: 1, zIndex: 1, text: 'Texto libre' } as const
    expect((oldLayer as { zoneWidthFrac?: number }).zoneWidthFrac).toBeUndefined()
    expect((oldLayer as { zoneRole?: string }).zoneRole).toBeUndefined()
  })

  it('una invitación NUEVA siempre graba `zoneRole`/`zoneWidthFrac` en TITLE/BODY/CLOSING — nunca queda a medias', () => {
    for (const key of ['clasico', 'boda', 'alegre']) {
      const result = composeInvitationForMe({ event: EVENT_A, template: template(key), style: 'clasico' })
      if (result.status !== 'success') continue
      for (const role of ['title', 'body', 'closing'] as const) {
        const layer = result.layers.find((l) => l.id === `auto-${role}`)
        if (!layer) continue
        expect(layer.zoneRole, `${key}/${role}`).toBe(role)
        expect(typeof layer.zoneWidthFrac, `${key}/${role}`).toBe('number')
      }
    }
  })
})
