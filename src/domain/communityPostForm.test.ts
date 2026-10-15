// Lógica pura del formulario de publicaciones y borradores de Comunidad: qué se puede elegir, cambios sin guardar, validación y caducidad.
import { describe, expect, it } from 'vitest'
import { DRAFT_DAYS, MAX_BODY, MAX_POST_PHOTOS, MAX_TITLE, type CommunityTopic } from '@/domain/community'
import {
  DRAFT_EXPIRY_WARNING,
  charCounter,
  daysLeftText,
  draftDaysLeft,
  draftToForm,
  emptyForm,
  emptyRecipe,
  externalLinkHosts,
  hasErrors,
  initialFormFromQuery,
  isDraftExpired,
  isFormBlank,
  isFormDirty,
  isSectionAllowed,
  recipeForServer,
  sortDraftsBySavedDesc,
  topicsForSection,
  unsavedPhotos,
  validateForDraft,
  validateForPublish,
  withKind,
  withSection,
  type PostForm,
} from '@/domain/communityPostForm'

const topics: CommunityTopic[] = [
  { id: 'cocina-basica', section: 'recetas', label: 'Cocina básica' },
  { id: 'postres', section: 'recetas', label: 'Postres' },
  { id: 'ahorro', section: 'hogar', label: 'Ahorro' },
]

function valid(over: Partial<PostForm> = {}): PostForm {
  return { ...emptyForm('pregunta', 'hogar'), topicId: 'ahorro', title: '¿Cómo ahorrar en luz?', body: 'Cuento mi caso…', ...over }
}

describe('tipos y secciones', () => {
  it('una Receta solo puede ir en «Recetas y cocina»; los demás tipos, en cualquiera', () => {
    expect(isSectionAllowed('receta', 'recetas')).toBe(true)
    expect(isSectionAllowed('receta', 'hogar')).toBe(false)
    for (const k of ['pregunta', 'consejo', 'anecdota'] as const) {
      expect(isSectionAllowed(k, 'recetas')).toBe(true)
      expect(isSectionAllowed(k, 'hogar')).toBe(true)
    }
  })

  it('el formulario parte de lo que llega en la dirección y ignora valores raros', () => {
    const f = initialFormFromQuery({ tipo: 'consejo', seccion: 'hogar', titulo: '  Truco  ' })
    expect(f).toMatchObject({ kind: 'consejo', section: 'hogar', title: 'Truco', topicId: null })
    expect(initialFormFromQuery({ tipo: 'hackeo', seccion: 'nada' })).toMatchObject({ kind: 'pregunta', section: null })
    // Una receta fuerza la sección de cocina y trae una receta vacía lista para rellenar.
    const r = initialFormFromQuery({ tipo: 'receta', seccion: 'hogar' })
    expect(r.section).toBe('recetas')
    expect(r.recipe).toEqual(emptyRecipe())
    // El título precompletado no pasa del máximo.
    expect(initialFormFromQuery({ titulo: 'a'.repeat(300) }).title).toHaveLength(MAX_TITLE)
  })

  it('cambiar a Receta fuerza la sección y borra el tema si era de otra; cambiar de sección borra el tema', () => {
    const f = withKind(valid(), 'receta')
    expect(f.section).toBe('recetas')
    expect(f.topicId).toBeNull()
    expect(f.recipe).toEqual(emptyRecipe())
    // Con la misma sección el tema se conserva.
    const same = withKind({ ...valid({ section: 'recetas', topicId: 'postres' }) }, 'consejo')
    expect(same.topicId).toBe('postres')
    expect(withSection(valid(), 'recetas').topicId).toBeNull()
    // Una receta no se puede mover a Hogar.
    expect(withSection(withKind(valid(), 'receta'), 'hogar').section).toBe('recetas')
  })

  it('volver a Receta tras cambiar de tipo por error conserva la receta ya escrita', () => {
    const withRecipe = { ...withKind(valid(), 'receta'), recipe: { servings: 4, ingredients: [{ name: 'Arroz', quantity: '1', unit: 'kg' }], steps: 'Hervir', tags: [] } }
    const back = withKind(withKind(withRecipe, 'consejo'), 'receta')
    expect(back.recipe?.ingredients[0].name).toBe('Arroz')
  })

  it('solo se ofrecen los temas de la sección elegida', () => {
    expect(topicsForSection(topics, 'recetas').map((t) => t.id)).toEqual(['cocina-basica', 'postres'])
    expect(topicsForSection(topics, 'hogar').map((t) => t.id)).toEqual(['ahorro'])
    expect(topicsForSection(topics, null)).toEqual([])
  })
})

