// Alergias e intolerancias: catálogo, validación y motor de avisos de ingredientes. Tabla de casos reales, falsos positivos/negativos documentados,
// propiedad «nunca devuelve seguro» y prueba de lenguaje prohibido.
import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/0279_family_dietary_restrictions.sql?raw'
import {
  checkRecipeIngredients,
  dietaryBadgeText,
  dietaryRestrictionLabel,
  DIETARY_ALLERGEN_KEYS,
  DIETARY_CATALOG,
  DIETARY_GENERAL_DISCLAIMER,
  DIETARY_KIND_LABELS,
  DIETARY_NOTE_MAX,
  DIETARY_LABEL_MAX,
  DIETARY_SEVERITY_LABELS,
  NO_DATA_MESSAGE,
  NO_MATCH_DISCLAIMER,
  REVIEW_MESSAGE,
  normalizeDietaryText,
  stemWord,
  suggestCatalogKeys,
  validateDietaryDraft,
  type DietaryAllergenKey,
  type DietaryKind,
  type DietaryRestrictionInput,
  type RecipeDietaryCheck,
} from './dietaryRestrictions'
import { KEY_RULES, type RuleTerm } from './dietaryRestrictionsRules'

let seq = 0
function restriction(key: DietaryAllergenKey, kind: DietaryKind = 'alergia'): DietaryRestrictionInput {
  return { id: `r-${key}-${kind}-${seq++}`, kind, allergenKey: key, customLabel: null }
}
function custom(label: string, kind: DietaryKind = 'restriccion'): DietaryRestrictionInput {
  return { id: `c-${label}-${seq++}`, kind, allergenKey: null, customLabel: label }
}
// Nivel con el que UNA restricción de catálogo marca UN ingrediente (null = ninguna coincidencia).
function level(ingredient: string, key: DietaryAllergenKey): 'conflicto' | 'revisar' | null {
  const res = checkRecipeIngredients([{ name: ingredient }], [restriction(key)])
  const f = res.findings.find((x) => x.level !== 'sin_datos')
  return f ? (f.level as 'conflicto' | 'revisar') : null
}
function levelCustom(ingredient: string, label: string): 'conflicto' | 'revisar' | null {
  const res = checkRecipeIngredients([{ name: ingredient }], [custom(label)])
  const f = res.findings.find((x) => x.level !== 'sin_datos')
  return f ? (f.level as 'conflicto' | 'revisar') : null
}

describe('normalización', () => {
  it('quita tildes y mayúsculas, y unifica plurales', () => {
    expect(normalizeDietaryText('MEJILLÓN Piñón')).toBe('mejillon pinon')
    expect(stemWord('nueces')).toBe('nuez')
    expect(stemWord('mejillones')).toBe('mejillon')
    expect(stemWord('cacahuetes')).toBe('cacahuete')
    expect(stemWord('huevos')).toBe('huevo')
    expect(stemWord('leches')).toBe('leche')
    expect(stemWord('yogures')).toBe('yogur')
    expect(stemWord('panes')).toBe('pan')
  })

  it('reconoce diminutivos y plurales en el ingrediente', () => {
    expect(level('Quesito', 'leche')).toBe('conflicto')
    expect(level('huevitos', 'huevo')).toBe('conflicto')
    expect(level('QUESOS CURADOS', 'leche')).toBe('conflicto')
    expect(level('Nata', 'leche')).toBe('conflicto')
    expect(level('Leche ENTERA', 'leche')).toBe('conflicto')
    expect(level('Cacahuetes', 'cacahuete')).toBe('conflicto')
    expect(level('Mejillones en escabeche', 'moluscos')).toBe('conflicto')
  })

  it('coincide por palabra completa, no por trozos de otra palabra', () => {
    expect(level('Panceta', 'trigo')).toBeNull()
    expect(level('Compañía de salmorejo', 'trigo')).toBeNull()
    expect(level('Sal', 'soja')).toBeNull()
    expect(level('Manitas de cerdo', 'cacahuete')).toBeNull()
    expect(level('Cacahuetera', 'cacahuete')).toBeNull()
  })
})

describe('leche (proteínas lácteas) frente a lactosa', () => {
  const lacteos: [string, 'conflicto' | 'revisar' | null][] = [
    ['200 ml de leche entera', 'conflicto'],
    ['nata para montar', 'conflicto'],
    ['queso rallado', 'conflicto'],
    ['queso de cabra', 'conflicto'],
    ['mozzarella', 'conflicto'],
    ['parmesano', 'conflicto'],
    ['yogur natural', 'conflicto'],
    ['mantequilla', 'conflicto'],
    ['bechamel', 'conflicto'],
    ['leche sin lactosa', 'conflicto'], // sin lactosa NO quita la proteína de la leche
    ['queso sin lactosa', 'conflicto'],
    ['salsa', 'revisar'],
    ['cubito de caldo', 'revisar'],
    ['chocolate negro', 'revisar'],
    ['pan de molde', 'revisar'],
    ['leche de coco', null],
    ['leche de almendra', null],
    ['leche de soja', null],
    ['bebida de avena', null],
    ['mantequilla de cacahuete', null],
    ['nata vegetal', null],
    ['queso vegano', null],
    ['nuez moscada', null],
    ['crema de calabaza', null],
    ['harina de trigo', null],
    ['aceite de oliva', null],
  ]
  for (const [ing, expected] of lacteos) {
    it(`leche · «${ing}» → ${expected ?? 'ninguna coincidencia'}`, () => expect(level(ing, 'leche')).toBe(expected))
  }

  const lactosa: [string, 'conflicto' | 'revisar' | null][] = [
    ['leche', 'conflicto'],
    ['yogur', 'conflicto'],
    ['queso fresco', 'conflicto'],
    ['helado de vainilla', 'conflicto'],
    ['queso curado', 'revisar'],
    ['parmesano', 'revisar'],
    ['mantequilla', 'revisar'],
    ['leche sin lactosa', null],
    ['yogur sin lactosa', null],
    ['nata sin lactosa', null],
    ['leche de avena', null],
    ['mantequilla de cacahuete', null],
    ['crema de calabaza', null],
    ['pan', null],
  ]
  for (const [ing, expected] of lactosa) {
    it(`lactosa · «${ing}» → ${expected ?? 'ninguna coincidencia'}`, () => expect(level(ing, 'lactosa')).toBe(expected))
  }

  it('leche/nata/queso se identifican como lácteos y la lactosa es una restricción distinta', () => {
    const res = checkRecipeIngredients([{ name: 'leche' }, { name: 'nata' }, { name: 'queso' }], [restriction('leche')])
    expect(res.findings.filter((f) => f.level === 'conflicto').map((f) => f.ingredient)).toEqual(['leche', 'nata', 'queso'])
    expect(DIETARY_CATALOG.find((e) => e.key === 'leche')?.label).not.toMatch(/lactosa/i)
    expect(DIETARY_CATALOG.find((e) => e.key === 'lactosa')?.group).toBe('otras')
  })
})

