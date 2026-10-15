// Guardia de «cambios sin guardar»: decisiones puras (qué clics se frenan, qué pasa tras cada botón) y textos exactos de la especificación.
import { describe, expect, it } from 'vitest'
import { UNSAVED_ACTIONS, UNSAVED_MESSAGE, classifyClick, resolveChoice, shouldBlock } from '@/domain/unsavedChangesGuard'

const here = 'https://pepa.example/family-app/comunidad/nueva?tipo=pregunta'
const anchor = (href: string, over: Record<string, unknown> = {}) => classifyClick({ kind: 'anchor', href, currentUrl: here, button: 0, ...over })

describe('textos exactos', () => {
  it('el mensaje y las tres acciones son los de la especificación', () => {
    expect(UNSAVED_MESSAGE).toBe('Tienes cambios sin guardar. ¿Qué quieres hacer?')
    expect(UNSAVED_ACTIONS).toEqual({ keep: 'Seguir editando', save: 'Guardar borrador', discard: 'Descartar cambios' })
  })
})

describe('shouldBlock', () => {
  it('solo frena si hay cambios y no está en paso libre', () => {
    expect(shouldBlock(true, false)).toBe(true)
    expect(shouldBlock(false, false)).toBe(false)
    expect(shouldBlock(true, true)).toBe(false)
  })
})

describe('classifyClick', () => {
  it('frena los enlaces internos que cambian de página (migas, menú, sugerencias)', () => {
    expect(anchor('/family-app/comunidad/borradores')).toBe('intercept')
    expect(anchor('/family-app/comunidad/s/recetas?tema=postres')).toBe('intercept')
    expect(anchor('https://pepa.example/family-app/')).toBe('intercept')
  })

  it('frena los botones de la barra de navegación de PEPA', () => {
    expect(classifyClick({ kind: 'navbutton', currentUrl: here, button: 0 })).toBe('intercept')
  })

  it('deja pasar lo que no sale de la pantalla', () => {
    expect(anchor('/family-app/comunidad/nueva?tipo=pregunta')).toBe('ignore') // mismo lugar
    expect(anchor('/family-app/comunidad/nueva?tipo=pregunta#abajo')).toBe('ignore') // solo cambia el ancla
    expect(anchor('')).toBe('ignore')
    expect(anchor('mailto:a@b.es')).toBe('ignore')
    expect(anchor('tel:123')).toBe('ignore')
    expect(anchor('javascript:void(0)')).toBe('ignore')
    expect(classifyClick({ kind: 'other', currentUrl: here })).toBe('ignore')
  })

  it('deja pasar los enlaces que abren otra pestaña, descargan o llevan a otro sitio', () => {
    expect(anchor('/family-app/comunidad/borradores', { target: '_blank' })).toBe('ignore')
    expect(anchor('/family-app/comunidad/borradores', { ctrlKey: true })).toBe('ignore')
    expect(anchor('/family-app/comunidad/borradores', { metaKey: true })).toBe('ignore')
    expect(anchor('/family-app/comunidad/borradores', { shiftKey: true })).toBe('ignore')
    expect(anchor('/family-app/comunidad/borradores', { button: 1 })).toBe('ignore')
    expect(anchor('/family-app/comunidad/borradores', { download: true })).toBe('ignore')
    expect(anchor('/family-app/comunidad/borradores', { defaultPrevented: true })).toBe('ignore')
    expect(anchor('https://otro-sitio.com/')).toBe('ignore') // lo cubre el aviso del navegador (beforeunload)
  })

  it('un enlace con target="_self" sí se frena', () => {
    expect(anchor('/family-app/comunidad/borradores', { target: '_self' })).toBe('intercept')
  })
})

describe('resolveChoice', () => {
  it('«Seguir editando» se queda', () => {
    expect(resolveChoice('keep')).toBe('stay')
    expect(resolveChoice('keep', { saveSucceeded: true, discardConfirmed: true })).toBe('stay')
  })

  it('«Guardar borrador» solo sale si se guardó bien', () => {
    expect(resolveChoice('save', { saveSucceeded: true })).toBe('leave')
    expect(resolveChoice('save', { saveSucceeded: false })).toBe('stay')
    expect(resolveChoice('save')).toBe('stay')
  })

  it('«Descartar cambios» pide confirmación antes de salir', () => {
    expect(resolveChoice('discard')).toBe('confirm-discard')
    expect(resolveChoice('discard', { discardConfirmed: false })).toBe('confirm-discard')
    expect(resolveChoice('discard', { discardConfirmed: true })).toBe('leave')
  })
})
