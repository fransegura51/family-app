// La hora, el día de hoy y cuántos días faltan para una fiesta, por voz (petición real, 17/10/2026).
import { describe, expect, it } from 'vitest'
import { answerGeneralQuestion } from './generalQuestions'

const SABADO = new Date(2026, 9, 17, 11, 35) // sábado 17 de octubre de 2026, 11:35

describe('hora', () => {
  it('la dice con el reloj del móvil', () => {
    expect(answerGeneralQuestion('¿Qué hora es?', SABADO)).toBe('Son las 11:35.')
    expect(answerGeneralQuestion('dime la hora', SABADO)).toBe('Son las 11:35.')
    expect(answerGeneralQuestion('me dices la hora por favor', new Date(2026, 9, 17, 9, 5))).toBe('Son las 9:05.')
  })
  it('la una es «es la»', () => {
    expect(answerGeneralQuestion('qué hora es', new Date(2026, 9, 17, 13, 10))).toBe('Es la 13:10.')
  })
})

describe('fecha', () => {
  it('dice el día de la semana y la fecha', () => {
    for (const frase of ['¿qué día es hoy?', 'a qué día estamos', 'qué fecha es hoy', 'qué día de la semana es hoy']) {
      expect(answerGeneralQuestion(frase, SABADO)).toBe('Hoy es sábado, 17 de octubre de 2026.')
    }
  })
  it('no se lleva «qué día es mañana» ni preguntas de otra cosa', () => {
    expect(answerGeneralQuestion('qué día es mañana la cena', SABADO)).toBeNull()
    expect(answerGeneralQuestion('qué tengo hoy', SABADO)).toBeNull()
  })
})

describe('cuántos días faltan', () => {
  it('para Navidad, Nochebuena, Nochevieja, Año Nuevo y Reyes', () => {
    expect(answerGeneralQuestion('cuántos días faltan para Navidad', SABADO)).toBe('Faltan 69 días para Navidad (25 de diciembre).')
    expect(answerGeneralQuestion('cuántos días quedan para Nochebuena', SABADO)).toBe('Faltan 68 días para Nochebuena (24 de diciembre).')
    expect(answerGeneralQuestion('cuántos días faltan para Nochevieja?', SABADO)).toContain('31 de diciembre')
    expect(answerGeneralQuestion('cuánto falta para Reyes', SABADO)).toContain('6 de enero')
    expect(answerGeneralQuestion('cuántos días faltan para el año nuevo', SABADO)).toContain('1 de enero')
  })
  it('si ya pasó este año, cuenta hasta el que viene; si es hoy, lo dice', () => {
    expect(answerGeneralQuestion('cuántos días faltan para Reyes', new Date(2026, 0, 7))).toBe('Faltan 364 días para el Día de Reyes (6 de enero).')
    expect(answerGeneralQuestion('cuántos días faltan para Navidad', new Date(2026, 11, 25))).toBe('¡Hoy es Navidad! (25 de diciembre)')
    expect(answerGeneralQuestion('cuántos días faltan para Navidad', new Date(2026, 11, 24))).toBe('Falta 1 día para Navidad (25 de diciembre).')
  })
  it('una fecha que no conoce no se inventa: sigue su camino', () => {
    expect(answerGeneralQuestion('cuántos días faltan para el cumpleaños de Eric', SABADO)).toBeNull()
  })
})
