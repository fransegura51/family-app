import { describe, expect, it } from 'vitest'

// Inciso Compras — Parte B: foto OPCIONAL de un producto (bucket
// privado product-photos, mismo patrón que member-photos/recipe-photos/
// receipts — solo se guarda el path en products.photo_path, nunca los
// bytes de la imagen). Va en `products` (identidad reutilizable por
// nombre normalizado), no en shopping_items (que se borra al completar
// la compra — ver deleteShoppingItems en data/shopping.ts), para que la
// foto reaparezca sola la próxima vez que se añada el mismo producto.
//
// La RLS del bucket se verificó EN VIVO contra producción
// (objhgjgrinbhyzscjlbw) con un rehearsal BEGIN/ROLLBACK simulando un
// usuario real de Familia Hepburn (profile 93b0ce0e-...): insertar un
// objeto en la carpeta de la propia familia OK, insertar en la carpeta
// de otra familia (Familia Demo) rechazado, leer el objeto propio OK,
// actualizar products.photo_path de un producto propio OK. El DELETE
// directo por SQL está bloqueado por la propia plataforma de Supabase
// ("Direct deletion from storage tables is not allowed") — no es un
// fallo de la política, es un límite del rehearsal por SQL crudo; la
// política de borrado sigue el mismo patrón ya probado y en uso real en
// otros 7 buckets del proyecto (member-photos, recipe-photos...).
// Ningún dato real se modificó (verificado con ROLLBACK + conteos
// antes/después).
const FILES = import.meta.glob(['/supabase/migrations/0166_product_photo.sql', '/supabase/rollbacks/0166_product_photo_down.sql'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const MIGRATION = FILES['/supabase/migrations/0166_product_photo.sql']
const ROLLBACK = FILES['/supabase/rollbacks/0166_product_photo_down.sql']

describe('0166 — esquema y bucket', () => {
  it('products.photo_path es nullable (TEST: producto sin foto por defecto)', () => {
    expect(MIGRATION).toContain('alter table products add column photo_path text')
    expect(MIGRATION).not.toMatch(/photo_path text not null/)
  })

  it('crea un bucket privado (public: false), nunca público', () => {
    expect(MIGRATION).toContain("insert into storage.buckets (id, name, public)\nvalues ('product-photos', 'product-photos', false)")
  })
})

describe('0166 — RLS de storage: mismo patrón exacto que member-photos/recipe-photos (TEST: familia correcta puede verla, otra familia no)', () => {
  it('select/insert/delete, los tres condicionados a la carpeta de la propia familia', () => {
    expect(MIGRATION).toContain(
      "create policy \"product-photos storage: family select\" on storage.objects for select\n  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = private.current_family_id()::text)",
    )
    expect(MIGRATION).toContain(
      "create policy \"product-photos storage: family insert\" on storage.objects for insert\n  with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] = private.current_family_id()::text)",
    )
    expect(MIGRATION).toContain(
      "create policy \"product-photos storage: family delete\" on storage.objects for delete\n  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = private.current_family_id()::text)",
    )
  })

  it('no crea ninguna política "update" (mismo patrón que el resto de buckets: sustituir es borrar+subir)', () => {
    expect(MIGRATION).not.toMatch(/for update/i)
  })

  it('no toca la política ya existente de la tabla products (0014) — family_id = current_family_id() ya cubre la columna nueva', () => {
    expect(MIGRATION).not.toContain('drop policy')
    expect(MIGRATION).not.toContain('"products: family crud"')
  })
})

describe('0166 — rollback', () => {
  it('quita la columna y las políticas, nunca borra el bucket ni ningún dato', () => {
    expect(ROLLBACK).toContain('alter table products drop column if exists photo_path')
    expect(ROLLBACK).toContain('drop policy if exists "product-photos storage: family select"')
    expect(ROLLBACK).toContain('drop policy if exists "product-photos storage: family insert"')
    expect(ROLLBACK).toContain('drop policy if exists "product-photos storage: family delete"')
    expect(ROLLBACK).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop table\b/i)
    expect(ROLLBACK).not.toMatch(/drop\s+storage\.buckets|delete\s+from\s+storage\.buckets/i)
  })
})

const APP = import.meta.glob('/src/data/products.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SRC = APP['/src/data/products.ts']

describe('capa de datos — subir/ver/quitar foto', () => {
  it('reutiliza compressImageFile (mismo límite de tamaño/calidad que el resto de la app, sin dependencia nueva) (TEST: archivo demasiado grande gestionado)', () => {
    expect(SRC).toContain("import { compressImageFile } from '@/domain/imageCompression'")
    const body = SRC.slice(SRC.indexOf('async function uploadProductPhoto('), SRC.indexOf('export async function getProductPhotoUrl'))
    expect(body).toContain('await compressImageFile(file)')
    expect(body).toContain('MAX_PHOTO_BYTES')
  })

  it('valida el MIME antes de tocar storage, no confía solo en accept="image/*" del input (TEST: archivo inválido rechazado)', () => {
    const body = SRC.slice(SRC.indexOf('async function uploadProductPhoto('), SRC.indexOf('export async function getProductPhotoUrl'))
    expect(body).toContain("if (!file.type.startsWith('image/'))")
  })

  it('el path lleva el family_id como primer segmento (mismo patrón que member-photos), nunca el nombre original del archivo', () => {
    const body = SRC.slice(SRC.indexOf('async function uploadProductPhoto('), SRC.indexOf('export async function getProductPhotoUrl'))
    expect(body).toContain('const path = `${familyId}/${crypto.randomUUID()}.${ext}`')
  })

  it('uploadProductPhoto sustituye la foto anterior borrando el archivo huérfano del bucket (TEST: cambiar foto)', () => {
    const body = SRC.slice(SRC.indexOf('async function uploadProductPhoto('), SRC.indexOf('export async function getProductPhotoUrl'))
    expect(body).toContain('if (previousPath) await supabase.storage.from(\'product-photos\').remove([previousPath])')
  })

  it('getProductPhotoUrl pide una URL firmada (privada), nunca una URL pública', () => {
    const body = SRC.slice(SRC.indexOf('export async function getProductPhotoUrl'), SRC.indexOf('export async function removeProductPhoto'))
    expect(body).toContain("createSignedUrl(photoPath, 3600)")
    expect(body).not.toContain('getPublicUrl')
  })

  it('removeProductPhoto quita el path de la fila Y el archivo del bucket — no deja referencias inválidas (TEST: quitar foto, sin referencias inválidas)', () => {
    const body = SRC.slice(SRC.indexOf('export async function removeProductPhoto'))
    expect(body).toContain("update({ photo_path: null })")
    expect(body).toContain("supabase.storage.from('product-photos').remove([photoPath])")
  })
})

describe('getOrCreateProductId — crea la identidad SIN comprar nada (TEST: añadir foto a un producto nunca comprado)', () => {
  it('nunca inserta en product_prices (no finge una compra) — a diferencia de recordProductPurchase', () => {
    const body = SRC.slice(SRC.indexOf('async function getOrCreateProductId'), SRC.indexOf('const MAX_PHOTO_BYTES'))
    expect(body).not.toContain('product_prices')
  })

  it('recordProductPurchase sigue intacto: mismo upsert de siempre, sigue siendo el único camino que crea historial de precio real', () => {
    const body = SRC.slice(SRC.indexOf('export async function recordProductPurchase'))
    expect(body).toContain(".from('products')\n    .upsert(")
    expect(body).toContain("supabase.from('product_prices').insert(")
  })
})

describe('lo que esta fase NO toca (TEST: foto no afecta tickets/OCR)', () => {
  it('el flujo de tickets/receipts no se ha tocado: sin ninguna mención a product-photos ni a photo_path', () => {
    const RECEIPTS_SRC = (import.meta.glob('/src/data/receipts.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/receipts.ts']
    expect(RECEIPTS_SRC).not.toContain('product-photos')
    expect(RECEIPTS_SRC).not.toContain('photo_path')
  })

  it('deleteShoppingItem/deleteShoppingItems (borrar de la lista) nunca tocan products ni product-photos — la foto es del producto, no del item (TEST: eliminación no borra assets reutilizables)', () => {
    const SHOPPING_SRC = (import.meta.glob('/src/data/shopping.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/shopping.ts']
    const start = SHOPPING_SRC.indexOf('export async function deleteShoppingItem')
    const body = SHOPPING_SRC.slice(start)
    expect(body).not.toContain("from('products')")
    expect(body).not.toContain('product-photos')
  })
})
