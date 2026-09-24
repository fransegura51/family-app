// Formato de lo que se comparte con el botón nativo "Compartir" (petición
// real: "el típico botón de compartir que se le abra el menú del teléfono
// para compartir por donde quiera", no un chat propio). Todo aquí es
// texto puro, sin tocar el navegador (Web Share API vive en
// services/share.ts) — así se puede probar con tests normales.
import { attendanceFilterLabel, organizeModeLabel, type AlfabeticoView, type FamiliasView, type GuestExportAttendanceFilter, type MesasView } from '@/domain/guestExport'

// Petición real: "compartir la lista de una tienda o de todas, que se
// pueda elegir en el momento de compartir" — texto plano legible en
// cualquier app de mensajería, agrupado igual que ya se ve en pantalla.
export function shoppingListText(
  groups: { store: string; items: { name: string; quantity: string | null; unit: string | null }[] }[],
): string {
  const parts = ['🛒 Lista de la compra']
  for (const g of groups) {
    if (g.items.length === 0) continue
    parts.push('', `— ${g.store} —`)
    for (const it of g.items) {
      const qty = [it.quantity, it.unit].filter(Boolean).join(' ')
      parts.push(`• ${it.name}${qty ? ` (${qty})` : ''}`)
    }
  }
  return parts.join('\n')
}

export function recipeText(recipe: {
  title: string
  ingredients: { name: string; quantity: string | null; unit: string | null }[]
  notes: string | null
}): string {
  const parts = [`🍽️ ${recipe.title}`]
  if (recipe.ingredients.length > 0) {
    parts.push('', 'Ingredientes:')
    for (const i of recipe.ingredients) {
      const qty = [i.quantity, i.unit].filter(Boolean).join(' ')
      parts.push(`• ${i.name}${qty ? ` — ${qty}` : ''}`)
    }
  }
  if (recipe.notes?.trim()) {
    parts.push('', 'Preparación:', recipe.notes.trim())
  }
  return parts.join('\n')
}

// Fase 14E.4 — "Exportar invitados" → Compartir. Texto humano de
// último recurso cuando el archivo (CSV) no se puede compartir como tal
// (sin soporte de Web Share con archivos) — sobre las MISMAS vistas de
// pantalla de domain/guestExport.ts (buildMesasView/buildFamiliasView/
// buildAlfabeticoView), nunca un contenido distinto solo para compartir.
// Nunca incluye groupId/tableId (IDs internos) — solo los mismos
// nombres/textos ya humanos que la vista y el HTML de impresión.
export type GuestListTextInput =
  | { organize: 'mesas'; view: MesasView }
  | { organize: 'familias'; view: FamiliasView }
  | { organize: 'alfabetico'; view: AlfabeticoView }

export function guestListText(eventTitle: string, attendance: GuestExportAttendanceFilter, input: GuestListTextInput): string {
  const parts = [`👥 Invitados — ${eventTitle}`, `${organizeModeLabel(input.organize)} · ${attendanceFilterLabel(attendance)}`]

  if (input.organize === 'mesas') {
    for (const t of input.view.tableGroups) {
      const occupancy = t.capacity != null ? `${t.occupied}/${t.capacity}` : `${t.occupied}`
      const warn = t.overCapacity ? ' · ⚠️ Aforo superado' : ''
      parts.push('', `— ${t.tableName} (${occupancy})${warn} —`)
      if (t.entries.length === 0) parts.push('Sin invitados asignados.')
      else for (const e of t.entries) parts.push(`• ${e.label}`)
    }
    if (input.view.pending.length > 0) {
      parts.push('', '⚠️ Pendientes de asignar')
      for (const p of input.view.pending) parts.push(`${p.groupName}: ${p.lines.join(', ')}`)
    }
  } else if (input.organize === 'familias') {
    for (const g of input.view.groups) {
      const metaParts = [`Invitados: ${g.declaredTotal}`]
      if (g.confirmedTotal != null) metaParts.push(`Confirmados: ${g.confirmedTotal}`)
      metaParts.push(g.rsvpStatusLabel)
      if (g.inviteScopeLabel) metaParts.push(g.inviteScopeLabel)
      parts.push('', `— ${g.groupName} —`, metaParts.join(' · '))
      for (const l of g.namedLines) parts.push(`• ${l.text}`)
      for (const l of g.pendingLines) parts.push(l)
    }
  } else {
    for (const e of input.view.entries) parts.push(`• ${e.text}`)
    if (input.view.pending.length > 0) {
      parts.push('', 'Pendientes de identificar')
      for (const p of input.view.pending) parts.push(`${p.groupName}: ${p.lines.join(', ')}`)
    }
  }

  return parts.join('\n')
}
