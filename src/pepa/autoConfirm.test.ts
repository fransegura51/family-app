import { describe, expect, it, vi } from 'vitest'
import type { ActionProposal, Presentation, Selection } from '@/pepa/actions/types'
import { autoConfirmProposal } from '@/pepa/autoConfirm'

const selection = (choices: Record<string, string> = {}): Selection => ({ choices, checked: [] })
const view = (over: Partial<Presentation> = {}): Presentation => ({ title: 't', lines: [], warnings: [], choices: [], checks: [], confirmLabel: 'Hecho', ...over })

function proposal(over: Partial<ActionProposal> & { view?: Presentation; selection?: Selection } = {}): ActionProposal {
  const sel = over.selection ?? selection()
  return {
    actionId: over.actionId ?? 'shopping.add',
    initialSelection: sel,
    preview: () => over.view ?? view(),
    confirm: over.confirm ?? vi.fn().mockResolvedValue('Hecho.'),
  }
}

describe('autoConfirmProposal: cuándo se puede saltar la tarjeta', () => {
  it('una acción normal, sin avisos ni decisiones pendientes, se hace y devuelve el mensaje', async () => {
    const p = proposal()
    await expect(autoConfirmProposal(p)).resolves.toBe('Hecho.')
    expect(p.confirm).toHaveBeenCalledTimes(1)
  })

  it('lo que toca dinero (presupuestos) NUNCA se salta la tarjeta', async () => {
    const p = proposal({ actionId: 'budget.set' })
    await expect(autoConfirmProposal(p)).resolves.toBeNull()
    expect(p.confirm).not.toHaveBeenCalled()
  })

  it('si la tarjeta trae avisos (duplicado, conflicto de horario…), se enseña', async () => {
    const p = proposal({ view: view({ warnings: ['Ya hay algo a esa hora'] }) })
    await expect(autoConfirmProposal(p)).resolves.toBeNull()
    expect(p.confirm).not.toHaveBeenCalled()
  })

  it('si queda una elección sin valor (a quién va, qué plato…), se enseña', async () => {
    const p = proposal({ view: view({ choices: [{ id: 'dish', label: 'Plato', options: [{ key: 'a', label: 'A' }] }] }), selection: selection({}) })
    await expect(autoConfirmProposal(p)).resolves.toBeNull()
    expect(p.confirm).not.toHaveBeenCalled()
  })

  it('con las elecciones ya hechas, se puede saltar', async () => {
    const p = proposal({ view: view({ choices: [{ id: 'dish', label: 'Plato', options: [{ key: 'a', label: 'A' }] }] }), selection: selection({ dish: 'a' }) })
    await expect(autoConfirmProposal(p)).resolves.toBe('Hecho.')
  })

  it('si al guardar falla algo, no se pierde nada: devuelve null y se enseña la tarjeta', async () => {
    const p = proposal({ confirm: vi.fn().mockRejectedValue(new Error('sin red')) })
    await expect(autoConfirmProposal(p)).resolves.toBeNull()
  })
})

describe('autoConfirmProposal: tareas del calendario', () => {
  const calendarChoices = [{ id: 'member', label: 'Para', options: [{ key: 'none', label: 'Toda la familia' }, { key: 'm1', label: 'Eric' }] }]

  it('una tarea SIN persona enseña la tarjeta para elegir a quién va', async () => {
    const p = proposal({ actionId: 'calendar.create', view: view({ choices: calendarChoices }), selection: selection({ member: 'none', kind: 'task' }) })
    await expect(autoConfirmProposal(p)).resolves.toBeNull()
    expect(p.confirm).not.toHaveBeenCalled()
  })

  it('una tarea CON persona se guarda directo', async () => {
    const p = proposal({ actionId: 'calendar.create', view: view({ choices: calendarChoices }), selection: selection({ member: 'm1', kind: 'task' }) })
    await expect(autoConfirmProposal(p)).resolves.toBe('Hecho.')
  })

  it('un evento para toda la familia sigue guardándose directo', async () => {
    const p = proposal({ actionId: 'calendar.create', view: view({ choices: calendarChoices }), selection: selection({ member: 'none', kind: 'event' }) })
    await expect(autoConfirmProposal(p)).resolves.toBe('Hecho.')
  })
})
