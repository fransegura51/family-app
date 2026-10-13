// «¿Qué cocino hoy?» en La cocina de Pepa: la pestaña existe, está en el menú y en el Inicio, y se conecta con la IA, con la voz y con el guardado de recetas.
import { describe, expect, it } from 'vitest'
import { ALIMENTACION_MENU_ITEM_META, loadAlimentacionMenuLayout } from '@/state/alimentacionMenu'
import screen from '@/ui/AlimentacionScreen.tsx?raw'
import tab from '@/ui/CocinarTab.tsx?raw'
import sheet from '@/ui/RecipeDraftSheet.tsx?raw'
import voiceCapture from '@/ui/VoiceCapture.tsx?raw'
import whatToCook from '@/services/whatToCook.ts?raw'
import edge from '../../supabase/functions/what-to-cook/index.ts?raw'

describe('La cocina de Pepa → ¿Qué cocino hoy?', () => {
  it('es una pestaña fija del menú con su nombre', () => {
    expect(ALIMENTACION_MENU_ITEM_META.Cocinar).toEqual({ icon: '🥘', label: '¿Qué cocino hoy?' })
  })

  it('aparece también en los menús que cada móvil ya tenía guardados', () => {
    const store: Record<string, string> = { 'familyapp:alimentacion-menu-layout': JSON.stringify([{ id: 'default', name: null, items: [{ key: 'Inicio' }, { key: 'Menú' }, { key: 'Recetas' }] }]) }
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store[k] ?? null, setItem: () => undefined }, configurable: true })
    try {
      expect(loadAlimentacionMenuLayout()[0].items.map((i) => i.key)).toContain('Cocinar')
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true })
    }
  })

  it('la pantalla la muestra, y el Inicio de la sección tiene su acceso', () => {
    expect(screen).toContain("'Cocinar'")
    expect(screen).toContain("{tab === 'Cocinar' && <CocinarTab onOpenRecipes={() => setTab('Recetas')} />}")
    expect(screen).toContain("{ tab: 'Cocinar',")
  })

  it('primero busca gratis (tus recetas e internet) y la IA solo se pide con su botón', () => {
    expect(tab).toContain('findRecipesWithIngredients(')
    expect(tab).toContain('searchCookpadRecipes(')
    expect(tab).toContain('importRecipeFromUrl(')
    expect(tab).toContain('draftFromImportedRecipe(')
    // La IA solo se llama desde askAi, que solo cuelga del botón «Pedir ideas a la IA».
    expect(tab.match(/requestCookIdeas\(/g)).toHaveLength(1)
    expect(tab).toContain('onClick={() => void askAi()}')
    expect(tab).toContain('Pedir ideas a la IA')
  })

  it('la pestaña pide las ideas a la IA, se puede dictar y escuchar, y guarda con la tarjeta de siempre', () => {
    expect(tab).toContain('requestCookIdeas(')
    expect(tab).toContain('listenContinuous(')
    expect(tab).toContain('speakAsync(describeCookIdeas(')
    expect(tab).toContain('<RecipeDraftSheet')
    expect(tab).toContain('draft: idea.recipe')
  })

  it('la tarjeta de receta empieza ya con la receta si viene preparada, sin pedir otra a la IA', () => {
    expect(sheet).toContain("request.draft ? 'draft' : 'offer'")
    expect(sheet).toContain('useState<RecipeDraftData | null>(request.draft ?? null)')
  })

  it('«Hablar con PEPA» lleva a la pestaña cuando cuenta las ideas', () => {
    expect(voiceCapture).toContain("outcome.kind === 'cook-ideas'")
    expect(voiceCapture).toContain("navigate('/alimentacion?tab=Cocinar')")
  })

  it('la IA solo recibe los ingredientes, las raciones y las preferencias, por la función propia', () => {
    expect(whatToCook).toContain("callAiFunction('what-to-cook', {")
    expect(whatToCook).toContain('ingredients: request.ingredients,')
    expect(whatToCook).toContain('servings: request.servings,')
    expect(whatToCook).toContain('preferences: request.preferences,')
    expect(edge).toContain('serveAiPurpose(whatToCookSpec)')
  })
})
