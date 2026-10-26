// Compras admite compras CON ticket y SIN ticket, así que la sección ya no se llama «Tickets». Solo cambian los textos visibles: las claves internas
// (pestaña 'Tickets', destino 'compras.tickets', ids de tutoriales) siguen igual porque están guardadas en ajustes de la gente y en el historial de tutoriales.
import { describe, expect, it } from 'vitest'
import { COMPRAS_MENU_ITEM_META } from '@/state/comprasMenu'
import finance from './FinanceScreen.tsx?raw'
import shopping from './ShoppingScreen.tsx?raw'
import comprasTourMain from '../help/tours/defs/g2/compras.ts?raw'
import comprasTourTickets from '../help/tours/defs/g2/comprasTickets.ts?raw'
import comprasExplainer from '../help/explainers/g2/compras.ts?raw'
import legacyHelp from '../help/legacy/legacyHelp.ts?raw'

// Los capítulos de Compras viven en dos archivos (visita, lista y tiendas; y registrar compras): el texto se comprueba en los dos.
const comprasTour = comprasTourMain + comprasTourTickets

describe('Tickets → Compras registradas (solo textos visibles)', () => {
  it('el menú, las migas y las tarjetas de Compras usan «Compras registradas»; la clave interna no cambia', () => {
    expect(COMPRAS_MENU_ITEM_META.Tickets.label).toBe('Compras registradas')
    expect(COMPRAS_MENU_ITEM_META.Tickets.icon).toBe('🧾')
    expect(shopping).toContain("'compras.tickets': () => setTab('Tickets')")
    expect(shopping).toContain('Compras registradas — ${currentMonth}')
  })

  it('«Subir ticket» → «Registrar compra» y «Tickets guardados» → «Historial de compras»', () => {
    expect(finance).toContain("'Registrar compra'}</h2>")
    expect(finance).toContain('>Historial de compras</h2>')
    expect(finance).not.toContain("'Subir ticket'}</h2>")
    expect(finance).not.toContain('>Tickets guardados<')
  })

  it('se mantienen los dos botones de tipo de compra y el editor de productos', () => {
    expect(finance).toContain('📷 Con ticket')
    expect(finance).toContain('✍️ Sin ticket')
    expect(finance).toContain('+ Añadir productos')
    expect(finance).toContain('Guardar ticket')
  })

  it('Ayuda y tutoriales Enséñame hablan de «Compras registradas», «Registrar compra» e «Historial de compras»', () => {
    expect(comprasTour).toContain("group: 'Compras registradas'")
    expect(comprasTour).toContain('Registrar compra')
    expect(comprasTour).toContain('Historial de compras')
    expect(comprasExplainer).toContain('Llévame a Compras registradas')
    expect(comprasExplainer).toContain('Historial de compras')
    expect(legacyHelp).toContain('Compras → Compras registradas pulsa «✍️ Sin ticket»')
    for (const src of [comprasTour, comprasExplainer, legacyHelp]) {
      expect(src).not.toContain('Subir un ticket')
      expect(src).not.toContain('Tickets guardados')
      expect(src).not.toContain('Llévame a Tickets')
      expect(src).not.toContain('«Subir ticket»')
    }
  })

  it('Banco ya no menciona el efectivo y la Ayuda sitúa las carteras en Movimientos', () => {
    expect(legacyHelp).not.toContain('Economía → Banco → «Efectivo (opcional)»')
    expect(legacyHelp).toContain('+ Añadir cuenta o cartera')
  })
})
