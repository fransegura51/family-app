// «Solicitar datos» (Gestión de grupos) — dominio puro del lado de la aplicación. Las reglas de las preguntas y de las respuestas viven en el módulo compartido con el servidor
// (supabase/functions/_shared/groups/formSchema.ts): lo que acepta quien construye el formulario y lo que acepta quien responde sale de las MISMAS reglas.
import { PEPA_PUBLIC_WEBSITE_URL } from '@/domain/brand'
import {
  addDays,
  compatibleMaps,
  daysBetween,
  FIELD_TYPES,
  hasSensitive,
  MAPS_TO,
  MAX_FIELDS,
  MAX_RETENTION_DAYS,
  normalizeFields,
  notesBlock,
  retentionExpiry,
  retentionMaxError,
  todayIn,
  validateAnswers,
  type AnswerValue,
  type FieldType,
  type FormField,
  type MapsTo,
} from '../../supabase/functions/_shared/groups/formSchema'

export { addDays, compatibleMaps, daysBetween, FIELD_TYPES, hasSensitive, MAPS_TO, MAX_FIELDS, MAX_RETENTION_DAYS, normalizeFields, notesBlock, retentionExpiry, retentionMaxError, todayIn, validateAnswers }
export type { AnswerValue, FieldType, FormField, MapsTo }

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  texto: 'Texto',
  numero: 'Número',
  fecha: 'Fecha',
  email: 'Correo electrónico',
  telefono: 'Teléfono',
  si_no: 'Sí / No',
  seleccion: 'Elegir una opción',
  multiple: 'Elegir varias opciones',
  archivo: 'Documento o archivo',
}

export const MAPS_TO_LABEL: Record<MapsTo, string> = {
  surname: 'Apellidos',
  guardianName: 'Madre, padre o tutor',
  phone: 'Teléfono',
  email: 'Correo',
}

/** Etiquetas del selector «Guardar también en la ficha», según el tipo de pregunta. */
export const MAPS_TO_OPTION_LABEL: Record<MapsTo, string> = {
  surname: 'Apellidos',
  guardianName: 'Madre, padre o tutor',
  phone: 'Teléfono de la ficha',
  email: 'Correo de la ficha',
}

export interface FormItem {
  id: string
  groupId: string
  createdBy: string
  title: string
  requesterName: string
  requesterContact: string | null
  purpose: string
  intro: string | null
  fields: FormField[]
  status: 'borrador' | 'abierto' | 'cerrado'
  deadline: string | null
  retentionMax: string | null
  retentionHistory: { at: string; from: string | null; to: string }[]
  publishedAt: string | null
  createdAt: string
}

export interface FormRecipient {
  id: string
  formId: string
  participantId: string | null
  kind: 'participante' | 'general'
  token: string
  active: boolean
}

export interface Proposal {
  field: MapsTo
  value: string
  current: string | null
  status: 'aplicado' | 'igual' | 'conflicto' | 'ignorado'
}

export interface FormResponse {
  id: string
  formId: string
  recipientId: string
  participantId: string | null
  claimedName: string | null
  status: 'recibida' | 'revisar'
  answers: Record<string, AnswerValue>
  proposals: Proposal[]
  submittedAt: string
}

export interface DeletionRequest {
  id: string
  responseId: string
  reason: string | null
  status: 'pendiente' | 'eliminado' | 'conservado'
  legalReason: string | null
  requestedAt: string
}

let seq = 0
export function newFieldId(): string {
  seq += 1
  return `q${Date.now().toString(36)}${seq.toString(36)}`.slice(0, 40)
}

export function newField(type: FieldType): FormField {
  return {
    id: newFieldId(),
    type,
    label: '',
    help: null,
    required: false,
    options: type === 'seleccion' || type === 'multiple' ? ['', ''] : [],
    sensitive: false,
    mapsTo: null,
  }
}

