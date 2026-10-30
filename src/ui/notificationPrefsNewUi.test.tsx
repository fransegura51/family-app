// @vitest-environment jsdom
// NOT-01/02/04 en Configuración → Avisos: forma de ver el panel, tipos personales, repetición de tareas atrasadas (apagada por defecto) y aviso agrupado del banco.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '@/domain/notificationPrefs'

vi.mock('@/services/notifications', () => ({ getPermissionState: () => 'granted', hasPushSubscription: async () => true, isNotificationsDisabledByUser: () => false }))
const { NotificationViewPrefs } = await import('@/ui/NotificationViewPrefs')
const { TaskSummaryPrefs } = await import('@/ui/TaskSummaryPrefs')
afterEach(cleanup)

const prefs = (over: Partial<NotificationPrefs> = {}): NotificationPrefs => ({ ...DEFAULT_NOTIFICATION_PREFS, ...over })

describe('NOT-01 · cómo ver tus avisos', () => {
  it('por defecto la forma de siempre y se puede cambiar a «Por áreas»', () => {
    const onSave = vi.fn()
    render(<NotificationViewPrefs prefs={prefs()} onSave={onSave} />)
    expect((screen.getByRole('radio', { name: /Por prioridad personal/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Por áreas/ }))
    expect(onSave).toHaveBeenCalledWith({ notificationViewMode: 'areas' })
  })
  it('en la vista personal se eligen los tipos por módulo y se guardan', () => {
    const onSave = vi.fn()
    render(<NotificationViewPrefs prefs={prefs()} onSave={onSave} />)
    const bank = screen.getByRole('checkbox', { name: 'Movimientos nuevos del banco' }) as HTMLInputElement
    expect(bank.checked).toBe(false)
    fireEvent.click(bank)
    const saved = onSave.mock.calls[0][0].personalCategories as string[]
    expect(saved).toContain('bank_import')
    expect(saved).toContain('task_assigned') // lo que ya era personal se conserva
  })
  it('en la vista por áreas no se enseña la lista de tipos', () => {
    render(<NotificationViewPrefs prefs={prefs({ notificationViewMode: 'areas' })} onSave={vi.fn()} />)
    expect(screen.queryByTestId('personal-types')).toBeNull()
  })
  it('el aviso del banco se puede apagar', () => {
    const onSave = vi.fn()
    render(<NotificationViewPrefs prefs={prefs()} onSave={onSave} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /movimientos nuevos del banco \(un solo aviso/ }))
    expect(onSave).toHaveBeenCalledWith({ bankImportEnabled: false })
  })
})

describe('NOT-02 · repetir las tareas atrasadas', () => {
  it('apagado por defecto (nuevas personas) y solo aparece con el aviso de atrasadas activado', () => {
    const { rerender } = render(<TaskSummaryPrefs prefs={prefs({ taskOverdueEnabled: false })} onSave={vi.fn()} />)
    expect(screen.queryByLabelText('Repetir el aviso de tareas atrasadas')).toBeNull()
    rerender(<TaskSummaryPrefs prefs={prefs({ taskOverdueEnabled: true })} onSave={vi.fn()} />)
    expect((screen.getByLabelText('Repetir el aviso de tareas atrasadas') as HTMLSelectElement).value).toBe('')
  })
  it('ofrece 1, 2, 3, 6 y 24 horas y guarda la elección; «No repetir» la apaga', () => {
    const onSave = vi.fn()
    render(<TaskSummaryPrefs prefs={prefs({ taskOverdueEnabled: true })} onSave={onSave} />)
    const select = screen.getByLabelText('Repetir el aviso de tareas atrasadas') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['', '1', '2', '3', '6', '24'])
    fireEvent.change(select, { target: { value: '3' } })
    expect(onSave).toHaveBeenCalledWith({ overdueRepeatHours: 3 })
    fireEvent.change(select, { target: { value: '' } })
    expect(onSave).toHaveBeenLastCalledWith({ overdueRepeatHours: null })
  })
})
