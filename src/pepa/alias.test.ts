import { describe, expect, it } from 'vitest'
import { createAliasMap } from './alias'

describe('alias de nombres', () => {
  const map = createAliasMap(['Eric', 'Jennifer', 'Fernando', 'Ana María'])

  it('sustituye nombres reales por alias', () => {
    expect(map.aliasize('qué tiene Eric mañana')).toBe('qué tiene Persona A mañana')
    expect(map.aliasize('dentista de Jennifer y Fernando')).toBe('dentista de Persona B y Persona C')
  })

  it('no distingue mayúsculas ni acentos', () => {
    expect(map.aliasize('cumple de ERIC')).toBe('cumple de Persona A')
    expect(map.aliasize('cita de ana maria')).toBe('cita de Persona D')
    expect(createAliasMap(['José']).aliasize('cita de Jose y JOSÉ')).toBe('cita de Persona A y Persona A')
  })

  it('reconoce el primer nombre de un nombre compuesto', () => {
    expect(map.aliasize('llama a Ana')).toBe('llama a Persona D')
  })

  it('el nombre largo gana al corto', () => {
    expect(map.aliasize('con Ana María')).toBe('con Persona D')
  })

  it('no toca palabras que solo contienen el nombre', () => {
    expect(map.aliasize('el ericaceae de Fernandos')).toBe('el ericaceae de Fernandos')
    expect(createAliasMap(['Ana']).aliasize('banana y Ana')).toBe('banana y Persona A')
  })

  it('no cambia nada si no hay nombres', () => {
    expect(map.aliasize('leche huevos y pan')).toBe('leche huevos y pan')
    expect(createAliasMap([]).aliasize('Eric')).toBe('Eric')
  })

  it('restaura los nombres en la respuesta', () => {
    expect(map.restore('Persona A')).toBe('Eric')
    expect(map.restore('cita de persona b y Persona C.')).toBe('cita de Jennifer y Fernando.')
  })

  it('funciona aunque el texto lleve emojis', () => {
    expect(map.aliasize('🎂 cumple de Eric 🎉')).toBe('🎂 cumple de Persona A 🎉')
  })

  it('un alias desconocido se deja como está', () => {
    expect(map.restore('Persona Z')).toBe('Persona Z')
  })

  it('ida y vuelta conserva el texto', () => {
    const original = 'Qué tiene Eric el viernes con Jennifer'
    expect(map.restore(map.aliasize(original))).toBe(original)
  })
})
