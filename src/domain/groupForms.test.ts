import { describe, expect, it } from 'vitest'
import {
  addDays,
  BUILTIN_TEMPLATES,
  fieldsFromTemplate,
  formShareUrl,
  hasSensitive,
  inviteText,
  isOpenForAnswers,
  moveField,
  newField,
  normalizeFields,
  notesBlock,
  responseStatus,
  retentionExpiry,
  retentionMaxError,
  todayIn,
  validateAnswers,
  type FormField,
  type FormRecipient,
  type FormResponse,
} from '@/domain/groupForms'

const field = (over: Partial<FormField>): FormField => ({ id: 'q1', type: 'texto', label: 'Pregunta', help: null, required: false, options: [], sensitive: false, mapsTo: null, ...over })

describe('BLOQUE 6 · preguntas del formulario', () => {
  it('las plantillas de partida son válidas y ninguna lleva datos de personas', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const n = normalizeFields(fieldsFromTemplate(t))
      expect(n.errors, t.key).toEqual([])
      expect(n.fields.length, t.key).toBeGreaterThan(0)
    }
  })
  it('hay un tipo para cada cosa que se pidió', () => {
    const types = new Set(['texto', 'numero', 'fecha', 'email', 'telefono', 'si_no', 'seleccion', 'multiple', 'archivo'])
    for (const t of types) expect(normalizeFields([{ ...field({ type: t as FormField['type'], options: ['a', 'b'] }), id: 'a1' }]).fields.length).toBe(1)
  })
  it('exige pregunta con texto y al menos dos opciones en las de elegir; descarta ids repetidos o inválidos', () => {
    expect(normalizeFields([field({ label: '' })]).errors).toContain('Hay una pregunta sin texto.')
    expect(normalizeFields([field({ type: 'seleccion', options: ['solo una'] })]).errors.join(' ')).toContain('al menos dos opciones')
    const n = normalizeFields([field({ id: 'dup' }), field({ id: 'dup', label: 'Otra' }), field({ id: 'MAL ID' })])
    expect(n.fields).toHaveLength(1)
    expect(normalizeFields([]).errors).toContain('Añade al menos una pregunta.')
  })
  it('solo un dato ordinario de texto, correo o teléfono puede completar la ficha; nunca uno delicado ni un archivo', () => {
    expect(normalizeFields([field({ type: 'telefono', mapsTo: 'phone' })]).fields[0].mapsTo).toBe('phone')
    expect(normalizeFields([field({ type: 'telefono', mapsTo: 'email' })]).fields[0].mapsTo).toBeNull()
    expect(normalizeFields([field({ type: 'email', mapsTo: 'phone' })]).fields[0].mapsTo).toBeNull()
    expect(normalizeFields([field({ type: 'texto', sensitive: true, mapsTo: 'surname' })]).fields[0].mapsTo).toBeNull()
    expect(normalizeFields([field({ type: 'archivo', mapsTo: 'surname' })]).fields[0].mapsTo).toBeNull()
  })
  it('reordenar preguntas', () => {
    const a = field({ id: 'a' })
    const b = field({ id: 'b' })
    const c = field({ id: 'c' })
    expect(moveField([a, b, c], 'c', -1).map((f) => f.id)).toEqual(['a', 'c', 'b'])
    expect(moveField([a, b, c], 'a', -1).map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(newField('seleccion').options).toHaveLength(2)
    expect(hasSensitive([a, field({ sensitive: true })])).toBe(true)
  })
})

