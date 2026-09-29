import { describe, expect, it } from 'vitest'

// Validación real en iPhone + WhatsApp — flujo de envío/RSVP APROBADO tal cual (PNG, texto, Maps, RSVP,
// confirmación no se tocan). 4 mejoras de marca: nota RSVP visible (ver eventGuestRsvpNoteUi.test.ts),
// firma "Creado con PEPA" en la tarjeta de envío, pie de marca en el flujo RSVP público, y logo/eslogan en
// el login — reutilizando los assets oficiales YA existentes (src/assets/brand/*, sin usar hasta esta
// fase) y una única URL pública compartida (domain/brand.ts), nunca un dibujo/emoji nuevo por sitio.
const LOGIN_SRC = (import.meta.glob('/src/ui/LoginScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/LoginScreen.tsx']
const RSVP_SRC = (import.meta.glob('/src/ui/RsvpScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RsvpScreen.tsx']
const EVENTOS_SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const BRAND_SRC = (import.meta.glob('/src/domain/brand.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/brand.ts']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Una única fuente visual — la URL pública vive en un solo sitio (domain/brand.ts), nunca repetida a mano', () => {
  it('PEPA_PUBLIC_WEBSITE_URL apunta al dominio real ya referenciado en domain/signupOrigin.ts', () => {
    expect(BRAND_SRC).toContain("export const PEPA_PUBLIC_WEBSITE_URL = 'https://pepafamilyapp.es'")
  })

  it('RsvpScreen la importa en vez de escribir el literal a mano', () => {
    expect(RSVP_SRC).toContain("import { PEPA_PUBLIC_WEBSITE_URL } from '@/domain/brand'")
    expect(RSVP_SRC).not.toContain("'https://pepafamilyapp.es'")
  })
})

describe('Login — branding genérico "Family App" sustituido por el logo+nombre+eslogan oficial', () => {
  it('ya no queda el <h1>Family App</h1> genérico', () => {
    expect(LOGIN_SRC).not.toContain('<h1>Family App</h1>')
  })

  it('usa el asset oficial de marca (logo+eslogan en una sola imagen), no un dibujo/texto nuevo', () => {
    expect(LOGIN_SRC).toContain("import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'")
    expect(LOGIN_SRC).toContain('<img src={pepaLogoSlogan}')
  })

  it('el resto de la autenticación (Supabase Auth, entrar/crear cuenta/recuperar, términos/privacidad) sigue intacto', () => {
    expect(LOGIN_SRC).toContain('supabase.auth.signInWithPassword')
    expect(LOGIN_SRC).toContain('supabase.auth.signUp')
    expect(LOGIN_SRC).toContain('supabase.auth.resetPasswordForEmail')
    expect(LOGIN_SRC).toContain('términos de uso')
    expect(LOGIN_SRC).toContain('política de privacidad')
  })
})

describe('RSVP público — RsvpFooter (los 6 estados del flujo) enlaza a la web pública, nunca al login de la app', () => {
  const footerFn = slice(RSVP_SRC, 'function RsvpFooter() {', '\nfunction RsvpForm')

  it('bug real corregido: antes enlazaba a window.location.origin + BASE_URL (el login de la propia app) — un invitado sin cuenta PEPA no tiene por qué acabar ahí', () => {
    expect(footerFn).not.toContain('window.location.origin')
    expect(footerFn).toContain('href={PEPA_PUBLIC_WEBSITE_URL}')
  })

  it('usa el mismo asset oficial (cara) que el resto de la marca — nunca un dibujo nuevo ni un emoji sustituto', () => {
    expect(RSVP_SRC).toContain("import pepaFaceReference from '@/assets/brand/references/pepa-face-reference-official.jpg'")
    expect(footerFn).toContain('<img src={pepaFaceReference}')
  })

  it('el pie sigue siendo el ÚNICO componente compartido por los 6 estados del flujo RSVP — nunca una copia por pantalla', () => {
    expect((RSVP_SRC.match(/<RsvpFooter \/>/g) ?? []).length).toBe(6)
    expect((RSVP_SRC.match(/function RsvpFooter\(\)/g) ?? []).length).toBe(1)
  })
})

describe('Invitación (tarjeta de envío) — "Creado con PEPA", asociado al mensaje, nunca dentro del lienzo', () => {
  it('usa el mismo asset oficial de cara — no incrusta el logo dentro de InvitationCanvasView ni de la exportación PNG', () => {
    expect(EVENTOS_SRC).toContain("import pepaFaceReference from '@/assets/brand/references/pepa-face-reference-official.jpg'")
    const captionBlock = slice(EVENTOS_SRC, '<p className="muted" style={{ display: \'flex\', alignItems: \'center\', gap: 6, fontSize: 11', 'Creado con PEPA\n        </p>')
    expect(captionBlock).toContain('<img src={pepaFaceReference}')
  })

  it('la firma vive en InvitationModal (la tarjeta de envío), separada de InvitationCanvasView y de exportInvitationImage — nunca toca el diseño ni el PNG compartido', () => {
    const modalBlock = slice(EVENTOS_SRC, 'function InvitationModal(', '\n// ---')
    expect(modalBlock).toContain('Creado con PEPA')
    // Nunca dentro del propio InvitationCanvasView (compartido con el editor y con exportInvitationImage) —
    // si estuviera ahí, aparecería también en el lienzo editable y en el PNG exportado.
    const canvasViewFn = slice(
      (import.meta.glob('/src/ui/InvitationDesigner.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/InvitationDesigner.tsx'],
      'export function InvitationCanvasView(',
      '\nconst LAYER_FONT_OPTIONS',
    )
    expect(canvasViewFn).not.toContain('Creado con PEPA')
  })
})
