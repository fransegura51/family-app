// Reglas de «Borrar mi cuenta» (código puro, sin Deno, para poder probarlo con los tests normales).
//
//   · «me»: borra el acceso de UNA persona; la familia y todo lo suyo siguen. No se puede si es la única cuenta (no quedaría nadie para llevar la familia: hay que
//     borrar la familia entera) ni si es la única administradora y quedan más cuentas (primero hay que nombrar a otra administradora).
//   · «family»: borra la familia entera con todos sus datos y los accesos de todas sus cuentas. Solo administradoras.
// Siempre hay que escribir BORRAR: un toque suelto nunca borra nada.

export type DeletionScope = 'me' | 'family'

export type DeletionDecision = { ok: true } | { ok: false; status: number; error: string }

export const CONFIRM_WORD = 'BORRAR'

export function decideDeletion(input: { scope: unknown; confirm: unknown; role: string; otherAdmins: number; otherProfiles: number }): DeletionDecision {
  if (input.scope !== 'me' && input.scope !== 'family') return { ok: false, status: 400, error: 'invalid_scope' }
  if (input.confirm !== CONFIRM_WORD) return { ok: false, status: 400, error: 'confirm_required' }
  if (input.scope === 'family') {
    return input.role === 'admin' ? { ok: true } : { ok: false, status: 403, error: 'admin_only' }
  }
  if (input.otherProfiles === 0) return { ok: false, status: 409, error: 'only_account' }
  if (input.role === 'admin' && input.otherAdmins === 0) return { ok: false, status: 409, error: 'last_admin' }
  return { ok: true }
}