describe('gluten, trigo y celiaquía', () => {
  const gluten: [string, 'conflicto' | 'revisar' | null][] = [
    ['harina de trigo', 'conflicto'],
    ['sémola de trigo duro', 'conflicto'],
    ['semola', 'conflicto'],
    ['cebada', 'conflicto'],
    ['centeno', 'conflicto'],
    ['cuscús', 'conflicto'],
    ['seitán', 'conflicto'],
    ['pan', 'conflicto'],
    ['pan rallado', 'conflicto'],
    ['panecillos', 'conflicto'],
    ['macarrones', 'conflicto'],
    ['pasta', 'conflicto'],
    ['cerveza', 'conflicto'],
    ['harina', 'revisar'],
    ['avena', 'revisar'],
    ['salsa de soja', 'revisar'],
    ['caldo', 'revisar'],
    ['embutido', 'revisar'],
    ['pan sin gluten', null],
    ['galletas sin gluten', null],
    ['pasta sin gluten', null],
    ['cerveza sin gluten', null],
    ['harina sin gluten', null],
    ['pan libre de gluten', null],
    ['pan (sin gluten)', null],
    ['harina de maíz', null],
    ['harina de arroz', null],
    ['trigo sarraceno', null],
    ['pasta de tomate', null],
    ['pasta de curry', null],
    ['arroz', null],
    ['seitán sin gluten', 'revisar'], // dice «sin gluten» pero nombra un cereal con gluten: se avisa igualmente
    ['harina de trigo sin gluten', 'revisar'],
    ['pan sin gluten con harina de trigo', 'conflicto'], // «con» vuelve a añadir lo que se había quitado
  ]
  for (const [ing, expected] of gluten) {
    it(`gluten · «${ing}» → ${expected ?? 'ninguna coincidencia'}`, () => expect(level(ing, 'gluten')).toBe(expected))
  }

  it('la sensibilidad al gluten no celíaca usa las mismas reglas', () => {
    for (const [ing] of gluten) expect(level(ing, 'gluten_no_celiaco'), ing).toBe(level(ing, 'gluten'))
  })

  const trigo: [string, 'conflicto' | 'revisar' | null][] = [
    ['harina de trigo', 'conflicto'],
    ['sémola', 'conflicto'],
    ['pan', 'conflicto'],
    ['espelta', 'conflicto'],
    ['cebada', 'revisar'],
    ['centeno', 'revisar'],
    ['harina', 'revisar'],
    ['avena', null],
    ['harina de maíz', null],
    ['trigo sarraceno', null],
    ['pan sin gluten', 'revisar'], // «sin gluten» no garantiza que no lleve almidón de trigo: solo baja de nivel
  ]
  for (const [ing, expected] of trigo) {
    it(`trigo · «${ing}» → ${expected ?? 'ninguna coincidencia'}`, () => expect(level(ing, 'trigo')).toBe(expected))
  }

  it('harina de trigo y sémola se avisan para trigo Y para gluten, pero no son lo mismo en todos los contextos', () => {
    expect(level('harina de trigo', 'trigo')).toBe('conflicto')
    expect(level('harina de trigo', 'gluten')).toBe('conflicto')
    expect(level('cebada', 'gluten')).toBe('conflicto')
    expect(level('cebada', 'trigo')).toBe('revisar') // alergia al trigo ≠ gluten: aquí solo se pide revisar
    expect(level('avena', 'gluten')).toBe('revisar')
    expect(level('avena', 'trigo')).toBeNull()
  })
})

