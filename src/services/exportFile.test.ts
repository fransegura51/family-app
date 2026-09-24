import { describe, expect, it } from 'vitest'

// downloadTextFile (Blob + URL.createObjectURL + <a download>) es un
// efecto de navegador real — igual que el resto de services/*.ts en
// este proyecto (services/share.ts no tiene test propio tampoco), no
// hay jsdom/happy-dom instalado a propósito (ningún test de este
// proyecto depende del DOM real, para no añadir esa dependencia solo
// para esto). Se comprueba en su lugar, de forma estructural, que usa
// exactamente el mecanismo esperado — sin ninguna librería — y que
// limpia el object URL después de usarlo.
const APP = import.meta.glob('/src/services/exportFile.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/services/exportFile.ts']

describe('downloadTextFile (TEST: Blob + <a download>, sin ninguna librería)', () => {
  it('usa Blob + URL.createObjectURL + <a download>, nunca una librería de exportación', () => {
    expect(SRC).toContain('new Blob(')
    expect(SRC).toContain('URL.createObjectURL(')
    expect(SRC).toContain("a.download = filename")
  })

  it('limpia el object URL después de descargar, para no dejar memoria reservada', () => {
    expect(SRC).toContain('URL.revokeObjectURL(url)')
  })

  it('con withBom, antepone el BOM UTF-8 (0xFEFF) al contenido — para que Excel/Numbers lean bien ñ y tildes', () => {
    expect(SRC).toContain('0xfeff')
    expect(SRC).toContain('withBom ? bom + content : content')
  })
})
