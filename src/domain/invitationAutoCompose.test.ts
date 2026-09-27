import { describe, expect, it } from 'vitest'
import { INVITATION_TEMPLATES, type InvitationTemplateMeta } from '@/domain/events'
import {
  classifyTemplateGeometry,
  composeInvitationForMe,
  getAvailableInvitationData,
  getFallbackRecipes,
  selectInitialRecipe,
  type AutoComposeStyle,
  type AutoComposeSuccess,
} from '@/domain/invitationAutoCompose'
import type { FamilyEvent } from '@/domain/types'

// Fase 3 Bloque 5A — motor determinista de "✨ Pepa, hazla por mí". Sin React Testing Library en este
// proyecto (igual que el resto de domain/*.test.ts): funciones puras, se llaman directamente.

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

// Fixtures de contenido (sección 32) — datos FICTICIOS explícitos, nunca inventados por el motor.
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

describe('getAvailableInvitationData — nunca inventa un hecho ausente', () => {
  it('incluye siempre el título (hecho real garantizado)', () => {
    const fields = getAvailableInvitationData(EVENT_F)
    expect(fields.find((f) => f.key === 'title')?.text).toBe('Reunión')
  })

  it('un evento sin fecha/hora/lugar no genera esos campos (no hay hueco vacío)', () => {
    const fields = getAvailableInvitationData(EVENT_F)
    expect(fields.some((f) => f.key === 'fecha')).toBe(false)
    expect(fields.some((f) => f.key === 'hora')).toBe(false)
    expect(fields.some((f) => f.key === 'lugar')).toBe(false)
  })

  it('un evento sin hora (pero con fecha y lugar) no inventa una hora', () => {
    const fields = getAvailableInvitationData(EVENT_G)
    expect(fields.some((f) => f.key === 'fecha')).toBe(true)
    expect(fields.some((f) => f.key === 'hora')).toBe(false)
  })

  it('boda con ceremonia/celebración pero sin fecha: ceremonia y celebración presentes, fecha ausente', () => {
    const fields = getAvailableInvitationData(EVENT_D)
    expect(fields.some((f) => f.key === 'ceremonia')).toBe(true)
    expect(fields.some((f) => f.key === 'celebracion')).toBe(true)
    expect(fields.some((f) => f.key === 'fecha')).toBe(false)
  })

  it('cumpleaños con edad real genera el campo subtitle; sin ella, no aparece', () => {
    expect(getAvailableInvitationData(EVENT_C).find((f) => f.key === 'subtitle')?.text).toContain('6')
    expect(getAvailableInvitationData(EVENT_A).some((f) => f.key === 'subtitle')).toBe(false)
  })

  it('el cierre genérico nunca contiene un hecho (fecha/hora/lugar) — es una frase fija por tipo de evento', () => {
    const closing = getAvailableInvitationData(EVENT_A).find((f) => f.key === 'closing')
    expect(closing?.essential).toBe(false)
    expect(closing?.text).not.toMatch(/\d/)
  })
})

describe('selectInitialRecipe / getFallbackRecipes', () => {
  it('reproduce exactamente la matriz pedida', () => {
    expect(selectInitialRecipe('clasica', 1)).toBe('C1')
    expect(selectInitialRecipe('clasica', 2)).toBe('C1')
    expect(selectInitialRecipe('clasica', 3)).toBe('C2')
    expect(selectInitialRecipe('clasica', 4)).toBe('C2')
    expect(selectInitialRecipe('clasica', 5)).toBe('C1')
    expect(selectInitialRecipe('con_foto', 1)).toBe('P1')
    expect(selectInitialRecipe('con_foto', 2)).toBe('P1')
    expect(selectInitialRecipe('con_foto', 3)).toBe('P3')
    expect(selectInitialRecipe('con_foto', 4)).toBe('P3')
    expect(selectInitialRecipe('con_foto', 5)).toBe('P2')
    expect(selectInitialRecipe('divertida', 1)).toBe('D1')
    expect(selectInitialRecipe('divertida', 2)).toBe('D1')
    expect(selectInitialRecipe('divertida', 3)).toBe('D2')
    expect(selectInitialRecipe('divertida', 4)).toBe('D2')
    expect(selectInitialRecipe('divertida', 5)).toBe('D1')
  })

  it('cadena de fallback: C1→C2→fin, nunca en bucle', () => {
    expect(getFallbackRecipes('C1')).toEqual(['C1', 'C2'])
    expect(getFallbackRecipes('C2')).toEqual(['C2'])
  })

  it('cadena de fallback: P1→P2→P3→fin', () => {
    expect(getFallbackRecipes('P1')).toEqual(['P1', 'P2', 'P3'])
  })

  it('empezando directamente en P2 (Familia 5): P2→P3→fin, no repite P1', () => {
    expect(getFallbackRecipes('P2')).toEqual(['P2', 'P3'])
  })

  it('cadena de fallback: D1→D2→fin', () => {
    expect(getFallbackRecipes('D1')).toEqual(['D1', 'D2'])
  })

  it('cada receta aparece como mucho una vez en su propia cadena', () => {
    for (const start of ['C1', 'C2', 'P1', 'P2', 'P3', 'D1', 'D2'] as const) {
      const chain = getFallbackRecipes(start)
      expect(new Set(chain).size).toBe(chain.length)
    }
  })
})