describe('frutos de cáscara: cada alergia con precisión', () => {
  const todos: [string, 'conflicto' | 'revisar' | null][] = [
    ['almendras', 'conflicto'],
    ['nueces', 'conflicto'],
    ['avellanas', 'conflicto'],
    ['anacardos', 'conflicto'],
    ['pistachos', 'conflicto'],
    ['nuez de macadamia', 'conflicto'],
    ['nuez pecana', 'conflicto'],
    ['nuez de Brasil', 'conflicto'],
    ['frutos secos', 'conflicto'],
    ['mazapán', 'conflicto'],
    ['pesto', 'revisar'],
    ['piñones', 'revisar'],
    ['nuez moscada', null],
    ['coco rallado', null],
    ['cacahuetes', null],
  ]
  for (const [ing, expected] of todos) {
    it(`frutos de cáscara (todos) · «${ing}» → ${expected ?? 'ninguna coincidencia'}`, () => expect(level(ing, 'frutos_de_cascara')).toBe(expected))
  }

  it('almendra: conflicto con almendra, «revisar» con otros frutos de cáscara', () => {
    expect(level('almendras laminadas', 'almendra')).toBe('conflicto')
    expect(level('leche de almendra', 'almendra')).toBe('conflicto')
    expect(level('mazapán', 'almendra')).toBe('conflicto')
    expect(level('nueces', 'almendra')).toBe('revisar')
    expect(level('avellanas', 'almendra')).toBe('revisar')
    expect(level('frutos secos', 'almendra')).toBe('revisar')
    expect(level('pesto', 'almendra')).toBe('revisar')
    expect(level('nuez moscada', 'almendra')).toBeNull()
    expect(level('cacahuetes', 'almendra')).toBeNull()
  })

  it('nuez: nuez de nogal sí; moscada no; otras nueces solo «revisar»', () => {
    expect(level('nueces picadas', 'nuez')).toBe('conflicto')
    expect(level('nuez', 'nuez')).toBe('conflicto')
    expect(level('nuez moscada', 'nuez')).toBeNull()
    expect(level('nuez de Brasil', 'nuez')).toBe('revisar')
    expect(level('nuez de macadamia', 'nuez')).toBe('revisar')
    expect(level('nuez pecana', 'nuez')).toBe('revisar')
    expect(level('almendra', 'nuez')).toBe('revisar')
  })

  it('cada fruto concreto se reconoce con precisión', () => {
    expect(level('crema de avellanas', 'avellana')).toBe('conflicto')
    expect(level('Nutella', 'avellana')).toBe('conflicto')
    expect(level('anacardos', 'anacardo')).toBe('conflicto')
    expect(level('pistacho', 'pistacho')).toBe('conflicto')
    expect(level('anacardos', 'pistacho')).toBe('revisar')
    expect(level('macadamia', 'macadamia')).toBe('conflicto')
    expect(level('pecanas', 'pecana')).toBe('conflicto')
    expect(level('nueces de Brasil', 'nuez_de_brasil')).toBe('conflicto')
    expect(level('nueces', 'pecana')).toBe('revisar')
  })
})

describe('resto del catálogo de la UE', () => {
  const cases: [DietaryAllergenKey, string, 'conflicto' | 'revisar' | null][] = [
    ['cacahuete', 'mantequilla de cacahuete', 'conflicto'],
    ['cacahuete', 'cacahuetes tostados', 'conflicto'],
    ['cacahuete', 'frutos secos', 'revisar'],
    ['cacahuete', 'altramuces', 'revisar'],
    ['cacahuete', 'almendras', null],
    ['cacahuete', 'nuez moscada', null],
    ['altramuces', 'harina de altramuz', 'conflicto'],
    ['altramuces', 'cacahuete', 'revisar'],
    ['altramuces', 'harina', 'revisar'],
    ['huevo', 'huevos', 'conflicto'],
    ['huevo', 'claras de huevo', 'conflicto'],
    ['huevo', 'mayonesa', 'conflicto'],
    ['huevo', 'mayonesa vegana', null],
    ['huevo', 'flan', 'conflicto'],
    ['huevo', 'alioli', 'revisar'],
    ['huevo', 'pasta fresca', 'revisar'],
    ['huevo', 'bizcocho', 'revisar'],
    ['huevo', 'pasta fresca sin huevo', null],
    ['huevo', 'huevas de pescado', null],
    ['huevo', 'pan', null],
    ['pescado', 'merluza', 'conflicto'],
    ['pescado', 'anchoas en aceite', 'conflicto'],
    ['pescado', 'surimi', 'conflicto'],
    ['pescado', 'bonito del norte', 'conflicto'],
    ['pescado', 'caldo de pescado', 'conflicto'],
    ['pescado', 'salsa Worcestershire', 'revisar'],
    ['pescado', 'paella', 'revisar'],
    ['pescado', 'gambas', null],
    ['crustaceos', 'gambas', 'conflicto'],
    ['crustaceos', 'langostinos', 'conflicto'],
    ['crustaceos', 'surimi', 'revisar'],
    ['crustaceos', 'marisco variado', 'revisar'],
    ['crustaceos', 'mejillones', null],
    ['moluscos', 'mejillones', 'conflicto'],
    ['moluscos', 'calamares', 'conflicto'],
    ['moluscos', 'pulpo', 'conflicto'],
    ['moluscos', 'marisco variado', 'revisar'],
    ['moluscos', 'gambas', null],
    ['soja', 'salsa de soja', 'conflicto'],
    ['soja', 'tofu', 'conflicto'],
    ['soja', 'edamame', 'conflicto'],
    ['soja', 'leche de soja', 'conflicto'],
    ['soja', 'brotes de soja', 'conflicto'],
    ['soja', 'chocolate', 'revisar'],
    ['soja', 'salsa', 'revisar'],
    ['soja', 'aceite de oliva', null],
    ['apio', 'apio', 'conflicto'],
    ['apio', 'sal de apio', 'conflicto'],
    ['apio', 'caldo de verduras', 'revisar'],
    ['apio', 'sofrito', 'revisar'],
    ['apio', 'cebolla', null],
    ['mostaza', 'mostaza de Dijon', 'conflicto'],
    ['mostaza', 'semillas de mostaza', 'conflicto'],
    ['mostaza', 'mayonesa', 'revisar'],
    ['mostaza', 'salsa', 'revisar'],
    ['sesamo', 'semillas de sésamo', 'conflicto'],
    ['sesamo', 'tahini', 'conflicto'],
    ['sesamo', 'hummus', 'conflicto'],
    ['sesamo', 'pan de hamburguesa', 'revisar'],
    ['sulfitos', 'vino blanco', 'conflicto'],
    ['sulfitos', 'orejones', 'revisar'],
    ['sulfitos', 'vinagre', 'revisar'],
    ['sulfitos', 'tomate', null],
    ['fructosa', 'miel', 'conflicto'],
    ['fructosa', 'jarabe de maíz', 'conflicto'],
    ['fructosa', 'manzana', 'revisar'],
    ['fructosa', 'arroz', null],
  ]
  for (const [key, ing, expected] of cases) {
    it(`${key} · «${ing}» → ${expected ?? 'ninguna coincidencia'}`, () => expect(level(ing, key)).toBe(expected))
  }
})

