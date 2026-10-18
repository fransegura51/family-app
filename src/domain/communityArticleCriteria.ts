// Criterio editorial PERMANENTE de los artículos oficiales de Comunidad (PEPA/Pepa). Se aplica a los borradores nuevos y a las plantillas; NO reescribe artículos antiguos.
// La revisión y la aprobación humanas siguen siendo obligatorias antes de publicar: esto solo avisa (nunca bloquea ni publica nada).
export const ARTICLE_CRITERIA: readonly string[] = [
  'Introducción breve, atractiva y natural, con la voz cercana de Pepa.',
  'Contenido realmente útil: trucos, variantes, explicaciones, alternativas y consejos concretos (cantidades, pasos, ejemplos).',
  'Sin introducciones largas, obviedades ni relleno.',
  'Si el artículo lleva recetas importables, se desarrollan UNA sola vez, dentro de sus fichas. En el texto, solo una introducción y por qué son interesantes: sin repetir ingredientes ni pasos.',
  'No llamar «recetas de aprovechamiento» a platos que se preparan desde cero; distinguir las que parten de algo ya cocinado de las que se cocinan desde el principio.',
  'Conservar la información práctica y las advertencias de seguridad alimentaria.',
  'Cómodo de leer en el móvil: evitar artículos innecesariamente largos.',
]

export const ARTICLE_INTRO_MAX_CHARS = 420
export const ARTICLE_MAX_CHARS = 5000

export interface ArticleCriteriaInput {
  body: string
  // El artículo lleva fichas de recetas importables (el texto no debe repetirlas).
  hasRecipeCards?: boolean
}

// Avisos para quien redacta o revisa el borrador (lista vacía = nada que señalar). Son comprobaciones sencillas y conservadoras: no sustituyen a la lectura humana.
export function checkArticleCriteria({ body, hasRecipeCards = false }: ArticleCriteriaInput): string[] {
  const text = body.replace(/\r\n/g, '\n').trim()
  const warnings: string[] = []
  if (text === '') return warnings
  const firstParagraph = text.split(/\n\s*\n/)[0] ?? ''
  if (firstParagraph.length > ARTICLE_INTRO_MAX_CHARS) warnings.push(`La introducción tiene ${firstParagraph.length} letras: mejor breve (hasta unas ${ARTICLE_INTRO_MAX_CHARS}) y al grano.`)
  if (text.length > ARTICLE_MAX_CHARS) warnings.push(`El artículo tiene ${text.length} letras: es largo para leerlo en el móvil (conviene no pasar de ${ARTICLE_MAX_CHARS}).`)
  if (hasRecipeCards) {
    const numbered = text.split('\n').filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length
    if (numbered >= 3) warnings.push('Hay recetas o pasos numerados en el texto y el artículo ya lleva fichas de recetas: desarróllalas solo en las fichas y deja aquí una introducción.')
  }
  if (/recetas? de aprovechamiento/i.test(text)) warnings.push('Se habla de «recetas de aprovechamiento»: usa esa expresión solo para platos que de verdad aprovechan sobras o restos.')
  return warnings
}
