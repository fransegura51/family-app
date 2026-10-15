// Estructura de las pantallas de creación/edición de publicaciones y de borradores: orden EXACTO de los tres botones, texto EXACTO del diálogo de «cambios sin
// guardar», aviso de caducidad bajo el título, y que cada pieza esté montada. Se pintan los componentes con react-dom/server y se lee el código fuente.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import editorPage from '@/ui/community/PostEditorPage.tsx?raw'
import draftsPage from '@/ui/community/DraftsPage.tsx?raw'
import guardHook from '@/ui/community/useUnsavedChangesGuard.ts?raw'
import photoPicker from '@/ui/community/PhotoPicker.tsx?raw'
import richEditor from '@/ui/community/RichTextEditor.tsx?raw'
import routes from '@/ui/community/CommunityRoutes.tsx?raw'
import navShell from '@/ui/NavShell.tsx?raw'

const { PostEditorActions } = await import('@/ui/community/PostEditorActions')
const { UnsavedChangesDialog } = await import('@/ui/community/UnsavedChangesDialog')
const { DraftExpiryNotice } = await import('@/ui/community/DraftExpiryNotice')
const { RichTextEditor } = await import('@/ui/community/RichTextEditor')
const { ConfirmDiscardDialog } = await import('@/ui/community/ConfirmDiscardDialog')