describe('productos compuestos: salsa, caldo, embutido', () => {
  it('«salsa de tomate» sola no avisa de todo; «salsa» a secas sí', () => {
    for (const key of DIETARY_ALLERGEN_KEYS) expect(level('salsa de tomate', key), key).toBeNull()
    expect(level('salsa', 'gluten')).toBe('revisar')
    expect(level('salsa', 'huevo')).toBe('revisar')
    expect(level('salsa de queso', 'leche')).toBe('conflicto')
  })

  it('«casero» apaga los productos genéricos (salvo el apio del caldo)', () => {
    expect(level('caldo de pollo casero', 'gluten')).toBeNull()
    expect(level('caldo de pollo', 'gluten')).toBe('revisar')
    expect(level('salsa casera', 'soja')).toBeNull()
    expect(level('caldo de verduras casero', 'apio')).toBe('revisar')
    expect(level('chorizo casero', 'leche')).toBeNull()
    expect(level('queso casero', 'leche')).toBe('conflicto') // lo nombrado no se apaga
  })

  it('el caldo genérico no avisa de leche; el cubito sí', () => {
    expect(level('caldo de pollo', 'leche')).toBeNull()
    expect(level('cubito de caldo', 'leche')).toBe('revisar')
  })

  it('embutidos y fiambres avisan como «revisar»; el jamón serrano no', () => {
    expect(level('chorizo', 'leche')).toBe('revisar')
    expect(level('salchichón', 'gluten')).toBe('revisar')
    expect(level('jamón serrano', 'leche')).toBeNull()
  })

  it('las tortillas de maíz o de trigo no son tortilla de huevo', () => {
    expect(level('tortillas de maíz', 'huevo')).toBeNull()
    expect(level('tortilla', 'huevo')).toBe('revisar')
    expect(level('tortilla de patatas', 'huevo')).toBe('conflicto')
  })
})

describe('negaciones: «sin X» y listas', () => {
  it('«sin» solo anula lo que sigue inmediatamente (o una lista de cosas que se reconocen)', () => {
    expect(level('pan sin gluten ni lactosa', 'gluten')).toBeNull()
    expect(level('galletas sin leche y sin huevo', 'huevo')).toBeNull()
    expect(level('galletas sin leche y sin huevo', 'leche')).toBeNull()
    expect(level('pan sin gluten y con queso', 'leche')).toBe('conflicto') // «con» corta la negación
    expect(level('pan sin sal y queso', 'leche')).toBe('conflicto') // «sal» no se reconoce: no se arriesga a ocultar el queso
    expect(level('pan sin corteza queso', 'leche')).toBe('conflicto')
    expect(level('sin queso, con nata', 'leche')).toBe('conflicto') // la nata sigue ahí
  })

  it('una negación no cruza de un trozo a otro (comas, paréntesis)', () => {
    expect(level('queso (sin gluten)', 'leche')).toBe('conflicto')
    expect(level('sin sal, queso', 'leche')).toBe('conflicto')
  })

  it('«sin X» pone el X a salvo pero NO anula a un alérgeno distinto', () => {
    expect(level('leche sin lactosa', 'leche')).toBe('conflicto')
    expect(level('pan sin gluten', 'lactosa')).toBeNull()
    expect(level('galletas sin gluten', 'huevo')).toBe('revisar')
    expect(level('galletas sin gluten', 'leche')).toBe('revisar')
  })

  it('«libre de», «gluten free» y «para celiacos» cuentan como «sin gluten»', () => {
    expect(level('pan gluten free', 'gluten')).toBeNull()
    expect(level('pasta para celiacos', 'gluten')).toBeNull()
    expect(level('pasta libre de gluten', 'gluten')).toBeNull()
  })

  it('una declaración «vegano» solo se cree para la leche y el huevo', () => {
    expect(level('vegano queso curado', 'leche')).toBe('revisar')
    expect(level('vegano queso curado', 'pescado')).toBeNull()
    expect(level('galletas veganas con leche', 'leche')).toBe('conflicto') // «con leche» manda
  })
})

