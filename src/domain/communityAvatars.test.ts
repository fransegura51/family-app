import { describe, expect, it } from 'vitest'
import { ALL_AVATARS, AVATAR_CATEGORIES, categoryOfAvatar, isValidAvatar, LEGACY_AVATARS } from '@/domain/communityAvatars'

describe('Comunidad — catálogo de avatares', () => {
  it('hay unos 100 iconos repartidos en seis categorías', () => {
    expect(AVATAR_CATEGORIES.map((c) => c.id)).toEqual(['caras', 'animales', 'comida', 'aficiones', 'naturaleza', 'personajes'])
    expect(ALL_AVATARS.length).toBeGreaterThanOrEqual(95)
    expect(ALL_AVATARS.length).toBeLessThanOrEqual(130)
  })
  it('se conservan todos los iconos que ya existían', () => {
    for (const a of LEGACY_AVATARS) expect(ALL_AVATARS, a).toContain(a)
    expect(LEGACY_AVATARS.length).toBe(20)
  })
  it('ninguno se repite (ni dentro de una categoría ni entre categorías)', () => {
    expect(new Set(ALL_AVATARS).size).toBe(ALL_AVATARS.length)
  })
  it('todos cumplen la regla del servidor (≤ 16 caracteres, sin letras ni dígitos)', () => {
    for (const a of ALL_AVATARS) expect(isValidAvatar(a), a).toBe(true)
  })
  it('cada categoría tiene icono de pestaña propio y no está vacía', () => {
    for (const c of AVATAR_CATEGORIES) {
      expect(c.icons.length, c.id).toBeGreaterThan(10)
      expect(c.icons, c.id).toContain(c.tab)
    }
  })
  it('el selector se abre en la categoría del icono elegido', () => {
    expect(categoryOfAvatar('🐶')).toBe('animales')
    expect(categoryOfAvatar('🧑‍🍳')).toBe('comida')
    expect(categoryOfAvatar('🤖')).toBe('personajes')
    expect(categoryOfAvatar(null)).toBe('caras')
    expect(categoryOfAvatar('🪐')).toBe('caras')
  })
  it('rechaza lo que el servidor rechazaría', () => {
    expect(isValidAvatar('A')).toBe(false)
    expect(isValidAvatar('1️⃣')).toBe(false)
    expect(isValidAvatar('')).toBe(false)
  })
})
