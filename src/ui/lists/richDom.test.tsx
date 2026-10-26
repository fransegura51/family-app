// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseRich, serializeRich } from '@/domain/lists'
import { getSelectionOffsets, readSpans, renderSpans, setSelectionOffsets } from '@/ui/lists/richDom'

describe('Mis listas — editor con formato: ida y vuelta con el DOM', () => {
  it('pinta y vuelve a leer el mismo marcado', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const markup = 'Comprar <b>mochila</b> <c:rojo>azul</c> y <b><c:verde>lápices</c></b> &lt;ok&gt;'
    renderSpans(root, parseRich(markup))
    expect(root.textContent).toBe('Comprar mochila azul y lápices <ok>')
    expect(serializeRich(readSpans(root))).toBe(markup)
  })
  it('nunca crea elementos que no sean b / span con color: el texto con etiquetas se queda como texto', () => {
    const root = document.createElement('div')
    renderSpans(root, parseRich('<b>x</b> &lt;script&gt;alert(1)&lt;/script&gt;'))
    expect(root.querySelector('script')).toBeNull()
    expect([...root.querySelectorAll('*')].map((e) => e.tagName)).toEqual(['B'])
  })
  it('lo que el navegador inserte al teclear (strong, div, br, colores ajenos) se normaliza', () => {
    const root = document.createElement('div')
    root.innerHTML = '<strong>hola</strong><br>mundo<div style="color:red">uno</div><span data-c="fucsia">dos</span><img src=x>'
    const spans = readSpans(root)
    expect(serializeRich(spans)).toBe('<b>hola</b> mundouno' + 'dos')
  })
  it('la selección se convierte a posiciones del texto plano y vuelve', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    renderSpans(root, parseRich('abc <b>def</b> ghi'))
    setSelectionOffsets(root, 2, 8)
    expect(getSelectionOffsets(root)).toEqual({ from: 2, to: 8 })
  })
})
