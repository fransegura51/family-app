import { describe, expect, it } from 'vitest'

// PEPA — "Finalizar trabajo actual y rediseñar Objetivos de ahorro". Rediseño puramente visual de
// GoalCard: fondo pastel del avatar del niño/a dueño/a del objetivo, imagen/emoji a la izquierda, cifras
// a la derecha, barra arcoíris de ancho completo que se DESCUBRE (nunca se redimensiona) según el % real.
// Nunca toca la lógica financiera: categoryTotal/goal.targetAmount son los mismos inputs de siempre
// (domain/finance.ts), ni los permisos/confirmación de borrado ya existentes.
// No se comprueba el contenido de styles.css aquí: Vite deja en blanco los imports de .css (incluso con
// "?raw") en el entorno de test, y este proyecto no tiene las utilidades de Node ("fs") que haría falta
// para leer el fichero del disco directamente (mismo límite ya documentado en calendarTimeGridOverflowUi.test.ts)
// — el CSS del degradado/clip-path/prefers-reduced-motion se verifica en vivo en el navegador.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const FS = UI['/src/ui/FinanceScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const card = window_(FS, 'function GoalCard({', '\n// Pequeños Grandes, Fase 11')

describe('GoalCard — fondo pastel del AVATAR del dueño/a, nunca un color fijo por índice/nombre', () => {
  it('resuelve el color desde members (el mismo m.color real de la familia), vía toPastel — mismo criterio que las tarjetas de cuenta de Banco', () => {
    expect(card).toContain('const owner = members.find((m) => m.id === goal.memberId)')
    expect(card).toContain('const cardBg = owner ? toPastel(owner.color) : COMMON_ACCOUNT_COLOR')
  })
  it('ya no usa pastelPalette por índice (el rediseño anterior coloreaba por posición, no por dueño/a)', () => {
    expect(card).not.toContain('pastelPalette(total)[colorIndex]')
    expect(card).not.toContain('colorIndex')
  })
})

describe('GoalCard — distribución superior: imagen a la izquierda, cifras a la derecha', () => {
  it('columna de imagen: foto real si existe, si no el emoji guardado, si no un icono fijo (nunca generado, nunca un hueco vacío)', () => {
    expect(card).toContain('className="goal-card-image"')
    expect(card).toContain("photoUrl ? <img src={photoUrl} alt=\"\" /> : <span>{goal.emoji || '🎯'}</span>")
  })
  it('primera fila: título a la izquierda, % a la derecha — ambos de datos reales', () => {
    expect(card).toContain('<strong>{goal.title}</strong>')
    expect(card).toContain('<span>{pct}%</span>')
  })
  it('tercera fila: importe acumulado destacado + importe objetivo en tamaño menor', () => {
    expect(card).toContain('className="goal-card-amount">{categoryTotal.toFixed(2)} €')
    expect(card).toContain('className="goal-card-target">de {goal.targetAmount.toFixed(2)} €')
  })
  it('nunca añade el enlace "Ver detalles"', () => {
    expect(card).not.toContain('Ver detalles')
  })
})

// El degradado/clip-path/prefers-reduced-motion viven en styles.css (.goal-progress/.goal-progress-rainbow)
// — no verificables aquí (ver nota de cabecera), se comprueban en vivo en el navegador.
describe('GoalCard — barra arcoíris: el progreso se pasa como variable CSS, nunca redimensionando el relleno a mano', () => {
  it('el ancho de relleno nunca se controla con width/transform en el componente — solo la variable --progress', () => {
    expect(card).toContain("className=\"goal-progress\" style={{ '--progress': `${pct}%` } as CSSProperties}")
    expect(card).not.toMatch(/goal-progress-rainbow[\s\S]{0,80}width:\s*`\$\{pct\}/)
  })
})

describe('GoalCard — rango e importe pendiente, mensajes correctos según el progreso', () => {
  it('debajo de la barra: 0 € a la izquierda, el objetivo real con 🏆 a la derecha', () => {
    expect(card).toContain('className="goal-card-range"')
    expect(card).toContain('<span>0 €</span>')
    expect(card).toContain('{goal.targetAmount.toFixed(2)} € 🏆')
  })
  it('mensaje con el importe pendiente real mientras no se ha cumplido, mensaje de enhorabuena al 100% — nunca "incorrecto" si se supera (remaining ya viene clamp a 0)', () => {
    expect(card).toContain('const remaining = Math.max(0, goal.targetAmount - categoryTotal)')
    expect(card).toContain("pct >= 100 ? '🏆 ¡Enhorabuena! Has conseguido tu objetivo.' : `🏆 Te faltan ${remaining.toFixed(2)} € para «${goal.title}».`")
  })
})

describe('GoalCard — nunca toca la lógica financiera ni los permisos de borrado ya existentes', () => {
  it('categoryTotal y goal.targetAmount siguen siendo los mismos inputs de siempre, ningún cálculo nuevo', () => {
    expect(card).toContain('const pct = Math.min(100, Math.round((categoryTotal / goal.targetAmount) * 100))')
  })
  it('"Eliminar" sigue siendo el mismo ConfirmButton de siempre (misma confirmación, mismo deleteGoal)', () => {
    expect(card).toContain('<ConfirmButton label="Eliminar" onConfirm={() => deleteGoal(goal.id).then(onChanged)} />')
  })
})
