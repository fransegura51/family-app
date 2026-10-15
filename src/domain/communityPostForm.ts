// Comunidad PEPA — lógica PURA del formulario de publicaciones y borradores (sin red, sin React): qué se puede elegir, cuándo hay cambios sin guardar, qué falta para
// publicar y cuánto le queda a un borrador. El servidor (migraciones 0265/0266) vuelve a comprobar y sanea todo; aquí solo se evitan errores tontos y se avisa con frases claras.
import {
  DRAFT_DAYS,
  MAX_BODY,
  MAX_POST_PHOTOS,
  MAX_TITLE,
  POST_KINDS,
  SECTIONS,
  type CommunitySection,
  type CommunityTopic,
  type Draft,
  type PostKind,
  type PublicRecipe,
  type RecipeDraftInput,
} from '@/domain/community'
import { parseRichText, type Inline } from '@/domain/communityRichText'

// El servidor exige al menos 3 letras en el título (community_create_post).
export const MIN_TITLE = 3

export interface PostForm {
  kind: PostKind
  section: CommunitySection | null
  topicId: string | null
  title: string
  body: string
  // Rutas de las fotos ya subidas al almacenamiento, EN ORDEN (la primera es la portada).
  photos: string[]
  // Solo se usa (y se envía) cuando el tipo es Receta.
  recipe: RecipeDraftInput | null
}

export function emptyRecipe(): RecipeDraftInput {
  return { servings: null, ingredients: [], steps: '', tags: [] }
}

export function parseKind(raw: string | null | undefined): PostKind | null {
  return POST_KINDS.find((k) => k.id === raw)?.id ?? null
}

export function parseSection(raw: string | null | undefined): CommunitySection | null {
  return SECTIONS.find((s) => s.id === raw)?.id ?? null
}

// Una Receta SOLO puede ir en «Recetas y cocina»; los demás tipos, en cualquiera de las dos secciones.
export function isSectionAllowed(kind: PostKind, section: CommunitySection): boolean {
  return kind !== 'receta' || section === 'recetas'
}

export function emptyForm(kind: PostKind = 'pregunta', section: CommunitySection | null = null, title = ''): PostForm {
  const forced = kind === 'receta' ? 'recetas' : section
  return { kind, section: forced, topicId: null, title: title.slice(0, MAX_TITLE), body: '', photos: [], recipe: kind === 'receta' ? emptyRecipe() : null }
}

// Formulario de partida según lo que llega en la dirección (?tipo=&seccion=&titulo=). Valores raros se ignoran.
export function initialFormFromQuery(q: { tipo?: string | null; seccion?: string | null; titulo?: string | null }): PostForm {
  const kind = parseKind(q.tipo) ?? 'pregunta'
  const section = parseSection(q.seccion)
  return emptyForm(kind, section && isSectionAllowed(kind, section) ? section : null, (q.titulo ?? '').trim())
}

// Cambiar el tipo: la Receta obliga a la sección de cocina. Si la sección cambia, el tema se vuelve a elegir.
export function withKind(form: PostForm, kind: PostKind): PostForm {
  if (kind === form.kind) return form
  const section = kind === 'receta' ? 'recetas' : form.section
  return {
    ...form,
    kind,
    section,
    topicId: section === form.section ? form.topicId : null,
    // La receta escrita se conserva si se cambia de tipo por error y se vuelve atrás.
    recipe: kind === 'receta' ? (form.recipe ?? emptyRecipe()) : form.recipe,
  }
}

export function withSection(form: PostForm, section: CommunitySection): PostForm {
  if (section === form.section || !isSectionAllowed(form.kind, section)) return form
  return { ...form, section, topicId: null }
}

export function topicsForSection(topics: CommunityTopic[], section: CommunitySection | null): CommunityTopic[] {
  return section ? topics.filter((t) => t.section === section) : []
}

// ---- Cambios sin guardar

