// Trinquete de calidad del normalizador sobre los dos corpus de prueba (corpus.ts y corpusB.ts, redactados a mano, NO son tickets reales).
// Si una regla nueva empeora estas cifras, la prueba falla; al mejorar el catálogo, SUBE los mínimos. Son una red de seguridad, no el resultado de la prueba limpia con una familia real.
import { describe, expect, it } from 'vitest'
import { CORPUS } from './corpus'
import { CORPUS_B } from './corpusB'
import { evaluateCorpus } from './evaluate'

const A = evaluateCorpus(CORPUS)
const B = evaluateCorpus(CORPUS_B)

describe('corpus A (de ajuste)', () => {
  it('identifica casi todo y NUNCA se equivoca de producto con seguridad', () => {
    expect(A.summary.lines).toBeGreaterThanOrEqual(270)
    expect(A.summary.identity.incorrecta).toBe(0)
    expect(A.summary.identity.correcta / A.summary.identity.total).toBeGreaterThanOrEqual(0.99)
    expect(A.summary.secureWrong).toBe(0)
  })
  it('atributos (talla, etapa, tipo de leche…) y formato siempre bien', () => {
    expect(A.summary.attrs.incorrecta + A.summary.attrs.sin_identificar).toBe(0)
    expect(A.summary.format.incorrecta + A.summary.format.sin_identificar).toBe(0)
  })
})

describe('corpus B (ciego en su primera pasada)', () => {
  it('identificación y clase', () => {
    expect(B.summary.lines).toBeGreaterThanOrEqual(180)
    expect(B.summary.identity.correcta / B.summary.identity.total).toBeGreaterThanOrEqual(0.98)
    expect(B.summary.klass.incorrecta).toBe(0)
    expect(B.summary.secureWrong).toBeLessThanOrEqual(1) // «MEJILLONES NATURAL» (mejillón fresco o en conserva) es una ambigüedad conocida
    expect(B.summary.groupableWrong).toBeLessThanOrEqual(1)
  })
  it('atributos y formato', () => {
    expect(B.summary.attrs.incorrecta).toBe(0)
    expect(B.summary.format.incorrecta).toBe(0)
  })
})

describe('frente al clasificador por palabras clave anterior', () => {
  it('acierta mucho más clases y se equivoca menos', () => {
    for (const { summary } of [A, B]) {
      expect(summary.klass.correcta).toBeGreaterThan(summary.oldKlass.correcta * 1.5)
      expect(summary.klass.incorrecta).toBeLessThan(summary.oldKlass.incorrecta)
    }
  })
  it('las clases que el clasificador anterior no conocía (no alimentos, bebé, infantil) ahora se reconocen', () => {
    const nonFood = [...A.rows, ...B.rows].filter((r) => r.expectedClass?.startsWith('other.') && r.klass === 'correcta')
    expect(nonFood.length).toBeGreaterThan(60)
    expect([...A.rows, ...B.rows].filter((r) => r.expectedClass?.startsWith('other.') && r.oldKlass === 'correcta').length).toBe(0)
  })
})
