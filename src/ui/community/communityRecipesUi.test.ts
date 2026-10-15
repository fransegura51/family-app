// Recetas de Comunidad (CMN-§5): estructura de las pantallas y reglas de consentimiento, importación y actualización. Se pintan los componentes puros con
// react-dom/server y se lee el código fuente de los que necesitan red.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import publishSheet from '@/ui/community/recipes/RecipePublishSheet.tsx?raw'
import importButton from '@/ui/community/recipes/RecipeImportButton.tsx?raw'
import updateBanner from '@/ui/community/recipes/RecipeUpdateBanner.tsx?raw'
import shareButton from '@/ui/community/recipes/ShareToCommunityButton.tsx?raw'
import ratingBox from '@/ui/community/recipes/RecipeRatingBox.tsx?raw'
import panel from '@/ui/community/recipes/RecipePanel.tsx?raw'
import fields from '@/ui/community/recipes/RecipeFields.tsx?raw'
import editorSrc from '@/ui/recipeEditor/RecipeEditorFields.tsx?raw'
import consent from '@/ui/community/recipes/RecipeConsentCheckbox.tsx?raw'
import similarHook from '@/ui/community/recipes/useSimilarRecipes.ts?raw'
import photoCopy from '@/ui/community/recipes/recipePhotoCopy.ts?raw'
import seedHook from '@/ui/community/useRecipeSeed.ts?raw'
import alimentacion from '@/ui/AlimentacionScreen.tsx?raw'
import food from '@/data/food.ts?raw'
import postDetail from '@/ui/community/PostDetailPage.tsx?raw'
import { diffRecipes } from '@/domain/communityRecipeDiff'
import { RECIPE_CONSENT_TEXT } from '@/domain/communityRecipeBridge'
import type { RecipeDraftInput } from '@/domain/community'

const { RecipeFields } = await import('@/ui/community/recipes/RecipeFields')
const { RecipeVersionCompare } = await import('@/ui/community/recipes/RecipeVersionCompare')
const { RecipeConsentCheckbox } = await import('@/ui/community/recipes/RecipeConsentCheckbox')
const { StarsText } = await import('@/ui/community/recipes/RecipeRatingBox')
const cache = await import('@/ui/community/recipes/recipeUpdateCache')

const noop = () => undefined
const draft: RecipeDraftInput = {
  servings: 4,
  ingredients: [
    { name: 'Patatas', quantity: '500', unit: 'g' },
    { name: 'Huevos', quantity: '6', unit: 'unidades' },
  ],
  steps: '1. Pelar las patatas.\n2. Cuajar la tortilla.',
  tags: ['favoritos'],
}

describe('RecipeFields (campos de receta del editor, los mismos que los de la Cocina)', () => {
  const html = renderToStaticMarkup(createElement(RecipeFields, { value: draft, onChange: noop }))

  it('pinta raciones, etiquetas, ingredientes y pasos con sus datos y etiquetas accesibles', () => {
    expect(html).toContain('Raciones (opcional)')
    expect(html).toContain('value="4"')
    expect(html).toContain('value="Patatas"')
    expect(html).toContain('value="Huevos"')
    expect(html).toContain('aria-label="Ingrediente 1"')
    expect(html).toContain('aria-label="Cantidad del ingrediente 2"')
    expect(html).toContain('aria-label="Unidad del ingrediente 1"')
    expect(html).toContain('aria-label="Paso 2"')
    expect(html).toContain('Pelar las patatas.')
    expect(html).toContain('aria-label="Quitar el paso 1"')
    expect(html).toContain('aria-label="Subir el paso 2"')
    // La etiqueta propia aparece marcada para poder quitarla.
    expect(html).toContain('Quitar la etiqueta favoritos')
  })

  it('reutiliza las clases y los ayudantes de la Cocina (no es un editor nuevo)', () => {
    for (const cls of ['recipe-form', 'recipe-field', 'recipe-ing-row', 'recipe-step-row', 'recipe-row-remove']) expect(html).toContain(cls)
    // RecipeFields es solo un adaptador: pinta EL editor compartido con la Cocina y no trae sus propios campos (ver recipeEditorShared.test.tsx).
    expect(fields).toContain("from '@/ui/recipeEditor/RecipeEditorFields'")
    expect(fields).toContain('<RecipeEditorFields')
    expect(fields).not.toContain('<input')
    expect(fields).not.toContain('<textarea')
    expect(editorSrc).toContain("from '@/domain/recipeDraft'")
    expect(editorSrc).toContain('servingsTextInvalid')
  })

  it('desactivado: no se puede tocar nada', () => {
    const off = renderToStaticMarkup(createElement(RecipeFields, { value: draft, onChange: noop, disabled: true }))
    const controls = off.match(/<(input|textarea|button)\b[^>]*>/g) ?? []
    expect(controls.length).toBeGreaterThan(10)
    expect(controls.every((c) => /disabled=""/.test(c))).toBe(true)
  })

  it('sin ingredientes ni pasos deja filas en blanco para empezar', () => {
    const blank = renderToStaticMarkup(createElement(RecipeFields, { value: { servings: null, ingredients: [], steps: '', tags: [] }, onChange: noop }))
    expect((blank.match(/class="recipe-ing-row"/g) ?? []).length).toBe(3)
    expect((blank.match(/class="recipe-step-row"/g) ?? []).length).toBe(2)
  })
})

