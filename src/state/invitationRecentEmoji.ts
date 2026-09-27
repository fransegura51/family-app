// Fase 3 Bloque 3 — "🕘 Recientes" en el panel de emoji del diseñador de invitaciones: por dispositivo, en
// localStorage, mismo patrón que tabOrder.ts/movementColorMode.ts. Sin backend nuevo para algo tan menor —
// si localStorage no está disponible (privado/bloqueado) simplemente no hay recientes, no es crítico.
const STORAGE_KEY = 'familyapp:invitation-recent-emoji'
const MAX_RECENTS = 12

export function loadRecentInvitationEmoji(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string').slice(0, MAX_RECENTS) : []
  } catch {
    return []
  }
}

export function recordRecentInvitationEmoji(emoji: string): void {
  try {
    const current = loadRecentInvitationEmoji().filter((e) => e !== emoji)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([emoji, ...current].slice(0, MAX_RECENTS)))
  } catch {
    // localStorage no disponible: se pierde recordar recientes entre visitas, no es crítico.
  }
}
