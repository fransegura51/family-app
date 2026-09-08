import { supabase } from '@/data/supabaseClient'
import type { CustomMenuItem } from '@/domain/types'

// Accesos libres del ☰ Menú (petición real: "añade todas las
// subcarpetas que te he puesto en la foto [Wallet]... con la función
// de añadir más si queremos, o eliminar alguna") — compartidos por
// toda la familia (RLS por family_id, ver 0081_custom_menu_items.sql),
// no solo en este dispositivo. Se editan desde "Organizar menú".
async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return profileRow.family_id
}

export async function listCustomMenuItems(): Promise<CustomMenuItem[]> {
  const { data, error } = await supabase.from('custom_menu_items').select('id, family_id, label, icon, sort_order').order('sort_order', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, familyId: r.family_id, label: r.label, icon: r.icon, sortOrder: r.sort_order }))
}

export async function createCustomMenuItem(input: { label: string; icon?: string }): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('custom_menu_items').insert({
    family_id: familyId,
    label: input.label.trim(),
    icon: input.icon?.trim() || '📌',
  })
  if (error) throw error
}

// Petición real: "todas y cada una de ellas" — la primera vez que la
// familia abre "Organizar menú" y no tiene ningún acceso propio
// todavía, se dan de alta solas todas las de la captura de Wallet (sin
// pedirlo), igual que ya se hace con las categorías de ingresos —
// luego cada una se puede renombrar o borrar libremente.
export const DEFAULT_CUSTOM_MENU_ITEMS: { label: string; icon: string }[] = [
  { label: 'Inicio', icon: '🏠' },
  { label: 'Registros', icon: '📋' },
  { label: 'Inversiones', icon: '📈' },
  { label: 'Estadísticas', icon: '📊' },
  { label: 'Pagos planificados', icon: '⏰' },
  { label: 'Presupuestos', icon: '💰' },
  { label: 'Deudas', icon: '💳' },
  { label: 'Metas', icon: '🎯' },
  { label: 'Prueba nuestra nueva app', icon: '✨' },
  { label: 'Listas de compras', icon: '🛍️' },
  { label: 'Garantías', icon: '🛡️' },
  { label: 'Tarjetas de fidelidad', icon: '🎁' },
  { label: 'Tipos de cambio', icon: '💱' },
  { label: 'Invitar amigos', icon: '👤' },
  { label: 'Síguenos', icon: '❤️' },
  { label: 'Configuración', icon: '⚙️' },
]

export async function seedDefaultCustomMenuItems(): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('custom_menu_items').insert(
    DEFAULT_CUSTOM_MENU_ITEMS.map((item, i) => ({
      family_id: familyId,
      label: item.label,
      icon: item.icon,
      sort_order: Date.now() + i,
    })),
  )
  if (error) throw error
}

export async function updateCustomMenuItem(id: string, patch: { label?: string; icon?: string }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.label !== undefined) update.label = patch.label.trim()
  if (patch.icon !== undefined) update.icon = patch.icon.trim() || '📌'
  const { error } = await supabase.from('custom_menu_items').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteCustomMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from('custom_menu_items').delete().eq('id', id)
  if (error) throw error
}
