// Texto enriquecido de Comunidad: sin HTML, sin enlaces peligrosos, listas, editor.
import { describe, expect, it } from 'vitest'
import { applyBold, applyBullets, applyItalic, applyLink, applyNumbered, countLinks, parseInline, parseRichText, richTextToPlain, safeLink } from '@/domain/communityRichText'

describe('enlaces seguros', () => {
  it('http y https de sitios con nombre; se quita www y se avisa de acortadores', () => {
    expect(safeLink('https://www.ine.es/dyngs/INEbase')).toMatchObject({ host: 'ine.es', shortener: false })
    expect(safeLink('http://ejemplo.com/a?b=1')).toMatchObject({ host: 'ejemplo.com' })
    expect(safeLink('https://bit.ly/abc')).toMatchObject({ shortener: true })
  })
  it('rechaza todo lo demás', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>', 'ftp://x.com', 'file:///etc/passwd', 'https://192.168.0.1/x', 'https://localhost/x', 'https://user:pass@x.com', 'ejemplo.com', '', 'https://[::1]/x']) {
      expect(safeLink(bad), bad).toBeNull()
    }
  })
})

describe('inline', () => {
  it('negrita, cursiva y enlaces', () => {
    const out = parseInline('Hola **mundo** y *tú* mira [la guía](https://consumo.gob.es)')
    expect(out.map((i) => i.t)).toEqual(['text', 'bold', 'text', 'italic', 'text', 'link'])
  })
  it('un enlace peligroso nunca se vuelve enlace: queda como texto', () => {
    const out = parseInline('[haz clic](javascript:alert(1))')
    expect(out).toEqual([{ t: 'text', v: 'haz clic' }])
    expect(JSON.stringify(parseInline('mira http://127.0.0.1/x'))).not.toContain('"t":"link"')
  })
  it('una dirección suelta se convierte en enlace sin la puntuación final', () => {
    const out = parseInline('Visita https://www.ine.es.')
    expect(out[1]).toMatchObject({ t: 'link', host: 'ine.es' })
    expect(out[2]).toEqual({ t: 'text', v: '.' })
  })
  it('el HTML se queda como texto, nunca se interpreta', () => {
    const out = parseInline('<script>alert(1)</script> y <b>negrita</b>')
    expect(out).toEqual([{ t: 'text', v: '<script>alert(1)</script> y <b>negrita</b>' }])
  })
})

describe('bloques', () => {
  it('párrafos, viñetas y numeradas', () => {
    const blocks = parseRichText('Intro\n\n- uno\n- dos\n\n1. primero\n2. segundo\n\nFin')
    expect(blocks.map((b) => b.t)).toEqual(['p', 'ul', 'ol', 'p'])
    expect((blocks[1] as { items: unknown[] }).items).toHaveLength(2)
  })
  it('texto plano para extractos', () => {
    expect(richTextToPlain('**Hola** [guía](https://consumo.gob.es)\n- a\n- b')).toBe('Hola guía a · b')
  })
  it('cuenta enlaces', () => {
    expect(countLinks('a https://x.es b http://y.es')).toBe(2)
  })
})

describe('editor', () => {
  it('negrita y cursiva envuelven la selección o dejan un texto de ejemplo', () => {
    expect(applyBold('hola mundo', 5, 10).text).toBe('hola **mundo**')
    expect(applyItalic('', 0, 0).text).toBe('*texto en cursiva*')
  })
  it('viñetas y numeradas por líneas, sin duplicar el marcador', () => {
    expect(applyBullets('uno\ndos', 0, 7).text).toBe('- uno\n- dos')
    expect(applyNumbered('- uno\n- dos', 0, 11).text).toBe('1. uno\n2. dos')
  })
  it('enlace con el texto seleccionado', () => {
    expect(applyLink('mira la guía', 5, 12, 'https://x.es').text).toBe('mira [la guía](https://x.es)')
  })
})
