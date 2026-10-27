// Las siete áreas del Centro de Administración de PEPA (/administracion). Un solo sitio para las dos antiguas pantallas (Panel de admin y Centro de Mando de Comunidad).
// El área activa viaja en la dirección (?area=…) para que recargar no devuelva al principio y para que las direcciones antiguas puedan redirigir al área que les corresponde.
export type AdminAreaId = 'resumen' | 'usuarios' | 'comunidad' | 'ia' | 'funcionalidades' | 'ayuda' | 'sistema'

export const ADMIN_AREAS: { id: AdminAreaId; label: string; icon: string; short: string }[] = [
  { id: 'resumen', label: 'Resumen general', icon: '📊', short: 'Resumen' },
  { id: 'usuarios', label: 'Usuarios, familias e invitaciones', icon: '👥', short: 'Usuarios' },
  { id: 'comunidad', label: 'Comunidad y moderación', icon: '🛡️', short: 'Comunidad' },
  { id: 'ia', label: 'Control de IA', icon: '🤖', short: 'IA' },
  { id: 'funcionalidades', label: 'Estado de funcionalidades', icon: '🧩', short: 'Funcionalidades' },
  { id: 'ayuda', label: 'Ayuda y documentación', icon: '📖', short: 'Ayuda' },
  { id: 'sistema', label: 'Sistema', icon: '🛠️', short: 'Sistema' },
]

export const ADMIN_BASE = '/administracion'

export function parseAdminArea(v: string | null | undefined): AdminAreaId {
  return ADMIN_AREAS.find((a) => a.id === v)?.id ?? 'resumen'
}

export function adminAreaPath(area: AdminAreaId, extra?: Record<string, string>): string {
  const q = new URLSearchParams({ area, ...(extra ?? {}) })
  return `${ADMIN_BASE}?${q.toString()}`
}

// Direcciones antiguas → área nueva. /admin-uso era el «Panel de admin» (usuarios, errores, invitaciones, automatizaciones); /comunidad/admin era el Centro de Mando de Comunidad
// y conserva su pestaña (?tab=…), que ahora vive dentro del área «Comunidad y moderación».
export function legacyAdminUsagePath(): string {
  return adminAreaPath('usuarios')
}

export function legacyCommunityAdminPath(search: string): string {
  const tab = new URLSearchParams(search).get('tab')
  return adminAreaPath('comunidad', tab ? { tab } : undefined)
}
