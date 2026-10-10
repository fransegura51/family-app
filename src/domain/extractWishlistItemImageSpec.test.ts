import { describe, expect, it } from 'vitest'

// Lista de deseos, Parte C del prompt — "al pegar un enlace de producto, recuperar automáticamente su
// fotografía principal". Mismo patrón de pruebas que providerContactDocumentWhatsappSpec.test.ts — raw-
// string sobre el propio archivo del servidor (Deno), para no ejecutar módulos jsr:/npm: en vitest.
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SPEC_SRC = FUNCTIONS['/supabase/functions/extract-wishlist-item-image/index.ts']

describe('extract-wishlist-item-image — seguridad (SSRF)', () => {
  it('exige sesión (Authorization) antes de hacer ninguna petición', () => {
    expect(SPEC_SRC).toContain('if (!authHeader) return json({ error: "unauthorized" }, 401)')
  })
  it('valida la URL del producto y la de la imagen encontrada — solo http(s) a hosts públicos', () => {
    expect(SPEC_SRC).toContain('if (!productUrl || !isPublicHttpUrl(productUrl)) return json({ error: "invalid_url" }, 400)')
    expect(SPEC_SRC).toContain('if (!isPublicHttpUrl(imageUrl)) return null')
  })
  it('bloquea localhost, redes privadas (10/8, 172.16/12, 192.168/16, enlace local) y metadatos de nube (169.254)', () => {
    expect(SPEC_SRC).toContain('host === "localhost"')
    expect(SPEC_SRC).toContain('if (a === 10 || a === 127 || a === 0) return false')
    expect(SPEC_SRC).toContain('if (a === 169 && b === 254) return false')
    expect(SPEC_SRC).toContain('if (a === 172 && b >= 16 && b <= 31) return false')
    expect(SPEC_SRC).toContain('if (a === 192 && b === 168) return false')
  })
  it('nunca sigue redirecciones de la imagen a ciegas (podrían apuntar a algo interno)', () => {
    expect(SPEC_SRC).toContain('redirect: "manual"')
  })
  it('limita el tamaño de la página leída y de la imagen descargada', () => {
    expect(SPEC_SRC).toContain('.slice(0, 3_000_000)')
    expect(SPEC_SRC).toContain('const MAX_IMAGE_BYTES = 8 * 1024 * 1024')
    expect(SPEC_SRC).toContain('buffer.byteLength > MAX_IMAGE_BYTES')
  })
  it('solo acepta tipos de imagen reales (rechaza cualquier content-type que no sea una imagen conocida)', () => {
    expect(SPEC_SRC).toContain('const ext = EXT_BY_TYPE[contentType]')
    expect(SPEC_SRC).toContain('if (!ext) return null')
  })
})

describe('extract-wishlist-item-image — extracción (nunca una imagen aleatoria ni de otro producto)', () => {
  it('prioriza schema.org/Product (JSON-LD) antes que Open Graph', () => {
    expect(SPEC_SRC).toContain('if (!types.includes("Product")) continue')
    expect(SPEC_SRC).toContain('if (!imageUrl) imageUrl = extractMetaImage(html, productUrl)')
  })
  it('el respaldo Open Graph/Twitter Card solo lee las etiquetas explícitas de imagen principal, nunca busca un <img> cualquiera', () => {
    expect(SPEC_SRC).toContain('"og:image", "twitter:image"')
    expect(SPEC_SRC).not.toMatch(/<img[^>]*src/i)
  })
  it('sin ninguna imagen identificable, responde con el error "no_image_found" — nunca inventa una', () => {
    expect(SPEC_SRC).toContain('if (!imageUrl) return json({ error: "no_image_found" }, 404)')
  })
})

describe('extract-wishlist-item-image — nunca bloquea el guardado del deseo', () => {
  it('cualquier fallo de descarga/lectura se traduce en null, nunca en una excepción sin capturar', () => {
    expect(SPEC_SRC).toContain('} catch {\n    return null\n  }')
  })
  it('sube la imagen al bucket privado "wishlist_items" (el mismo que ya usa la subida manual)', () => {
    expect(SPEC_SRC).toContain('admin.storage.from("wishlist_items")')
  })
})
