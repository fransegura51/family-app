import { describe, expect, it } from 'vitest'
import { ALIAS_MAX, ALIAS_MIN, ALIAS_PATTERN, aliasCombinationCount, isSuggestableAlias, suggestAlias } from '@/domain/communityAlias'

// Generador de números repetible (mulberry32) para que las pruebas sean estables.
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Palabras que el servidor rechaza como alias (migración 0265, ALIAS_RESERVED), con o sin separadores.
const SERVER_RESERVED = /(^|[ ._-])(pepa|equipo|admin|administrador|administradora|administracion|moderador|moderadora|soporte|oficial)([ ._-]|$)/
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

describe('generador de alias divertidos', () => {
  it('todo lo que genera cumple el formato del servidor (3-24 caracteres, letras con tildes/ñ) y no contiene palabras reservadas', () => {
    const rng = seeded(1)
    for (let i = 0; i < 2000; i++) {
      const a = suggestAlias([], rng)
      expect(a.length, a).toBeGreaterThanOrEqual(ALIAS_MIN)
      expect(a.length, a).toBeLessThanOrEqual(ALIAS_MAX)
      expect(ALIAS_PATTERN.test(a), a).toBe(true)
      expect(isSuggestableAlias(a), a).toBe(true)
      expect(SERVER_RESERVED.test(norm(a)), a).toBe(false)
      expect(norm(a), a).not.toMatch(/pepa|equipo|admin|soporte|oficial|moderador/)
    }
  })

  it('es variado: en 1000 propuestas salen cientos distintas y de muchas formas (no combinaciones casi idénticas)', () => {
    const rng = seeded(7)
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(suggestAlias([], rng))
    expect(seen.size).toBeGreaterThan(500)
    expect(aliasCombinationCount()).toBeGreaterThan(2000)
    // Ninguna palabra inicial acapara la lista: la más repetida no llega al 8 %.
    const starts = new Map<string, number>()
    for (const a of seen) {
      const w = a.match(/^[A-ZÀ-Ý][a-zà-ÿ]+/)?.[0] ?? a
      starts.set(w, (starts.get(w) ?? 0) + 1)
    }
    expect(Math.max(...starts.values()) / seen.size).toBeLessThan(0.08)
  })

  it('concuerda el género en las combinaciones nombre + adjetivo (nada de «CroquetaViajero» ni «CalcetínPerdida»)', () => {
    const fem = 'Croqueta|Tortilla|Cuchara|Sartén|Cazuela|Tostada|Galleta|Paella|Nevera|Despensa|Mochila'
    const mas = 'Calcetín|Cucharón|Tupper|Sofrito|Bizcocho|Tenedor|Fogón|Horno|Delantal'
    const adjM = 'Viajero|Despistado|Curioso|Travieso|Soñador|Aventurero|Madrugador|Perdido|Ahorrador|Dormilón|Glotón|Presumido|Organizado|Inquieto|Campeón|Misterioso'
    const adjF = 'Viajera|Despistada|Curiosa|Traviesa|Soñadora|Aventurera|Madrugadora|Perdida|Ahorradora|Dormilona|Glotona|Presumida|Organizada|Inquieta|Campeona|Misteriosa'
    const wrongF = new RegExp(`^(${fem})(${adjM})$`)
    const wrongM = new RegExp(`^(${mas})(${adjF})$`)
    const rng = seeded(3)
    for (let i = 0; i < 2000; i++) {
      const a = suggestAlias([], rng)
      expect(wrongF.test(a), a).toBe(false)
      expect(wrongM.test(a), a).toBe(false)
    }
  })

  it('«Sugerir otro» nunca devuelve algo de la lista a evitar (ni cambiando mayúsculas), aunque el azar insista', () => {
    const always = () => 0 // siempre elige lo primero: obliga al generador a reintentar y caer en la lista hecha
    const first = suggestAlias([], always)
    const second = suggestAlias([first], always)
    expect(second.toLowerCase()).not.toBe(first.toLowerCase())
    const rng = seeded(11)
    let previous = suggestAlias([], rng)
    for (let i = 0; i < 300; i++) {
      const next = suggestAlias([previous.toUpperCase()], rng)
      expect(next.toLowerCase()).not.toBe(previous.toLowerCase())
      previous = next
    }
  })

  it('incluye los ejemplos aprobados y rechaza los alias reservados', () => {
    for (const ok of ['CroquetaViajera', 'CapitánSofrito', 'TortillaConArte', 'FamiliaEnAcción', 'DetectiveDelOrden', 'CucharónFeliz', 'PlanetaRecetas', 'CalcetínPerdido', 'ReinaDelTupper', 'ChefDespistado']) {
      expect(isSuggestableAlias(ok), ok).toBe(true)
    }
    for (const bad of ['Pepa', 'EquipoPepa', 'Admin', 'FanDePepa', 'Soporte', 'Oficial', 'ab', 'Nombre Con Ñ y un alias demasiado largo']) {
      expect(isSuggestableAlias(bad), bad).toBe(false)
    }
  })
})