describe('texto libre («restricción libre»)', () => {
  it('coincide por palabra completa y marca «revisar»', () => {
    expect(levelCustom('kiwi', 'Kiwi')).toBe('revisar')
    expect(levelCustom('3 kiwis maduros', 'kiwi')).toBe('revisar')
    expect(levelCustom('frutos rojos', 'frutos rojos')).toBe('revisar')
    expect(levelCustom('sin kiwi', 'kiwi')).toBeNull()
    expect(levelCustom('manzana', 'kiwi')).toBeNull()
  })

  it('si el texto libre es un nombre del catálogo se trata como esa clave', () => {
    expect(suggestCatalogKeys('Gluten')).toContain('gluten')
    expect(suggestCatalogKeys('frutos secos')).toEqual(['frutos_de_cascara'])
    expect(suggestCatalogKeys('Lactosa')).toEqual(['lactosa'])
    expect(suggestCatalogKeys('histamina')).toEqual([])
    expect(levelCustom('harina de trigo', 'Gluten')).toBe('conflicto')
    expect(levelCustom('leche sin lactosa', 'Lactosa')).toBeNull()
  })

  it('un texto libre sin palabras útiles se declara «sin datos», no se ignora en silencio', () => {
    const res = checkRecipeIngredients([{ name: 'leche' }], [custom('de la')])
    expect(res.findings).toHaveLength(1)
    expect(res.findings[0].level).toBe('sin_datos')
    expect(res.status).toBe('sin_datos')
  })
})

describe('estados del resultado', () => {
  it('sin restricciones registradas no hay nada que comprobar (sin mensaje)', () => {
    const res = checkRecipeIngredients([{ name: 'leche' }], [])
    expect(res.status).toBe('sin_restricciones')
    expect(res.findings).toEqual([])
    expect(res.message).toBe('')
    expect(dietaryBadgeText(res)).toBeNull()
  })

  it('receta sin ingredientes → sin_datos (nunca «ninguna coincidencia»)', () => {
    for (const ings of [[], [{ name: '' }], [{ name: '   ' }], [{ name: 'Para la salsa:' }]]) {
      const res = checkRecipeIngredients(ings, [restriction('leche')])
      expect(res.status, JSON.stringify(ings)).toBe(ings.length === 0 || ings[0].name.endsWith(':') ? 'sin_datos' : 'sin_datos')
      expect(res.findings.some((f) => f.level === 'sin_datos')).toBe(true)
      expect(res.message).toBe(NO_DATA_MESSAGE)
      expect(dietaryBadgeText(res)).toBe('No se puede comprobar')
    }
  })

  it('ingredientes incompletos (solo cantidad o una letra) → sin_datos', () => {
    for (const name of ['200 g', 'al gusto', 'x', '1', '2 cucharadas']) {
      const res = checkRecipeIngredients([{ name }], [restriction('leche')])
      expect(res.status, name).toBe('sin_datos')
      expect(res.findings[0].ingredientIndex).toBe(0)
    }
  })

  it('un ingrediente incompleto no oculta los avisos de los demás', () => {
    const res = checkRecipeIngredients([{ name: 'queso' }, { name: '200 g' }], [restriction('leche')])
    expect(res.status).toBe('hallazgos')
    expect(res.counts).toEqual({ conflicto: 1, revisar: 0, sin_datos: 1 })
  })

  it('ingredientes completos sin coincidencias → ninguna_coincidencia + texto fijo', () => {
    const res = checkRecipeIngredients([{ name: 'aceite de oliva' }, { name: 'tomate' }, { name: 'sal' }], [restriction('leche')])
    expect(res.status).toBe('ninguna_coincidencia')
    expect(res.message).toBe(NO_MATCH_DISCLAIMER)
    expect(NO_MATCH_DISCLAIMER).toBe('No hemos detectado coincidencias con lo que tienes registrado, pero esto no garantiza que la receta sea segura: revisa etiquetas y posibles trazas.')
    expect(res.findings).toEqual([])
    expect(dietaryBadgeText(res)).toBeNull()
  })

  it('con hallazgos: orden conflicto → revisar, mensaje de revisión y descargo general', () => {
    const res = checkRecipeIngredients([{ name: 'salsa' }, { name: 'nata' }], [restriction('leche')])
    expect(res.status).toBe('hallazgos')
    expect(res.findings.map((f) => f.level)).toEqual(['conflicto', 'revisar'])
    expect(res.message).toBe(REVIEW_MESSAGE)
    expect(res.disclaimer).toBe(DIETARY_GENERAL_DISCLAIMER)
    expect(dietaryBadgeText(res)).toBe('Revisar: 2 avisos')
  })

  it('el hallazgo trae el ingrediente original, la restricción afectada y la razón', () => {
    const r = restriction('leche', 'alergia')
    const res = checkRecipeIngredients([{ name: '  Queso Rallado ', quantity: '100', unit: 'g' }], [r])
    const f = res.findings[0]
    expect(f).toMatchObject({ level: 'conflicto', restrictionId: r.id, kind: 'alergia', ingredientIndex: 0, ingredient: '  Queso Rallado ' })
    expect(f.matchedTerms).toContain('queso')
    expect(f.reason).toMatch(/queso/)
  })

  it('se mira también la cantidad y la unidad (recetas importadas con la línea entera ahí)', () => {
    expect(checkRecipeIngredients([{ name: 'ingrediente', quantity: '2 vasos de leche' }], [restriction('leche')]).status).toBe('hallazgos')
    expect(checkRecipeIngredients([{ name: 'harina', unit: 'sin gluten' }], [restriction('gluten')]).status).toBe('ninguna_coincidencia')
  })

  it('varias personas con la misma alergia dan un aviso cada una (la pantalla las relaciona con su dueña)', () => {
    const a = restriction('leche'), b = restriction('leche', 'intolerancia')
    const res = checkRecipeIngredients([{ name: 'queso' }], [a, b])
    expect(res.findings.map((f) => f.restrictionId).sort()).toEqual([a.id, b.id].sort())
  })

  it('el resultado nunca lleva datos de la ficha (ni ids de miembro ni notas)', () => {
    const full = { id: 'rid', memberId: 'MIEMBRO-SECRETO-123', kind: 'alergia' as const, allergenKey: 'leche' as const, customLabel: null, severity: 'grave' as const, note: 'NOTA-SECRETA-777', createdAt: 'x', updatedAt: 'y' }
    const res = checkRecipeIngredients([{ name: 'queso' }, { name: 'salsa' }], [full])
    const json = JSON.stringify(res)
    expect(json).not.toContain('MIEMBRO-SECRETO-123')
    expect(json).not.toContain('NOTA-SECRETA-777')
  })

  it('rápido: 500 ingredientes × 6 restricciones', () => {
    const ings = Array.from({ length: 500 }, (_, i) => ({ name: `ingrediente ${i} con queso y harina de trigo` }))
    const rs = (['leche', 'gluten', 'huevo', 'soja', 'almendra', 'mostaza'] as const).map((k) => restriction(k))
    const t0 = Date.now()
    const res = checkRecipeIngredients(ings, rs)
    expect(Date.now() - t0).toBeLessThan(3000)
    expect(res.counts.conflicto).toBeGreaterThan(900)
  })
})

