// Punto 3.1 (prompt de correcciones) — "Por categoría" mostraba prácticamente una partida distinta por
// categoría, porque el agrupador usaba el nombre propio de la partida (p. ej. "Ramo de Jennifer"), que por
// construcción es único. Esta es la categoría REAL y compartida (p. ej. "Flores y decoración"), separada
// del nombre/concepto de la partida: PEPA la sugiere sola a partir del concepto, la familia puede
// corregirla sin que vuelva a sobrescribirse sola (ver CategoryInputWithSuggestions en EventosScreen.tsx),
// y nunca depende de budget_categories (el catálogo de Economía, con el problema de sembrado duplicado ya
// conocido — ver memoria "Duplicate category seeding") ni obliga a configurar nada de antemano.
interface BudgetCategoryGroupRule {
  group: string
  keywords: string[]
}

const CATALOG: BudgetCategoryGroupRule[] = [
  { group: 'Flores y decoración', keywords: ['ramo', 'flor', 'decoracion', 'decoración', 'prendido', 'corsage', 'tocado'] },
  { group: 'Vestuario', keywords: ['vestido', 'traje', 'vestuario', 'complemento', 'zapato', 'corbata', 'gemelo'] },
  { group: 'Peluquería y maquillaje', keywords: ['peluqueria', 'peluquería', 'maquillaje'] },
  { group: 'Alianzas y joyería', keywords: ['alianza', 'joyer'] },
  { group: 'Animación', keywords: ['animacion', 'animación', 'monitor', 'juego'] },
  { group: 'Música', keywords: ['musica', 'música', ' dj', 'banda', 'orquesta'] },
  { group: 'Fotografía y vídeo', keywords: ['foto', 'video', 'vídeo', 'reportaje'] },
  { group: 'Comida y bebida', keywords: ['catering', 'comida', 'bebida', 'tarta', 'pastel', 'menu', 'menú', 'bebida'] },
  { group: 'Transporte', keywords: ['transporte', 'coche', 'autobus', 'autobús'] },
  { group: 'Invitaciones y papelería', keywords: ['invitacion', 'invitación', 'papeleria', 'papelería'] },
]

// Nunca inventa una categoría que el texto no sugiere: sin coincidencia, "Otros" (igual de simple que no
// rellenar nada, pero evita dejar la agrupación vacía por defecto en cada partida nueva).
export function suggestBudgetCategoryGroup(category: string): string {
  const normalized = ` ${category.toLowerCase()} `
  for (const rule of CATALOG) {
    if (rule.keywords.some((k) => normalized.includes(k))) return rule.group
  }
  return 'Otros'
}
