import { describe, expect, it } from 'vitest'

// Bloque E (opciones de menú de los invitados): el aviso antes de renombrar/cambiar audiencia/borrar una
// opción ya elegida leía el recuento de `members`, cargado una sola vez al abrir la pantalla — si otra
// sesión (otro familiar) guardaba una elección mientras tanto, el aviso mentía con un número viejo. Ahora
// pide el recuento real a la base de datos justo antes de decidir, cada vez.
const EVENTS = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

describe('countMenuOptionChoices: recuento real en servidor, nunca reasigna ni borra elecciones', () => {
  it('cuenta event_guest_members por menu_option_id — la misma tabla que ya decide "elegido/sin elegir"', () => {
    const body = fn(EVENTS, 'export async function countMenuOptionChoices(')
    expect(body).toContain("from('event_guest_members')")
    expect(body).toContain("eq('menu_option_id', optionId)")
    expect(body).not.toMatch(/\.update\(|\.delete\(/)
  })
})

describe('la pantalla pide el recuento real antes de avisar, no el array cargado al abrir', () => {
  it('confirmChangeWithChoices y handleDeleteOption llaman a countMenuOptionChoices (servidor), no a members.filter', () => {
    const confirmFn = fn(UI, 'async function confirmChangeWithChoices(')
    const deleteFn = fn(UI, 'async function handleDeleteOption(')
    expect(confirmFn).toContain('await countMenuOptionChoices(option.id)')
    expect(deleteFn).toContain('await countMenuOptionChoices(option.id)')
    expect(confirmFn).not.toContain('members.filter')
    expect(deleteFn).not.toContain('members.filter')
  })

  it('renombrar y cambiar audiencia esperan la confirmación antes de guardar (dos sesiones abiertas nunca pisan el aviso)', () => {
    expect(UI).toContain("confirmChangeWithChoices(o, 'se verá el nuevo nombre').then((ok) => {")
    expect(UI).toContain("confirmChangeWithChoices(o, 'cambia a quién va dirigida').then((ok) => {")
  })

  it('ninguna reasignación automática: quitar una opción nunca toca otra opción ni reasigna elecciones', () => {
    const deleteEventMenuOption = fn(EVENTS, 'export async function deleteEventMenuOption(')
    expect(deleteEventMenuOption).not.toContain('event_guest_members')
  })
})