describe('coherencia del diccionario', () => {
  // Cada frase del diccionario, escrita como ingrediente, debe disparar su propia clave: así se detectan frases que el motor no llega a reconocer.
  function plain(t: RuleTerm): string {
    return typeof t === 'string' ? t : t.p
  }
  for (const key of DIETARY_ALLERGEN_KEYS) {
    it(`${key}: sus frases se reconocen a sí mismas`, () => {
      const rules = KEY_RULES[key]
      for (const t of rules.named) expect(level(plain(t), key), `named «${plain(t)}»`).toBe('conflicto')
      for (const t of rules.cls ?? []) expect(level(plain(t), key), `cls «${plain(t)}»`).toBe('conflicto')
      for (const t of rules.review ?? []) expect(['revisar', 'conflicto'], `review «${plain(t)}»`).toContain(level(plain(t), key))
    })
  }

  it('hay reglas para todas las claves y los 14 alérgenos de declaración obligatoria de la UE', () => {
    for (const key of DIETARY_ALLERGEN_KEYS) {
      expect(KEY_RULES[key], key).toBeDefined()
      expect(DIETARY_CATALOG.find((e) => e.key === key), key).toBeDefined()
    }
    const eu14 = ['gluten', 'crustaceos', 'huevo', 'pescado', 'cacahuete', 'soja', 'leche', 'frutos_de_cascara', 'apio', 'mostaza', 'sesamo', 'sulfitos', 'altramuces', 'moluscos']
    for (const k of eu14) expect(DIETARY_ALLERGEN_KEYS as readonly string[], k).toContain(k)
    expect(DIETARY_CATALOG.filter((e) => e.group === 'ue14' && eu14.includes(e.key))).toHaveLength(14)
  })

  it('las claves de TypeScript coinciden EXACTAMENTE con las de la migración 0279', () => {
    const body = /private\.dietary_allergen_keys\(\)[\s\S]*?select array\[([\s\S]*?)\]::text\[\]/.exec(migration)?.[1] ?? ''
    const sqlKeys = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...sqlKeys].sort()).toEqual([...DIETARY_ALLERGEN_KEYS].sort())
  })

  it('los límites de TypeScript coinciden con los de la base de datos', () => {
    expect(DIETARY_LABEL_MAX).toBe(60)
    expect(DIETARY_NOTE_MAX).toBe(200)
    expect(migration).toContain('char_length(custom_label) between 1 and 60')
    expect(migration).toContain('char_length(note) between 1 and 200')
    expect(migration).toMatch(/>= 40 then\s+raise exception 'DIET_LIMIT'/)
  })

  it('no hay frases duplicadas con distinto nivel dentro de la misma clave (confusión de reglas)', () => {
    for (const key of DIETARY_ALLERGEN_KEYS) {
      const r = KEY_RULES[key]
      const named = new Set(r.named.map((t) => normalizeDietaryText(plain(t))))
      for (const t of r.cls ?? []) expect(named.has(normalizeDietaryText(plain(t))), `${key}: «${plain(t)}» está en named y en cls`).toBe(false)
    }
  })
})