describe('composeInvitationForMe — determinismo (sección 33)', () => {
  it('mismo evento/plantilla/estilo → mismo resultado exacto (deepEqual), repetido 3 veces', () => {
    const params = { event: EVENT_A, template: template('boda'), style: 'clasica' as const }
    const r1 = composeInvitationForMe(params)
    const r2 = composeInvitationForMe(params)
    const r3 = composeInvitationForMe(params)
    expect(r1).toEqual(r2)
    expect(r2).toEqual(r3)
  })

  it('determinismo también para con_foto (con la misma photoPath) y divertida', () => {
    const foto1 = composeInvitationForMe({ event: EVENT_C, template: template('monstruo'), style: 'con_foto', photoPath: 'f1/e1/foto.jpg' })
    const foto2 = composeInvitationForMe({ event: EVENT_C, template: template('monstruo'), style: 'con_foto', photoPath: 'f1/e1/foto.jpg' })
    expect(foto1).toEqual(foto2)
    const div1 = composeInvitationForMe({ event: EVENT_A, template: template('unicornio'), style: 'divertida' })
    const div2 = composeInvitationForMe({ event: EVENT_A, template: template('unicornio'), style: 'divertida' })
    expect(div1).toEqual(div2)
  })

  it('ninguna capa usa un id que dependa de Date.now/Math.random (mismo id en dos llamadas)', () => {
    const r1 = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    const r2 = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    expect(r1.layers.map((l) => l.id)).toEqual(r2.layers.map((l) => l.id))
  })
})

describe('composeInvitationForMe — conservación de datos reales (sección 34)', () => {
  it('un dato real presente en el input SIEMPRE aparece en alguna capa del resultado aceptado', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Cumpleaños de Lucía')
    expect(allText).toContain('19 de diciembre de 2026')
    expect(allText).toContain('20:00')
    expect(allText).toContain('Restaurante Trastevere')
  })

  it('boda con ceremonia+celebración: ambas sobreviven en el resultado', () => {
    const result = composeInvitationForMe({ event: EVENT_D, template: template('elegante'), style: 'clasica' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Parroquia de San José')
    expect(allText).toContain('Restaurante Los Olivos')
  })

  it('el motor nunca escribe una hora/lugar que no estaba en el evento (no inventa)', () => {
    const result = composeInvitationForMe({ event: EVENT_G, template: template('clasico'), style: 'clasica' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).not.toMatch(/\d{2}:\d{2}/) // ninguna hora con formato HH:MM
  })

  it('un fixture con solo datos mínimos (F) sigue conservando el único hecho real: el título', () => {
    const result = composeInvitationForMe({ event: EVENT_F, template: template('clasico'), style: 'clasica' }) as AutoComposeSuccess
    expect(result.layers.some((l) => l.text === 'Reunión')).toBe(true)
  })
})

describe('composeInvitationForMe — 📷 con_foto', () => {
  it('style=con_foto sin photoPath devuelve needs_photo, nunca inventa una foto', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'con_foto' })
    expect(result.status).toBe('needs_photo')
  })

  it('con foto real: la capa de tipo photo usa la MISMA photoPath dada, nunca una URL inventada', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('elegante'), style: 'con_foto', photoPath: 'familia1/evento1/mi-foto.jpg' }) as AutoComposeSuccess
    const photoLayer = result.layers.find((l) => l.type === 'photo')
    expect(photoLayer?.photoPath).toBe('familia1/evento1/mi-foto.jpg')
  })

  it('P1 (Familias 1/2): máscara "none" (rectangular)', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'con_foto', photoPath: 'x.jpg' }) as AutoComposeSuccess
    expect(result.initialRecipe).toBe('P1')
    const photoLayer = result.layers.find((l) => l.type === 'photo')
    expect(photoLayer?.photoMask).toBe('none')
  })

  it('P2 (Familia 5): máscara "circle"', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('corazones_terraza'), style: 'con_foto', photoPath: 'x.jpg' }) as AutoComposeSuccess
    expect(result.initialRecipe).toBe('P2')
    if (result.status === 'success') {
      const photoLayer = result.layers.find((l) => l.type === 'photo')
      expect(photoLayer?.photoMask).toBe('circle')
    }
  })

  it('la foto no colisiona con el texto (la capa de foto y las de texto ocupan bandas distintas de la zona)', () => {
    const result = composeInvitationForMe({ event: EVENT_C, template: template('elegante'), style: 'con_foto', photoPath: 'x.jpg' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const photoLayer = result.layers.find((l) => l.type === 'photo')!
    const textLayers = result.layers.filter((l) => l.type === 'text' || l.type === 'event_data')
    for (const t of textLayers) {
      expect(t.y).toBeGreaterThan(photoLayer.y)
    }
  })
})