const noop = () => undefined
const buttonTexts = (html: string) => [...html.matchAll(/<button\b[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())

describe('tres botones apilados, en este orden exacto', () => {
  it('al crear: Descartar, Guardar borrador, Publicar', () => {
    const html = renderToStaticMarkup(createElement(PostEditorActions, { mode: 'create', busy: false, onDiscard: noop, onSaveDraft: noop, onPublish: noop }))
    expect(buttonTexts(html)).toEqual(['Descartar', 'Guardar borrador', 'Publicar'])
  })

  it('al editar: Descartar cambios y Guardar cambios (no hay borrador de una publicación ya publicada)', () => {
    const html = renderToStaticMarkup(createElement(PostEditorActions, { mode: 'edit', busy: false, onDiscard: noop, onSaveDraft: noop, onPublish: noop }))
    expect(buttonTexts(html)).toEqual(['Descartar cambios', 'Guardar cambios'])
  })

  it('mientras algo se guarda o se sube no se puede pulsar ninguno', () => {
    const html = renderToStaticMarkup(createElement(PostEditorActions, { mode: 'create', busy: true, onDiscard: noop, onSaveDraft: noop, onPublish: noop }))
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3)
  })

  it('están apilados (una sola columna) y Publicar es el último', () => {
    const css = renderToStaticMarkup(createElement(PostEditorActions, { mode: 'create', busy: false, onDiscard: noop, onSaveDraft: noop, onPublish: noop }))
    expect(css).toContain('class="ce-actions"')
    expect(css.lastIndexOf('Publicar')).toBeGreaterThan(css.indexOf('Guardar borrador'))
    expect(css.indexOf('Guardar borrador')).toBeGreaterThan(css.indexOf('Descartar'))
  })

  it('la pantalla monta los botones una sola vez y confirma antes de descartar', () => {
    expect((editorPage.match(/<PostEditorActions/g) ?? []).length).toBe(1)
    expect(editorPage).toContain('<ConfirmDiscardDialog')
    expect(editorPage).toContain('onDiscard={() => setConfirmDiscard(true)}')
  })
})

describe('diálogo de cambios sin guardar', () => {
  const html = renderToStaticMarkup(createElement(UnsavedChangesDialog, { onKeep: noop, onSave: noop, onDiscard: noop }))

  it('muestra EXACTAMENTE el mensaje corto', () => {
    expect(html).toContain('Tienes cambios sin guardar. ¿Qué quieres hacer?')
  })

  it('tiene tres acciones, en orden: Seguir editando, Guardar borrador, Descartar cambios', () => {
    expect(buttonTexts(html)).toEqual(['Seguir editando', 'Guardar borrador', 'Descartar cambios'])
  })

  it('es un diálogo accesible (alertdialog, modal, con título)', () => {
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="ce-unsaved-title"')
  })

  it('al editar una publicación ya publicada la segunda acción es «Guardar cambios»', () => {
    const edit = renderToStaticMarkup(createElement(UnsavedChangesDialog, { saveLabel: 'Guardar cambios', onKeep: noop, onSave: noop, onDiscard: noop }))
    expect(buttonTexts(edit)).toEqual(['Seguir editando', 'Guardar cambios', 'Descartar cambios'])
  })

  it('descartar pide confirmación: el diálogo solo la enseña tras pulsar «Descartar cambios»', () => {
    const src = renderToStaticMarkup(createElement(ConfirmDiscardDialog, { title: 'T', message: 'M', confirmLabel: 'Sí', cancelLabel: 'No', onConfirm: noop, onCancel: noop }))
    expect(buttonTexts(src)).toEqual(['No', 'Sí'])
    expect(html).not.toContain('Sí, descartar')
  })

  it('la pantalla lo muestra cuando la guardia lo pide, y «Guardar borrador» guarda de verdad', () => {
    expect(editorPage).toContain('{guard.open && (')
    expect(editorPage).toContain('<UnsavedChangesDialog')
    expect(editorPage).toContain('await saveDraftManually()')
    expect(editorPage).toContain('guard.proceed()')
  })
})

describe('aviso de caducidad', () => {
  it('dice que se conserva 30 días desde el último guardado y que el autoguardado no es permanente', () => {
    const html = renderToStaticMarkup(createElement(DraftExpiryNotice))
    expect(html).toContain('30 días')
    expect(html).toContain('último guardado')
    expect(html).toContain('no es permanente')
  })

  it('va INMEDIATAMENTE debajo del título en «Nueva publicación» y en «Mis borradores»', () => {
    expect(editorPage).toMatch(/<h1>\{isEdit \? 'Editar publicación' : 'Nueva publicación'\}<\/h1>\s*\{\/\*[^*]*\*\/\}\s*\{!isEdit && <DraftExpiryNotice \/>\}/)
    expect(draftsPage).toMatch(/<h1>Mis borradores<\/h1>\s*\{\/\*[^*]*\*\/\}\s*<DraftExpiryNotice \/>/)
  })
})

describe('editor de texto', () => {
  const html = renderToStaticMarkup(createElement(RichTextEditor, { value: 'Hola', onChange: noop, label: 'Tu consejo' }))

  it('tiene negrita, cursiva, lista con viñetas, lista numerada, enlace y vista previa', () => {
    for (const label of ['Negrita', 'Cursiva', 'Lista con viñetas', 'Lista numerada', 'Enlace']) expect(html).toContain(`aria-label="${label}"`)
    expect(html).toContain('Vista previa')
    expect(html).toContain('role="toolbar"')
  })

  it('tiene contador de caracteres y el campo etiquetado', () => {
    expect(html).toContain('caracteres')
    expect(html).toMatch(/<label[^>]*>Tu consejo<\/label>/)
    expect(html).toContain('<textarea')
  })

  it('avisa cuando un enlace sale de PEPA', () => {
    const withLink = renderToStaticMarkup(createElement(RichTextEditor, { value: 'Mira [esto](https://www.ejemplo.com/a)', onChange: noop, label: 'Texto' }))
    expect(withLink).toContain('sale de PEPA')
    expect(withLink).toContain('ejemplo.com')
    expect(html).not.toContain('sale de PEPA')
  })

  it('usa las ayudas puras del dominio y nunca HTML inyectado', () => {
    for (const fn of ['applyBold', 'applyItalic', 'applyBullets', 'applyNumbered', 'applyLink']) expect(richEditor).toContain(fn)
    for (const src of [richEditor, editorPage, draftsPage, photoPicker]) expect(src).not.toContain('dangerouslySetInnerHTML')
    expect(richEditor).toContain('CommunityRichText')
  })
})

describe('pantalla Nueva/Editar publicación', () => {
  it('pide participación antes de publicar y muestra los errores del servidor con communityErrorText', () => {
    expect(editorPage).toContain('requireParticipation')
    expect(editorPage).toContain('communityErrorText')
  })

  it('usa las migas «Nueva publicación» y sirve a las dos rutas', () => {
    expect(editorPage).toContain("pageCrumbs(isEdit ? 'Editar publicación' : 'Nueva publicación')")
    expect(routes).toMatch(/path="nueva" element=\{<PostEditorPage \/>\}/)
    expect(routes).toMatch(/path="editar\/:id" element=\{<PostEditorPage \/>\}/)
    expect(routes).toMatch(/path="borradores" element=\{<DraftsPage \/>\}/)
  })

  it('lee ?tipo, ?seccion, ?titulo y ?borrador, y carga el borrador con todos sus datos', () => {
    for (const q of ['tipo', 'seccion', 'titulo', 'borrador']) expect(editorPage).toContain(`'${q}'`)
    expect(editorPage).toContain('getDraft(draftParam)')
    expect(editorPage).toContain('draftToForm(draft)')
  })

  it('sugiere hasta tres publicaciones parecidas con pausa de 600 ms y sin impedir publicar', () => {
    expect(editorPage).toContain('similarPosts(')
    expect(editorPage).toContain('.slice(0, 3)')
    expect(editorPage).toContain('}, 600)')
    expect(editorPage).toContain('title.length < 4')
    expect(editorPage).toContain('¿Es lo mismo que…?')
    // Las sugerencias no intervienen en la validación ni en el botón Publicar.
    const publishFn = editorPage.slice(editorPage.indexOf('async function publish()'), editorPage.indexOf('// ---- Descartar'))
    expect(publishFn).not.toContain('similar')
  })

  it('para la receta monta RecipeFields con value/onChange y deja el hueco useRecipeSeed', () => {
    expect(editorPage).toMatch(/<RecipeFields value=\{form\.recipe \?\? emptyRecipe\(\)\} onChange=\{\(r\) => update\(\{ recipe: r \}\)\}/)
    expect(editorPage).toContain('useRecipeSeed()')
  })

  it('el autoguardado temporal vive solo en el dispositivo y se ofrece «Recuperar lo que estabas escribiendo»', () => {
    expect(editorPage).toContain('writeBuffer')
    expect(editorPage).toContain('Recuperar lo que estabas escribiendo')
    expect(editorPage).toContain('}, 1500)')
  })
})

describe('fotos', () => {
  it('hasta 5, subiendo con uploadCommunityPhoto, quitando con removeCommunityPhoto y preparando cada foto antes', () => {
    expect(photoPicker).toContain('MAX_POST_PHOTOS')
    expect(photoPicker).toContain('prepareCommunityPhoto(file)')
    expect(photoPicker).toContain('uploadCommunityPhoto(profileId, blob)')
    expect(photoPicker).toContain('removeCommunityPhoto(path)')
    expect(photoPicker).toContain('accept="image/*"')
    expect(photoPicker).toContain('communityErrorText')
    expect(photoPicker).toMatch(/Mover la foto/)
    expect(photoPicker).toMatch(/Quitar la foto/)
  })
})

describe('guardia de cambios sin guardar (BrowserRouter, sin useBlocker)', () => {
  it('cubre cerrar la pestaña, clics en enlaces en fase de captura y el botón atrás', () => {
    expect(guardHook).toContain("'beforeunload'")
    expect(guardHook).toContain("document.addEventListener('click', onClick, true)")
    expect(guardHook).toContain("'popstate'")
    expect(guardHook).toContain('history.pushState')
    expect(guardHook).not.toMatch(/useBlocker\(/)
    expect(editorPage).not.toMatch(/useBlocker\(/)
  })

  it('los botones de la barra de PEPA que intercepta existen de verdad en NavShell', () => {
    expect(guardHook).toContain(".bottom-nav button, .nav-menu-flyout button")
    expect(navShell).toContain('className="bottom-nav bottom-nav-pinned"')
    expect(navShell).toContain('nav-menu-flyout')
    // El botón «Menú» solo abre el desplegable y se distingue por su etiqueta.
    expect(navShell).toContain("aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}")
  })
})

describe('Mis borradores', () => {
  it('lista con listDrafts, abre el editor con el id y descarta con confirmación', () => {
    expect(draftsPage).toContain('listDrafts()')
    expect(draftsPage).toContain('sortDraftsBySavedDesc')
    expect(draftsPage).toContain('paths.newPost({ borrador: d.id })')
    expect(draftsPage).toContain('<ConfirmDiscardDialog')
    expect(draftsPage).toContain('deleteDraft(toDiscard.id)')
  })

  it('cada borrador enseña título, tipo, fecha del guardado y días restantes; hay estado vacío amable', () => {
    expect(draftsPage).toContain('KIND_LABELS[d.kind]')
    expect(draftsPage).toContain('d.title')
    expect(draftsPage).toContain('Guardado el {formatDate(d.savedAt)}')
    expect(draftsPage).toContain('daysLeftText(d.daysLeft)')
    expect(draftsPage).toContain('No tienes ningún borrador guardado.')
  })
})
