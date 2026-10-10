import { describe, expect, it } from 'vitest'

// Punto 1.1 (prompt de correcciones) — decisión definitiva del usuario: los datos de contacto se quedan
// SIEMPRE visibles (nada plegable); el teléfono y el correo son ellos mismos el enlace (llamar/abrir
// correo de un toque) y cada uno lleva su propio icono de copiar al lado. Mismo componente reutilizado en
// el registro global y en la ficha de un proveedor dentro de un evento — nunca dos implementaciones.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const CONTACT_LINE = window_(UI, 'function ProviderContactLine(', '\nfunction ProviderCardMenu(')

describe('ProviderContactLine — teléfono y correo siempre visibles, nunca plegados', () => {
  it('el teléfono es un enlace tel: real, no solo texto', () => {
    expect(CONTACT_LINE).toContain('href={`tel:${phone}`}')
  })
  it('el correo es un enlace mailto: real, no solo texto', () => {
    expect(CONTACT_LINE).toContain('href={`mailto:${email}`}')
  })
  it('cada uno (teléfono, WhatsApp, correo) lleva su propio CopyIconButton al lado', () => {
    expect((CONTACT_LINE.match(/<CopyIconButton/g) ?? []).length).toBe(3)
    expect(CONTACT_LINE).toContain('<CopyIconButton text={phone}')
    expect(CONTACT_LINE).toContain('<CopyIconButton text={whatsapp}')
    expect(CONTACT_LINE).toContain('<CopyIconButton text={email}')
  })
  it('sin teléfono ni correo no renderiza nada (ni una fila vacía)', () => {
    expect(CONTACT_LINE).toContain('if (!phone && !whatsapp && !email) return null')
  })
})

describe('Se usa en el registro global y en la ficha de proveedor de un evento, nunca duplicado como texto plano', () => {
  it('ProvidersGlobalScreen usa <ProviderContactLine phone={p.phone} whatsapp={p.whatsapp} email={p.email} />, y ya no mete el teléfono en el título ni el email en la línea de texto', () => {
    expect(UI).toContain('<ProviderContactLine phone={p.phone} whatsapp={p.whatsapp} email={p.email} />')
    expect(UI).not.toContain('{p.phone ? ` · ${p.phone}` : \'\'}')
    expect(UI).not.toContain('[p.contactPerson, p.email, p.website, p.address]')
  })
  it('la ficha de proveedor dentro de un evento usa <ProviderContactLine phone={g.phone} whatsapp={g.whatsapp} email={g.email} />, mismo criterio', () => {
    expect(UI).toContain('<ProviderContactLine phone={g.phone} whatsapp={g.whatsapp} email={g.email} />')
    expect(UI).not.toContain('{g.phone ? ` · ${g.phone}` : \'\'}')
    expect(UI).not.toContain('[g.contactPerson, g.email, g.website, g.address]')
  })
})

describe('ProviderCardMenu — ya no duplica llamar/email/copiar (ahora siempre visibles arriba), solo acciones de verdad ocasionales', () => {
  const MENU = window_(UI, 'function ProviderCardMenu(', '\nfunction ProvidersGlobalScreen(')
  it('conserva Editar y Guardar en contactos', () => {
    expect(MENU).toContain('✏️ Editar')
    expect(MENU).toContain('📱 Guardar en contactos')
  })
  it('ya no tiene un "📞 Llamar"/"✉️ Email"/"📋 Copiar email" redundante dentro del menú', () => {
    expect(MENU).not.toContain('📞 Llamar')
    expect(MENU).not.toContain('✉️ Email')
    expect(MENU).not.toContain('📋 Copiar email')
  })
})
