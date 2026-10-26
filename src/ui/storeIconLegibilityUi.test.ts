import { readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Logotipos de tiendas (27/10/2026): el icono nunca se ve como un recuadro vacío. La insignia de texto se pinta mientras la imagen no ha cargado y la sustituye si falla;
// el logo va sobre un respaldo blanco con margen fijo (un logo mayormente blanco sería ilegible); y los archivos empaquetados existen y no están vacíos.
const SRC = (import.meta.glob('/src/ui/StoreIcon.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/StoreIcon.tsx']
const ICONS = (import.meta.glob('/src/domain/storeIcons.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/domain/storeIcons.ts']

describe('StoreIcon — nunca un cuadro vacío', () => {
  it('la imagen empaquetada y el favicon en vivo pasan por LogoImage (insignia mientras carga y si falla)', () => {
    expect(SRC).toContain("if (icon.kind === 'image') return <LogoImage")
    expect(SRC).toContain("if (icon.kind === 'logo') return <LogoImage")
    expect(SRC).toContain("setState('error')")
    expect(SRC).toContain("if (state === 'error') return <StoreBadge")
    expect(SRC).toContain("state === 'loading' &&")
  })
  it('el icono por defecto (🏬) se pinta como insignia de texto, no como emoji genérico', () => {
    expect(SRC).toContain('if (icon.icon === DEFAULT_STORE_EMOJI) return <StoreBadge')
  })
  it('respaldo blanco con margen fijo y el logo en sí conserva su tamaño', () => {
    expect(SRC).toContain('const boxSize = size + LOGO_BACKDROP_PADDING * 2')
    expect(SRC).toContain('<Box size={size} background="#fff">')
    expect([...SRC.matchAll(/width=\{size\}\s*\n\s*height=\{size\}/g)]).toHaveLength(1)
  })
})

describe('logotipos empaquetados: persisten tras compilar y desplegar', () => {
  const dir = resolve(process.cwd(), 'src/assets/store-logos')
  const files = readdirSync(dir).filter((f) => f.endsWith('.png'))
  it('cada import de storeIcons.ts apunta a un archivo que existe y no está vacío', () => {
    const imports = [...ICONS.matchAll(/from '@\/assets\/store-logos\/([a-z]+\.png)'/g)].map((m) => m[1])
    expect(imports.length).toBeGreaterThanOrEqual(15)
    for (const f of imports) {
      expect(files, f).toContain(f)
      expect(statSync(resolve(dir, f)).size, f).toBeGreaterThan(300)
    }
  })
  it('no hay archivos sueltos sin usar (un logo en la carpeta que nadie importa se perdería sin que nadie lo note)', () => {
    for (const f of files) expect(ICONS, f).toContain(`store-logos/${f}`)
  })
})
