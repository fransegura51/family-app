import { describe, expect, it } from 'vitest'

// INV-EDITOR-7 — validación de fotos del diseñador de invitaciones (event-photos). Mismo patrón de
// comprobación por código fuente que productPhotoMigrationRLS.test.ts usa para uploadProductPhoto — sin
// esa validación cliente, el bucket aceptaba cualquier archivo/tamaño (accept="image/*" del <input> es
// solo una pista de UI, nunca una validación real).
const SRC = (import.meta.glob('/src/data/events.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/events.ts']

function uploadInvitationPhotoBody(): string {
  const start = SRC.indexOf('export async function uploadInvitationPhoto(')
  const end = SRC.indexOf('export async function getInvitationPhotoUrl')
  return SRC.slice(start, end)
}

describe('uploadInvitationPhoto valida antes de tocar storage', () => {
  it('rechaza cualquier archivo que no sea imagen, no confía solo en accept="image/*" del input', () => {
    const body = uploadInvitationPhotoBody()
    expect(body).toContain("if (!file.type.startsWith('image/'))")
    expect(body).toMatch(/throw new Error\(['"]Solo se pueden subir imágenes/)
  })

  it('reutiliza compressImageFile (mismo límite 1600px/calidad que el resto de la app, sin dependencia nueva)', () => {
    expect(SRC).toContain("import { compressImageFile } from '@/domain/imageCompression'")
    const body = uploadInvitationPhotoBody()
    expect(body).toContain('await compressImageFile(file)')
  })

  it('pone un tope razonable de tamaño tras comprimir, con mensaje comprensible', () => {
    const body = uploadInvitationPhotoBody()
    expect(body).toContain('MAX_INVITATION_PHOTO_BYTES')
    expect(body).toMatch(/if \(compressed\.size > MAX_INVITATION_PHOTO_BYTES\)/)
    expect(body).toMatch(/throw new Error\(['"]La foto pesa demasiado/)
  })

  it('la validación ocurre ANTES de llamar a supabase.storage...upload (nunca sube primero y valida después)', () => {
    const body = uploadInvitationPhotoBody()
    const typeCheckIdx = body.indexOf("file.type.startsWith('image/')")
    const sizeCheckIdx = body.indexOf('MAX_INVITATION_PHOTO_BYTES')
    const uploadIdx = body.indexOf('.storage.from(\'event-photos\').upload(')
    expect(typeCheckIdx).toBeGreaterThan(-1)
    expect(uploadIdx).toBeGreaterThan(sizeCheckIdx)
    expect(sizeCheckIdx).toBeGreaterThan(typeCheckIdx)
  })

  it('el límite de tamaño coincide con el mismo tope ya usado para fotos de producto (8 MB) — ningún número nuevo inventado', () => {
    expect(SRC).toMatch(/const MAX_INVITATION_PHOTO_BYTES = 8 \* 1024 \* 1024/)
  })
})
