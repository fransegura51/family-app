import { describe, expect, it } from 'vitest'

// CORRECCIÓN REAL (incidencia 2 — "No puedo editar objetivos de ahorro", reportada tras comprobar la
// versión desplegada: en la tarjeta "Robot" solo aparecía «Eliminar»). Hasta ahora data/finance.ts solo
// tenía createGoal/deleteGoal — nunca una función para editar. Nuevo updateGoal (reutiliza la MISMA fila/
// política ya permitida: markGoalCelebrated/saveGoalPhoto ya hacían update() sobre kid_goals sin ninguna
// migración nueva, así que esto tampoco necesita ninguna). Icono de lápiz junto al título → modal real
// (mismo patrón que WalletTransactionModal) con los mismos campos que AddGoalForm (título/coste/emoji/
// foto), sin tocar ningún movimiento de ahorro ya registrado ni el diseño de la tarjeta/barra arcoíris.
const UI = (import.meta.glob('/src/ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
const FS = UI['/src/ui/FinanceScreen.tsx']
const DATA_FINANCE = (import.meta.glob('/src/data/finance.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/finance.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('data/finance.ts — updateGoal, reutilizando la política ya permitida (sin migración nueva)', () => {
  it('updateGoal hace un update() directo sobre kid_goals (título/coste/emoji), mismo patrón que markGoalCelebrated/saveGoalPhoto', () => {
    const fn = window_(DATA_FINANCE, 'export async function updateGoal(', '\n}')
    expect(fn).toContain(".from('kid_goals')")
    expect(fn).toContain('.update({ title: input.title, target_amount: input.targetAmount, emoji: input.emoji ?? null })')
  })
  it('nunca toca kid_wallet_transactions — editar el objetivo no mete, quita ni recalcula ahorro', () => {
    const fn = window_(DATA_FINANCE, 'export async function updateGoal(', '\n}')
    expect(fn).not.toContain('kid_wallet_transactions')
  })
})

describe('GoalCard — icono de lápiz junto al título, abre el modal de edición (corrección incidencia 2)', () => {
  const card = window_(FS, 'function GoalCard({', '\n// Pequeños Grandes, Fase 11')

  it('botón ✏️ junto al título, con su propio aria-label', () => {
    expect(card).toContain('className="icon-button goal-card-edit" onClick={() => setEditing(true)}')
    expect(card).toContain('aria-label={`Editar objetivo ${goal.title}`}')
  })
  it('"Eliminar" sigue existiendo tal cual (misma confirmación, mismo deleteGoal) — la edición se AÑADE, no lo sustituye', () => {
    expect(card).toContain('<ConfirmButton label="Eliminar" onConfirm={() => deleteGoal(goal.id).then(onChanged)} />')
  })
  it('el formulario de edición se abre en un modal real (createPortal + sheet-modal), nunca saca de Educación financiera ni es un formulario inline', () => {
    expect(card).toContain('createPortal(<EditGoalForm goal={goal} onSaved={onChanged} onClose={() => setEditing(false)} />, document.body)')
  })
})

describe('EditGoalForm — mismos campos que AddGoalForm (título/coste/emoji/foto), modal real', () => {
  const form = window_(FS, 'function EditGoalForm({', '\n// Pequeños Grandes, Fase 11')

  it('overlay + hoja con cabecera fija y botón X, mismo patrón que WalletTransactionModal', () => {
    expect(form).toContain('className="sheet-modal-overlay" onClick={onClose}')
    expect(form).toContain('<h2>Editar objetivo</h2>')
    expect(form).toContain('className="modal-close" onClick={onClose} aria-label="Cerrar"')
  })
  it('título y coste prerellenados con los datos reales del objetivo, nunca vacíos', () => {
    expect(form).toContain('const [title, setTitle] = useState(goal.title)')
    expect(form).toContain('const [targetAmount, setTargetAmount] = useState(String(goal.targetAmount))')
  })
  it('guarda con updateGoal (título/coste/emoji) y, si se eligió una foto nueva, con saveGoalPhoto — mismas funciones que crear, reutilizadas', () => {
    expect(form).toContain('await updateGoal(goal.id, { title, targetAmount: Number(targetAmount), emoji: emoji.trim() || null })')
    expect(form).toContain('if (photoFile) await saveGoalPhoto(goal, photoFile)')
  })
  it('mismo selector de emoji que AddGoalForm (GOAL_EMOJI_OPTIONS), nunca una lista nueva distinta', () => {
    expect(form).toContain('{GOAL_EMOJI_OPTIONS.map((e) => (')
  })
  it('tiene Cancelar, y guardar cierra el modal solo tras guardar de verdad (onSaved + onClose)', () => {
    expect(form).toContain('onClick={onClose}')
    expect(form).toContain('onSaved()\n      onClose()')
  })
})
