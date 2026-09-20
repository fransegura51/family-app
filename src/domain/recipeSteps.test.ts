import { describe, expect, it } from 'vitest'
import { dedupeStepNumbers } from './recipeSteps'

describe('dedupeStepNumbers', () => {
  it('removes a repeated step number at the start of a line', () => {
    expect(dedupeStepNumbers('1. 1. Mezcla\n2. 2. Hornea')).toBe('1. Mezcla\n2. Hornea')
  })

  it('leaves normal numbering and numbers inside the text alone', () => {
    expect(dedupeStepNumbers('1. Mezcla\n2. Hornea 15. minutos\n1. 2. distinto')).toBe('1. Mezcla\n2. Hornea 15. minutos\n1. 2. distinto')
  })
})