describe('BLOQUE 6 · respuestas', () => {
  const fields: FormField[] = [
    field({ id: 'nombre', required: true }),
    field({ id: 'edad', type: 'numero' }),
    field({ id: 'nac', type: 'fecha' }),
    field({ id: 'mail', type: 'email' }),
    field({ id: 'tel', type: 'telefono' }),
    field({ id: 'ok', type: 'si_no', required: true }),
    field({ id: 'talla', type: 'seleccion', options: ['S', 'M'] }),
    field({ id: 'extras', type: 'multiple', options: ['a', 'b', 'c'] }),
    field({ id: 'doc', type: 'archivo' }),
  ]
  const prefix = 'f1/r1/'
  it('acepta respuestas válidas de todos los tipos', () => {
    const r = validateAnswers(fields, { nombre: ' Eric ', edad: '5,5', nac: '2020-02-29', mail: 'a@b.es', tel: '+34 612 345 678', ok: false, talla: 'M', extras: ['a', 'c', 'a'], doc: [`${prefix}doc-1.png`] }, prefix)
    expect(r.errors).toEqual({})
    expect(r.clean).toMatchObject({ nombre: 'Eric', edad: 5.5, nac: '2020-02-29', mail: 'a@b.es', ok: false, talla: 'M', extras: ['a', 'c'] })
  })
  it('«No» en una pregunta Sí/No obligatoria es una respuesta válida', () => {
    expect(validateAnswers([field({ id: 'ok', type: 'si_no', required: true })], { ok: false }, prefix).errors).toEqual({})
    expect(validateAnswers([field({ id: 'ok', type: 'si_no', required: true })], {}, prefix).errors.ok).toBeTruthy()
  })
  it('marca lo obligatorio y lo inválido, pregunta por pregunta, sin aceptar nada raro', () => {
    const r = validateAnswers(fields, { edad: 'abc', nac: '2021-02-30', mail: 'no-es-correo', tel: '12', talla: 'XL', extras: ['z'], doc: ['otra/ruta/x.png'] }, prefix)
    expect(Object.keys(r.errors).sort()).toEqual(['doc', 'edad', 'extras', 'mail', 'nac', 'nombre', 'ok', 'talla', 'tel'])
    expect(r.clean).toEqual({})
  })
  it('un archivo solo vale si lo subió ESTE destinatario a su carpeta (sin «..»)', () => {
    expect(validateAnswers([field({ id: 'doc', type: 'archivo' })], { doc: [`${prefix}../otro/x.png`] }, prefix).errors.doc).toBeTruthy()
    expect(validateAnswers([field({ id: 'doc', type: 'archivo' })], { doc: [`f2/r9/doc-1.png`] }, prefix).errors.doc).toBeTruthy()
  })
  it('las preguntas que no existen en el formulario se ignoran', () => {
    expect(validateAnswers([field({ id: 'a' })], { a: 'x', inventada: 'y' }, prefix).clean).toEqual({ a: 'x' })
  })
})

describe('BLOQUE 6.5 · conservación de datos delicados', () => {
  const today = '2026-10-30'
  it('quien organiza fija una fecha futura y como mucho a 400 días', () => {
    expect(retentionMaxError(null, today)).toBeTruthy()
    expect(retentionMaxError('2026-10-30', today)).toBeTruthy()
    expect(retentionMaxError('2026-10-01', today)).toBeTruthy()
    expect(retentionMaxError(addDays(today, 401), today)).toBeTruthy()
    expect(retentionMaxError(addDays(today, 400), today)).toBeNull()
    expect(retentionMaxError('2026-12-01', today)).toBeNull()
  })
  it('quien responde puede elegir una fecha ANTERIOR; una posterior se recorta al máximo; una pasada se ignora', () => {
    expect(retentionExpiry('2026-12-01', '2026-11-10', today)).toBe('2026-11-10')
    expect(retentionExpiry('2026-12-01', '2027-03-01', today)).toBe('2026-12-01')
    expect(retentionExpiry('2026-12-01', '2026-10-01', today)).toBe('2026-12-01')
    expect(retentionExpiry('2026-12-01', null, today)).toBe('2026-12-01')
    expect(retentionExpiry('2026-12-01', 'no-es-fecha', today)).toBe('2026-12-01')
  })
  it('hoy se calcula en la zona horaria de España', () => {
    // 23:30 UTC del 29/10 ya es 30/10 en Madrid (horario de invierno: UTC+1 desde el 25/10).
    expect(todayIn(new Date('2026-10-29T23:30:00Z'))).toBe('2026-10-30')
    expect(todayIn(new Date('2026-10-30T12:00:00Z'))).toBe('2026-10-30')
  })
})

