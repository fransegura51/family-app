import { describe, expect, it } from 'vitest'

// Punto 2.1 (prompt de correcciones) — comportamiento exacto pedido por el usuario:
// 1. Pulsar una línea de «Resumen de decisiones» abre su pregunta.
// 2. Pulsar la MISMA línea otra vez la cierra.
// 3. Pulsar el enunciado de la pregunta ya abierta también la pliega.
// 4. Desde el propio enunciado se puede volver a desplegar cuando esté visible en la vista de preguntas.
// 5/6. Cerrar nunca toca datos/decisiones/tareas/presupuesto — localFocus es puro estado de vista en
//      React, nunca se escribe en Supabase. Reutiliza el mecanismo existente (toggleLocalFocus), sin
//      crear un sistema paralelo — ver useConfiguratorQuestionFocus.ts.
// Ejemplo real citado por el usuario: Eventos → Boda de plata → Invitados e invitaciones → "La invitación
// se gestiona con PEPA →" (GUESTS_INVITACION_QUESTION_KEY, vía CustomAwareQuestion).
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const CUSTOM_AWARE_QUESTION = window_(UI, 'function CustomAwareQuestion<C extends string>(', '\n// Vestuario —')

describe('CustomAwareQuestion — el propio enunciado también es un toggle (Punto 2.1, puntos 3 y 4)', () => {
  it('cuando se pasa onToggleFocus, el enunciado es un botón pulsable, no solo texto', () => {
    expect(CUSTOM_AWARE_QUESTION).toContain('onToggleFocus ? (')
    expect(CUSTOM_AWARE_QUESTION).toContain('onClick={onToggleFocus}')
  })
  it('onToggleFocus es opcional — un sitio que todavía no lo pase sigue mostrando el enunciado como texto plano, sin romperse', () => {
    expect(CUSTOM_AWARE_QUESTION).toContain('onToggleFocus?: () => void')
    expect(CUSTOM_AWARE_QUESTION).toContain(') : (')
  })
})

describe('Las 9 preguntas que usan CustomAwareQuestion pasan onToggleFocus con su propia clave (incluida la del ejemplo real)', () => {
  it('"La invitación se gestiona con PEPA" (GuestsDecisionsBlock) — el ejemplo exacto citado por el usuario', () => {
    expect(UI).toContain('onToggleFocus={() => toggleLocalFocus(GUESTS_INVITACION_QUESTION_KEY)}')
  })
  it('el resto de preguntas con CustomAwareQuestion (Celebración, Alianzas, Lista, Momentos, Niños, Menú infantil, Tarta, Bebidas)', () => {
    for (const key of [
      'LUGAR_CONTEXTO_QUESTION_KEY',
      'ALIANZAS_QUESTION_KEY',
      'GUESTS_LISTA_QUESTION_KEY',
      'GUESTS_MOMENTOS_QUESTION_KEY',
      'GUESTS_NINOS_QUESTION_KEY',
      'FOOD_MENU_INFANTIL_KEY',
      'FOOD_TARTA_KEY',
      'FOOD_BEBIDAS_KEY',
    ]) {
      expect(UI).toContain(`onToggleFocus={() => toggleLocalFocus(${key})}`)
    }
  })
})

describe('Los 10 bloques del configurador exponen toggleLocalFocus y lo usan en su propio "Resumen de decisiones"', () => {
  it('el hook se desestructura con toggleLocalFocus en los 10 bloques (mismo nº que onSelect={toggleLocalFocus})', () => {
    const hookDestructure = (UI.match(/const \{ localFocus, setLocalFocus, toggleLocalFocus, ref: focusRef \} = useConfiguratorQuestionFocus\(focusRequest\)/g) ?? []).length
    const onSelectToggle = (UI.match(/onSelect=\{toggleLocalFocus\}/g) ?? []).length
    expect(hookDestructure).toBe(10)
    expect(onSelectToggle).toBe(10)
  })
})
