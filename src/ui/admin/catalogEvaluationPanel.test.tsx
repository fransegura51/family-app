// @vitest-environment jsdom
// «Evaluación del catálogo de productos»: solo lee, enseña lo medido sobre todos los artículos y las cifras de aciertos solo salen de lo revisado.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Product, ProductPrice } from '@/domain/types'

const NAMES = ['LECHE SEMI P-6', 'LECHE SEMIDESNATADA PASCUAL 1L', 'PATATA 3 KG', 'PATATA 5 KG', 'PAÑALES T3', 'PAÑALES T4', 'QUESADILLA POLLO', 'XILOFON AZUL', 'DETERGENTE LIQUIDO']
const products = NAMES.map((n, i) => ({ id: `p${i}`, familyId: 'f', normalizedName: n.toLowerCase(), displayName: n, category: null, brand: null, nonFood: false, classConfirmedAt: null, photoPath: null }) as Product)
const prices = NAMES.map((_, i) => ({ id: `r${i}`, productId: `p${i}`, price: 2 + i, store: i % 2 ? 'Consum' : 'Mercadona', quantity: '1', unit: 'ud', recordedDate: '2026-10-01', receiptId: null, pack: null }) as ProductPrice)

const writes = vi.fn()
vi.mock('@/data/products', () => ({ listProducts: async () => products, listAllProductPrices: async () => prices }))
vi.mock('@/data/commonProducts', () => ({ listCommonProductsData: async () => ({ commons: [], members: [], skipped: [], rejected: [], available: true }) }))
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: () => (...args: unknown[]) => writes(...args) }) }))

const { CatalogEvaluationPanel } = await import('@/ui/admin/CatalogEvaluationPanel')

afterEach(cleanup)

describe('Evaluación del catálogo de productos', () => {
  it('antes de calcular no enseña cifras y avisa de que solo lee', () => {
    render(<CatalogEvaluationPanel />)
    expect(screen.getByText(/solo leyendo/)).toBeTruthy()
    expect(screen.queryByText(/Medido sobre todos los artículos/)).toBeNull()
  })

  it('calcula el informe sin escribir nada y enseña lo medido sobre todos los artículos', async () => {
    render(<CatalogEvaluationPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Calcular el informe' }))
    await waitFor(() => expect(screen.getByText(/Medido sobre todos los artículos \(9; 9 con compras\)/)).toBeTruthy())
    expect(screen.getByText(/no identificados:/)).toBeTruthy()
    expect(writes).not.toHaveBeenCalled()
  })

  it('lista los no identificados y los probables para poder revisarlos', async () => {
    render(<CatalogEvaluationPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Calcular el informe' }))
    await waitFor(() => screen.getByText(/Medido sobre todos/))
    expect(screen.getByText('XILOFON AZUL')).toBeTruthy()
    expect(screen.getByText(/PEPA no lo identifica/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Clase distinta de antes/ }))
    expect(screen.getByText('QUESADILLA POLLO')).toBeTruthy()
  })

  it('las cifras de aciertos salen solo de lo revisado: sin revisar no hay ninguna', async () => {
    render(<CatalogEvaluationPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Calcular el informe' }))
    await waitFor(() => screen.getByText(/Medido sobre todos/))
    expect(screen.getByText(/Sin revisar todavía: no hay cifras de aciertos/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ver la muestra/ }))
    const first = screen.getAllByRole('group', { name: '¿Producto?' })[0]
    fireEvent.click(within(first).getByRole('button', { name: 'Sí' }))
    const klass = screen.getAllByRole('group', { name: '¿Clase?' })[0]
    fireEvent.click(within(klass).getByRole('button', { name: 'Sí' }))
    await waitFor(() => expect(screen.getByText(/Revisados 1 de \d+: producto correcto 1 de 1 · clase correcta 1 de 1 · identificación completa 1/)).toBeTruthy())
  })

  it('«Otra muestra» reinicia lo revisado (no se mezclan muestras)', async () => {
    render(<CatalogEvaluationPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Calcular el informe' }))
    await waitFor(() => screen.getByText(/Medido sobre todos/))
    fireEvent.click(screen.getByRole('button', { name: /Ver la muestra/ }))
    fireEvent.click(within(screen.getAllByRole('group', { name: '¿Producto?' })[0]).getByRole('button', { name: 'No' }))
    expect(screen.getByText(/Revisados 1 de/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Otra muestra' }))
    expect(screen.getByText(/Sin revisar todavía/)).toBeTruthy()
  })

  it('el componente no escribe en la base de datos (solo lecturas)', () => {
    const src = import.meta.glob('/src/ui/admin/CatalogEvaluationPanel.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const text = Object.values(src)[0]
    expect(text).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
    expect(text).not.toMatch(/sharedClass|resolve_shared/)
  })
})
