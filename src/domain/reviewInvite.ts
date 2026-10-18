// Invitación a valorar PEPA tras unos días de uso (Reseñas y opiniones). Se pide con suavidad: una vez pasados unos días desde que se creó la cuenta, solo a quien
// todavía no ha valorado la app en general, y si dice «Ahora no» no se vuelve a preguntar hasta pasado un tiempo (o nunca, si pide que no se le pregunte más).

export const REVIEW_INVITE_AFTER_DAYS = 7
export const REVIEW_INVITE_SNOOZE_DAYS = 14
// «No volver a preguntar»: una fecha tan lejana que equivale a nunca.
export const REVIEW_INVITE_NEVER_ISO = '9999-12-31T00:00:00.000Z'

const DAY_MS = 86_400_000

export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((now.getTime() - t) / DAY_MS)
}

export function snoozeUntil(now: Date, days: number = REVIEW_INVITE_SNOOZE_DAYS): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString()
}

export interface ReviewInviteInput {
  now: Date
  // Cuándo se creó la cuenta (auth). Sin dato → no se invita.
  accountCreatedAt: string | null | undefined
  // ¿Ya ha valorado la app en general?
  hasGeneralReview: boolean
  // Hasta cuándo dijo «Ahora no» (o «No volver a preguntar»), guardado en este móvil.
  dismissedUntil: string | null | undefined
}

export function shouldInviteToReview(input: ReviewInviteInput): boolean {
  if (input.hasGeneralReview) return false
  const age = daysSince(input.accountCreatedAt, input.now)
  if (age === null || age < REVIEW_INVITE_AFTER_DAYS) return false
  if (input.dismissedUntil) {
    const until = new Date(input.dismissedUntil).getTime()
    if (!Number.isNaN(until) && until > input.now.getTime()) return false
  }
  return true
}