describe('validación de lo que escribe la persona', () => {
  it('acepta una clave del catálogo o un texto libre, nunca los dos ni ninguno', () => {
    expect(validateDietaryDraft({ kind: 'alergia', allergenKey: 'leche' })).toMatchObject({ ok: true, value: { allergenKey: 'leche', customLabel: null } })
    expect(validateDietaryDraft({ kind: 'restriccion', customLabel: '  Kiwi   verde ' })).toMatchObject({ ok: true, value: { customLabel: 'Kiwi verde', allergenKey: null } })
    expect(validateDietaryDraft({ kind: 'alergia', allergenKey: 'leche', customLabel: 'x' })).toEqual({ ok: false, error: 'both' })
    expect(validateDietaryDraft({ kind: 'alergia' })).toEqual({ ok: false, error: 'none' })
    expect(validateDietaryDraft({ kind: 'alergia', customLabel: '   ' })).toEqual({ ok: false, error: 'none' })
  })

  it('rechaza claves, tipos, gravedades y longitudes fuera de lo permitido', () => {
    expect(validateDietaryDraft({ kind: 'alergia', allergenKey: 'platano' })).toEqual({ ok: false, error: 'key' })
    expect(validateDietaryDraft({ kind: 'celiaquia', allergenKey: 'gluten' })).toEqual({ ok: false, error: 'kind' })
    expect(validateDietaryDraft({ kind: 'alergia', allergenKey: 'leche', severity: 'mortal' })).toEqual({ ok: false, error: 'severity' })
    expect(validateDietaryDraft({ kind: 'restriccion', customLabel: 'x'.repeat(61) })).toEqual({ ok: false, error: 'label' })
    expect(validateDietaryDraft({ kind: 'alergia', allergenKey: 'leche', note: 'x'.repeat(201) })).toEqual({ ok: false, error: 'note' })
    expect(validateDietaryDraft({ kind: 'restriccion', customLabel: 'x'.repeat(60) }).ok).toBe(true)
    expect(validateDietaryDraft({ kind: 'alergia', allergenKey: 'leche', note: 'x'.repeat(200) }).ok).toBe(true)
  })

  it('«alergia a la lactosa» no existe: la lactosa solo es intolerancia o restricción', () => {
    expect(validateDietaryDraft({ kind: 'alergia', allergenKey: 'lactosa' })).toEqual({ ok: false, error: 'kind_not_allowed' })
    expect(validateDietaryDraft({ kind: 'intolerancia', allergenKey: 'lactosa' }).ok).toBe(true)
    expect(validateDietaryDraft({ kind: 'intolerancia', allergenKey: 'gluten' }).ok).toBe(true) // celiaquía registrada como intolerancia
  })

  it('el nombre que se enseña no incluye personas', () => {
    expect(dietaryRestrictionLabel({ allergenKey: 'leche', customLabel: null })).toBe('Leche (proteínas lácteas)')
    expect(dietaryRestrictionLabel({ allergenKey: null, customLabel: 'Kiwi' })).toBe('Kiwi')
  })
})

describe('NUNCA devuelve «segura»', () => {
  // Generador determinista (sin dependencias): mezcla ingredientes y restricciones y comprueba las invariantes.
  let state = 12345
  const rnd = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
  const pool = [
    'leche', 'nata', 'queso', 'harina de trigo', 'pan sin gluten', 'aceite de oliva', 'tomate', 'sal', 'huevos', 'mayonesa', 'salsa', 'caldo', 'surimi', 'almendras', 'nuez moscada',
    'leche de coco', 'mantequilla de cacahuete', 'gambas', 'mejillones', 'atún', 'arroz', 'pasta', 'pasta de tomate', 'tofu', 'salsa de soja', 'apio', 'mostaza', 'tahini', 'vino blanco',
    'miel', 'manzana', 'kiwi', 'pesto', 'embutido', 'chocolate', '200 g', '', 'al gusto', 'Para la salsa:', 'ajo', 'cebolla', 'pimiento', 'agua', 'azúcar', 'harina sin gluten',
  ]
  const forbidden = /\bseguro\b|\bsegura\b|\bseguros\b|\bseguras\b|libre de|apt[oa]s? para|sin alérgenos|sin alergenos|\bapto\b|\bapta\b/i

  it('en 400 combinaciones aleatorias: estados válidos, sin «segura» y «ninguna_coincidencia» solo con el texto fijo', () => {
    const allowedStatus = ['hallazgos', 'sin_datos', 'ninguna_coincidencia', 'sin_restricciones']
    const keys = [...DIETARY_ALLERGEN_KEYS]
    for (let n = 0; n < 400; n++) {
      const ings = Array.from({ length: Math.floor(rnd() * 8) }, () => ({ name: pool[Math.floor(rnd() * pool.length)] }))
      const rs: DietaryRestrictionInput[] = Array.from({ length: Math.floor(rnd() * 4) }, () => (rnd() < 0.8 ? restriction(keys[Math.floor(rnd() * keys.length)]) : custom(['kiwi', 'histamina', 'x', 'frutos rojos'][Math.floor(rnd() * 4)])))
      const res: RecipeDietaryCheck = checkRecipeIngredients(ings, rs)
      expect(allowedStatus).toContain(res.status)
      // Todo texto generado, salvo el descargo fijo (que contiene «no garantiza que … sea segura»), está libre de palabras prohibidas.
      const texts = [res.disclaimer, ...res.findings.map((f) => f.reason)]
      if (res.status !== 'ninguna_coincidencia') texts.push(res.message)
      for (const t of texts) expect(t, t).not.toMatch(forbidden)
      if (res.status === 'ninguna_coincidencia') {
        expect(res.message).toBe(NO_MATCH_DISCLAIMER)
        expect(res.findings).toEqual([])
        expect(ings.length).toBeGreaterThan(0)
        expect(rs.length).toBeGreaterThan(0)
      }
      if (res.status === 'sin_datos') expect(res.counts.conflicto + res.counts.revisar).toBe(0)
      // Receta sin ingredientes comprobables con restricciones → jamás «ninguna_coincidencia».
      const usable = ings.filter((i) => i.name.trim() && !i.name.trim().endsWith(':') && !/^(200 g|al gusto)$/.test(i.name))
      if (rs.length > 0 && usable.length === 0) expect(res.status).toBe('sin_datos')
    }
  })

  it('el único texto con «segura» es el descargo fijo, y la niega («no garantiza que… sea segura»)', () => {
    expect(NO_MATCH_DISCLAIMER).toMatch(/no garantiza que la receta sea segura/)
    for (const t of [DIETARY_GENERAL_DISCLAIMER, REVIEW_MESSAGE, NO_DATA_MESSAGE]) expect(t).not.toMatch(forbidden)
  })

  it('lenguaje prohibido: ningún texto de la interfaz que genera el módulo lo contiene', () => {
    const texts: string[] = [...Object.values(DIETARY_KIND_LABELS), ...Object.values(DIETARY_SEVERITY_LABELS)]
    for (const e of DIETARY_CATALOG) texts.push(e.label, e.short, e.examples)
    // Se generan avisos con TODAS las frases del diccionario para recoger cada «razón» que puede salir.
    for (const key of DIETARY_ALLERGEN_KEYS) {
      const rules = KEY_RULES[key]
      const all = [...rules.named, ...(rules.cls ?? []), ...(rules.review ?? [])].map((t) => (typeof t === 'string' ? t : t.p))
      for (const ing of all) {
        for (const suffix of ['', ' sin gluten', ' vegano']) {
          const res = checkRecipeIngredients([{ name: ing + suffix }], [restriction(key)])
          for (const f of res.findings) texts.push(f.reason)
        }
      }
    }
    expect(texts.length).toBeGreaterThan(1000)
    for (const t of new Set(texts)) expect(t, t).not.toMatch(forbidden)
    // Las etiquetas de interfaz no usan «segur…» (ni siquiera negado: solo el descargo fijo puede).
    for (const t of new Set(texts)) expect(t.toLowerCase(), t).not.toContain('segur')
  })

  it('«ninguna_coincidencia» nunca produce insignia en tarjetas ni listas', () => {
    const res = checkRecipeIngredients([{ name: 'tomate' }], [restriction('leche')])
    expect(res.status).toBe('ninguna_coincidencia')
    expect(dietaryBadgeText(res)).toBeNull()
  })
})

