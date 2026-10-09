import { describe, expect, it } from 'vitest'
import { desiredForCoberturaFotos, normalizeCoberturaFotosAnswer, type CoberturaFotosAnswer } from '@/domain/eventFotosRecuerdos'

// PEPA Eventos, prompt maestro — Fase 11 (Parte G4): cobertura fotográfica combinable (profesional +
// familiares/amigos + nuestra cuenta a la vez) con "sin cobertura"/"todavía no lo sabemos" como estados
// terminales mutuamente excluyentes. REQUISITO "no alterar datos reales": una respuesta ya guardada con
// la forma antigua (un único valor) se sigue leyendo correctamente, nunca se pierde ni rompe.
describe('normalizeCoberturaFotosAnswer — compatibilidad con respuestas antiguas (forma de un único valor)', () => {
  it('una respuesta antigua "profesional" se lee como seleccionada con ese único elemento', () => {
    expect(normalizeCoberturaFotosAnswer({ choice: 'profesional' })).toEqual({ choice: 'seleccionar', selected: ['profesional'] })
  })
  it('una respuesta antigua "familiares_amigos" o "nuestra_cuenta" se lee igual', () => {
    expect(normalizeCoberturaFotosAnswer({ choice: 'familiares_amigos' })).toEqual({ choice: 'seleccionar', selected: ['familiares_amigos'] })
    expect(normalizeCoberturaFotosAnswer({ choice: 'nuestra_cuenta' })).toEqual({ choice: 'seleccionar', selected: ['nuestra_cuenta'] })
  })
  it('los estados terminales antiguos ("sin_cobertura"/"todavia_no_lo_sabemos") se leen igual, sin selección', () => {
    expect(normalizeCoberturaFotosAnswer({ choice: 'sin_cobertura' })).toEqual({ choice: 'sin_cobertura', selected: [] })
    expect(normalizeCoberturaFotosAnswer({ choice: 'todavia_no_lo_sabemos' })).toEqual({ choice: 'todavia_no_lo_sabemos', selected: [] })
  })
  it('una respuesta ya en la forma nueva se devuelve tal cual (varios elementos combinados)', () => {
    const answer: CoberturaFotosAnswer = { choice: 'seleccionar', selected: ['profesional', 'familiares_amigos'] }
    expect(normalizeCoberturaFotosAnswer(answer)).toEqual(answer)
  })
  it('sin respuesta, o una forma irreconocible, devuelve undefined — nunca inventa una selección', () => {
    expect(normalizeCoberturaFotosAnswer(undefined)).toBeUndefined()
    expect(normalizeCoberturaFotosAnswer({})).toBeUndefined()
    expect(normalizeCoberturaFotosAnswer({ choice: 'algo_desconocido' })).toBeUndefined()
  })
})

describe('desiredForCoberturaFotos — solo genera tarea/presupuesto/proveedor si "profesional" está entre lo combinado', () => {
  it('"profesional" solo, o combinado con otros, genera la tarea de contratar fotógrafo', () => {
    expect(desiredForCoberturaFotos({ choice: 'seleccionar', selected: ['profesional'] }).taskTitle).not.toBeNull()
    const combined = desiredForCoberturaFotos({ choice: 'seleccionar', selected: ['profesional', 'familiares_amigos'] })
    expect(combined.taskTitle).not.toBeNull()
    expect(combined.budgetCategory).toBe('Fotografía')
    expect(combined.providerCategory).toBe('Fotografía')
  })
  it('familiares/amigos y nuestra cuenta, SOLOS (sin "profesional"), nunca generan tarea ni presupuesto ni proveedor', () => {
    const result = desiredForCoberturaFotos({ choice: 'seleccionar', selected: ['familiares_amigos', 'nuestra_cuenta'] })
    expect(result.taskTitle).toBeNull()
    expect(result.budgetCategory).toBeNull()
    expect(result.providerCategory).toBeNull()
  })
  it('sin respuesta, con selección vacía, o en un estado terminal, nunca genera nada', () => {
    expect(desiredForCoberturaFotos(undefined).taskTitle).toBeNull()
    expect(desiredForCoberturaFotos({ choice: 'seleccionar', selected: [] }).taskTitle).toBeNull()
    expect(desiredForCoberturaFotos({ choice: 'sin_cobertura', selected: [] }).taskTitle).toBeNull()
    expect(desiredForCoberturaFotos({ choice: 'todavia_no_lo_sabemos', selected: [] }).taskTitle).toBeNull()
  })
})