// Lo que de verdad cuenta como «contenido» del formulario: la receta solo importa si el tipo es Receta; los espacios sobrantes del título no son un cambio.
function comparable(form: PostForm) {
  return {
    kind: form.kind,
    section: form.section,
    topicId: form.topicId,
    title: form.title.trim(),
    body: form.body.trim(),
    photos: form.photos,
    recipe: form.kind === 'receta' ? (form.recipe ?? emptyRecipe()) : null,
  }
}

export function isFormDirty(current: PostForm, baseline: PostForm): boolean {
  return JSON.stringify(comparable(current)) !== JSON.stringify(comparable(baseline))
}

// ¿Hay algo escrito, elegido o subido? (un formulario recién abierto no se autoguarda ni cuenta como cambios)
export function isFormBlank(form: PostForm): boolean {
  const r = form.kind === 'receta' ? form.recipe : null
  const recipeHasContent = !!r && (r.ingredients.some((i) => i.name.trim() !== '') || r.steps.trim() !== '' || r.tags.length > 0 || r.servings != null)
  return form.title.trim() === '' && form.body.trim() === '' && form.photos.length === 0 && !recipeHasContent
}

// ---- Validación

export interface FormErrors {
  kind?: string
  section?: string
  topic?: string
  title?: string
  body?: string
  recipe?: string
  photos?: string
}

export function hasErrors(e: FormErrors): boolean {
  return Object.keys(e).length > 0
}

export type FormMode = 'create' | 'edit'

// Todo lo que falta para PUBLICAR (borrador es más permisivo: ver validateForDraft).
export function validateForPublish(form: PostForm, topics: CommunityTopic[]): FormErrors {
  const e: FormErrors = {}
  if (!POST_KINDS.some((k) => k.id === form.kind)) e.kind = 'Elige qué quieres publicar.'
  if (!form.section) e.section = 'Elige en qué sección va.'
  else if (!isSectionAllowed(form.kind, form.section)) e.section = 'Las recetas solo van en «Recetas y cocina».'
  if (!form.topicId) e.topic = 'Elige un tema.'
  else if (form.section && !topicsForSection(topics, form.section).some((t) => t.id === form.topicId)) e.topic = 'Ese tema no es de la sección elegida. Elige otro.'
  const title = form.title.trim()
  if (title.length < MIN_TITLE) e.title = 'Escribe un título (al menos 3 letras).'
  else if (title.length > MAX_TITLE) e.title = `El título es demasiado largo (máximo ${MAX_TITLE} letras).`
  const body = form.body.trim()
  if (body.length > MAX_BODY) e.body = `El texto es demasiado largo (máximo ${MAX_BODY} caracteres).`
  else if (form.kind !== 'receta' && body.length === 0) e.body = 'Escribe el texto de tu publicación.'
  if (form.photos.length > MAX_POST_PHOTOS) e.photos = `Solo se pueden añadir hasta ${MAX_POST_PHOTOS} fotos.`
  if (form.kind === 'receta') {
    const hasIngredient = !!form.recipe && form.recipe.ingredients.some((i) => i.name.trim() !== '')
    if (!hasIngredient) e.recipe = 'La receta necesita al menos un ingrediente con nombre.'
  }
  return e
}

// Un borrador puede estar a medias; solo hace falta que haya algo que guardar y que no se pase de los límites.
export function validateForDraft(form: PostForm): string | null {
  if (isFormBlank(form)) return 'Escribe algo (o añade una foto) antes de guardar el borrador.'
  if (form.title.length > MAX_TITLE) return `El título es demasiado largo (máximo ${MAX_TITLE} letras).`
  if (form.body.length > MAX_BODY) return `El texto es demasiado largo (máximo ${MAX_BODY} caracteres).`
  if (form.photos.length > MAX_POST_PHOTOS) return `Solo se pueden añadir hasta ${MAX_POST_PHOTOS} fotos.`
  return null
}

// ---- Texto enriquecido: contador y avisos de enlaces

export function charCounter(text: string, max: number): { used: number; left: number; over: boolean; nearLimit: boolean } {
  const used = text.length
  return { used, left: max - used, over: used > max, nearLimit: max - used <= Math.max(50, Math.floor(max * 0.05)) }
}

