// Textos fijos de la ficha de alergias e intolerancias (DATOS DE SALUD, RGPD art. 9) y de los avisos en recetas. Español de España, para una persona no técnica.
// Viven en src/ui (y no en domain/) a propósito: el candado src/data/dietaryPrivacyLock.test.ts solo deja importar los módulos de alergias a las pantallas.
// REGLAS DE LENGUAJE: jamás «segura», «libre de», «apta para» ni «sin alérgenos» como afirmación (la única mención de «segura» es la frase negativa fija
// NO_MATCH_DISCLAIMER, que viene del dominio). Ningún texto lleva nombres de personas dentro de un aviso de receta.
import { DIETARY_NOTICE_VERSION, type DietaryAllergenKey, type DietaryKind } from '@/domain/dietaryRestrictions'

export const DIETARY_SECTION_TITLE = 'Alergias e intolerancias alimentarias'
export const DIETARY_SECTION_OPTIONAL = 'Es opcional. Si no lo necesitas, déjalo cerrado.'

// Quién lo ve: refleja los roles REALES de la base de datos (migración 0279): administradores y adultos ven y editan todo; niño o invitado solo ven lo suyo.
export const DIETARY_PRIVACY_MANAGER =
  'Solo lo ven las personas adultas de tu familia (administradores y adultos). No se comparte con Comunidad ni con la inteligencia artificial. Las cuentas de niño o de invitado solo ven lo suyo y no pueden cambiarlo.'
export const DIETARY_PRIVACY_READONLY =
  'Solo lo ven las personas adultas de tu familia y tú. No se comparte con Comunidad ni con la inteligencia artificial. Tú no puedes cambiarlo: pídeselo a una persona adulta de tu familia.'

export const DIETARY_NO_CONSENT_TEXT = (name: string) =>
  `Para anotar alergias o intolerancias de ${name} hace falta antes su consentimiento. Son datos de salud y están especialmente protegidos.`
export const DIETARY_NO_CONSENT_READONLY = 'Todavía no hay nada anotado sobre ti.'
export const DIETARY_EMPTY_TEXT = (name: string) => `Todavía no hay nada anotado para ${name}.`
export const DIETARY_LOADING_TEXT = 'Cargando…'
export const DIETARY_RETRY_LABEL = 'Volver a intentarlo'

// ─── Consentimiento ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const DIETARY_CONSENT_TITLE = 'Aviso sobre datos de salud'
export const DIETARY_PROVISIONAL_TEXT = 'Texto provisional pendiente de revisión jurídica'
export const DIETARY_CONSENT_VERSION_LINE = `Versión del aviso: ${DIETARY_NOTICE_VERSION}`
export const DIETARY_CONSENT_PARAGRAPHS = (name: string): { title: string; text: string }[] => [
  { title: 'Qué se guarda', text: `Alergias, intolerancias o restricciones alimentarias de ${name}. Son datos de salud y están especialmente protegidos.` },
  { title: 'Para qué', text: 'Solo para avisarte, en las recetas de tu Cocina, de ingredientes que podrían afectar a alguien de tu familia.' },
  { title: 'Quién lo ve', text: 'Las personas adultas y administradoras de tu familia. Una cuenta de niño o de invitado solo ve lo suyo y no puede cambiarlo.' },
  { title: 'Qué no se hace', text: 'No se comparte con Comunidad, no se envía a la inteligencia artificial y no se usa en avisos al móvil.' },
  { title: 'Cuánto tiempo', text: 'Hasta que lo borres o retires el consentimiento. Al retirarlo se borra todo lo anotado de esta persona y no se puede recuperar.' },
]
export const DIETARY_CONSENT_CHECK = (name: string) => `Tengo permiso de ${name} (o soy su madre, padre o tutor legal) para guardar estos datos de salud.`
export const DIETARY_CONSENT_GIVE = 'Dar el consentimiento'
export const DIETARY_CONSENT_ASK = 'Dar el consentimiento…'
export const DIETARY_CONSENT_CANCEL = 'Ahora no'

export const DIETARY_REVOKE_ASK = 'Retirar el consentimiento…'
export const DIETARY_REVOKE_TITLE = 'Retirar el consentimiento'
export const DIETARY_REVOKE_TEXT = (name: string, count: number) =>
  `Si lo retiras, se BORRARÁN de forma definitiva todas las alergias, intolerancias y restricciones anotadas de ${name}` +
  (count > 0 ? ` (${count === 1 ? '1 anotada' : `${count} anotadas`})` : '') +
  '. No se pueden recuperar.'
export const DIETARY_REVOKE_CONFIRM = 'Retirar y borrar los datos'
export const DIETARY_REVOKE_CANCEL = 'No, conservar'

