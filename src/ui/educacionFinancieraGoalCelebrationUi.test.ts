import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte B2) — "+ Nuevo objetivo de ahorro" usando el sistema YA EXISTENTE de
// objetivos; al completar uno, "¡Enhorabuena!" + confeti, registrado para que no se repita; crear un
// objetivo nunca genera dinero; varios objetivos sin perder ninguno; nunca contar el ahorro dos veces.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FinanceScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const KIDS_TAB = window_(UI, 'export function KidsFinanceTab(', '\nfunction GoalCard(')

describe('B2 — "+ Nuevo objetivo de ahorro": el formulario ya existente, ahora detrás de un botón', () => {
  it('AddGoalForm tiene Cancelar (onClose) — antes siempre visible, ahora se puede cerrar sin crear nada', () => {
    const form = window_(UI, 'function AddGoalForm(', '\n// El tipo ya no se elige')
    expect(form).toContain('onClose: () => void')
    expect(form).toContain('<button type="button" className="link-button" onClick={onClose}>')
  })
  it('crear un objetivo SOLO llama a createGoal (y opcionalmente saveGoalPhoto) — nunca a ninguna función de ingresos/puntos', () => {
    const form = window_(UI, 'function AddGoalForm(', '\n// El tipo ya no se elige')
    expect(form).toContain('await createGoal({')
    expect(form).not.toContain('registerKidIncome')
    expect(form).not.toContain('givePoints')
  })
})

describe('B2 — celebración "¡Enhorabuena!" + confeti al completar un objetivo, nunca repetida', () => {
  it('detecta el objetivo recién completado mirando TODOS los objetivos de la familia (no solo el niño/a activo), igual que pendingTransactions', () => {
    expect(KIDS_TAB).toContain('if (g.celebratedAt) return false')
    expect(KIDS_TAB).toContain('return saved >= g.targetAmount')
  })
  it('marca el objetivo como celebrado (markGoalCelebrated) para que nunca vuelva a repetirse', () => {
    expect(KIDS_TAB).toContain('markGoalCelebrated(justCompleted.id)')
  })
  it('reutiliza <Confetti /> (Parte A5), nunca una animación nueva aparte', () => {
    expect(KIDS_TAB).toContain('<Confetti />')
  })
  it('la celebración se cierra sola a los 4s, nunca exige un cierre manual', () => {
    expect(KIDS_TAB).toContain('setTimeout(() => setCelebratingGoal(null), 4000)')
  })
})

describe('B2 — GoalCard muestra el importe restante, nunca negativo tras cumplir el objetivo', () => {
  const card = window_(UI, 'function GoalCard(', '\n// Pequeños Grandes, Fase 11')

  it('"Faltan X €" mientras no se ha cumplido, "¡Objetivo cumplido!" en vez de "Faltan 0,00 €"', () => {
    expect(card).toContain('const remaining = Math.max(0, goal.targetAmount - categoryTotal)')
    expect(card).toContain("remaining > 0 ? `Faltan ${remaining.toFixed(2)} €` : '¡Objetivo cumplido!'")
  })
  it('sigue comparando contra el MISMO categoryTotal que reciben todos los objetivos de ese niño/a — nunca un reparto/asignación entre objetivos que pudiera hacer doble cuenta', () => {
    expect(card).toContain('categoryTotal: number')
    expect(UI).toContain('<GoalCard key={goal.id} goal={goal} categoryTotal={categoryTotal} colorIndex={i} total={memberGoals.length} onChanged={reload} />')
  })
})
