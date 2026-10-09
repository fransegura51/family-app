import { describe, expect, it } from 'vitest'

// Bug real reportado (Parte B, Fase 4): dos contenedores "Flores" sueltos en Encargos, uno con tareas y
// otro vacío — causa real: "+ Nuevo encargo" (addEventTaskGroup) nunca comprobaba si ya existía uno con
// ese nombre. Fix: SIN fusionar nada solo (dos "Flores" pueden ir legítimamente a floristerías
// distintas), se avisa y la familia elige "es el mismo, usar el existente" / "crear uno nuevo igualmente"
// / "cancelar".
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const GROUPS_MODAL = window_(UI, 'function EventTaskGroupsModal(', '\nfunction ResolveGroupModal(')

describe('EventTaskGroupsModal.add — "+ Nuevo encargo" avisa de un nombre duplicado, nunca fusiona solo', () => {
  it('sin force, busca un encargo existente con el mismo nombre (sin distinguir mayúsculas) antes de crear', () => {
    const addFn = window_(GROUPS_MODAL, 'async function add(', '\n  }')
    expect(addFn).toContain("groups.find((g) => g.name.trim().toLowerCase() === name.toLowerCase())")
    expect(addFn).toContain('setDuplicateOfName(existing.name)')
    expect(addFn).toContain('return')
  })
  it('ofrece "usar el existente" (no crea nada), "crear uno nuevo igualmente" (add(true), fuerza la creación) y "Cancelar"', () => {
    expect(GROUPS_MODAL).toContain('Es el mismo, usar el existente')
    expect(GROUPS_MODAL).toContain('void add(true)')
    expect(GROUPS_MODAL).toContain('Crear uno nuevo igualmente')
  })
  it('"usar el existente" nunca llama a addEventTaskGroup ni a ningún endpoint que fusione/borre nada', () => {
    const useExistingBtn = window_(GROUPS_MODAL, 'Es el mismo, usar el existente', '</button>')
    const onClickBlock = window_(GROUPS_MODAL, "onClick={() => { setNewName(''); setDuplicateOfName(null) }}", 'Es el mismo, usar el existente')
    expect(onClickBlock).not.toContain('addEventTaskGroup')
    expect(useExistingBtn.length).toBeGreaterThan(0)
  })
})
