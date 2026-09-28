import { describe, expect, it } from 'vitest'
import { INVITATION_EMOJI_CATEGORIES, INVITATION_SHAPES, invitationEmojiSkinToneVariants, searchInvitationEmoji } from '@/domain/events'

// Fase 3 Bloque 3 (2026-09-27) — biblioteca de emojis por categorías + buscador en español, sin
// dependencias ni API (metadatos locales). Ver también src/state/invitationRecentEmoji.test.ts (recientes)
// y src/ui/invitationDesignerVisualLayersUi.test.ts (cableado del panel).

describe('INVITATION_EMOJI_CATEGORIES — biblioteca ampliada', () => {
  it('tiene bastantes más de los 10 emojis fijos que había antes', () => {
    const total = INVITATION_EMOJI_CATEGORIES.reduce((sum, c) => sum + c.emojis.length, 0)
    expect(total).toBeGreaterThan(100)
  })

  it('varias categorías temáticas reales (no una lista plana única)', () => {
    expect(INVITATION_EMOJI_CATEGORIES.length).toBeGreaterThanOrEqual(10)
    const keys = INVITATION_EMOJI_CATEGORIES.map((c) => c.key)
    expect(keys).toContain('cumpleanos')
    expect(keys).toContain('boda')
    expect(keys).toContain('bebe')
    expect(keys).toContain('fecha_hora')
    expect(keys).toContain('lugares')
  })

  it('cada emoji lleva al menos un término de búsqueda en español (nunca solo el carácter)', () => {
    for (const cat of INVITATION_EMOJI_CATEGORIES) {
      for (const entry of cat.emojis) {
        expect(entry.terms.length, `${entry.char} en "${cat.label}" sin términos`).toBeGreaterThan(0)
      }
    }
  })
})

describe('searchInvitationEmoji — busca por concepto en español, no solo por el carácter', () => {
  it('"corazón" encuentra ❤️', () => {
    expect(searchInvitationEmoji('corazón').map((e) => e.char)).toContain('❤️')
  })

  it('sin tilde ("corazon") encuentra lo mismo que con tilde — normaliza acentos', () => {
    const conTilde = searchInvitationEmoji('corazón').map((e) => e.char)
    const sinTilde = searchInvitationEmoji('corazon').map((e) => e.char)
    expect(sinTilde).toEqual(conTilde)
  })

  it('"tarta" encuentra 🎂', () => {
    expect(searchInvitationEmoji('tarta').map((e) => e.char)).toContain('🎂')
  })

  it('"cumpleaños" encuentra 🎂', () => {
    expect(searchInvitationEmoji('cumpleaños').map((e) => e.char)).toContain('🎂')
  })

  it('"reloj" encuentra 🕐', () => {
    expect(searchInvitationEmoji('reloj').map((e) => e.char)).toContain('🕐')
  })

  it('"ubicación" (con tilde) encuentra 📍', () => {
    expect(searchInvitationEmoji('ubicación').map((e) => e.char)).toContain('📍')
  })

  it('"regalo" encuentra 🎁', () => {
    expect(searchInvitationEmoji('regalo').map((e) => e.char)).toContain('🎁')
  })

  it('"bebé" (con tilde) encuentra 👶', () => {
    expect(searchInvitationEmoji('bebé').map((e) => e.char)).toContain('👶')
  })

  it('"anillo" encuentra 💍', () => {
    expect(searchInvitationEmoji('anillo').map((e) => e.char)).toContain('💍')
  })

  it('"flor" encuentra al menos una flor (🌸/🌷/🌹/🌻)', () => {
    const results = searchInvitationEmoji('flor').map((e) => e.char)
    expect(results.some((c) => ['🌸', '🌷', '🌹', '🌻'].includes(c))).toBe(true)
  })

  it('mayúsculas/minúsculas no importan ("Tarta" == "tarta")', () => {
    expect(searchInvitationEmoji('Tarta').map((e) => e.char)).toEqual(searchInvitationEmoji('tarta').map((e) => e.char))
  })

  it('un término sin ningún resultado real devuelve un array vacío (no inventa coincidencias)', () => {
    expect(searchInvitationEmoji('xyzxyzxyz')).toEqual([])
  })

  it('una búsqueda vacía no devuelve todo el catálogo (evita mostrar 140 emojis como "resultado")', () => {
    expect(searchInvitationEmoji('')).toEqual([])
    expect(searchInvitationEmoji('   ')).toEqual([])
  })

  it('cada emoji sale como mucho una vez aunque coincida en varios términos', () => {
    const results = searchInvitationEmoji('a') // término muy genérico, coincide en muchas entradas
    const chars = results.map((e) => e.char)
    expect(new Set(chars).size).toBe(chars.length)
  })
})

describe('invitationEmojiSkinToneVariants — tono de piel real de Unicode (long-press), ver InvitationEmojiChip en ui/InvitationDesigner.tsx', () => {
  it('👍 (Emoji_Modifier_Base real) da 5 variantes, claro a oscuro, siempre con el emoji base + un único modificador', () => {
    const variants = invitationEmojiSkinToneVariants('👍')
    expect(variants).toHaveLength(5)
    for (const v of variants) {
      expect(v.startsWith('👍')).toBe(true)
      expect([...v].length).toBe(2) // el emoji base + el modificador, ninguna secuencia rara.
    }
    expect(new Set(variants).size).toBe(5) // las 5 son distintas entre sí.
  })

  it('todos los emoji de mano/persona ya presentes en el catálogo con variante real dan exactamente 5 resultados', () => {
    for (const char of ['🙌', '👏', '🙏', '👍', '👶', '👰', '🤵', '🎅', '🤶', '🧙']) {
      expect(invitationEmojiSkinToneVariants(char), `${char} debería tener 5 variantes`).toHaveLength(5)
    }
  })

  it('un emoji sin cara/mano no tiene variante de tono de piel (nunca se inventa una)', () => {
    expect(invitationEmojiSkinToneVariants('🎂')).toEqual([])
    expect(invitationEmojiSkinToneVariants('🎁')).toEqual([])
  })

  it('los emoji de MÁS DE UNA persona (👫, 💑) se dejan fuera a propósito — Unicode no da un tono distinto por persona sin una secuencia ZWJ más compleja, y ante la duda se deja fuera', () => {
    expect(invitationEmojiSkinToneVariants('👫')).toEqual([])
    expect(invitationEmojiSkinToneVariants('💑')).toEqual([])
  })
})

describe('INVITATION_SHAPES — rectángulo/línea/corazón añadidos, resto conservado', () => {
  it('incluye las 3 formas nuevas pedidas, además de las que ya existían', () => {
    const keys = INVITATION_SHAPES.map((s) => s.key)
    expect(keys).toContain('rectangulo')
    expect(keys).toContain('linea')
    expect(keys).toContain('corazon')
    // ya existían — no se han quitado.
    expect(keys).toContain('circulo')
    expect(keys).toContain('estrella')
    expect(keys).toContain('anillo')
    expect(keys).toContain('confeti')
    expect(keys).toContain('ondas')
    expect(keys).toContain('brillos')
  })
})
