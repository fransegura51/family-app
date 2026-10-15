// Comunidad PEPA — comparación de dos versiones de una receta (CMN-§5.3). Código puro, sin red ni React.
// Se usa cuando una receta pública que una familia importó cambia: la familia ve QUÉ cambió (ingredientes añadidos, quitados o cambiados; pasos nuevos, quitados
// o cambiados; raciones, título y etiquetas) y decide si actualiza su copia. Nunca se actualiza sola.

export interface DiffIngredient {
  name: string
  quantity: string
  unit: string
}

// Forma mínima que se compara: la misma en la versión importada y en la actual (snapshot del servidor).
export interface DiffRecipe {
  title: string
  servings: number | null
  ingredients: DiffIngredient[]
  steps: string
  tags: string[]
}

export interface IngredientChange {
  before: DiffIngredient
  after: DiffIngredient
}

export type StepOp = { type: 'same'; text: string } | { type: 'added'; text: string } | { type: 'removed'; text: string } | { type: 'changed'; from: string; to: string }

export interface RecipeDiff {
  titleChanged: { from: string; to: string } | null
  servingsChanged: { from: number | null; to: number | null } | null
  ingredientsAdded: DiffIngredient[]
  ingredientsRemoved: DiffIngredient[]
  ingredientsChanged: IngredientChange[]
  ingredientsSame: number
  stepOps: StepOp[]
  tagsAdded: string[]
  tagsRemoved: string[]
  // Verdadero si hay AL MENOS una diferencia visible para la persona.
  hasChanges: boolean
}

// Sin mayúsculas, sin tildes y sin espacios sobrantes: «Harina», «harina » y «Hárina» son el mismo ingrediente a efectos de comparar.
export function normalizeKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Quita la numeración delante del paso («1. », «2) », «- ») para comparar el contenido y no el número.
export function stripStepNumber(line: string): string {
  // El signo debe ir seguido de un espacio: «2.5 cucharadas» o «-5 grados» NO son numeración.
  return line.replace(/^\s*(?:\d+[.)]|[-•*])(?=\s)\s*/, '').trim()
}

// Lista de pasos de un texto de pasos (una línea por paso; las líneas vacías no cuentan).
export function splitSteps(text: string | null | undefined): string[] {
  return (text ?? '')
    .split('\n')
    .map((l) => stripStepNumber(l))
    .filter(Boolean)
}

function sameIngredient(a: DiffIngredient, b: DiffIngredient): boolean {
  return normalizeKey(a.quantity) === normalizeKey(b.quantity) && normalizeKey(a.unit) === normalizeKey(b.unit)
}

// Empareja ingredientes por NOMBRE (si un nombre sale dos veces, se emparejan en orden). Lo que no tiene pareja es añadido o quitado.
function diffIngredients(before: DiffIngredient[], after: DiffIngredient[]) {
  const pool = new Map<string, DiffIngredient[]>()
  for (const b of before) {
    const key = normalizeKey(b.name)
    pool.set(key, [...(pool.get(key) ?? []), b])
  }
  const added: DiffIngredient[] = []
  const changed: IngredientChange[] = []
  let same = 0
  for (const a of after) {
    const queue = pool.get(normalizeKey(a.name))
    const match = queue?.shift()
    if (!match) {
      added.push(a)
    } else if (sameIngredient(match, a)) {
      same += 1
    } else {
      changed.push({ before: match, after: a })
    }
  }
  const removed = [...pool.values()].flat()
  return { added, removed, changed, same }
}

