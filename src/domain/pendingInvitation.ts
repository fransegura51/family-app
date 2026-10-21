import type { InvitationKind } from '@/domain/invitations'

// La invitación con la que alguien está creando su cuenta. Se guarda solo para que, tras confirmar el correo, la pantalla de alta ya sepa qué hacer sin volver a pedir el código.
// El código es de un solo uso y se vuelve a comprobar en el servidor al terminar (create_family / join_family_with_code): guardarlo aquí no da ningún permiso por sí solo.
// Va en sessionStorage (se borra al cerrar la pestaña) y, además, viaja en los datos del usuario (invite_code) por si la persona confirma el correo en otro dispositivo.
const KEY = 'pepa_pending_invitation'

export interface PendingInvitation {
  code: string
  kind: InvitationKind
  needsBirthDate: boolean
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

export function rememberPendingInvitation(p: PendingInvitation, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.setItem(KEY, JSON.stringify(p))
  } catch {
    // sin almacenamiento (modo privado): se volverá a leer de los datos del usuario
  }
}

export function recallPendingInvitation(storage: StorageLike | null = defaultStorage()): PendingInvitation | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<PendingInvitation>
    if (typeof v.code !== 'string' || v.code.length < 6 || v.code.length > 40) return null
    if (v.kind !== 'family' && v.kind !== 'member') return null
    return { code: v.code, kind: v.kind, needsBirthDate: v.needsBirthDate !== false }
  } catch {
    return null
  }
}

export function forgetPendingInvitation(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(KEY)
  } catch {
    // ídem
  }
}

/** El código del enlace «?invitacion=…» de una invitación compartida (null si no hay). */
export function invitationCodeFromSearch(search: string): string | null {
  try {
    const raw = new URLSearchParams(search).get('invitacion')
    if (!raw) return null
    const code = raw.trim().slice(0, 40)
    return /^[A-Za-z0-9_-]{6,40}$/.test(code) ? code : null
  } catch {
    return null
  }
}
