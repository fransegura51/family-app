import { describe, expect, it } from 'vitest'
import { foodQuestionResults, unclassifiedQuestions } from '@/domain/eventMenuHub'
import type { EventGuestQuestion } from '@/domain/types'

// «Quitar de comida» (2.ª tanda, regresión): quitar la clasificación saca la pregunta del bloque de comida
// y la deja como «Otra pregunta»; «Es de comida» la devuelve. Solo cambia `topic` de esa pregunta.
const q = (id: string, topic: 'comida' | null, active = true) => ({ id, eventId: 'e1', familyId: 'f1', prompt: id, scope: 'persona', required: false, active, sortOrder: 1, createdAt: '', topic }) as unknown as EventGuestQuestion

describe('Quitar de comida — regresión del comportamiento visto en iPhone', () => {
  it('una pregunta marcada como comida alimenta el bloque de comida', () => {
    expect(foodQuestionResults([q('carne', 'comida')], [], [], [], []).map((r) => r.question.id)).toEqual(['carne'])
  })

  it('al quitarla de comida (topic null) deja de alimentar el bloque de comida', () => {
    expect(foodQuestionResults([q('carne', null)], [], [], [], [])).toEqual([])
  })

  it('al quitarla aparece como «Otra pregunta» (sin clasificar), y solo ella', () => {
    const questions = [q('carne', null), q('musica', 'comida'), q('canciones', null, false)]
    expect(unclassifiedQuestions(questions).map((x) => x.id)).toEqual(['carne'])
  })

  it('«Es de comida» la devuelve al bloque de comida y sale de «Otras preguntas»', () => {
    const back = q('carne', 'comida')
    expect(foodQuestionResults([back], [], [], [], []).map((r) => r.question.id)).toEqual(['carne'])
    expect(unclassifiedQuestions([back])).toEqual([])
  })

  it('quitar una pregunta inactiva no la muestra en ninguna lista', () => {
    expect(foodQuestionResults([q('x', 'comida', false)], [], [], [], [])).toEqual([])
    expect(unclassifiedQuestions([q('x', null, false)])).toEqual([])
  })
})