describe('falsos positivos y negativos CONOCIDOS (documentados: si cambian, hay que actualizar la documentación)', () => {
  it('falso positivo: «dorada» como adjetivo se toma por pescado', () => {
    expect(level('cebolla dorada', 'pescado')).toBe('conflicto')
  })
  it('falso negativo: un producto elaborado que no nombra el alérgeno no avisa', () => {
    expect(level('galletas María', 'huevo')).toBe('revisar') // las galletas se avisan; pero…
    expect(level('Cola Cao', 'leche')).toBeNull() // …marcas sin palabra clave no se reconocen
    expect(level('embutido de pavo', 'huevo')).toBeNull()
  })
  it('falso negativo: faltas de ortografía no se reconocen', () => {
    expect(level('quezo', 'leche')).toBeNull()
    expect(level('cachuetes', 'cacahuete')).toBeNull()
  })
  it('la comprobación solo mira ingredientes: no títulos ni pasos', () => {
    expect(checkRecipeIngredients([{ name: 'tomate' }], [restriction('leche')]).status).toBe('ninguna_coincidencia')
  })
})

describe('recetas completas (ingredientes explícitos, ambiguos e incompletos)', () => {
  const lasana = [{ name: 'placas de lasaña', quantity: '12' }, { name: 'carne picada', quantity: '500', unit: 'g' }, { name: 'tomate triturado' }, { name: 'bechamel', quantity: '600', unit: 'ml' }, { name: 'queso rallado' }, { name: 'cebolla' }, { name: 'aceite de oliva' }]

  it('lasaña: leche, gluten y huevo avisan cada una con su nivel', () => {
    const leche = restriction('leche'), gluten = restriction('gluten'), huevo = restriction('huevo'), pescado = restriction('pescado')
    const res = checkRecipeIngredients(lasana, [leche, gluten, huevo, pescado])
    const by = (id: string) => res.findings.filter((f) => f.restrictionId === id).map((f) => `${f.ingredient}:${f.level}`)
    expect(by(leche.id)).toEqual(['bechamel:conflicto', 'queso rallado:conflicto', 'placas de lasaña:revisar'])
    expect(by(gluten.id)).toEqual(['placas de lasaña:conflicto', 'bechamel:conflicto'])
    expect(by(huevo.id)).toEqual(['placas de lasaña:revisar'])
    expect(by(pescado.id)).toEqual([])
    expect(res.status).toBe('hallazgos')
  })

  it('pasta al pesto: lo ambiguo (pesto, piñones) se avisa como «revisar» para quien tiene frutos de cáscara', () => {
    const ings = [{ name: 'espaguetis' }, { name: 'pesto' }, { name: 'piñones' }, { name: 'aceite' }]
    expect(checkRecipeIngredients(ings, [restriction('frutos_de_cascara')]).findings.map((f) => f.level)).toEqual(['revisar', 'revisar'])
    expect(checkRecipeIngredients(ings, [restriction('cacahuete')]).status).toBe('ninguna_coincidencia')
  })

  it('ensalada de atún: pescado conflicto, sulfitos solo revisar por el vinagre', () => {
    const ings = [{ name: 'lechuga' }, { name: 'tomate' }, { name: 'atún en lata' }, { name: 'vinagre' }, { name: 'sal' }]
    expect(checkRecipeIngredients(ings, [restriction('pescado')]).findings.map((f) => `${f.ingredient}:${f.level}`)).toEqual(['atún en lata:conflicto'])
    expect(checkRecipeIngredients(ings, [restriction('sulfitos')]).findings.map((f) => `${f.ingredient}:${f.level}`)).toEqual(['vinagre:revisar'])
  })

  it('una receta con una línea de título y otra incompleta sigue avisando de lo comprobable', () => {
    const ings = [{ name: 'Para la masa:' }, { name: 'harina de trigo' }, { name: 'sal' }, { name: '' }]
    const res = checkRecipeIngredients(ings, [restriction('gluten')])
    expect(res.status).toBe('hallazgos')
    expect(res.counts).toEqual({ conflicto: 1, revisar: 0, sin_datos: 1 })
  })
})