describe('cambios sin guardar', () => {
  it('sin tocar nada no hay cambios; escribir, elegir o subir una foto sí los son', () => {
    const base = valid()
    expect(isFormDirty(base, base)).toBe(false)
    expect(isFormDirty({ ...base, title: base.title + '!' }, base)).toBe(true)
    expect(isFormDirty({ ...base, topicId: null }, base)).toBe(true)
    expect(isFormDirty({ ...base, photos: ['p/1.jpg'] }, base)).toBe(true)
  })

  it('los espacios sobrantes al principio o al final no cuentan como cambio', () => {
    const base = valid()
    expect(isFormDirty({ ...base, title: `  ${base.title}  `, body: `${base.body}\n\n` }, base)).toBe(false)
  })

  it('la receta solo cuenta si el tipo es Receta', () => {
    const base = valid()
    expect(isFormDirty({ ...base, recipe: { ...emptyRecipe(), steps: 'x' } }, base)).toBe(false)
    const recipeForm = withKind(base, 'receta')
    expect(isFormDirty({ ...recipeForm, recipe: { ...emptyRecipe(), steps: 'x' } }, recipeForm)).toBe(true)
  })

  it('un formulario vacío (o solo con el tipo elegido) está en blanco', () => {
    expect(isFormBlank(emptyForm())).toBe(true)
    expect(isFormBlank(withKind(emptyForm(), 'receta'))).toBe(true)
    expect(isFormBlank({ ...emptyForm(), title: 'Hola' })).toBe(false)
    expect(isFormBlank({ ...emptyForm(), photos: ['a.jpg'] })).toBe(false)
    const r = withKind(emptyForm(), 'receta')
    expect(isFormBlank({ ...r, recipe: { ...emptyRecipe(), ingredients: [{ name: 'Sal', quantity: '', unit: '' }] } })).toBe(false)
  })

  it('las fotos recién subidas (no guardadas en el servidor) se distinguen de las guardadas', () => {
    expect(unsavedPhotos(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual(['b'])
  })
})

describe('validación para publicar', () => {
  it('una publicación completa no tiene errores', () => {
    expect(hasErrors(validateForPublish(valid(), topics))).toBe(false)
  })

  it('exige tema, título y texto; en una Receta el texto es opcional pero hace falta un ingrediente', () => {
    const e = validateForPublish(valid({ topicId: null, title: ' ', body: '' }), topics)
    expect(e.topic).toBeTruthy()
    expect(e.title).toBeTruthy()
    expect(e.body).toBeTruthy()
    const recipe = { ...withKind(valid(), 'receta'), topicId: 'postres', body: '' }
    const noIngredients = validateForPublish(recipe, topics)
    expect(noIngredients.body).toBeUndefined()
    expect(noIngredients.recipe).toBeTruthy()
    const ok = validateForPublish({ ...recipe, recipe: { ...emptyRecipe(), ingredients: [{ name: 'Harina', quantity: '200', unit: 'g' }] } }, topics)
    expect(hasErrors(ok)).toBe(false)
  })

  it('el tema debe ser de la sección elegida', () => {
    expect(validateForPublish(valid({ topicId: 'postres' }), topics).topic).toBeTruthy()
  })

  it('exige la sección y respeta los límites de título, texto y fotos', () => {
    expect(validateForPublish(valid({ section: null }), topics).section).toBeTruthy()
    expect(validateForPublish(valid({ title: 'a'.repeat(MAX_TITLE + 1) }), topics).title).toBeTruthy()
    expect(validateForPublish(valid({ title: 'ab' }), topics).title).toBeTruthy()
    expect(validateForPublish(valid({ title: 'a'.repeat(MAX_TITLE) }), topics).title).toBeUndefined()
    expect(validateForPublish(valid({ body: 'x'.repeat(MAX_BODY + 1) }), topics).body).toBeTruthy()
    expect(validateForPublish(valid({ body: 'x'.repeat(MAX_BODY) }), topics).body).toBeUndefined()
    expect(validateForPublish(valid({ photos: Array.from({ length: MAX_POST_PHOTOS + 1 }, (_, i) => `${i}.jpg`) }), topics).photos).toBeTruthy()
    expect(validateForPublish(valid({ photos: Array.from({ length: MAX_POST_PHOTOS }, (_, i) => `${i}.jpg`) }), topics).photos).toBeUndefined()
  })

  it('una Receta fuera de «Recetas y cocina» no se puede publicar', () => {
    expect(validateForPublish({ ...withKind(valid(), 'receta'), section: 'hogar' }, topics).section).toBeTruthy()
  })
})

describe('validación para guardar borrador', () => {
  it('un borrador puede estar a medias, pero no vacío', () => {
    expect(validateForDraft(emptyForm())).toBeTruthy()
    expect(validateForDraft({ ...emptyForm(), title: 'Solo el título' })).toBeNull()
    expect(validateForDraft({ ...emptyForm(), photos: ['a.jpg'] })).toBeNull()
  })
  it('respeta los límites', () => {
    expect(validateForDraft({ ...emptyForm(), body: 'x'.repeat(MAX_BODY + 1) })).toBeTruthy()
  })
})

describe('receta hacia el servidor y desde un borrador', () => {
  it('solo viaja la receta si el tipo es Receta', () => {
    expect(recipeForServer(valid())).toBeNull()
    expect(recipeForServer(withKind(valid(), 'receta'))).toEqual(emptyRecipe())
  })

  it('un borrador se abre con TODOS sus datos', () => {
    const f = draftToForm({
      id: 'd1',
      kind: 'receta',
      title: 'Tarta',
      savedAt: '2026-10-01T10:00:00Z',
      daysLeft: 20,
      section: null,
      topicId: 'postres',
      body: 'Hola',
      photos: ['a.jpg', 'b.jpg'],
      recipe: { servings: 6, ingredients: [{ name: 'Huevos', quantity: '3', unit: '' }], steps: 'Batir', tags: ['dulce'] },
    })
    expect(f).toMatchObject({ kind: 'receta', section: 'recetas', topicId: 'postres', title: 'Tarta', body: 'Hola', photos: ['a.jpg', 'b.jpg'] })
    expect(f.recipe?.ingredients).toHaveLength(1)
  })
})

describe('caducidad de los borradores', () => {
  const saved = '2026-10-01T10:00:00Z'
  const at = (days: number, extraHours = 0) => new Date(new Date(saved).getTime() + days * 86400000 + extraHours * 3600000)

  it('el plazo son 30 días desde el último guardado manual', () => {
    expect(DRAFT_DAYS).toBe(30)
    expect(draftDaysLeft(saved, at(0))).toBe(30)
    expect(draftDaysLeft(saved, at(10))).toBe(20)
    expect(draftDaysLeft(saved, at(29, 1))).toBe(1)
    expect(draftDaysLeft(saved, at(30))).toBe(0)
    expect(draftDaysLeft(saved, at(45))).toBe(0)
  })

  it('pasados los 30 días está caducado', () => {
    expect(isDraftExpired(saved, at(29, 23))).toBe(false)
    expect(isDraftExpired(saved, at(30))).toBe(true)
    expect(isDraftExpired('basura', at(1))).toBe(true)
  })

  it('los días restantes se leen con frases claras', () => {
    expect(daysLeftText(12)).toBe('Quedan 12 días')
    expect(daysLeftText(1)).toBe('Queda 1 día')
    expect(daysLeftText(0)).toBe('Caduca hoy')
  })

  it('el aviso dice 30 días desde el último guardado y que el autoguardado no es permanente', () => {
    expect(DRAFT_EXPIRY_WARNING.kept).toContain('30 días')
    expect(DRAFT_EXPIRY_WARNING.kept).toContain('último guardado')
    expect(DRAFT_EXPIRY_WARNING.autosave).toContain('no es permanente')
  })

  it('«Mis borradores» va del último guardado al más antiguo', () => {
    const list = [{ savedAt: '2026-10-01T00:00:00Z' }, { savedAt: '2026-10-09T00:00:00Z' }, { savedAt: '2026-10-05T00:00:00Z' }]
    expect(sortDraftsBySavedDesc(list).map((d) => d.savedAt.slice(8, 10))).toEqual(['09', '05', '01'])
  })
})

describe('contador y enlaces', () => {
  it('el contador avisa al acercarse al límite y al pasarse', () => {
    expect(charCounter('hola', 100)).toMatchObject({ used: 4, left: 96, over: false })
    expect(charCounter('x'.repeat(101), 100)).toMatchObject({ over: true, left: -1 })
    expect(charCounter('x'.repeat(10), 100).nearLimit).toBe(false)
    expect(charCounter('x'.repeat(98), 100).nearLimit).toBe(true)
  })

  it('detecta los sitios a los que llevan los enlaces, sin repetir', () => {
    const body = 'Mira [esto](https://www.ejemplo.com/a) y https://ejemplo.com/b y **[otro](https://otra.es)**\n- https://otra.es/x'
    expect(externalLinkHosts(body).sort()).toEqual(['ejemplo.com', 'otra.es'])
    expect(externalLinkHosts('sin enlaces')).toEqual([])
    // Un enlace no permitido (javascript:, IP) no cuenta como enlace.
    expect(externalLinkHosts('[x](javascript:alert(1)) http://127.0.0.1/a')).toEqual([])
  })
})