describe('comparación de versiones', () => {
  const before = { title: 'Pan', servings: 4, ingredients: [{ name: 'Harina', quantity: '500', unit: 'g' }, { name: 'Sal', quantity: '1', unit: 'pizca' }], steps: '1. Amasar\n2. Hornear', tags: [] }
  const after = { title: 'Pan', servings: 4, ingredients: [{ name: 'Harina', quantity: '750', unit: 'g' }, { name: 'Levadura', quantity: '10', unit: 'g' }], steps: '1. Amasar\n2. Hornear 40 minutos\n3. Enfriar', tags: [] }

  it('enseña ingredientes nuevos, quitados y cambiados, y pasos cambiados y nuevos, siempre con una palabra', () => {
    const html = renderToStaticMarkup(createElement(RecipeVersionCompare, { diff: diffRecipes(before, after) }))
    expect(html).toContain('Nuevo')
    expect(html).toContain('Quitado')
    expect(html).toContain('Cambiado')
    expect(html).toContain('Levadura')
    expect(html).toContain('750 g')
    expect(html).toContain('Hornear 40 minutos')
    expect(html).toContain('Enfriar')
  })

  it('sin diferencias lo dice con claridad', () => {
    const html = renderToStaticMarkup(createElement(RecipeVersionCompare, { diff: diffRecipes(before, before) }))
    expect(html).toContain('No hay diferencias')
  })

  it('el texto de la receta nunca se pinta como HTML', () => {
    const evil = { ...after, steps: '1. <script>alert(1)</script>' }
    const html = renderToStaticMarkup(createElement(RecipeVersionCompare, { diff: diffRecipes(before, evil) }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('consentimiento para publicar (CMN-§5.1)', () => {
  it('la casilla lleva el texto exacto y es obligatoria', () => {
    const html = renderToStaticMarkup(createElement(RecipeConsentCheckbox, { checked: false, onChange: noop }))
    expect(html).toContain('Entiendo que esta receta será pública, la podrá leer cualquier persona y no incluirá datos de mi familia')
    expect(html).toContain('required=""')
    expect(RECIPE_CONSENT_TEXT).toContain('no incluirá datos de mi familia')
    expect(consent).toContain('RECIPE_CONSENT_TEXT')
  })

  it('la hoja de publicar: consentimiento + tema + vista previa; publicar solo si canPublishRecipe; participación ANTES de crear', () => {
    expect(publishSheet).toContain('<RecipeConsentCheckbox')
    expect(publishSheet).toContain('canPublishRecipe({ consent, topicId: topicId || null, title, draft })')
    expect(publishSheet).toContain('Vista previa de lo que será público')
    expect(publishSheet.indexOf('requireParticipation()')).toBeGreaterThan(-1)
    expect(publishSheet.indexOf('requireParticipation()')).toBeLessThan(publishSheet.indexOf('await createPost('))
    // La función de publicar sale sin hacer nada si no se cumplen las reglas (casilla incluida).
    expect(publishSheet).toContain('if (!canPublish || busy) return')
    // El consentimiento empieza SIN marcar: nunca se publica nada solo.
    expect(publishSheet).toContain('useState(false)')
    expect(publishSheet).toMatch(/const \[consent, setConsent\] = useState\(false\)/)
  })

  it('crea la publicación como receta de la sección Recetas con la copia pública (sin ids de la familia)', () => {
    const call = publishSheet.slice(publishSheet.indexOf('await createPost('), publishSheet.indexOf('rememberShared('))
    expect(call).toContain("kind: 'receta'")
    expect(call).toContain("section: 'recetas'")
    expect(call).toContain('recipe: clean')
    for (const secret of ['recipe.id', 'familyId', 'family_id', 'privateId']) expect(call).not.toContain(secret)
  })

  it('la foto se copia (bajar por enlace firmado, quitar datos ocultos y subir a Comunidad) solo si se elige, y se retira si falla la publicación', () => {
    expect(publishSheet).toContain('includePhoto && recipe.imagePath')
    expect(publishSheet).toContain('copyPrivatePhotoToCommunity(')
    expect(publishSheet).toContain('removeCommunityPhoto(uploaded)')
    expect(photoCopy).toContain('getRecipePhotoUrl(imagePath)')
    expect(photoCopy).toContain('prepareCommunityPhoto(blob)')
    expect(photoCopy).toContain('uploadCommunityPhoto(profileId, prepared)')
  })

  it('no hay publicación automática: createPost solo se llama desde la hoja, al pulsar «Publicar»', () => {
    for (const src of [alimentacion, importButton, updateBanner, panel, seedHook, fields]) expect(src).not.toContain('createPost(')
    expect(publishSheet.match(/createPost\(/g)?.length).toBe(1)
    expect(publishSheet).toContain('onClick={publish}')
  })
})

describe('publicaciones parecidas antes de publicar (§4)', () => {
  it('pide similarPosts(título, receta, recetas) con pausa de 600 ms, al menos 4 letras y una sola petición por cambio de título', () => {
    expect(similarHook).toContain("similarPosts(clean, 'receta', 'recetas')")
    expect(similarHook).toContain('SIMILAR_DELAY_MS = 600')
    expect(similarHook).toContain('SIMILAR_MIN_LETTERS = 4')
    expect(similarHook).toContain('SIMILAR_MAX = 3')
    expect(similarHook.match(/similarPosts\(/g)?.length).toBe(1)
    // Al cambiar el título se anula la espera y se descarta la respuesta anterior.
    expect(similarHook).toContain('window.clearTimeout(t)')
    expect(similarHook).toContain('if (cancelled) return')
    expect(similarHook).toContain('[clean, eligible]')
    expect(similarHook).not.toMatch(/setInterval/)
  })

  it('la hoja las enseña bajo el título como «¿Es lo mismo que…?», con enlaces que abren otra pestaña, y no condicionan «Publicar»', () => {
    expect(publishSheet).toContain('useSimilarRecipes(title, !closed && !publishedId)')
    expect(publishSheet).toContain('¿Es lo mismo que…?')
    expect(publishSheet).toContain('<Link to={paths.post(p.id)} target="_blank" rel="noopener noreferrer">')
    // Se ven antes que la vista previa y el editor.
    expect(publishSheet.indexOf('community-similar')).toBeLessThan(publishSheet.indexOf('{editing ? ('))
    // Las sugerencias no entran en la regla de publicar.
    const rule = publishSheet.slice(publishSheet.indexOf('const canPublish ='), publishSheet.indexOf('async function publish'))
    expect(rule).not.toContain('similar')
    const publishFn = publishSheet.slice(publishSheet.indexOf('async function publish'), publishSheet.indexOf('return (\n    <div className="modal-overlay"'))
    expect(publishFn).not.toContain('similar')
  })
})

describe('importar a mi Cocina (CMN-§5.2)', () => {
  it('usa createRecipe de la Cocina y registra la importación con el id de la copia', () => {
    expect(importButton).toContain('createRecipe(publicRecipeToKitchenInput(')
    expect(importButton).toContain('recordRecipeImport(publicRecipe.id, id)')
    expect(importButton).toContain('Guardar en mi Cocina')
  })

  it('createRecipe ahora devuelve el id de la receta creada (y quien no lo usa lo ignora)', () => {
    expect(food).toMatch(/\}\): Promise<string> \{\n  const familyId = await currentFamilyId\(\)/)
    expect(food).toContain('return recipe.id as string')
  })

  it('avisa si la familia ya la importó (importedByMyFamily) y pide confirmar antes de otra copia', () => {
    expect(importButton).toContain('recipe.importedByMyFamily')
    expect(importButton).toContain('Tu familia ya guardó esta receta en su Cocina')
    expect(importButton).toContain('Guardar otra copia')
  })

  it('no obliga a elegir alias (guardar en tu Cocina no es participar) y no toca recetas privadas de nadie', () => {
    expect(importButton).not.toContain('requireParticipation')
    expect(importButton).not.toContain('getRecipeById')
  })

  it('si falla anotar la importación no se duplica la receta al reintentar', () => {
    expect(importButton).toContain("setPhase('record-failed')")
    expect(importButton).toContain('if (!id) {')
  })

  it('el botón está en la ficha de la receta pública, junto a la valoración', () => {
    expect(panel).toContain('<RecipeImportButton detail={detail}')
    expect(panel).toContain('<RecipeRatingBox')
    expect(panel).toContain('<RecipeReviewsList')
    expect(postDetail).toContain('<RecipePanel detail={detail} onChanged={reload} />')
  })
})

describe('actualización voluntaria (CMN-§5.3)', () => {
  it('avisa «Hay una versión nueva», compara y ofrece actualizar o dejarla', () => {
    expect(updateBanner).toContain('Hay una versión nueva de esta receta en Comunidad')
    expect(updateBanner).toContain('<RecipeVersionCompare')
    expect(updateBanner).toContain('Actualizar mi copia')
    expect(updateBanner).toContain('Dejarla como está')
  })

  it('actualizar usa updateRecipe de la Cocina y después anota con markRecipeUpdated; nunca se actualiza sola', () => {
    expect(updateBanner).toContain('updateRecipe(recipeId, recipeUpdateToKitchenInput(')
    expect(updateBanner).toContain('markRecipeUpdated(recipeId)')
    // updateRecipe solo se llama dentro de apply() (botón), no en el efecto de carga.
    const effect = updateBanner.slice(updateBanner.indexOf('useEffect('), updateBanner.indexOf('const info ='))
    expect(effect).not.toContain('updateRecipe')
    expect(updateBanner.match(/updateRecipe\(/g)?.length).toBe(1)
  })

  it('se consulta de forma perezosa y sin repetir: una vez por receta y sesión, y lo «no importado» se recuerda', () => {
    expect(updateBanner.match(/getRecipeUpdate\(/g)?.length).toBe(1)
    expect(updateBanner).toContain('sessionLookups')
    expect(updateBanner).toContain('isKnownNotImported(')
    expect(updateBanner).toContain('rememberNotImported(')
    expect(updateBanner).not.toMatch(/setInterval|setTimeout/)
  })

  it('se monta en la ficha de la receta de la Cocina y la hoja de publicar se carga solo al pulsar', () => {
    expect(alimentacion).toContain('<RecipeUpdateBanner')
    expect(alimentacion).toContain('<ShareToCommunityButton')
    expect(shareButton).toContain('🌍 Compartir en Comunidad')
    expect(alimentacion).toContain("lazy(() => import('@/ui/community/recipes/RecipePublishSheet')")
    expect(alimentacion).toContain('<RecipePublishHost recipe={sharing}')
  })

  it('no cambia el comportamiento de guardado de la Cocina: createRecipe(input) sigue una sola vez', () => {
    expect(alimentacion.match(/createRecipe\(input\)/g)?.length).toBe(1)
    expect(alimentacion.match(/updateRecipe\(recipe\.id, input\)/g)?.length).toBe(1)
  })

  it('la semilla del editor solo lee una receta y solo si la ruta trae ?receta=', () => {
    expect(seedHook).toContain("params.get('receta')")
    expect(seedHook).toContain('getRecipeById(privateId)')
    expect(seedHook).toContain('if (!privateId) return')
    expect(seedHook).toContain('needsConsent: true')
  })
})

describe('valoración y reseñas (CMN-§5.4)', () => {
  it('pide participar antes de valorar y usa rateRecipe', () => {
    expect(ratingBox.indexOf('requireParticipation()')).toBeGreaterThan(-1)
    expect(ratingBox.indexOf('requireParticipation()')).toBeLessThan(ratingBox.indexOf('await rateRecipe('))
  })

  it('estrellas de 1 a 5 accesibles (grupo de opciones, 44 px) y reseña opcional de máximo 1000 letras', () => {
    expect(ratingBox).toContain('role="radiogroup"')
    expect(ratingBox).toContain('role="radio"')
    expect(ratingBox).toContain('REVIEW_MAX = 1000')
    expect(ratingBox).toContain('Tu reseña (opcional)')
  })

  it('las reseñas se piden solo al pulsar, de 20 en 20, con alias y capa neutra para bloqueados', () => {
    expect(ratingBox).toContain('Ver reseñas')
    expect(ratingBox).toContain('const PAGE = 20')
    expect(ratingBox).toContain('Contenido de usuario bloqueado por ti')
    expect(ratingBox).not.toContain('useEffect')
  })

  it('precarga estrellas Y reseña propia, y ya no avisa de que se sustituye la reseña', () => {
    expect(ratingBox).toContain('useState<number>(summary.myRating ?? 0)')
    expect(ratingBox).toContain("useState(summary.myReview ?? '')")
    expect(ratingBox).not.toContain('se sustituye tu reseña')
    // Cancelar devuelve estrellas y reseña a lo guardado.
    expect(ratingBox).toContain("setReview(summary.myReview ?? '')")
    // La ficha pasa la reseña propia que manda el servidor y, tras valorar, la nueva.
    expect(panel).toContain('myReview: recipe.myReview ?? null')
    expect(ratingBox).toContain('myReview: review.trim() === ')
  })

  it('el autor de la receta (isMine) o quien no puede interactuar NO ve las estrellas ni el formulario', () => {
    expect(panel).toContain('const canRate = detail.canInteract && !detail.isMine')
    expect(panel).toContain('canRate={canRate}')
    // Las estrellas solo se pintan dentro de «canRate && editing».
    const starsAt = ratingBox.indexOf('role="radiogroup"')
    expect(ratingBox.lastIndexOf('{canRate && editing && (', starsAt)).toBeGreaterThan(-1)
    expect(ratingBox.lastIndexOf('{canRate && editing && (', starsAt)).toBeLessThan(starsAt)
  })

  it('las estrellas de solo lectura dicen el valor en palabras', () => {
    const html = renderToStaticMarkup(createElement(StarsText, { value: 4 }))
    expect(html).toContain('aria-label="4 de 5 estrellas"')
    expect(html).toContain('★★★★☆')
  })

  it('la ficha muestra versión, fecha, raciones con escalado, familias que la guardaron y autor por alias', () => {
    expect(panel).toContain('Versión {recipe.version} · Actualizada el')
    expect(panel).toContain('scaleIngredientQuantity(')
    expect(panel).toContain('familias la han guardado')
    expect(panel).toContain('detail.authorAlias')
    expect(panel).toContain('detail.importCount')
  })
})

describe('seguridad y coste', () => {
  const all = { publishSheet, importButton, updateBanner, ratingBox, panel, fields, consent, photoCopy, seedHook }
  it('nunca se inserta HTML', () => {
    for (const [name, src] of Object.entries(all)) expect(src, name).not.toContain('dangerouslySetInnerHTML')
  })

  it('ninguna pantalla hace consultas periódicas', () => {
    for (const [name, src] of Object.entries(all)) expect(src, name).not.toMatch(/setInterval|refetchInterval/)
  })
})

describe('memoria de recetas no importadas (ahorra consultas)', () => {
  const makeStore = () => {
    const data = new Map<string, string>()
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) }
  }

  it('recuerda y olvida', () => {
    const s = makeStore()
    expect(cache.isKnownNotImported(s, 'r1')).toBe(false)
    cache.rememberNotImported(s, 'r1')
    expect(cache.isKnownNotImported(s, 'r1')).toBe(true)
    expect(cache.isKnownNotImported(s, 'r2')).toBe(false)
    cache.forgetNotImported(s, 'r1')
    expect(cache.isKnownNotImported(s, 'r1')).toBe(false)
  })

  it('si el almacenamiento falla o no existe, no rompe nada', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(cache.isKnownNotImported(broken, 'r1')).toBe(false)
    expect(() => cache.rememberNotImported(broken, 'r1')).not.toThrow()
    expect(() => cache.forgetNotImported(broken, 'r1')).not.toThrow()
    expect(cache.isKnownNotImported(null, 'r1')).toBe(false)
    expect(cache.sharedPostFor(null, 'r1')).toBeNull()
  })

  it('recuerda qué receta ya se compartió desde este dispositivo', () => {
    const s = makeStore()
    cache.rememberShared(s, 'r1', 'post-9')
    expect(cache.sharedPostFor(s, 'r1')).toBe('post-9')
    expect(cache.sharedPostFor(s, 'r2')).toBeNull()
  })
})
