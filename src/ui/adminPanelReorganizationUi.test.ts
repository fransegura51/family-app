import { describe, expect, it } from 'vitest'

// Reorganización "Familia / Panel de admin" (histórica) + Centro de Administración único (B2). Dos ideas que NO deben perderse:
// (1) las herramientas técnicas que solo usamos nosotros como administradoras de PEPA nunca vuelven a Familia (el rol de admin de CADA familia no da acceso a ellas);
// (2) "⚙️ Automatizaciones de tickets por email" (Pipedream: Amazon, Mercadona, eventos) conserva EXACTAMENTE los mismos webhooks, token y botones, ahora dentro del área
//     «Sistema» del Centro de Administración, detrás de la puerta que pregunta al servidor si la cuenta es propietaria (am_i_app_owner → profiles.is_app_owner).
const FAMILY_SRC = (import.meta.glob('/src/ui/FamilyScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FamilyScreen.tsx']
const SYSTEM_SRC = (import.meta.glob('/src/ui/admin/AreaSistema.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/admin/AreaSistema.tsx']
const AMAZON_SRC = (import.meta.glob('/src/ui/admin/AmazonWebhookSettings.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/admin/AmazonWebhookSettings.tsx'
]
const MENU_SETTINGS_SRC = (import.meta.glob('/src/ui/MenuSettingsScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/MenuSettingsScreen.tsx'
]

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('FamilyScreen — las Automatizaciones ya no viven aquí (ni el componente ni el desplegable)', () => {
  it('sin AmazonWebhookSettings ni el desplegable "⚙️ Automatizaciones de tickets por email"', () => {
    expect(FAMILY_SRC).not.toContain('AmazonWebhookSettings')
    expect(FAMILY_SRC).not.toContain('Automatizaciones de tickets por email')
    expect(FAMILY_SRC).not.toContain('getAmazonWebhookToken')
    expect(FAMILY_SRC).not.toContain('regenerateAmazonWebhookToken')
  })

  it('isAdmin (rol de admin de la familia) sigue existiendo — sigue gobernando el resto de acciones de Familia, nunca se tocó su lógica', () => {
    expect(FAMILY_SRC).toContain("const isAdmin = profile.role === 'admin'")
  })
})

describe('Centro de Administración → área Sistema: Automatizaciones trasladada tal cual', () => {
  it('el área Sistema pinta «⚙️ Automatizaciones» con el mismo componente', () => {
    expect(SYSTEM_SRC).toContain('⚙️ Automatizaciones')
    expect(SYSTEM_SRC).toContain('<AmazonWebhookSettings />')
  })

  it('mismos webhooks, mismo token, mismos botones — ninguna reimplementación', () => {
    expect(AMAZON_SRC).toContain('export function AmazonWebhookSettings() {')
    expect(AMAZON_SRC).toContain('`${base}/functions/v1/amazon-order-webhook`')
    expect(AMAZON_SRC).toContain('`${base}/functions/v1/mercadona-ticket-webhook`')
    expect(AMAZON_SRC).toContain('`${base}/functions/v1/import-event-email-webhook`')
    expect(AMAZON_SRC).toContain('getAmazonWebhookToken')
    expect(AMAZON_SRC).toContain('regenerateAmazonWebhookToken')
    expect(AMAZON_SRC).toContain("'Copiar URL'")
    expect(AMAZON_SRC).toContain("label={busy ? 'Regenerando…' : 'Regenerar token'}")
  })
})

describe('MenuSettingsScreen — el enlace lleva al Centro de Administración y solo se pinta si el servidor confirma que la cuenta es propietaria', () => {
  it('el enlace ahora dice "🛠️ Centro de Administración" (antes "🛠️ Panel de admin")', () => {
    expect(MENU_SETTINGS_SRC).toContain('🛠️ Centro de Administración')
    expect(MENU_SETTINGS_SRC).not.toContain('🛠️ Panel de admin')
    expect(MENU_SETTINGS_SRC).not.toContain('📊 Panel de uso de la app')
  })

  it('la señal de acceso es am_i_app_owner preguntado al servidor (useAppOwner), no el truco de "hay filas en list_app_usage"', () => {
    const fn = slice(MENU_SETTINGS_SRC, 'function AdminUsageLink() {', '\n\n// Petición real: "darle al usuario a elegir qué clases de tonos')
    expect(fn).toContain('useAppOwner()')
    expect(fn).toContain("if (owner !== 'owner') return null")
    expect(fn).toContain('<Link to="/administracion"')
    expect(fn).not.toContain('listAppUsage')
  })
})
