// Formato de lo que se comparte con el botón nativo "Compartir" (petición
// real: "el típico botón de compartir que se le abra el menú del teléfono
// para compartir por donde quiera", no un chat propio). Todo aquí es
// texto puro, sin tocar el navegador (Web Share API vive en
// services/share.ts) — así se puede probar con tests normales.

// Petición real: "compartir la lista de una tienda o de todas, que se
// pueda elegir en el momento de compartir" — texto plano legible en
// cualquier app de mensajería, agrupado igual que ya se ve en pantalla.
export function shoppingListText(
  groups: { store: string; items: { name: string; quantity: string | null; unit: string | null }[] }[],
): string {
  const parts = ['🛒 Lista de la compra']
  for (const g of groups) {
    if (g.items.length === 0) continue
    parts.push('', `— ${g.store} —`)
    for (const it of g.items) {
      const qty = [it.quantity, it.unit].filter(Boolean).join(' ')
      parts.push(`• ${it.name}${qty ? ` (${qty})` : ''}`)
    }
  }
  return parts.join('\n')
}

export function recipeText(recipe: {
  title: string
  ingredients: { name: string; quantity: string | null; unit: string | null }[]
  notes: string | null
}): string {
  const parts = [`🍽️ ${recipe.title}`]
  if (recipe.ingredients.length > 0) {
    parts.push('', 'Ingredientes:')
    for (const i of recipe.ingredients) {
      const qty = [i.quantity, i.unit].filter(Boolean).join(' ')
      parts.push(`• ${i.name}${qty ? ` — ${qty}` : ''}`)
    }
  }
  if (recipe.notes?.trim()) {
    parts.push('', 'Preparación:', recipe.notes.trim())
  }
  return parts.join('\n')
}
