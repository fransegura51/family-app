// Las personas menores de edad participan SIN fotos: el campo de comentario, el editor de publicaciones y «Compartir receta» ocultan el selector de fotos cuando el acceso
// dice `photosAllowed = false`, y explican por qué con una frase breve. Render estático (sin navegador ni red) + lectura del código fuente.
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import composerSrc from '@/ui/community/CommentComposer.tsx?raw'
import editorSrc from '@/ui/community/PostEditorPage.tsx?raw'
import sheetSrc from '@/ui/community/recipes/RecipePublishSheet.tsx?raw'
import hookSrc from '@/ui/community/useCommunityPhotosAllowed.ts?raw'

const photos = vi.hoisted(() => ({ allowed: null as boolean | null }))

vi.mock('@/data/community', () => ({
  addComment: vi.fn(),
  getMyCommunityProfile: vi.fn(),
  uploadCommunityPhoto: vi.fn(),
  removeCommunityPhoto: vi.fn(),
}))
vi.mock('@/data/communityMinors', () => ({ getCommunityAccess: vi.fn() }))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/services/communityPhoto', () => ({ prepareCommunityPhoto: vi.fn() }))
vi.mock('@/ui/community/CommunityProvider', () => ({
  useCommunity: () => ({ status: null, me: { hasProfile: true, id: 'yo' }, loading: false, refresh: async () => undefined, requireParticipation: async () => true }),
}))
// El resultado de la consulta se simula: lo que se prueba aquí es lo que la pantalla enseña según `photosAllowed`.
vi.mock('@/ui/community/useCommunityPhotosAllowed', () => ({
  useCommunityPhotosAllowed: () => ({ photosAllowed: photos.allowed, forbid: () => undefined }),
}))

import { CommentComposer } from '@/ui/community/CommentComposer'

const reply = { id: 'c1', rootId: 'c1', alias: 'Cocinillas' }
function composer(allowed: boolean | null) {
  photos.allowed = allowed
  return renderToStaticMarkup(
    <MemoryRouter>
      <CommentComposer postId="p1" replyTarget={reply} onCancelReply={() => undefined} onPosted={() => undefined} />
    </MemoryRouter>,
  )
}

describe('campo de comentario', () => {
  it('persona adulta: botón de foto y límite de una foto', () => {
    const html = composer(true)
    expect(html).toContain('Añadir una foto al comentario')
    expect(html).toContain('accept="image/*"')
    expect(html).toContain('📷 Añadir foto')
    expect(html).not.toContain('participan sin fotos')
  })

  it('mientras no se sabe (cargando o sin red) se enseña: el servidor decide', () => {
    expect(composer(null)).toContain('Añadir una foto al comentario')
  })

  it('persona menor de edad: sin selector de foto, con la frase breve', () => {
    const html = composer(false)
    expect(html).not.toContain('Añadir una foto al comentario')
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain('📷')
    expect(html).toContain('Las personas menores de edad participan sin fotos.')
    // Pero puede escribir y publicar el texto con normalidad.
    expect(html).toContain('Publicar')
    expect(html).toContain('Responde a Cocinillas')
  })
})

describe('editor de publicaciones y «Compartir receta»', () => {
  it('el editor oculta el selector solo con un «no» claro y deja ver la frase breve', () => {
    expect(editorSrc).toContain('useCommunityPhotosAllowed()')
    expect(editorSrc).toContain('photosAllowed === false ? (')
    expect(editorSrc).toContain('{MINORS_NO_PHOTOS_NOTE}')
    expect(editorSrc.indexOf('photosAllowed === false')).toBeLessThan(editorSrc.indexOf('<PhotoPicker'))
  })

  it('la hoja de compartir receta no ofrece la portada ni la sube cuando no se puede', () => {
    expect(sheetSrc).toContain('useCommunityPhotosAllowed(!!recipe.imagePath)')
    expect(sheetSrc).toContain('const withPhoto = includePhoto && photosAllowed !== false')
    expect(sheetSrc).toContain('recipe.imagePath && photosAllowed === false')
    expect(sheetSrc).toContain('recipe.imagePath && photosAllowed !== false')
    expect(sheetSrc).toContain('withPhoto && recipe.imagePath')
  })

  it('si el servidor responde PHOTOS_NOT_ALLOWED: mensaje amable, fotos fuera y selector oculto (comentario, editor y receta)', () => {
    for (const src of [composerSrc, editorSrc, sheetSrc]) {
      expect(src).toContain('communityErrorCode(e)')
      expect(src).toContain("'PHOTOS_NOT_ALLOWED'")
    }
    expect(composerSrc).toContain('dropPhoto()')
    expect(editorSrc).toContain('update({ photos: [] })')
    expect(sheetSrc).toContain('setIncludePhoto(false)')
    expect(composerSrc).toContain('forbid()')
    expect(editorSrc).toContain('forbidPhotosForMe()')
    expect(sheetSrc).toContain('forbidPhotosForMe()')
  })

  it('el editor usa failureText al guardar el borrador y al publicar (no el texto genérico)', () => {
    expect((editorSrc.match(/setSubmitError\(failureText\(e\)\)/g) ?? []).length).toBe(2)
  })
})

describe('coste: una consulta por persona y sesión, solo cuando hay un selector que enseñar', () => {
  it('el campo de comentario pregunta solo cuando está desplegado y la hoja de receta solo si la receta tiene foto', () => {
    expect(composerSrc).toContain('useCommunityPhotosAllowed(expanded)')
    expect(sheetSrc).toContain('useCommunityPhotosAllowed(!!recipe.imagePath)')
  })

  it('el hook no hace consultas periódicas y usa la memoria compartida', () => {
    expect(hookSrc).not.toMatch(/setInterval|setTimeout/)
    expect(hookSrc).toContain('loadPhotosAllowed(key, getCommunityAccess)')
    expect(hookSrc).toContain('if (enabled)')
  })
})
