// AYUDA-01: comprobaciones automáticas del catálogo de la Ayuda contra el código real. Si una ficha cita un botón que ya no existe, una ruta rota, una función del inventario
// que no está, o promete una función apagada, falla AQUÍ (no en producción). Sin jsdom: lee el código como texto.
import { describe, expect, it } from 'vitest'
import { FEATURE_INVENTORY } from '@/admin/features/featureInventory'
import { HELP_CARDS, HELP_MODULES, HELP_MODULE_BY_ID, LEGACY_ENTRIES } from '@/help/catalog'
import { HELP_DETAILS, HELP_VIDEOS, SETTINGS_ENTRY } from '@/help/legacy/legacyHelp'
import { KNOWN_APP_ROUTES } from '@/help/routes'
import appSource from '@/App.tsx?raw'

// Código de la interfaz (sin pruebas): para comprobar que los textos de botones que citan las fichas existen de verdad.
const UI_SOURCES = import.meta.glob(['/src/ui/**/*.{ts,tsx}', '/src/domain/*.ts', '/src/pepa/*.ts', '/src/state/*.ts', '/src/help/ui/**/*.{ts,tsx}', '!/src/**/*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const CORPUS = Object.values(UI_SOURCES).join('\n')

describe('catálogo de módulos', () => {
  it('cubre todos los módulos pedidos, sin repetidos, y cada uno tiene al menos una ficha', () => {
    const ids = HELP_MODULES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const needed of ['calendario', 'compras', 'economia', 'cocina', 'eventos', 'comunidad', 'pequenos', 'familia', 'contactos', 'cumpleanos', 'documentos', 'galeria', 'ubicacion', 'configuracion', 'notificaciones', 'cuentas', 'inicio', 'pepa', 'ayuda']) {
      expect(ids, needed).toContain(needed)
      expect(HELP_CARDS.filter((c) => c.module === needed).length, `sin fichas: ${needed}`).toBeGreaterThan(0)
    }
  })
  it('las rutas de «Llévame» de los módulos y de las fichas existen en la app', () => {
    for (const m of HELP_MODULES) expect(KNOWN_APP_ROUTES, m.id).toContain(m.path)
    for (const c of HELP_CARDS) if (c.go) expect(KNOWN_APP_ROUTES, `${c.id} → ${c.go.path}`).toContain(c.go.path)
  })
  it('KNOWN_APP_ROUTES coincide con las rutas de App.tsx (sin pantallas que falten ni sobren)', () => {
    const routes = [...appSource.matchAll(/<Route path="(\/[^"]*)"/g)].map((m) => m[1].replace(/\/\*$/, ''))
    const real = new Set(routes.filter((r) => !['/peso', '/admin-uso', '/administracion'].includes(r)))
    expect([...real].sort()).toEqual([...KNOWN_APP_ROUTES].sort())
  })
})

describe('fichas', () => {
  it('identificadores únicos y módulos válidos', () => {
    const ids = HELP_CARDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of HELP_CARDS) expect(HELP_MODULE_BY_ID.has(c.module), c.id).toBe(true)
  })
  it('cada ficha tiene título, respuesta breve, sinónimos y fecha de comprobación', () => {
    for (const c of HELP_CARDS) {
      expect(c.title.trim().length, c.id).toBeGreaterThan(5)
      expect(c.quick.trim().length, c.id).toBeGreaterThan(30)
      expect(c.synonyms.length, `${c.id}: sin sinónimos`).toBeGreaterThanOrEqual(3)
      expect(c.verified, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
  it('una función parcial o desactivada explica su límite; una desactivada NO ofrece «Llévame» ni «Enséñame»', () => {
    for (const c of HELP_CARDS) {
      if (c.state !== 'disponible') expect((c.limits ?? '').trim().length, `${c.id}: falta explicar el límite`).toBeGreaterThan(15)
      if (c.state === 'desactivada') {
        expect(c.go, `${c.id}: desactivada con «Llévame»`).toBeUndefined()
        expect(c.tour, `${c.id}: desactivada con «Enséñame»`).toBeUndefined()
      }
    }
  })
  it('las fichas se corresponden con el inventario del Centro de Administración: nunca prometen una función que está desactivada', () => {
    const features = new Map(FEATURE_INVENTORY.map((f) => [f.id, f]))
    for (const c of HELP_CARDS) {
      if (!c.featureId) continue
      const f = features.get(c.featureId)
      expect(f, `${c.id}: la función ${c.featureId} no está en el inventario`).toBeTruthy()
      if (f!.state === 'desactivada') expect(c.state, `${c.id} promete una función desactivada`).toBe('desactivada')
    }
  })
  it('toda función desactivada del inventario con ficha tiene la ficha marcada como desactivada', () => {
    for (const f of FEATURE_INVENTORY.filter((x) => x.state === 'desactivada')) {
      const cards = HELP_CARDS.filter((c) => c.featureId === f.id)
      for (const c of cards) expect(c.state, `${c.id} ↔ ${f.id}`).toBe('desactivada')
    }
  })
  it('los vídeos citados existen', () => {
    for (const c of HELP_CARDS) if (c.video) expect(Object.keys(HELP_VIDEOS), c.id).toContain(c.video)
  })
  it('AYUDA-01: cada texto de botón o pantalla que cita una ficha EXISTE en el código (si un botón cambia de nombre, esta prueba falla)', () => {
    const missing: string[] = []
    for (const c of HELP_CARDS) for (const l of c.labels ?? []) if (!CORPUS.includes(l)) missing.push(`${c.id}: «${l}»`)
    expect(missing).toEqual([])
  })
  it('las fichas de uso de Comunidad solo se enseñan a quien puede entrar; las generales, a todo el mundo', () => {
    const community = HELP_CARDS.filter((c) => c.module === 'comunidad')
    expect(community.length).toBeGreaterThanOrEqual(6)
    const general = new Set(['com2-que-es', 'com2-sin-acceso'])
    for (const c of community) {
      if (general.has(c.id)) expect(c.access?.community, c.id).toBeUndefined()
      else expect(c.access?.community, `${c.id}: debe exigir acceso a Comunidad`).toBe(true)
    }
  })
  it('lo que solo puede hacer la administración de la familia lo dice la ficha (regla familyAdmin)', () => {
    for (const id of ['fam-anadir-miembro', 'cfg-nombre-familia', 'eco-modo-cuentas', 'fam-invitado-limitado']) {
      expect(HELP_CARDS.find((c) => c.id === id)?.access?.familyAdmin, id).toBe(true)
    }
  })
  it('dar acceso a PEPA no es solo de la administración: una madre/padre/tutor vinculado también puede (canGiveAccess), así que la ficha es para personas adultas', () => {
    const c = HELP_CARDS.find((x) => x.id === 'fam-codigo-acceso')!
    expect(c.access?.familyAdmin).toBeUndefined()
    expect(c.access?.adultsOnly).toBe(true)
  })
  it('«Invitar amigos» consta como desactivada y sin botones', () => {
    const c = HELP_CARDS.find((x) => x.id === 'cue-invitar-amigos')!
    expect(c.state).toBe('desactivada')
    expect(c.go).toBeUndefined()
  })
})

describe('no se pierde material válido', () => {
  it('toda la explicación ampliada histórica sigue en el catálogo (una entrada por apartado de la Ayuda anterior)', () => {
    const total = Object.values(HELP_DETAILS).reduce((n, items) => n + items.length, 0) + SETTINGS_ENTRY.details.length
    expect(LEGACY_ENTRIES.length).toBe(total)
    expect(total).toBeGreaterThan(150)
  })
  it('cada entrada histórica pertenece a un módulo del catálogo', () => {
    for (const e of LEGACY_ENTRIES) expect(HELP_MODULE_BY_ID.has(e.module), e.id).toBe(true)
  })
  it('los textos corregidos tras la auditoría ya no dicen lo desfasado', () => {
    const all = LEGACY_ENTRIES.map((e) => e.text).join('\n')
    expect(all).not.toContain('(próximamente) lista de deseos')
    expect(all).not.toContain('el resto de bloques llegará más adelante')
    expect(all).not.toContain('se definirán más adelante, cuando exista esa fase')
    expect(all).not.toContain('(abajo del todo en Configuración)')
  })
})
