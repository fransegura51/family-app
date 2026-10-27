// INTEGRIDAD DEL CATÁLOGO MAESTRO: estructura válida y, sobre todo, que ningún alias «se coma» una variante que distingue productos.
// Si un alias contiene «cruda», «fresa» o una marca, dos artículos distintos acabarían con la misma identidad y se agruparían solos.
import { describe, expect, it } from 'vitest'
import { CATALOG_CLASSES, CLASS_CODES } from './classes'
import { CATALOG_ENTRIES, CATALOG_VERSION } from './catalogData'
import { BRAND_KEYS } from './lexicon'
import { tokensOf } from './tokens'

// Palabras que cambian de producto: solo pueden ir en un alias si ya forman parte del NOMBRE de la entrada.
const VARIANTS = new Set([
  'cocido', 'cocida', 'crudo', 'cruda', 'fresco', 'fresca', 'congelado', 'congelada', 'natural', 'integral', 'light', 'zero', 'cero', 'sin', 'entera',
  'semidesnatada', 'desnatada', 'grande', 'pequeno', 'mediano', 'picante', 'dulce', 'salado', 'ahumado', 'curado', 'tierno', 'semicurado', 'rojo', 'blanco',
  'negro', 'verde', 'tinto', 'rosado', 'rubio', 'tostado', 'molido', 'grano', 'soluble', 'bio', 'eco', 'ecologico', 'azucar', 'gluten', 'lactosa',
  // sabores y rellenos
  'fresa', 'vainilla', 'chocolate', 'limon', 'naranja', 'coco', 'platano', 'melocoton', 'cafe', 'caramelo', 'menta', 'nata', 'pistacho', 'avellana', 'almendra',
  'jamon', 'pollo', 'atun', 'ternera', 'cerdo', 'pavo', 'pisto', 'carne', 'verdura', 'bacalao', 'marisco', 'manzana', 'pina', 'frambuesa', 'cereza',
])
// Palabras que solo dicen «esto va en conserva»: definen la entrada, no una variante.
const CONSERVA = new Set(['lata', 'escabeche', 'conserva', 'bote', 'tarro'])
// Alias que DEFINEN la entrada aunque lleven una de esas palabras («pavo cocido» ES el fiambre; «zero» es lo que hace que sea ese refresco).
const ALLOWED = new Set([
  'emb.pavo.fiambre:pavo cocido', 'emb.pavo.fiambre:pechuga pavo cocida', 'emb.pavo.fiambre:pechuga cocida', 'emb.pollo.fiambre:pollo cocido loncha',
  'desp.legumbre.cocida:cocido', 'bna.refresco:zero', 'bna.refresco:cero', 'bna.refresco:light', 'bna.cerveza.sin:cerveza cero', 'bal.vino:tinto',
  'emb.pavo.fiambre:pechuga pavo cocido', 'emb.pavo.fiambre:pechuga cocido', 'verd.repollo:col blanco', 'desp.alubia:judia blanco', 'pap.pegamento:cola blanco',
  'pes.otros:marisco', 'pes.otros:marisco mixto', 'carne.otras:carne fresca',
])
const BRAND_WORDS = new Set(BRAND_KEYS.filter((b) => !b.includes(' ')))

describe('catálogo maestro · estructura', () => {
  it('claves únicas, versión y tamaño razonable', () => {
    const keys = CATALOG_ENTRIES.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(CATALOG_VERSION).toBeGreaterThanOrEqual(1)
    expect(CATALOG_ENTRIES.length).toBeGreaterThanOrEqual(500)
  })
  it('todas las clases existen y toda clase de producto del catálogo tiene al menos una entrada', () => {
    const used = new Set(CATALOG_ENTRIES.map((e) => e.classKey))
    for (const code of ['carne', 'pan', 'lac', 'hue', 'cong', 'snk', 'desp', 'ver', 'fru', 'pes', 'cond', 'bna', 'bal', 'pos', 'inf', 'pre', 'limp', 'cui', 'masc', 'pap', 'beb', 'farm', 'uten', 'ropa', 'elec', 'jard', 'jug', 'ferr']) {
      expect(used.has(CLASS_CODES[code]), `sin entradas para la clase ${code}`).toBe(true)
    }
    for (const e of CATALOG_ENTRIES) expect(CATALOG_CLASSES.some((c) => c.key === e.classKey)).toBe(true)
  })
  it('las claves siguen un formato estable y las entradas de clase son pocas frente al total', () => {
    for (const e of CATALOG_ENTRIES) expect(e.key).toMatch(/^[a-z0-9]+(\.[a-z0-9]+)*$/)
    expect(CATALOG_ENTRIES.filter((e) => e.broad).length).toBeLessThan(CATALOG_ENTRIES.length / 5)
  })
})

describe('catálogo maestro · los alias no se comen variantes ni marcas', () => {
  it('ningún alias adicional contiene una variante, un sabor o una marca que no esté ya en el nombre de la entrada', () => {
    const offenders: string[] = []
    for (const e of CATALOG_ENTRIES) {
      // Las entradas de clase solo clasifican (no identifican un producto): sus alias pueden nombrar variantes.
      if (e.broad) continue
      const nameTokens = new Set(tokensOf(e.name))
      // el primer alias es el propio nombre; el resto son los escritos a mano
      for (const alias of e.aliases.slice(1)) {
        if (ALLOWED.has(`${e.key}:${alias.join(' ')}`)) continue
        for (const w of alias) {
          if (nameTokens.has(w) || CONSERVA.has(w)) continue
          if (VARIANTS.has(w)) offenders.push(`${e.key}: «${alias.join(' ')}» lleva la variante «${w}»`)
          else if (BRAND_WORDS.has(w)) offenders.push(`${e.key}: «${alias.join(' ')}» lleva la marca «${w}»`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
  it('ningún alias idéntico apunta a dos entradas distintas (sería una ambigüedad permanente)', () => {
    const seen = new Map<string, string>()
    const dup: string[] = []
    for (const e of CATALOG_ENTRIES) {
      for (const alias of e.aliases) {
        const k = [...alias].sort().join(' ')
        const prev = seen.get(k)
        if (prev && prev !== e.key) dup.push(`«${k}»: ${prev} / ${e.key}`)
        else seen.set(k, e.key)
      }
    }
    expect(dup).toEqual([])
  })
})