// ─── Formulario ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const DIETARY_ADD_LABEL = '+ Añadir una alergia o intolerancia'
export const DIETARY_CHOICE_LABEL = '¿Qué es?'
export const DIETARY_CHOICE_PLACEHOLDER = 'Elige de la lista…'
export const DIETARY_CHOICE_CUSTOM = 'Otra (escribir)'
export const DIETARY_CHOICE_CUSTOM_VALUE = '__custom'
export const DIETARY_GROUP_UE = 'Alérgenos de declaración obligatoria en la UE'
export const DIETARY_GROUP_OTHER = 'Intolerancias y otros'
export const DIETARY_CUSTOM_LABEL = 'Escríbelo con tus palabras'
export const DIETARY_CUSTOM_HELP = 'Máximo 60 letras. Si PEPA lo reconoce, te propondrá la opción de la lista.'
export const DIETARY_KIND_LEGEND = 'Tipo'
export const DIETARY_KIND_UI_LABELS: Record<DietaryKind, string> = { alergia: 'Alergia', intolerancia: 'Intolerancia', restriccion: 'Otra restricción' }
export const DIETARY_KIND_HELP: Record<DietaryKind, string> = {
  alergia: 'Reacción del sistema inmune, a veces grave. Por ejemplo: alergia a la proteína de la leche.',
  intolerancia: 'Molestias digestivas, sin reacción alérgica. Por ejemplo: intolerancia a la lactosa.',
  restriccion: 'Algo que se evita por otro motivo (médico, religioso o personal).',
}
export const DIETARY_KIND_GENERAL_HELP = 'Alergia e intolerancia no son lo mismo: elige bien el tipo, porque PEPA avisa distinto.'
export const DIETARY_SEVERITY_LABEL = 'Gravedad (opcional)'
export const DIETARY_SEVERITY_NONE = 'Sin indicar'
export const DIETARY_NOTE_LABEL = 'Nota (opcional)'
export const DIETARY_NOTE_HELP = 'Solo para que la recuerdes, por ejemplo «tolera el huevo cocido». PEPA no la usa para avisar.'
export const DIETARY_SAVE = 'Guardar'
export const DIETARY_SAVING = 'Guardando…'
export const DIETARY_CANCEL = 'Cancelar'
export const DIETARY_EDIT = 'Editar'
export const DIETARY_REMOVE = 'Quitar'
export const DIETARY_USE_SUGGESTION = (label: string) => `Usar «${label}» de la lista`

export const DIETARY_DRAFT_ERRORS: Record<string, string> = {
  none: 'Elige qué es de la lista o escríbelo.',
  both: 'Elige de la lista o escríbelo, pero no las dos cosas.',
  key: 'Esa opción no está en la lista.',
  kind: 'Elige el tipo.',
  kind_not_allowed: 'Ese tipo no se puede usar con lo que has elegido. Cámbialo.',
  label: 'Ha quedado muy largo (máximo 60 letras).',
  note: 'La nota es demasiado larga (máximo 200 letras).',
  severity: 'La gravedad no es válida.',
}

// Ayuda extra al elegir una opción que suele confundirse (alergia a la leche frente a lactosa, gluten…).
const CHOICE_HINTS: Partial<Record<DietaryAllergenKey, string>> = {
  leche: '«Leche» aquí es la alergia a las proteínas de la leche. Si solo te sienta mal la lactosa, elige «Lactosa (intolerancia)».',
  lactosa: 'La intolerancia a la lactosa no es una alergia a la leche: son cosas distintas.',
  gluten: 'Sirve para la celiaquía o la alergia al gluten. Si es solo sensibilidad sin celiaquía, elige «Gluten (sensibilidad no celíaca)».',
  gluten_no_celiaco: 'Es una sensibilidad sin celiaquía ni alergia. Si hay celiaquía o alergia, elige «Cereales con gluten».',
  trigo: 'Alergia al trigo. Si hay celiaquía, elige «Cereales con gluten».',
  frutos_de_cascara: 'Incluye todos los frutos de cáscara. Si solo es uno (por ejemplo la almendra), elige ese.',
}
export function dietaryChoiceHint(key: string): string | null {
  return (CHOICE_HINTS as Record<string, string | undefined>)[key] ?? null
}

// ─── Avisos en recetas (sin nombres de personas) ────────────────────────────────────────────────────────────────────────────────────────────────
export const WARN_REGION_LABEL = 'Aviso de alergias e intolerancias'
export const WARN_TITLE_FINDINGS = 'Revisa antes de cocinar'
export const WARN_TITLE_NO_DATA = 'No se puede comprobar'
export const WARN_TITLE_NO_MATCH = 'Alergias e intolerancias'
export const WARN_WHO = 'Alguien de tu familia tiene registrada una restricción relacionada con esto.'
export const WARN_LEVEL_LABELS = { conflicto: 'Conflicto', revisar: 'Conviene revisar', sin_datos: 'Sin datos suficientes' } as const
export const WARN_LOAD_ERROR = 'Ahora no se han podido comprobar las alergias e intolerancias de tu familia.'