// Diferencia de pasos por la subsecuencia común más larga (LCS): lo común queda «igual»; un bloque de quitados seguido de un bloque de añadidos se empareja
// por posición como «cambiado» (así se ve «antes → ahora» en lugar de dos líneas sueltas).
export function diffSteps(beforeText: string, afterText: string): StepOp[] {
  const a = splitSteps(beforeText)
  const b = splitSteps(afterText)
  const ka = a.map(normalizeKey)
  const kb = b.map(normalizeKey)
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = ka[i] === kb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const raw: StepOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      raw.push({ type: 'same', text: b[j] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      raw.push({ type: 'removed', text: a[i] })
      i++
    } else {
      raw.push({ type: 'added', text: b[j] })
      j++
    }
  }
  while (i < n) raw.push({ type: 'removed', text: a[i++] })
  while (j < m) raw.push({ type: 'added', text: b[j++] })

  // Une cada bloque «quitados + añadidos» seguidos en pares «cambiado».
  const out: StepOp[] = []
  let k = 0
  while (k < raw.length) {
    if (raw[k].type === 'same') {
      out.push(raw[k++])
      continue
    }
    const removed: string[] = []
    const added: string[] = []
    while (k < raw.length && raw[k].type !== 'same') {
      const op = raw[k++]
      if (op.type === 'removed') removed.push(op.text)
      else if (op.type === 'added') added.push(op.text)
    }
    const pairs = Math.min(removed.length, added.length)
    for (let p = 0; p < pairs; p++) out.push({ type: 'changed', from: removed[p], to: added[p] })
    for (let p = pairs; p < removed.length; p++) out.push({ type: 'removed', text: removed[p] })
    for (let p = pairs; p < added.length; p++) out.push({ type: 'added', text: added[p] })
  }
  return out
}

export function diffRecipes(before: DiffRecipe, after: DiffRecipe): RecipeDiff {
  const ing = diffIngredients(before.ingredients, after.ingredients)
  const stepOps = diffSteps(before.steps, after.steps)
  const beforeTags = new Map(before.tags.map((t) => [normalizeKey(t), t]))
  const afterTags = new Map(after.tags.map((t) => [normalizeKey(t), t]))
  const tagsAdded = [...afterTags].filter(([k]) => !beforeTags.has(k)).map(([, t]) => t)
  const tagsRemoved = [...beforeTags].filter(([k]) => !afterTags.has(k)).map(([, t]) => t)
  const titleChanged = normalizeKey(before.title) !== normalizeKey(after.title) ? { from: before.title, to: after.title } : null
  const servingsChanged = (before.servings ?? null) !== (after.servings ?? null) ? { from: before.servings ?? null, to: after.servings ?? null } : null
  const hasChanges =
    titleChanged !== null ||
    servingsChanged !== null ||
    ing.added.length > 0 ||
    ing.removed.length > 0 ||
    ing.changed.length > 0 ||
    stepOps.some((op) => op.type !== 'same') ||
    tagsAdded.length > 0 ||
    tagsRemoved.length > 0
  return {
    titleChanged,
    servingsChanged,
    ingredientsAdded: ing.added,
    ingredientsRemoved: ing.removed,
    ingredientsChanged: ing.changed,
    ingredientsSame: ing.same,
    stepOps,
    tagsAdded,
    tagsRemoved,
    hasChanges,
  }
}

// «Cantidad y unidad» legible de un ingrediente: «250 g», «2», «» (sin cantidad).
export function ingredientAmount(i: DiffIngredient): string {
  return [i.quantity, i.unit].filter((x) => x && x.trim()).join(' ')
}

// Frase corta de qué cambió, para el aviso («2 ingredientes cambiados · 1 paso nuevo»). Vacía si no hay diferencias.
export function summarizeDiff(d: RecipeDiff): string {
  const parts: string[] = []
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  if (d.titleChanged) parts.push('nuevo nombre')
  if (d.servingsChanged) parts.push('raciones distintas')
  if (d.ingredientsAdded.length) parts.push(plural(d.ingredientsAdded.length, 'ingrediente nuevo', 'ingredientes nuevos'))
  if (d.ingredientsRemoved.length) parts.push(plural(d.ingredientsRemoved.length, 'ingrediente quitado', 'ingredientes quitados'))
  if (d.ingredientsChanged.length) parts.push(plural(d.ingredientsChanged.length, 'ingrediente cambiado', 'ingredientes cambiados'))
  const stepsAdded = d.stepOps.filter((o) => o.type === 'added').length
  const stepsRemoved = d.stepOps.filter((o) => o.type === 'removed').length
  const stepsChanged = d.stepOps.filter((o) => o.type === 'changed').length
  if (stepsAdded) parts.push(plural(stepsAdded, 'paso nuevo', 'pasos nuevos'))
  if (stepsRemoved) parts.push(plural(stepsRemoved, 'paso quitado', 'pasos quitados'))
  if (stepsChanged) parts.push(plural(stepsChanged, 'paso cambiado', 'pasos cambiados'))
  if (d.tagsAdded.length || d.tagsRemoved.length) parts.push('etiquetas distintas')
  return parts.join(' · ')
}
