import { describe, expect, it } from 'vitest'

// Petición real (Parte B, Fase 5): "📇 Proveedores" era demasiado básico (solo nombre, tipo y una nota de
// texto libre) y borrar un proveedor enlazado a un pago/encargo perdería esa referencia. Fix: ficha
// ampliada (persona de contacto, teléfono, email, web, dirección — todo opcional, el flujo rápido de
// siempre sigue igual) y "archivar" en vez de "borrar" cuando el proveedor tiene historial real.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const DATA = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('data/events.ts — isEventProviderLinked comprueba pagos, encargos actuales e históricos', () => {
  it('consulta event_payments, event_task_groups y event_task_group_resolutions por provider_id', () => {
    const fn = window_(DATA, 'export async function isEventProviderLinked(', '\n}')
    expect(fn).toContain("from('event_payments')")
    expect(fn).toContain("from('event_task_groups')")
    expect(fn).toContain("from('event_task_group_resolutions')")
    expect(fn).toContain(".eq('provider_id', id)")
  })
})

// NOTA (PEPA Eventos, prompt maestro Fase 3): el "borrar con comprobación de historial"/"archivar" de
// ProvidersSection que se probaba aquí (Fase 5) se sustituyó por el registro global — ya no hay NINGÚN
// botón de borrado en esta pantalla (ni aquí ni en ProvidersGlobalScreen): solo archivar/reactivar
// (registro global, ver providersGlobalUi.test.ts) y, dentro de un evento, descartar/recuperar o
// desvincular (nunca borran nada) — ver eventProvidersSectionFase3Ui.test.ts. isEventProviderLinked (data
// layer, arriba) se conserva por si se necesita en el futuro, pero ProvidersSection ya no la usa.

describe('Un proveedor archivado nunca se ofrece para un enlace NUEVO, pero su nombre no desaparece de los ya existentes', () => {
  it('ResolveGroupModal: el selector de "proveedor existente" excluye los archivados', () => {
    const resolveModal = window_(UI, 'function ResolveGroupModal(', '\nfunction NextStepPromptModal(')
    expect(resolveModal).toContain('setProviders(all.filter((p) => !p.archived))')
  })
  it('PaymentsSection: carga los proveedores que ofrece AddPaymentModal ya excluyendo los archivados', () => {
    const paymentsSection = window_(UI, 'function PaymentsSection(', '\nfunction AddPaymentModal(')
    expect(paymentsSection).toContain('setProviders(all.filter((p) => !p.archived))')
  })
  it('ProviderLinker: "available" (para relacionar uno nuevo) excluye archivados, pero la lista completa "providers" se sigue usando para mostrar el nombre de los ya relacionados', () => {
    const linker = window_(UI, 'function ProviderLinker(', '\n\nfunction ')
    expect(linker).toContain('providers.filter((p) => !linkedIds.has(p.id) && !p.archived)')
    expect(linker).toContain('providers.find((p) => p.id === l.providerId)?.name')
  })
})
