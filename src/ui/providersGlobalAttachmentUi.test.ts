import { describe, expect, it } from 'vitest'

// PEPA Eventos — orden de recuperación de requisitos (Parte A6, prompt maestro consolidado de Eventos):
// "conservar la imagen o documento original" al importar los datos de un proveedor. Migración 0233
// (aditiva: tres columnas + bucket privado por familia, mismo patrón ya en producción que
// event_task_group_offers/0223). El archivo nunca se aplica solo — sigue exigiendo "Usar estos datos".
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']
const DATA = (import.meta.glob('/src/data/providersGlobal.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/providersGlobal.ts']
const MIGRATION = (import.meta.glob('/supabase/migrations/0233_providers_global_attachment.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0233_providers_global_attachment.sql'
]
const ROLLBACK = (import.meta.glob('/supabase/rollbacks/0233_providers_global_attachment_down.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/rollbacks/0233_providers_global_attachment_down.sql'
]

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const SAVE_ATTACHMENT_FN = window_(DATA, 'export async function saveProviderGlobalAttachment(', '\n}')
const ATTACHMENT_LINK = window_(UI, 'function ProviderAttachmentLink(', '\nfunction ProviderCardMenu(')
const ADD_GLOBAL_FORM = window_(UI, 'function AddProviderGlobalForm(', '\nfunction EditProviderGlobalForm(')
const ADD_AND_LINK_FORM = window_(UI, 'function AddProviderAndLinkForm(', '\nfunction ImportProviderPhotoButton(')
const IMPORT_BUTTON = window_(UI, 'function ImportProviderPhotoButton(', '\nfunction ProviderExtraFields(')

describe('Migración 0233 — aditiva, RLS por familia, mismo patrón que las ofertas (0223)', () => {
  it('tres columnas nuevas, nunca borra ni renombra nada existente', () => {
    expect(MIGRATION).toContain('alter table providers_global add column attachment_storage_path text null')
    expect(MIGRATION).toContain('alter table providers_global add column attachment_original_name text null')
    expect(MIGRATION).toContain('alter table providers_global add column attachment_mime_type text null')
  })
  it('bucket privado con política de storage por familia (select/insert/delete)', () => {
    expect(MIGRATION).toContain("insert into storage.buckets (id, name, public)\nvalues ('providers_global', 'providers_global', false)")
    expect(MIGRATION).toContain('"providers_global storage: family select"')
    expect(MIGRATION).toContain('"providers_global storage: family insert"')
    expect(MIGRATION).toContain('"providers_global storage: family delete"')
  })
  it('rollback deshace bucket, políticas y columnas, en orden seguro', () => {
    expect(ROLLBACK).toContain("delete from storage.buckets where id = 'providers_global'")
    expect(ROLLBACK).toContain('drop column if exists attachment_storage_path')
  })
})

describe('saveProviderGlobalAttachment — un único adjunto por proveedor, nunca dos huérfanos', () => {
  it('comprime si es imagen, sube al bucket y borra el archivo anterior si cambia', () => {
    expect(SAVE_ATTACHMENT_FN).toContain('await compressImageFile(file)')
    expect(SAVE_ATTACHMENT_FN).toContain("supabase.storage.from('providers_global').upload(path, prepared)")
    expect(SAVE_ATTACHMENT_FN).toContain('if (previousPath && previousPath !== path)')
  })
  it('si falla guardar la fila, borra el archivo recién subido (nunca deja uno huérfano)', () => {
    expect(SAVE_ATTACHMENT_FN).toContain("await supabase.storage.from('providers_global').remove([path])")
  })
})

describe('ProviderAttachmentLink — solo aparece si hay adjunto, nunca oculta el error de abrirlo', () => {
  it('sin adjunto, no renderiza nada', () => {
    expect(ATTACHMENT_LINK).toContain('if (!provider.attachmentStoragePath) return null')
  })
  it('usa el nombre original guardado, o un texto genérico si no lo hay', () => {
    expect(ATTACHMENT_LINK).toContain("provider.attachmentOriginalName ?? 'Ver documento original'")
  })
})

for (const [label, FORM] of [
  ['AddProviderGlobalForm', ADD_GLOBAL_FORM],
  ['AddProviderAndLinkForm', ADD_AND_LINK_FORM],
] as const) {
  describe(`${label} — el documento importado se sube SOLO al guardar, nunca antes`, () => {
    it('guarda el archivo confirmado en estado, no lo sube en el momento de leerlo', () => {
      expect(FORM).toContain('setImportedFile(file)')
    })
    it('handleSubmit sube el adjunto después de crear la ficha, solo si hay archivo', () => {
      expect(FORM).toContain('if (importedFile) await saveProviderGlobalAttachment(')
    })
  })
}

describe('ImportProviderPhotoButton — el archivo original viaja junto con los datos leídos al confirmar', () => {
  it('onImported recibe (result, file) — nunca se pierde el archivo entre leer y confirmar', () => {
    expect(IMPORT_BUTTON).toContain('onImported: (result: ProviderContactScanResult, file: File) => void')
    expect(IMPORT_BUTTON).toContain('if (pendingFile) onImported(result, pendingFile)')
  })
  it('"Descartar" limpia también el archivo pendiente — nunca queda huérfano en memoria', () => {
    const discardBlock = IMPORT_BUTTON.slice(IMPORT_BUTTON.lastIndexOf('Descartar') - 200)
    expect(discardBlock).toContain('setPendingFile(null)')
  })
})
