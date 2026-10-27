import { DATA_NOTICE, dataBlock, sanitizeForPrompt } from '../_shared/communityAi.ts'

// Textos comunes de los prompts de community-editorial.

// Copia de ARTICLE_CRITERIA (src/domain/communityArticleCriteria.ts): las funciones de servidor no pueden importar de src/. Un test comprueba que siguen iguales.
export const ARTICLE_CRITERIA_TEXT: readonly string[] = [
  'Introducción breve, atractiva y natural, con la voz cercana de Pepa.',
  'Contenido realmente útil: trucos, variantes, explicaciones, alternativas y consejos concretos (cantidades, pasos, ejemplos).',
  'Sin introducciones largas, obviedades ni relleno.',
  'Si el artículo lleva recetas importables, se desarrollan UNA sola vez, dentro de sus fichas. En el texto, solo una introducción y por qué son interesantes: sin repetir ingredientes ni pasos.',
  'No llamar «recetas de aprovechamiento» a platos que se preparan desde cero; distinguir las que parten de algo ya cocinado de las que se cocinan desde el principio.',
  'Conservar la información práctica y las advertencias de seguridad alimentaria.',
  'Cómodo de leer en el móvil: evitar artículos innecesariamente largos.',
]

export const VOICE =
  'Eres Pepa, la voz cálida, cercana y práctica de Comunidad PEPA, una comunidad de familias en España. Escribes en español de España, claro y natural, sin tecnicismos. ' +
  'Tu texto es un BORRADOR: una persona lo revisará antes de publicarlo.'

export const FORBIDDEN_RULES =
  'Reglas para todo el texto: sin enlaces, sin HTML, sin direcciones de correo ni teléfonos; sin marcas comerciales ni nombres de personas; ' +
  'sin porcentajes, estadísticas, cifras de estudios ni afirmaciones del tipo «según un estudio»; no inventes datos; ' +
  'sin consejos médicos ni legales; la seguridad alimentaria, proporcionada y sin alarmismo.'

// Rodea un texto de personas como DATOS no confiables (los delimitadores no se pueden cerrar desde dentro).
export function untrusted(label: string, content: string, max: number): string {
  return dataBlock(label, sanitizeForPrompt(content, max))
}

export { DATA_NOTICE }

// Palabras que delatan una estadística o un estudio externo (el artículo es práctico y no puede citar datos que no tiene).
export function hasStatClaim(text: string): boolean {
  return /%|por ciento|\bestudios?\b|\bestad[ií]stic|\binvestigaci[oó]n|\bsondeos?\b|\bencuestas?\b|\b\d+\s+de\s+cada\s+\d+/i.test(text)
}

// Afirmaciones de validación nutricional que no podemos sostener.
export function hasNutritionClaim(text: string): boolean {
  return /nutricionalmente|validaci[oó]n nutricional|\bvalidad[oa]s?\b|\bdietista|\bnutricionista/i.test(text)
}

// Línea de agradecimiento a las familias que añade el servidor al crear el artículo.
export const THANKS_MARKER = '❤️ Este artículo nació de'

// Separa el cuerpo de la línea final de agradecimiento (si la hay): la IA nunca la ve ni la reescribe.
export function splitThanks(body: string): { text: string; thanks: string | null } {
  const idx = body.lastIndexOf(THANKS_MARKER)
  if (idx < 0 || (idx > 0 && body[idx - 1] !== '\n')) return { text: body, thanks: null }
  return { text: body.slice(0, idx).replace(/\s+$/, ''), thanks: body.slice(idx).trim() }
}