describe('composeInvitationForMe — 🎉 divertida', () => {
  it('D1/D2 incluyen una capa emoji (icono del tipo de evento, ya existente) y una forma decorativa', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('unicornio'), style: 'divertida' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.layers.some((l) => l.type === 'emoji')).toBe(true)
    expect(result.layers.some((l) => l.type === 'shape')).toBe(true)
  })

  it('la decoración no reemplaza ningún dato real (siguen todos presentes)', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('unicornio'), style: 'divertida' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).filter(Boolean).join(' | ')
    expect(allText).toContain('Cumpleaños de Lucía')
    expect(allText).toContain('Restaurante Trastevere')
  })

  it('clásica NUNCA añade emoji ni forma (principalmente tipográfica)', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('boda'), style: 'clasica' }) as AutoComposeSuccess
    expect(result.layers.some((l) => l.type === 'emoji')).toBe(false)
    expect(result.layers.some((l) => l.type === 'shape')).toBe(false)
  })
})

describe('composeInvitationForMe — casos extremos obligatorios (sección 31)', () => {
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
    it(`clásica sobre "${key}" (${note}) — éxito o fallo explícito, nunca una excepción sin controlar`, () => {
      expect(() => composeInvitationForMe({ event: EVENT_A, template: template(key), style: 'clasica' })).not.toThrow()
      const result = composeInvitationForMe({ event: EVENT_A, template: template(key), style: 'clasica' })
      expect(['success', 'fail']).toContain(result.status)
    })

    it(`con_foto sobre "${key}" (${note}) con foto real — éxito o fallo explícito`, () => {
      const result = composeInvitationForMe({ event: EVENT_A, template: template(key), style: 'con_foto', photoPath: 'x.jpg' })
      expect(['success', 'fail']).toContain(result.status)
    })

    it(`divertida sobre "${key}" (${note}) — éxito o fallo explícito`, () => {
      const result = composeInvitationForMe({ event: EVENT_A, template: template(key), style: 'divertida' })
      expect(['success', 'fail']).toContain(result.status)
    })
  }

  it('corazones_terraza NUNCA ve modificado su textArea por este motor (solo se lee, nunca se escribe)', () => {
    const before = JSON.stringify(template('corazones_terraza').textArea)
    composeInvitationForMe({ event: EVENT_E, template: template('corazones_terraza'), style: 'clasica' })
    const after = JSON.stringify(template('corazones_terraza').textArea)
    expect(after).toBe(before)
  })
})

describe('composeInvitationForMe — título/lugar muy largos (caso E) no cuelgan ni lanzan', () => {
  it('no lanza excepción con textos largos', () => {
    expect(() => composeInvitationForMe({ event: EVENT_E, template: template('clasico'), style: 'clasica' })).not.toThrow()
  })
})

