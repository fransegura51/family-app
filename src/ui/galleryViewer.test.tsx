// @vitest-environment jsdom
// Galería (24/10/2026): foto en grande con anterior/siguiente y descripción editable.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const update = vi.fn(async () => undefined)
vi.mock('@/data/gallery', () => ({
  listGalleryPhotos: async () => [
    { id: 'a', familyId: 'f', storagePath: 'f/a.jpg', caption: 'Playa', createdAt: '2026-10-01T10:00:00Z' },
    { id: 'b', familyId: 'f', storagePath: 'f/b.jpg', caption: null, createdAt: '2026-10-02T10:00:00Z' },
  ],
  getGalleryPhotoUrl: async (p: string) => 'https://x/' + p,
  uploadGalleryPhoto: async () => undefined,
  deleteGalleryPhoto: async () => undefined,
  updateGalleryCaption: (...a: unknown[]) => update(...(a as [])),
}))
vi.mock('@/services/share', () => ({ fetchAsShareableFile: async () => new File([], 'x'), shareFiles: async () => true }))
vi.mock('@/state/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }))
vi.mock('@/ui/SectionBreadcrumb', () => ({ SectionBreadcrumb: () => null }))

import { GalleryScreen } from '@/ui/GalleryScreen'

afterEach(cleanup)

describe('Galería: foto en grande', () => {
  it('abre la foto, deja pasar a la siguiente y guardar una descripción nueva', async () => {
    render(<GalleryScreen />)
    const open = await screen.findAllByRole('button', { name: 'Ver foto grande' })
    fireEvent.click(open[0])
    expect(screen.getByText('Foto 1 de 2')).toBeTruthy()
    expect((screen.getByPlaceholderText('Escribe una descripción') as HTMLInputElement).value).toBe('Playa')
    fireEvent.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(screen.getByText('Foto 2 de 2')).toBeTruthy()
    const input = screen.getByPlaceholderText('Escribe una descripción') as HTMLInputElement
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: 'Cumple de Eric' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar descripción' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('b', 'Cumple de Eric'))
  })
})
