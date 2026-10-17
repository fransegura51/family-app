// Contenido inicial de las recetas estructuradas (0282): cada receta sale del texto de su publicación y el parche SQL generado está al día con el JSON.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ingredientLine, orderedKeys, parsePostRecipes, toggleKey, validatePostRecipes, importResultSummary, postRecipeErrorCode } from '@/domain/communityPostRecipes'

const root = process.cwd()
const data = JSON.parse(readFileSync(join(root, 'supabase/seed/community_post_recipes.json'), 'utf8')) as Record<string, Record<string, unknown>[]>
const seedKeys = Object.keys(data).filter((k) => !k.startsWith('_'))

describe('recetas de las publicaciones iniciales', () => {
  it('hay recetas en ocho publicaciones y todas pasan la misma validación que la base de datos', () => {
    expect(seedKeys).toHaveLength(8)
    for (const key of seedKeys) {
      const list = data[key].map(({ anchor: _anchor, ...r }) => r)
      expect(validatePostRecipes(list), key).toBeNull()
    }
  })

  it('cada receta se apoya en una frase que existe de verdad en el texto de su publicación (no se inventa nada)', () => {
    for (const key of seedKeys) {
      const file = join(root, 'supabase/seed/community_initial_posts', key.replace(/^inicial-/, '') + '.md')
      expect(existsSync(file), file).toBe(true)
      const text = readFileSync(file, 'utf8').replace(/\s+/g, ' ')
      for (const r of data[key]) {
        const anchor = String(r.anchor ?? '').replace(/\s+/g, ' ').trim()
        expect(anchor.length, `${key}/${String(r.key)} sin ancla`).toBeGreaterThan(5)
        expect(text, `${key}/${String(r.key)}: «${anchor}»`).toContain(anchor)
      }
    }
  })

  it('una cantidad que el texto no da queda vacía (nunca un número inventado) y no hay claves repetidas dentro de una publicación', () => {
    for (const key of seedKeys) {
      const keys = data[key].map((r) => r.key)
      expect(new Set(keys).size, key).toBe(keys.length)
      for (const r of data[key]) {
        for (const i of r.ingredients as { quantity: unknown }[]) expect(typeof i.quantity === 'string' || typeof i.quantity === 'number').toBe(true)
      }
    }
  })

  it('el parche SQL generado está al día con el JSON (se vuelve a generar con scripts/build-community-post-recipes.mjs) y es idempotente', () => {
    const sql = readFileSync(join(root, 'supabase/seed/community_post_recipes_patch.sql'), 'utf8')
    for (const key of seedKeys) {
      const json = JSON.stringify(data[key].map(({ anchor: _anchor, ...r }) => r))
      expect(sql, key).toContain(`($j$${key}$j$, $j$${json}$j$::jsonb)`)
    }
    expect(sql).toContain('private.community_validate_post_recipes')
    expect(sql).toMatch(/recipes is null/)
    // No es una migración: no está en supabase/migrations y no se aplica sola.
    expect(sql).toContain('NO es una migración')
  })
})

describe('lectura segura de las recetas de una publicación', () => {
  const ok = [
    {
      key: 'migas',
      title: ' Migas ',
      servings: 4,
      ingredients: [
        { name: 'pan duro', quantity: '300', unit: 'g' },
        { name: 'ajo', quantity: '', unit: '' },
      ],
      steps: ['Remoja el pan.', 'Fríe.'],
      tags: ['pan'],
      tip: 'Con pan del día anterior.',
    },
    { key: 'tortitas', title: 'Tortitas', servings: 2, ingredients: [{ name: 'plátano', quantity: 1, unit: '' }], steps: ['Machaca.'], tags: [], tip: null },
  ]

  it('devuelve las recetas válidas, con su texto limpio y la cantidad desconocida vacía', () => {
    const parsed = parsePostRecipes(ok)
    expect(parsed.map((r) => r.title)).toEqual(['Migas', 'Tortitas'])
    expect(parsed[0].ingredients[1].quantity).toBe('')
    expect(parsed[1].ingredients[0].quantity).toBe('1')
    expect(parsed[1].tip).toBeNull()
    expect(ingredientLine(parsed[0].ingredients[0])).toBe('300 g pan duro')
    expect(ingredientLine(parsed[0].ingredients[1])).toBe('ajo')
  })

  it('algo dañado, ausente o a medias = sin recetas (nunca se enseñan recetas incompletas)', () => {
    expect(parsePostRecipes(null)).toEqual([])
    expect(parsePostRecipes(undefined)).toEqual([])
    expect(parsePostRecipes([])).toEqual([])
    expect(parsePostRecipes([{ ...ok[0], servings: 0 }])).toEqual([])
    expect(parsePostRecipes([{ ...ok[0], steps: [] }])).toEqual([])
    expect(parsePostRecipes([ok[0], ok[0]])).toEqual([]) // clave repetida
    expect(parsePostRecipes([{ ...ok[0], simple: true }])).toEqual([])
    expect(parsePostRecipes('no es una lista')).toEqual([])
  })

  it('selección múltiple: se marca y se desmarca y se importa en el orden de la publicación', () => {
    const recipes = parsePostRecipes(ok)
    let sel: string[] = []
    sel = toggleKey(sel, 'tortitas')
    sel = toggleKey(sel, 'migas')
    expect(orderedKeys(recipes, sel)).toEqual(['migas', 'tortitas'])
    sel = toggleKey(sel, 'migas')
    expect(orderedKeys(recipes, sel)).toEqual(['tortitas'])
  })

  it('errores propios de la importación y resumen en claro', () => {
    expect(postRecipeErrorCode({ message: 'Error: KEY_REUSED' })).toBe('KEY_REUSED')
    expect(postRecipeErrorCode({ message: 'NO_FAMILY' })).toBe('NO_FAMILY')
    expect(postRecipeErrorCode({ message: 'NOT_AVAILABLE' })).toBeNull() // es un error de Comunidad
    const base = { ok: true, replayed: false, postId: 'p', recipes: [] }
    expect(importResultSummary({ ...base, recipesCreated: 1, recipesReused: 0 })).toBe('1 receta nueva guardada')
    expect(importResultSummary({ ...base, recipesCreated: 2, recipesReused: 1 })).toBe('2 recetas nuevas guardadas · 1 receta que ya tenías (no se ha duplicado)')
    expect(importResultSummary({ ...base, recipesCreated: 0, recipesReused: 0 })).toBe('No había nada que guardar.')
  })
})
