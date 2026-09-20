// Respaldo con IA para separar una lista de la compra dictada de un tirón,
// sin comas ni pausas de por medio — ver
// supabase/functions/_shared/ai/purposes/splitGroceryList.ts para el porqué.
// Solo se llama cuando el troceo local por comas/"y" ya ha dejado un solo
// trozo. Los nombres de la familia viajan como alias.
import { callAiFunction, loadAliasMap } from '@/services/aiClient'

export async function splitGroceryListWithAi(text: string): Promise<string[]> {
  const alias = await loadAliasMap()
  const json = (await callAiFunction('split-grocery-list', { text: alias.aliasize(text) })) as { items?: unknown }
  const items = Array.isArray(json.items) ? json.items.filter((i): i is string => typeof i === 'string' && i.trim() !== '') : []
  return items.length > 0 ? items.map((i) => alias.restore(i)) : [text]
}
