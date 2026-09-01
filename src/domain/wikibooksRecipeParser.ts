// Saca ingredientes y pasos del wikitexto de una página de recetas de
// es.wikibooks.org — sin frameworks, solo manipulación de texto. Las
// recetas de "Artes culinarias/Recetas/*" van dentro de una plantilla
// {{Artes culinarias/Datos de receta | ingredientes = ... | procedimiento
// = ... }} en vez de secciones "== Ingredientes ==" normales, así que se
// prueban las dos formas por si el formato cambia entre páginas.

export interface ParsedRecipe {
  title: string
  ingredients: string[]
  steps: string[]
}

function cleanWikitext(s: string): string {
  return s
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/\{\{ing\|[^{}]*?\|([^{}|]+)\}\}/gi, '$1') // {{ing|patata|patatas}} -> patatas
    .replace(/\{\{ing\|([^{}|]+)\}\}/gi, '$1') // {{ing|sal}} -> sal
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'''''|'''|''/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function linesFromBlock(block: string): string[] {
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[*#]/.test(l))
    .map((l) => cleanWikitext(l.replace(/^[*#]+\s*/, '')))
    .filter(Boolean)
}

// Recorre el wikitexto contando profundidad de {{ }} / [[ ]] para no
// partir por un "|" que en realidad está dentro de una plantilla o un
// enlace anidado (p. ej. dentro de {{ing|patata|patatas}}).
function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = []
  let curly = 0
  let square = 0
  let last = 0
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('{{', i)) {
      curly++
      i++
    } else if (text.startsWith('}}', i)) {
      curly--
      i++
    } else if (text.startsWith('[[', i)) {
      square++
      i++
    } else if (text.startsWith(']]', i)) {
      square--
      i++
    } else if (text[i] === sep && curly <= 0 && square <= 0) {
      parts.push(text.slice(last, i))
      last = i + 1
    }
  }
  parts.push(text.slice(last))
  return parts
}

// Encuentra la primera plantilla "{{NombrePlantilla ... }}" (con posibles
// plantillas anidadas dentro) y devuelve su contenido, sin las llaves.
function findTemplateBody(wikitext: string, templateNameHint: string): string | null {
  const start = wikitext.indexOf(`{{${templateNameHint}`)
  if (start === -1) return null
  let depth = 0
  let i = start
  while (i < wikitext.length) {
    if (wikitext.startsWith('{{', i)) {
      depth++
      i += 2
    } else if (wikitext.startsWith('}}', i)) {
      depth--
      i += 2
      if (depth === 0) return wikitext.slice(start + 2, i - 2)
    } else {
      i++
    }
  }
  return null
}

function parseTemplateParams(body: string): Record<string, string> {
  const segments = splitTopLevel(body, '|')
  const params: Record<string, string> = {}
  for (const seg of segments.slice(1)) {
    const eqIdx = seg.indexOf('=')
    if (eqIdx === -1) continue
    const key = seg.slice(0, eqIdx).trim().toLowerCase()
    params[key] = seg.slice(eqIdx + 1)
  }
  return params
}

function fromTemplate(wikitext: string): { ingredients: string[]; steps: string[] } {
  const body = findTemplateBody(wikitext, 'Artes culinarias/Datos de receta')
  if (!body) return { ingredients: [], steps: [] }
  const params = parseTemplateParams(body)
  return {
    ingredients: linesFromBlock(params.ingredientes ?? ''),
    steps: linesFromBlock(params.procedimiento ?? params.preparacion ?? ''),
  }
}

function fromSections(wikitext: string): { ingredients: string[]; steps: string[] } {
  const sectionRe = /^={2,4}\s*(.+?)\s*={2,4}\s*$/gm
  const matches = [...wikitext.matchAll(sectionRe)]
  const bodyFor = (headerPattern: RegExp): string[] => {
    for (let i = 0; i < matches.length; i++) {
      if (!headerPattern.test(matches[i][1])) continue
      const start = (matches[i].index ?? 0) + matches[i][0].length
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? wikitext.length) : wikitext.length
      return linesFromBlock(wikitext.slice(start, end))
    }
    return []
  }
  return {
    ingredients: bodyFor(/ingrediente/i),
    steps: bodyFor(/preparaci[oó]n|elaboraci[oó]n|instruc|procedimiento|^pasos?$/i),
  }
}

export function parseWikibooksRecipe(rawTitle: string, wikitext: string): ParsedRecipe {
  const title = rawTitle.replace(/^Artes culinarias\/Recetas\//, '')
  const template = fromTemplate(wikitext)
  const sections = fromSections(wikitext)
  return {
    title,
    ingredients: template.ingredients.length > 0 ? template.ingredients : sections.ingredients,
    steps: template.steps.length > 0 ? template.steps : sections.steps,
  }
}