describe('BLOQUE 6.4 · notas organizadas', () => {
  const fields: FormField[] = [
    field({ id: 'a', label: 'Alergias' }),
    field({ id: 'b', label: 'DNI', sensitive: true }),
    field({ id: 'c', label: 'Foto', type: 'archivo' }),
    field({ id: 'd', label: 'Teléfono', type: 'telefono', mapsTo: 'phone' }),
    field({ id: 'e', label: '¿Asiste?', type: 'si_no' }),
  ]
  it('lleva solo respuestas ordinarias: nunca delicadas, archivos ni lo que ya va a un campo propio; con referencia al formulario', () => {
    const t = notesBlock('Excursión', '30/10/2026', 'abcdef12-0000', fields, { a: 'ninguna', b: '12345678Z', c: ['x'], d: '600', e: true })
    expect(t).toContain('Formulario «Excursión»')
    expect(t).toContain('[abcdef12]')
    expect(t).toContain('Alergias: ninguna')
    expect(t).toContain('¿Asiste?: Sí')
    expect(t).not.toContain('12345678Z')
    expect(t).not.toContain('DNI')
    expect(t).not.toContain('Foto')
    expect(t).not.toContain('Teléfono')
  })
  it('sin respuestas ordinarias no hay bloque', () => {
    expect(notesBlock('X', 'f', 'id', [field({ sensitive: true })], { q1: 'secreto' })).toBe('')
  })
})

describe('BLOQUE 6.2 · quién falta y mensajes', () => {
  const rec = (id: string, participantId: string | null, kind: FormRecipient['kind'] = 'participante', active = true): FormRecipient => ({ id, formId: 'f', participantId, kind, token: 't' + id, active })
  const resp = (recipientId: string): FormResponse => ({ id: 'r' + recipientId, formId: 'f', recipientId, participantId: null, claimedName: null, status: 'recibida', answers: {}, proposals: [], submittedAt: '2026-10-30T10:00:00Z' })
  it('separa quién respondió de quién falta, sin contar el enlace general ni los desactivados', () => {
    const s = responseStatus([rec('1', 'p1'), rec('2', 'p2'), rec('3', 'p3', 'participante', false), rec('g', null, 'general')], [resp('1'), resp('g')])
    expect(s.answered.map((r) => r.id)).toEqual(['1'])
    expect(s.missing.map((r) => r.id)).toEqual(['2'])
  })
  it('un formulario cerrado o con fecha límite pasada no admite respuestas', () => {
    expect(isOpenForAnswers({ status: 'abierto', deadline: null }, '2026-10-30')).toBe(true)
    expect(isOpenForAnswers({ status: 'abierto', deadline: '2026-10-30' }, '2026-10-30')).toBe(true)
    expect(isOpenForAnswers({ status: 'abierto', deadline: '2026-10-29' }, '2026-10-30')).toBe(false)
    expect(isOpenForAnswers({ status: 'cerrado', deadline: null }, '2026-10-30')).toBe(false)
    expect(isOpenForAnswers({ status: 'borrador', deadline: null }, '2026-10-30')).toBe(false)
  })
  it('el mensaje de invitación dice quién pide los datos, para qué, hasta cuándo y lleva el enlace', () => {
    const t = inviteText({ title: 'Excursión', requesterName: 'Colegio X', purpose: 'Organizar la salida', deadline: '2026-11-05' }, 'Clase de Eric', 'https://x/?formulario=abc', 'Eric', (d) => d.split('-').reverse().join('/'))
    expect(t).toContain('Colegio X · Clase de Eric')
    expect(t).toContain('Excursión (Eric)')
    expect(t).toContain('Para: Organizar la salida')
    expect(t).toContain('Antes del 05/11/2026.')
    expect(t).toContain('https://x/?formulario=abc')
  })
  it('el enlace usa el parámetro «formulario»', () => {
    // jsdom no es necesario: solo comprueba que se compone con el origen y el parámetro.
    const g = globalThis as { window?: { location: { origin: string } } }
    g.window = { location: { origin: 'https://pepa.test' } }
    expect(formShareUrl('TOKEN')).toMatch(/\?formulario=TOKEN$/)
    delete g.window
  })
})
