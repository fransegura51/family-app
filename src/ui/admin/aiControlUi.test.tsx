// @vitest-environment jsdom
// Centro de Control de IA: interfaz real en jsdom con las llamadas al servidor simuladas (no se toca ninguna base ni proveedor).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toAiAlerts, toAiFamilies, toAiLimits, toAiOverview, toAiState, toProjectionBase } from '@/domain/aiControl'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/state/useRealtimeRefresh', () => ({ useRealtimeRefresh: vi.fn() }))

const api = vi.hoisted(() => ({
  getAiState: vi.fn(),
  setAiGlobal: vi.fn(),
  setAiFunction: vi.fn(),
  getAiOverview: vi.fn(),
  getAiFamilies: vi.fn(),
  getAiFamilyDetail: vi.fn(),
  getAiLimits: vi.fn(),
  setAiLimit: vi.fn(),
  deleteAiLimit: vi.fn(),
  setAiException: vi.fn(),
  deleteAiException: vi.fn(),
  getAiAlerts: vi.fn(),
  setAiAlertStatus: vi.fn(),
  runAiDetection: vi.fn(),
  setAiThresholds: vi.fn(),
  getAiPrices: vi.fn(),
  addAiPrice: vi.fn(),
  getAiProjectionBase: vi.fn(),
  getAiAudit: vi.fn(),
  getAiPlans: vi.fn(),
  upsertAiPlan: vi.fn(),
  setAiQuota: vi.fn(),
  deleteAiQuota: vi.fn(),
}))
vi.mock('@/data/aiControl', () => api)

const { AreaIA } = await import('@/ui/admin/AreaIA')
const { AdminGroupsProvider } = await import('@/ui/admin/AdminGroups')

const stateRaw = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  provider: 'gemini',
  model: 'gemini-flash-lite-latest',
  key_configured: true,
  plans_enforced: false,
  thresholds: { cost_spike_factor: 3 },
  community: { launched: true, ai_enabled: false, daily_cap: 300, used_today: 4, schedule_articles: false, schedule_polls: false, schedule_menu: false },
  open_alerts: 1,
  functions: [
    { purpose: 'analyze-receipt-photo', label: 'Lectura inteligente de tickets', module: 'compras_economia', description: 'Lee tickets.', origin: 'family', needs: ['global'], enabled: true, calls_24h: 5, failed_24h: 0 },
    { purpose: 'editorial_article', label: 'Generación de artículos', module: 'comunidad', description: 'Redacta borradores.', origin: 'automatic', needs: ['global', 'community_launched'], enabled: false, calls_24h: 0, failed_24h: 0 },
    { purpose: 'summary', label: 'Resúmenes de conversaciones de Comunidad', module: 'comunidad', description: 'Resume.', origin: 'family', needs: ['global', 'community_launched', 'community_ai_enabled'], enabled: true, calls_24h: 0, failed_24h: 0 },
  ],
  unregistered: [],
  ...over,
})

const page = () =>
  render(
    <MemoryRouter>
      <AdminGroupsProvider>
        <AreaIA />
      </AdminGroupsProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.getAiState.mockResolvedValue(toAiState(stateRaw()))
  api.setAiGlobal.mockResolvedValue({})
  api.setAiFunction.mockResolvedValue({})
  api.getAiOverview.mockResolvedValue(toAiOverview({}))
  api.getAiFamilies.mockResolvedValue(toAiFamilies([]))
  api.getAiLimits.mockResolvedValue(toAiLimits({ limits: [], exceptions: [], community_daily_cap: { cap: 300, used_today: 4 } }))
  api.getAiAlerts.mockResolvedValue(toAiAlerts([]))
  api.getAiPrices.mockResolvedValue([])
  api.getAiProjectionBase.mockResolvedValue(toProjectionBase({}))
})
afterEach(cleanup)

