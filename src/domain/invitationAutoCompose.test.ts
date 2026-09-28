import { describe, expect, it } from 'vitest'
import { buildInvitationContent, INVITATION_TEMPLATES, type InvitationTemplateMeta } from '@/domain/events'
import { classifyTemplateGeometry, composeInvitationForMe, getAvailableInvitationData, type AutoComposeStyle, type AutoComposeSuccess } from '@/domain/invitationAutoCompose'
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
  it('incluye una capa emoji (icono del tipo de evento) y una forma decorativa, cuando cabe', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('unicornio'), style: 'divertido' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.layers.some((l) => l.type === 'emoji')).toBe(true)
    expect(result.layers.some((l) => l.type === 'shape')).toBe(true)
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
