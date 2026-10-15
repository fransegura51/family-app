// El comprobador de accesibilidad estático tiene que detectar lo malo y no quejarse de lo bueno (si no, las pruebas de pantalla que lo usan no valdrían nada).
import { describe, expect, it } from 'vitest'
import { a11yProblems, parseHtml } from '@/domain/staticA11y'

describe('comprobador de accesibilidad estático: detecta lo malo', () => {
  it('botón y enlace sin nombre', () => {
    expect(a11yProblems('<button class="x"></button>')).toEqual(['<button.x> no tiene nombre (sin texto ni aria-label)'])
    expect(a11yProblems('<a href="/x"><span aria-hidden="true">✕</span></a>')).toHaveLength(1)
    expect(a11yProblems('<button><img src="a.png" alt=""></button>')).toHaveLength(1)
  })

  it('campo sin etiqueta', () => {
    expect(a11yProblems('<input type="text" id="a">')).toEqual(['<input#a> (campo text) sin etiqueta'])
    expect(a11yProblems('<select id="s"><option>1</option></select>')).toHaveLength(1)
    expect(a11yProblems('<textarea></textarea>')).toHaveLength(1)
    expect(a11yProblems('<input type="checkbox">')).toHaveLength(1)
  })

  it('imagen sin alt, ventana sin nombre o sin aria-modal, tabindex positivo', () => {
    expect(a11yProblems('<img src="a.png">')).toHaveLength(1)
    expect(a11yProblems('<div role="dialog" aria-modal="true"></div>')).toEqual(['<div> (ventana) sin nombre'])
    expect(a11yProblems('<div role="dialog" aria-label="X"></div>')).toEqual(['<div> (ventana) sin aria-modal'])
    expect(a11yProblems('<div tabindex="3">x</div>')).toHaveLength(1)
  })

  it('ids repetidos, referencias rotas y radios sin grupo', () => {
    expect(a11yProblems('<p id="a">1</p><p id="a">2</p>')).toEqual(['id repetido «a» (2 veces)'])
    expect(a11yProblems('<div aria-labelledby="nope" role="group">x</div>')).toHaveLength(1)
    expect(a11yProblems('<label for="nada">x</label>')).toHaveLength(1)
    expect(a11yProblems('<div><button role="radio" aria-checked="true">A</button></div>')).toHaveLength(1)
  })
})

describe('comprobador de accesibilidad estático: lo bueno pasa', () => {
  it('nombres por texto, aria-label, aria-labelledby, title e imagen con alt', () => {
    const ok = [
      '<button>Guardar</button>',
      '<button aria-label="Cerrar">✕</button>',
      '<h2 id="t">Hola</h2><button aria-labelledby="t"></button>',
      '<a href="/x"><img src="a.png" alt="Inicio"></a>',
      '<button title="Ayuda"></button>',
      '<span role="button" aria-label="x"></span>',
    ]
    for (const html of ok) expect(a11yProblems(html), html).toEqual([])
  })

  it('campos con label for, envueltos en label, aria-label o aria-labelledby; botones de formulario con valor', () => {
    const ok = [
      '<label for="a">Nombre</label><input id="a" type="text">',
      '<label>Acepto <input type="checkbox"></label>',
      '<input type="search" aria-label="Buscar">',
      '<span id="l">Tema</span><select aria-labelledby="l"><option>x</option></select>',
      '<input type="hidden" name="x"><input type="submit" value="Enviar">',
    ]
    for (const html of ok) expect(a11yProblems(html), html).toEqual([])
  })

  it('ventana completa, radios en grupo con nombre, imagen decorativa y elementos ocultos', () => {
    const ok = [
      '<div role="alertdialog" aria-modal="true" aria-labelledby="t" aria-describedby="d"><h2 id="t">T</h2><p id="d">D</p></div>',
      '<span id="k">Tipo</span><div role="radiogroup" aria-labelledby="k"><button role="radio" aria-checked="true">A</button></div>',
      '<img src="a.png" alt="">',
      '<button hidden></button><div aria-hidden="true"><button></button></div>',
    ]
    for (const html of ok) expect(a11yProblems(html), html).toEqual([])
  })

  it('el analizador entiende atributos con > dentro de comillas y etiquetas sin cierre', () => {
    const root = parseHtml('<p title="a>b">x<br>y</p><input value="1">')
    expect(root.children.map((c) => c.tag)).toEqual(['p', 'input'])
    expect(root.children[0].attrs.title).toBe('a>b')
    expect(root.children[0].children.map((c) => c.tag)).toEqual(['br'])
  })
})