describe('Control de IA · interruptores', () => {
  it('enseña nombres en español, el estado real de cada función y la espera por dependencias', async () => {
    page()
    await screen.findByText(/Inteligencia artificial de PEPA — Activada/)
    expect(screen.getByText('Lectura inteligente de tickets')).toBeTruthy()
    expect(screen.getByText('Generación de artículos')).toBeTruthy()
    expect(screen.getByText('Desactivada por ti')).toBeTruthy()
    // «Resúmenes» está activada pero Comunidad no tiene su interruptor propio de IA: se explica, no se esconde.
    expect(screen.getByText('Activada, en espera')).toBeTruthy()
    expect(screen.getByText(/Falta activar «Inteligencia artificial de Comunidad»/)).toBeTruthy()
    // Nada de identificadores técnicos a la vista.
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/editorial_article|ai_enabled|purposes_disabled|analyze-receipt-photo/)
  })

  it('apagar toda la IA pide confirmación y llama al servidor; no se borra la selección individual', async () => {
    page()
    await screen.findByText(/Inteligencia artificial de PEPA — Activada/)
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar toda la IA' }))
    expect(api.setAiGlobal).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Toca otra vez para desactivar' }))
    await waitFor(() => expect(api.setAiGlobal).toHaveBeenCalledWith(false))
    expect(api.setAiFunction).not.toHaveBeenCalled()
  })

  it('con la IA general apagada, ninguna función figura como activa y se puede reactivar', async () => {
    api.getAiState.mockResolvedValue(toAiState(stateRaw({ enabled: false })))
    page()
    await screen.findByText(/Inteligencia artificial de PEPA — Desactivada/)
    expect(screen.getAllByText('Parada por el interruptor general').length).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'Activar la IA' }))
    await waitFor(() => expect(api.setAiGlobal).toHaveBeenCalledWith(true))
  })

  it('cada función tiene su propio interruptor', async () => {
    page()
    const sw = await screen.findByRole('switch', { name: 'Interruptor de Generación de artículos' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    await waitFor(() => expect(api.setAiFunction).toHaveBeenCalledWith('editorial_article', true))
  })

  it('la programación semanal se explica junto a la función y enlaza con Comunidad', async () => {
    page()
    await screen.findByText(/Programación semanal automática/)
    expect(screen.getByRole('link', { name: 'Comunidad → Contenido oficial' }).getAttribute('href')).toContain('area=comunidad')
  })

  it('un error del servidor se cuenta en claro; si falta la migración, lo dice', async () => {
    api.getAiState.mockRejectedValue(new Error('Could not find the function public.ai_admin_state in the schema cache'))
    page()
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/migración 0332/)).toBeTruthy()
  })

  it('un administrador sin permiso ve un mensaje, no un fallo técnico', async () => {
    api.getAiState.mockRejectedValue(new Error('NOT_ADMIN'))
    page()
    expect(await screen.findByText(/Solo las personas administradoras/)).toBeTruthy()
  })
})

describe('Control de IA · límites', () => {
  const openLimits = async () => {
    page()
    await screen.findByText(/Inteligencia artificial de PEPA — Activada/)
    fireEvent.click(screen.getByRole('button', { name: /Límites y presupuestos/ }))
    await screen.findByText(/Todos los límites nuevos empiezan en «Observación»/)
  }

  it('un límite nuevo nace en Observación y no pide confirmación de bloqueo', async () => {
    api.setAiLimit.mockResolvedValue('id')
    await openLimits()
    fireEvent.click(screen.getByRole('button', { name: 'Añadir un límite' }))
    fireEvent.change(screen.getByLabelText(/^Máximo/), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar límite' }))
    await waitFor(() => expect(api.setAiLimit).toHaveBeenCalled())
    expect(api.setAiLimit.mock.calls[0][0]).toMatchObject({ scope: 'global', mode: 'observe', metric: 'cost', period: 'month', max: 5 })
  })

  it('pasar a Bloqueo exige marcar la confirmación', async () => {
    await openLimits()
    fireEvent.click(screen.getByRole('button', { name: 'Añadir un límite' }))
    fireEvent.change(screen.getByLabelText(/^Máximo/), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/^Modo/), { target: { value: 'block' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar límite' }))
    expect(await screen.findByText(/confirmar que el límite bloqueará/)).toBeTruthy()
    expect(api.setAiLimit).not.toHaveBeenCalled()
  })

  it('rechaza un máximo vacío o negativo antes de llamar al servidor', async () => {
    await openLimits()
    fireEvent.click(screen.getByRole('button', { name: 'Añadir un límite' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar límite' }))
    expect(await screen.findByText('Escribe un máximo mayor que 0.')).toBeTruthy()
    expect(api.setAiLimit).not.toHaveBeenCalled()
  })

  it('enseña el límite de seguridad que ya existía en Comunidad', async () => {
    await openLimits()
    expect(screen.getByText(/300 llamadas al día/)).toBeTruthy()
  })
})

describe('Control de IA · accesibilidad y móvil', () => {
  it('el CSS evita desbordes: filas que se parten, sin anchuras fijas grandes', async () => {
    const fs = await import('node:fs')
    const css = fs.readFileSync('src/ui/admin/ia/aiControl.css', 'utf8')
    expect(css).toContain('overflow-wrap: anywhere')
    expect(css).not.toMatch(/min-width:\s*(3|4|5|6)\d\dpx/)
    expect(css).not.toMatch(/white-space:\s*nowrap/)
    const admin = fs.readFileSync('src/ui/admin/administration.css', 'utf8')
    expect(admin).toContain('@media (max-width: 520px)')
  })
})