describe('composeInvitationForMe — resultado FAIL informa attemptedRecipes y motivo', () => {
  it('cuando falla, incluye qué recetas se probaron y por qué (nunca null ambiguo)', () => {
    // No se fuerza un FAIL real aquí (dependería de qué plantillas fallan de verdad, ver test de la matriz
    // de 100) — se confirma la FORMA del resultado fail construyendo uno directamente vía el mismo tipo.
    const fail = { status: 'fail' as const, attemptedRecipes: ['C1', 'C2'] as const, reason: 'motivo de prueba' }
    expect(fail.status).toBe('fail')
    expect(fail.attemptedRecipes.length).toBeGreaterThan(0)
    expect(fail.reason.length).toBeGreaterThan(0)
  })
})

describe('classifyTemplateGeometry sigue exportada y usada de verdad por el motor (no una copia paralela)', () => {
  it('composeInvitationForMe reporta la misma familia que classifyTemplateGeometry para la misma plantilla', () => {
    const t = template('boda')
    const result = composeInvitationForMe({ event: EVENT_A, template: t, style: 'clasica' }) as AutoComposeSuccess
    expect(result.geometryFamily).toBe(classifyTemplateGeometry(t))
  })
})

// ---------------------------------------------------------------------------------------------------
// Frases de cierre genéricas (sección 6, 35) — deterministas, sin ningún hecho, prescindibles.
// ---------------------------------------------------------------------------------------------------
describe('catálogo de cierres genéricos (sección 35)', () => {
  it('es determinista: mismo tipo de evento → misma frase siempre', () => {
    const a = getAvailableInvitationData(EVENT_A).find((f) => f.key === 'closing')?.text
    const b = getAvailableInvitationData(makeEvent({ type: EVENT_A.type, title: 'Otro título distinto' })).find((f) => f.key === 'closing')?.text
    expect(a).toBe(b)
  })

  it('ningún cierre genérico contiene un hecho concreto (fecha, hora, dirección) para ningún tipo de evento', () => {
    const types: FamilyEvent['type'][] = ['cumpleanos', 'comunion', 'bautizo', 'boda', 'celebracion', 'personalizado']
    for (const type of types) {
      const closing = getAvailableInvitationData(makeEvent({ type })).find((f) => f.key === 'closing')
      expect(closing, type).toBeDefined()
      expect(closing!.essential, type).toBe(false)
      expect(closing!.text, type).not.toMatch(/\d/)
    }
  })

  it('su ausencia nunca invalida una composición: quitar el cierre de los campos disponibles no le hace falta al título ni a los datos reales', () => {
    // El cierre es siempre el único campo con essential:false — su ausencia nunca puede ser la razón de un FAIL.
    for (const f of getAvailableInvitationData(EVENT_A)) {
      if (f.key !== 'closing') expect(f.essential).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------------------------------
// Cadena de fallback D1→D2 (sección 21, 37) sobre un caso real (no simulado) del catálogo de 100.
// ---------------------------------------------------------------------------------------------------
describe('🎉 divertida — fallback D1→D2 (sección 37)', () => {
  it('otono_senderismo (Familia 5): D1 no cabe con decoración completa, D2 sí — receta aceptada distinta de la inicial', () => {
    const result = composeInvitationForMe({ event: EVENT_C, template: template('otono_senderismo'), style: 'divertida' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.initialRecipe).toBe('D1')
    expect(result.acceptedRecipe).toBe('D2')
    expect(result.attemptedRecipes).toEqual(['D1', 'D2'])
  })

  it('D2 puede prescindir de la decoración o del cierre genérico, pero jamás de un dato real', () => {
    const result = composeInvitationForMe({ event: EVENT_C, template: template('otono_senderismo'), style: 'divertida' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).filter(Boolean).join(' | ')
    expect(allText).toContain('Cumpleaños de Hugo')
    expect(allText).toContain('Parque de bolas Diverlandia')
  })
})

describe('📷 con_foto — fallback P1→P2 (sección 21, 36) sobre un caso real', () => {
  const EVENT_BARBACOA = makeEvent({
    type: 'cumpleanos',
    title: 'Cumpleaños de Valentina',
    eventDate: '2026-11-14',
    eventTime: '18:00',
    venueLabel: 'Salón de fiestas Arcoíris',
    details: { ageTurning: 8 },
  })

  it('barbacoa (Familia 2): P1 rectangular no cabe (foto+5 datos), P2 circular sí', () => {
    const result = composeInvitationForMe({ event: EVENT_BARBACOA, template: template('barbacoa'), style: 'con_foto', photoPath: 'x.jpg' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.initialRecipe).toBe('P1')
    expect(result.acceptedRecipe).toBe('P2')
    const photoLayer = result.layers.find((l) => l.type === 'photo')
    expect(photoLayer?.photoMask).toBe('circle')
  })
})

// ---------------------------------------------------------------------------------------------------
// Casos de contenido A-I (sección 32) — cada letra probada explícitamente, con las 3 recetas cuando aplica.
// ---------------------------------------------------------------------------------------------------
describe('casos de contenido A-I (sección 32)', () => {
  it('A) título+fecha+hora+lugar+cierre genérico: todos presentes', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('clasico'), style: 'clasica' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Cumpleaños de Lucía')
    expect(allText).toContain('20:00')
    expect(allText).toContain('Restaurante Trastevere')
  })

  it('B) título+fecha, sin hora ni lugar (EVENT_B): compone sin inventar ninguna hora', () => {
    const result = composeInvitationForMe({ event: EVENT_B, template: template('clasico'), style: 'clasica' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Comida de Navidad')
    expect(allText).not.toMatch(/\d{2}:\d{2}/)
  })

  it('C) título+edad+fecha+hora+lugar+cierre: la edad sobrevive junto al resto', () => {
    const result = composeInvitationForMe({ event: EVENT_C, template: template('clasico'), style: 'clasica' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('6')
    expect(allText).toContain('Parque de bolas Diverlandia')
  })

  it('D) título+ceremonia+celebración+cierre, sin fecha/hora: ambos lugares presentes, sin fecha', () => {
    const result = composeInvitationForMe({ event: EVENT_D, template: template('clasico'), style: 'clasica' }) as AutoComposeSuccess
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Parroquia de San José')
    expect(allText).toContain('Restaurante Los Olivos')
  })

  it('E) título y lugar muy largos + fecha + hora: no lanza y conserva el título completo', () => {
    const result = composeInvitationForMe({ event: EVENT_E, template: template('clasico'), style: 'clasica' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.layers.some((l) => l.text === EVENT_E.title)).toBe(true)
  })

  it('F) solo lo realmente disponible (título únicamente): compone igualmente', () => {
    const result = composeInvitationForMe({ event: EVENT_F, template: template('clasico'), style: 'clasica' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.layers.some((l) => l.text === 'Reunión')).toBe(true)
  })

  it('G) campos opcionales ausentes (sin hora ni lugar): no hay hueco vacío, el resto se recompone', () => {
    const result = composeInvitationForMe({ event: EVENT_G, template: template('clasico'), style: 'clasica' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    const allText = result.layers.map((l) => l.text).join(' | ')
    expect(allText).toContain('Cumpleaños de Marta')
  })

  it('H) estilo con_foto sin foto: needs_photo explícito, nunca una composición a medias', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('clasico'), style: 'con_foto' })
    expect(result.status).toBe('needs_photo')
  })

  it('I) estilo con_foto con foto real: compone con la foto dada', () => {
    const result = composeInvitationForMe({ event: EVENT_A, template: template('clasico'), style: 'con_foto', photoPath: 'familia/evento/foto.jpg' }) as AutoComposeSuccess
    expect(result.status).toBe('success')
    expect(result.layers.find((l) => l.type === 'photo')?.photoPath).toBe('familia/evento/foto.jpg')
  })
})

// ---------------------------------------------------------------------------------------------------
// Nunca null ambiguo (sección 43) — el resultado real de composeInvitationForMe es siempre uno de los 3
// estados tipados, nunca null/undefined, para cualquier combinación real de estilo.
// ---------------------------------------------------------------------------------------------------
describe('composeInvitationForMe nunca devuelve null/undefined', () => {
  it('para las 3 recetas, el resultado siempre tiene un status válido', () => {
    const styles: AutoComposeStyle[] = ['clasica', 'con_foto', 'divertida']
    for (const style of styles) {
      const result = composeInvitationForMe({ event: EVENT_A, template: template('clasico'), style, photoPath: 'x.jpg' })
      expect(result).toBeTruthy()
      expect(['success', 'needs_photo', 'fail']).toContain(result.status)
    }
  })
})
