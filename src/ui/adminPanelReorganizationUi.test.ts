import { describe, expect, it } from 'vitest'

// Reorganización "Familia / Panel de admin" — separar configuración de cada familia de las herramientas
// técnicas que solo usamos nosotros como administradores de PEPA. Dos cambios, ambos de UBICACIÓN/ACCESO,
// nunca de lógica: (1) "⚙️ Automatizaciones de tickets por email" (Pipedream: Amazon, Mercadona, eventos)
// se traslada de FamilyScreen.tsx (detrás de isAdmin, el rol de admin de CADA familia — cualquier familia
// de prueba lo veía) a AdminUsageScreen.tsx (detrás de isAppOwnerView, la MISMA señal real que ya usaba
// AdminUsageLink para decidir si el enlace aparece: list_app_usage() devuelve filas solo para
// profiles.is_app_owner). (2) "📊 Panel de uso de la app" se renombra "🛠️ Panel de admin" y pasa a
// contener dos secciones: "📊 Uso de la app" (contenido de siempre) y "⚙️ Automatizaciones" (la sección
// trasladada). Mismos webhooks, mismo token, mismos botones — nunca una reimplementación.
const FAMILY_SRC = (import.meta.glob('/src/ui/FamilyScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/FamilyScreen.tsx']
const ADMIN_SRC = (import.meta.glob('/src/ui/AdminUsageScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/AdminUsageScreen.tsx']
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

describe('AdminUsageScreen ("🛠️ Panel de admin") — Automatizaciones trasladada tal cual, protegida por la misma señal real que el resto del panel', () => {
  it('el título pasa a "🛠️ Panel de admin" con dos secciones visibles', () => {
    expect(ADMIN_SRC).toContain('<h1 style={{ margin: 0 }}>🛠️ Panel de admin</h1>')
    expect(ADMIN_SRC).toContain('📊 Uso de la app')
    expect(ADMIN_SRC).toContain('⚙️ Automatizaciones')
  })

  it('isAppOwnerView reutiliza la MISMA señal que ya usaba AdminUsageLink (list_app_usage() con filas) — nunca un segundo sistema de permisos', () => {
    expect(ADMIN_SRC).toContain('const isAppOwnerView = rows.length > 0')
  })

  it('la sección de Automatizaciones solo se monta con isAppOwnerView — quien llega a /admin-uso escribiéndola a mano sin ser is_app_owner no la ve (list_app_usage() le devuelve 0 filas)', () => {
    const gate = slice(ADMIN_SRC, '{isAppOwnerView && (', '\n    </div>\n  )\n}')
    expect(gate).toContain('<AmazonWebhookSettings />')
  })

  it('mismos webhooks, mismo token, mismos botones — ninguna reimplementación', () => {
    const start = ADMIN_SRC.indexOf('function AmazonWebhookSettings() {')
    expect(start).toBeGreaterThan(-1)
    const fn = ADMIN_SRC.slice(start)
    expect(fn).toContain("`${base}/functions/v1/amazon-order-webhook`")
    expect(fn).toContain("`${base}/functions/v1/mercadona-ticket-webhook`")
    expect(fn).toContain("`${base}/functions/v1/import-event-email-webhook`")
    expect(fn).toContain('getAmazonWebhookToken')
    expect(fn).toContain('regenerateAmazonWebhookToken')
    expect(fn).toContain("'Copiar URL'")
    expect(fn).toContain("label={busy ? 'Regenerando…' : 'Regenerar token'}")
  })
})

describe('MenuSettingsScreen — el enlace se renombra, la señal de acceso no cambia', () => {
  it('el enlace ahora dice "🛠️ Panel de admin" (antes "📊 Panel de uso de la app")', () => {
    expect(MENU_SETTINGS_SRC).toContain('🛠️ Panel de admin')
    expect(MENU_SETTINGS_SRC).not.toContain('📊 Panel de uso de la app')
  })

  it('sigue siendo el mismo mecanismo real: solo visible si list_app_usage() devuelve filas (profiles.is_app_owner) — la ruta sigue siendo /admin-uso', () => {
    const fn = slice(MENU_SETTINGS_SRC, 'function AdminUsageLink() {', '\n\n// Petición real: "que te dé la opción')
    expect(fn).toContain('setVisible(rows.length > 0)')
    expect(fn).toContain('<Link to="/admin-uso"')
  })
})
