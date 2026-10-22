// Invitación a valorar PEPA tras unos días de uso, y aviso a la dueña cuando llega una valoración de 1 o 2 estrellas.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { daysSince, REVIEW_INVITE_AFTER_DAYS, REVIEW_INVITE_NEVER_ISO, REVIEW_INVITE_SNOOZE_DAYS, shouldInviteToReview, snoozeUntil } from '@/domain/reviewInvite'
import card from '@/ui/ReviewInviteCard.tsx?raw'
import home from '@/ui/HomeScreen.tsx?raw'
import reviewsScreen from '@/ui/ReviewsScreen.tsx?raw'
import ayuda from '@/help/legacy/legacyHelp.ts?raw'

const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/0291_app_reviews_low_star_alert.sql'), 'utf8')
const now = new Date('2026-10-18T10:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

describe('shouldInviteToReview', () => {
  it('no antes de 7 días de cuenta; sí a partir del séptimo', () => {
    expect(REVIEW_INVITE_AFTER_DAYS).toBe(7)
    expect(shouldInviteToReview({ now, accountCreatedAt: daysAgo(6), hasGeneralReview: false, dismissedUntil: null })).toBe(false)
    expect(shouldInviteToReview({ now, accountCreatedAt: daysAgo(7), hasGeneralReview: false, dismissedUntil: null })).toBe(true)
    expect(shouldInviteToReview({ now, accountCreatedAt: daysAgo(90), hasGeneralReview: false, dismissedUntil: null })).toBe(true)
  })

  it('nunca a quien ya valoró la app en general', () => {
    expect(shouldInviteToReview({ now, accountCreatedAt: daysAgo(30), hasGeneralReview: true, dismissedUntil: null })).toBe(false)
  })

  it('«Ahora no» la aplaza 14 días y después vuelve; «No volver a preguntar» equivale a nunca', () => {
    expect(REVIEW_INVITE_SNOOZE_DAYS).toBe(14)
    const until = snoozeUntil(now)
    expect(daysSince(until, now)).toBe(-14)
    expect(shouldInviteToReview({ now, accountCreatedAt: daysAgo(30), hasGeneralReview: false, dismissedUntil: until })).toBe(false)
    const later = new Date(now.getTime() + 15 * 86_400_000)
    expect(shouldInviteToReview({ now: later, accountCreatedAt: daysAgo(30), hasGeneralReview: false, dismissedUntil: until })).toBe(true)
    expect(shouldInviteToReview({ now: later, accountCreatedAt: daysAgo(30), hasGeneralReview: false, dismissedUntil: REVIEW_INVITE_NEVER_ISO })).toBe(false)
  })

  it('sin fecha de cuenta, o inválida, no se invita (nunca por error)', () => {
    expect(shouldInviteToReview({ now, accountCreatedAt: null, hasGeneralReview: false, dismissedUntil: null })).toBe(false)
    expect(shouldInviteToReview({ now, accountCreatedAt: 'no es fecha', hasGeneralReview: false, dismissedUntil: null })).toBe(false)
  })
})

describe('tarjeta de Inicio', () => {
  it('va en Inicio junto a la invitación a activar los avisos, y no es una de las tarjetas ordenables', () => {
    expect(home).toContain("import { ReviewInviteCard } from '@/ui/ReviewInviteCard'")
    expect(home).toContain('<ReviewInviteCard />')
    expect(home.indexOf('<NotificationsOnboarding />')).toBeLessThan(home.indexOf('<ReviewInviteCard />'))
  })

  it('un toque en las estrellas guarda la valoración general; después se ofrece comentar sin obligar', () => {
    expect(card).toContain("saveAppReview({ section: 'general', stars: n })")
    expect(card).toContain("navigate('/resenas')")
    expect(card).toContain('Añadir comentario')
  })

  it('«Ahora no» aplaza y «No volver a preguntar» la quita; todo en este móvil y sin romper si no hay almacenamiento', () => {
    expect(card).toContain('writeDismissedUntil(snoozeUntil(new Date()))')
    expect(card).toContain('writeDismissedUntil(REVIEW_INVITE_NEVER_ISO)')
    expect(card).toMatch(/try \{\s*return window\.localStorage\.getItem\(STORAGE_KEY\)\s*\} catch/)
  })

  it('no estorba: sin consultas mientras está aplazada, la edad de la cuenta se mira antes de pedir nada a la base de datos, y un fallo la oculta', () => {
    expect(card.indexOf('shouldInviteToReview(')).toBeLessThan(card.indexOf('hasMyGeneralReview(user.id)'))
    expect(card).toContain('check().catch(() => undefined)')
    expect(card).toContain('setVisible(false)')
  })

  it('las estrellas son el mismo componente que usa la pantalla de Reseñas', () => {
    expect(card).toContain("import { StarPicker } from '@/ui/StarPicker'")
    expect(reviewsScreen).toContain("import { StarPicker } from '@/ui/StarPicker'")
  })

  it('está explicada en la ayuda', () => {
    expect(ayuda).toContain('Invitación a valorar')
    expect(ayuda).toContain('1 o 2 estrellas')
  })
})

describe('aviso de valoraciones de 1 o 2 estrellas (migración 0291)', () => {
  it('se dispara con valoraciones de 1 o 2 estrellas, al crearlas o cambiar estrellas o comentario', () => {
    expect(sql).toContain('after insert or update of stars, liked, disliked on public.app_reviews')
    expect(sql).toContain('when (new.stars <= 2)')
    expect(sql).toContain("if tg_op = 'UPDATE' and (old.stars, old.liked, old.disliked) is not distinct from (new.stars, new.liked, new.disliked) then")
    // OLD no puede aparecer en el WHEN de un disparador que también es de INSERT.
    const when = sql.slice(sql.indexOf('when (new.stars'), sql.indexOf('execute function'))
    expect(when).not.toContain('old.')
  })

  it('avisa solo a las cuentas dueñas de la app, por el centro de avisos de siempre, con enlace a la pantalla de reseñas', () => {
    expect(sql).toContain('select p.id from public.profiles p where p.is_app_owner')
    expect(sql).toContain('private.notify_user(')
    expect(sql).toContain("'/resenas'")
    expect(sql).toContain("'resenas-bajas'")
  })

  it('no repite el aviso (clave por valoración, estrellas y comentario) y nunca hace fallar la valoración', () => {
    expect(sql).toContain("v_key := 'review-low:'")
    expect(sql).toContain('md5(')
    expect(sql).toContain('exception when others then')
    expect(sql).toContain('raise warning')
  })

  it('es solo aditiva, con función segura (security definer, search_path vacío, sin permisos de ejecución públicos) y marcha atrás', () => {
    expect(sql).toContain('security definer')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('revoke execute on function private.app_reviews_low_star_notify() from public, anon, authenticated')
    expect(sql).not.toMatch(/drop |alter table/)
    const down = fs.readFileSync(path.resolve(__dirname, '../../supabase/rollbacks/0291_app_reviews_low_star_alert_down.sql'), 'utf8')
    expect(down).toContain('drop trigger if exists app_reviews_low_star_notify on public.app_reviews')
    expect(down).toContain('drop function if exists private.app_reviews_low_star_notify()')
  })
})