export function moveField(fields: FormField[], id: string, delta: -1 | 1): FormField[] {
  const i = fields.findIndex((f) => f.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= fields.length) return fields
  const next = [...fields]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** Plantillas de partida (los ejemplos habituales). Son solo preguntas: nunca llevan datos de personas. */
export interface FormTemplate {
  key: string
  name: string
  title: string
  purpose: string
  intro: string
  fields: Omit<FormField, 'id'>[]
}

const f = (type: FieldType, label: string, over: Partial<FormField> = {}): Omit<FormField, 'id'> => ({ type, label, help: null, required: false, options: [], sensitive: false, mapsTo: null, ...over })

export const BUILTIN_TEMPLATES: FormTemplate[] = [
  {
    key: 'emails-drive',
    name: 'Correos para Google Drive',
    title: 'Correo para compartir carpetas',
    purpose: 'Tener un correo electrónico por familia para compartir carpetas y documentos del grupo.',
    intro: 'Escribe el correo con el que quieres recibir lo que compartamos.',
    fields: [f('email', 'Correo electrónico', { required: true, mapsTo: 'email', help: 'Mejor uno que revises a menudo.' })],
  },
  {
    key: 'viaje',
    name: 'Documentación para un viaje',
    title: 'Documentación del viaje',
    purpose: 'Reservar el viaje y cumplir los requisitos de entrada y de seguros.',
    intro: 'Rellena los datos de la persona que viaja. Los documentos se guardan protegidos y se eliminan en la fecha indicada.',
    fields: [
      f('texto', 'Nombre completo tal como figura en el documento', { required: true }),
      f('fecha', 'Fecha de nacimiento', { required: true }),
      f('texto', 'Número de pasaporte o DNI', { required: true, sensitive: true }),
      f('archivo', 'Foto o copia del documento', { sensitive: true }),
      f('telefono', 'Teléfono de contacto durante el viaje', { required: true, mapsTo: 'phone' }),
    ],
  },
  {
    key: 'excursion',
    name: 'Datos para una excursión',
    title: 'Excursión: datos y autorización',
    purpose: 'Organizar la excursión y tener un contacto de urgencia.',
    intro: 'Responde antes de la fecha límite.',
    fields: [
      f('si_no', 'Autorizo la participación en la excursión', { required: true }),
      f('telefono', 'Teléfono de urgencia', { required: true, mapsTo: 'phone' }),
      f('texto', 'Alergias o necesidades que debamos saber', { sensitive: true, help: 'Solo si es necesario.' }),
    ],
  },
  {
    key: 'menu',
    name: 'Preferencias de menú',
    title: 'Preferencias de menú',
    purpose: 'Encargar el menú adecuado para todos.',
    intro: 'Marca lo que corresponda.',
    fields: [f('seleccion', 'Tipo de menú', { required: true, options: ['Normal', 'Vegetariano', 'Sin gluten', 'Otro'] }), f('texto', 'Observaciones')],
  },
  {
    key: 'tallas',
    name: 'Tallas de camiseta',
    title: 'Tallas de camiseta',
    purpose: 'Pedir las camisetas del grupo en la talla correcta.',
    intro: 'Elige la talla de la persona.',
    fields: [f('seleccion', 'Talla', { required: true, options: ['4', '6', '8', '10', '12', '14', 'S', 'M', 'L', 'XL'] })],
  },
  {
    key: 'asistencia',
    name: 'Confirmación de asistencia',
    title: 'Confirmación de asistencia',
    purpose: 'Saber quién asistirá para organizar el evento.',
    intro: 'Responde antes de la fecha límite.',
    fields: [f('si_no', '¿Asistirá?', { required: true }), f('numero', 'Número de acompañantes'), f('texto', 'Comentarios')],
  },
]

export function fieldsFromTemplate(t: Pick<FormTemplate, 'fields'>): FormField[] {
  return t.fields.map((x) => ({ ...x, id: newFieldId(), options: [...x.options] }))
}

/** Quién ha respondido y quién falta, a partir de los destinatarios con enlace personal. */
export function responseStatus(recipients: FormRecipient[], responses: FormResponse[]): { answered: FormRecipient[]; missing: FormRecipient[] } {
  const done = new Set(responses.map((r) => r.recipientId))
  const personal = recipients.filter((r) => r.kind === 'participante' && r.active)
  return { answered: personal.filter((r) => done.has(r.id)), missing: personal.filter((r) => !done.has(r.id)) }
}

export const isOpenForAnswers = (form: Pick<FormItem, 'status' | 'deadline'>, today: string): boolean => form.status === 'abierto' && (!form.deadline || form.deadline >= today)

/**
 * Enlace que se comparte: el dominio oficial de PEPA. La página `/f/` de la web (repositorio pepa-web) lleva a la persona al formulario sin registrarse. Los enlaces antiguos
 * (`fransegura51.github.io/family-app/?formulario=…`) siguen abriendo el mismo formulario porque la app no ha cambiado de sitio.
 */
export function formShareUrl(token: string): string {
  return `${PEPA_PUBLIC_WEBSITE_URL}/f/?formulario=${token}`
}

/** Mensaje de invitación (WhatsApp, etc.): primero quién pide los datos (con el grupo), luego qué se pide, para qué, hasta cuándo y el enlace. */
export function inviteText(form: Pick<FormItem, 'title' | 'requesterName' | 'purpose' | 'deadline'>, groupName: string, url: string, who: string | null, formatDate: (d: string) => string): string {
  return [
    `${form.requesterName} — ${groupName}`,
    `${form.title}${who ? ` (${who})` : ''}`,
    form.purpose,
    form.deadline ? `Fecha límite: ${formatDate(form.deadline)}` : '',
    url,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Estado que ve quien gestiona: borrador, activo, caducado (pasó la fecha límite) o cerrado. */
export function formStatusLabel(form: Pick<FormItem, 'status' | 'deadline'>, today: string): 'Borrador' | 'Activo' | 'Caducado' | 'Cerrado' {
  if (form.status === 'borrador') return 'Borrador'
  if (form.status === 'cerrado') return 'Cerrado'
  return form.deadline && form.deadline < today ? 'Caducado' : 'Activo'
}

/** Ejemplo orientativo para el campo «Pregunta» según el tipo. Es solo un texto de ayuda: nunca se guarda ni se usa como pregunta. */
export const FIELD_EXAMPLE: Record<FieldType, string> = {
  texto: 'Por ejemplo: Alergias o necesidades a tener en cuenta',
  numero: 'Por ejemplo: Número de acompañantes',
  fecha: 'Por ejemplo: Fecha de nacimiento',
  email: 'Por ejemplo: Correo electrónico de contacto',
  telefono: 'Por ejemplo: Teléfono de urgencia',
  si_no: 'Por ejemplo: ¿Asistirás a la excursión?',
  seleccion: 'Por ejemplo: Tipo de menú',
  multiple: 'Por ejemplo: Actividades en las que participarás',
  archivo: 'Por ejemplo: Adjunta la autorización firmada',
}

export const isChoice = (t: FieldType) => t === 'seleccion' || t === 'multiple'

/** Cambia el tipo de una pregunta conservando todo lo compatible: texto, ayuda, obligatoriedad, opciones (entre «una» y «varias») y la asociación a la ficha si sigue siendo coherente. */
export function changeFieldType(field: FormField, type: FieldType): FormField {
  // Las opciones se recuerdan aunque el tipo no las use, por si se vuelve atrás (al guardar, normalizeFields las descarta si no hacen falta).
  const options = isChoice(type) && field.options.length < 2 ? [...field.options, ...Array<string>(2 - field.options.length).fill('')] : field.options
  return { ...field, type, options, mapsTo: field.mapsTo && !field.sensitive && compatibleMaps(type).includes(field.mapsTo) ? field.mapsTo : null }
}
