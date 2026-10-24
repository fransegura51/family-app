// DECISIÓN DEFINITIVA (24/10/2026): marcar «Comprado» en la lista de la compra SOLO cambia el estado del artículo en la lista. No crea compras, ni
// productos del historial, ni registros de precios, ni movimientos económicos. El historial de precios se alimenta de tickets (y de compras con
// productos), nunca de la lista. Estas pruebas lo fijan para que ningún cambio futuro lo rompa sin querer.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import shoppingData from './shopping.ts?raw'
import shoppingScreen from '../ui/ShoppingScreen.tsx?raw'
import legacyHelp from '../help/legacy/legacyHelp.ts?raw'
import cards from '../help/catalog/cardsDiaADia.ts?raw'
import inventory from '../admin/features/featureInventory.ts?raw'

type Call = { table: string; op: string; payload: unknown }
const calls: Call[] = []
vi.mock('@/data/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      for (const op of ['insert', 'update', 'delete', 'upsert']) chain[op] = (payload?: unknown) => (calls.push({ table, op, payload }), chain)
      chain.eq = () => chain
      chain.select = () => chain
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
      return chain
    },
    rpc: (name: string, args: unknown) => {
      calls.push({ table: `rpc:${name}`, op: 'rpc', payload: args })
      return Promise.resolve({ data: null, error: null })
    },
  },
}))

const { updateShoppingItemStatus } = await import('./shopping')

beforeEach(() => {
  calls.length = 0
})

describe('marcar «comprado» solo cambia el estado del artículo', () => {
  it('toca únicamente shopping_items y únicamente su estado (y la fecha de actualización)', async () => {
    await updateShoppingItemStatus('item-1', 'comprado')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'shopping_items', op: 'update' })
    expect(Object.keys(calls[0].payload as object).sort()).toEqual(['status', 'updated_at'])
    expect((calls[0].payload as { status: string }).status).toBe('comprado')
  })

  it('desmarcar es lo mismo: solo el estado', async () => {
    await updateShoppingItemStatus('item-1', 'pendiente')
    expect(calls.map((c) => c.table)).toEqual(['shopping_items'])
  })

  it('no escribe nunca en productos, precios, tickets, gastos, carteras ni funciones del servidor', async () => {
    await updateShoppingItemStatus('item-1', 'comprado')
    const forbidden = ['products', 'product_prices', 'receipts', 'expenses', 'cash_movements', 'purchase_payments', 'bank_transactions']
    expect(calls.filter((c) => forbidden.includes(c.table) || c.table.startsWith('rpc:'))).toEqual([])
  })
})

describe('el código de la lista no alimenta el historial', () => {
  it('el manejador de «comprado» de la lista solo llama a updateShoppingItemStatus', () => {
    const body = shoppingScreen.slice(shoppingScreen.indexOf('async function setStatus('), shoppingScreen.indexOf('async function setStatus(') + 500)
    expect(body).toContain('await updateShoppingItemStatus(id, status)')
    expect(body).not.toMatch(/recordProductPurchase|uploadReceipt|addExpense|setPurchasePayments/)
  })

  it('ni la pantalla de la lista ni su capa de datos importan nada que escriba precios, compras o gastos', () => {
    for (const src of [shoppingScreen, shoppingData]) {
      expect(src).not.toMatch(/import[^;]*\b(recordProductPurchase|uploadReceipt|addExpense|setPurchasePayments|registerPurchaseRefund)\b/)
    }
    expect(shoppingData).not.toMatch(/product_prices|from\('receipts'\)|from\('expenses'\)/)
  })
})

describe('los textos de la app y de la Ayuda dicen lo mismo que hace el código', () => {
  it('desaparecen las frases que sugerían que la lista alimenta el historial', () => {
    expect(shoppingScreen).not.toContain('cada vez que guardas el precio de un producto comprado')
    expect(shoppingScreen).not.toContain('(tickets o lista de la compra)')
    expect(legacyHelp).not.toContain('Se construye solo con lo que compras')
    expect(inventory).not.toContain('aunque dos textos de la pantalla lo sugieren')
  })

  it('el Historial de precios dice de dónde sale y que «comprado» no guarda precios', () => {
    expect(shoppingScreen).toContain('Marcar «comprado» en la lista no guarda precios.')
    expect(shoppingScreen).toContain('marcar «comprado» en la lista no guarda precios.')
    expect(legacyHelp).toContain('Se construye solo con los tickets que guardas')
    expect(cards).toContain('marcar un producto como comprado en la lista solo cambia su estado en la lista; no guarda su precio ni crea compras')
  })

  it('la ficha de la Lista de la compra lo explica', () => {
    expect(legacyHelp).toContain('Marcar «comprado» SOLO cambia el estado del producto en la lista')
    expect(legacyHelp).toContain('no genera ningún movimiento en Economía')
    expect(inventory).toContain('Marcar «comprado» y Finalizar la compra solo cambian el estado de la lista')
  })

  it('la ficha de Ayuda describe de verdad cómo se añaden y corrigen líneas antes de guardar un ticket', () => {
    expect(legacyHelp).toContain('Añadir y corregir productos antes de guardar un ticket')
    expect(legacyHelp).toContain('«+ Añadir productos a mano»')
    expect(legacyHelp).toContain('suma cantidad × precio')
    expect(legacyHelp).toContain('Con un solo «Guardar ticket» se guarda el ticket y todos sus productos')
    expect(cards).toContain('«+ Añadir productos a mano» antes de guardar')
    // y ya no dice que hay que guardar y luego editar
    expect(legacyHelp).not.toContain('las líneas se corrigen a mano al editarlo')
    expect(cards).not.toContain('las líneas se corrigen a mano al editarlo')
    expect(inventory).not.toContain('exige guardarlo y luego editarlo')
  })
})