// Sitios a los que llevan los enlaces escritos (sin repetir): sirve para avisar «este enlace sale de PEPA».
export function externalLinkHosts(body: string): string[] {
  const hosts = new Set<string>()
  const walk = (items: Inline[]) => {
    for (const i of items) {
      if (i.t === 'link') hosts.add(i.host)
      else if (i.t === 'bold' || i.t === 'italic') walk(i.c)
    }
  }
  for (const b of parseRichText(body)) {
    if (b.t === 'p') walk(b.c)
    else for (const it of b.items) walk(it)
  }
  return [...hosts]
}

// ---- Conversión desde/hacia el servidor

export function recipeToInput(r: PublicRecipe | RecipeDraftInput | null | undefined): RecipeDraftInput | null {
  if (!r) return null
  return {
    servings: r.servings ?? null,
    ingredients: (r.ingredients ?? []).map((i) => ({ name: i.name, quantity: i.quantity ?? '', unit: i.unit ?? '' })),
    steps: r.steps ?? '',
    tags: r.tags ?? [],
  }
}

export function draftToForm(d: Draft): PostForm {
  return {
    kind: d.kind,
    section: d.kind === 'receta' ? 'recetas' : d.section,
    topicId: d.topicId,
    title: d.title,
    body: d.body,
    photos: Array.isArray(d.photos) ? d.photos : [],
    recipe: d.kind === 'receta' ? (recipeToInput(d.recipe) ?? emptyRecipe()) : null,
  }
}

// La receta solo viaja al servidor cuando el tipo es Receta (si no, va null).
export function recipeForServer(form: PostForm): RecipeDraftInput | null {
  return form.kind === 'receta' ? (form.recipe ?? emptyRecipe()) : null
}

// Rutas de fotos que se subieron en esta sesión y que el servidor aún no conoce (no están en el borrador/publicación guardados).
export function unsavedPhotos(current: string[], persisted: ReadonlySet<string>): string[] {
  return current.filter((p) => !persisted.has(p))
}

// ---- Caducidad de los borradores (30 días desde el último guardado MANUAL)

const DAY_MS = 24 * 60 * 60 * 1000

// Días que le quedan (redondeo hacia arriba, igual que el servidor: «ceil»). 0 = caduca hoy o ya ha caducado.
export function draftDaysLeft(savedAt: string | number | Date, now: Date | number = Date.now(), days = DRAFT_DAYS): number {
  const saved = new Date(savedAt).getTime()
  if (Number.isNaN(saved)) return 0
  const left = (saved + days * DAY_MS - new Date(now).getTime()) / DAY_MS
  return Math.max(0, Math.ceil(left))
}

export function isDraftExpired(savedAt: string | number | Date, now: Date | number = Date.now(), days = DRAFT_DAYS): boolean {
  const saved = new Date(savedAt).getTime()
  return Number.isNaN(saved) || saved + days * DAY_MS <= new Date(now).getTime()
}

export function daysLeftText(daysLeft: number): string {
  if (daysLeft <= 0) return 'Caduca hoy'
  if (daysLeft === 1) return 'Queda 1 día'
  return `Quedan ${daysLeft} días`
}

// Aviso fijo bajo el título de «Nueva publicación» y de «Mis borradores». Dos frases: lo que SÍ se conserva y lo que NO es permanente.
export const DRAFT_EXPIRY_WARNING = {
  kept: `Los borradores que guardas a mano se conservan ${DRAFT_DAYS} días desde el último guardado; después se eliminan solos, con sus fotos.`,
  autosave: 'El autoguardado temporal de este dispositivo solo te protege de accidentes: no es permanente.',
} as const

export function kindLabel(kind: PostKind): string {
  return POST_KINDS.find((k) => k.id === kind)?.label ?? 'Publicación'
}

// «Mis borradores»: del último guardado manual al más antiguo (el servidor ya los manda así; se vuelve a ordenar por si acaso).
export function sortDraftsBySavedDesc<T extends { savedAt: string }>(drafts: T[]): T[] {
  return [...drafts].sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
}

// A partir de aquí se avisa con más énfasis de que está a punto de caducar.
export const DRAFT_EXPIRING_SOON_DAYS = 3
