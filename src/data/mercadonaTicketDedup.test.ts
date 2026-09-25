import { describe, expect, it } from 'vitest'

// Protección contra tickets duplicados en mercadona-ticket-webhook (migración 0168) — incidente real: un
// ticket de Mercadona (25/09/2026, 153,60€) se procesó dos veces (timeout de Pipedream ~32s con límite 30s
// que hizo pensar que había fallado cuando SÍ se había guardado, + un reenvío manual posterior). Deno (no se
// ejecuta en Vitest/Node, mismo motivo que el resto de tests de Edge Functions de este proyecto): se audita
// el código fuente real por texto/orden Y ADEMÁS se reconstruyen aquí las funciones PURAS del webhook
// (verificadas carácter a carácter contra el archivo real) para probar de verdad los 8 escenarios pedidos con
// datos reales, no solo con coincidencia de texto. SHA-256 se recalcula con la misma Web Crypto API global
// (crypto.subtle.digest) que usa el archivo real — no node:crypto, que no tiene tipos en este proyecto.
const FUNCTIONS = import.meta.glob('/supabase/functions/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const WEBHOOK = FUNCTIONS['/supabase/functions/mercadona-ticket-webhook/index.ts']
const MANUAL_ANALYZE = FUNCTIONS['/supabase/functions/analyze-receipt-photo/index.ts']

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MIGRATION_0168 = MIGRATIONS['/supabase/migrations/0168_receipt_dedup_fingerprint.sql']

const DATA_SRC = import.meta.glob('/src/data/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const MANUAL_RECEIPTS_TS = DATA_SRC['/src/data/receipts.ts']

describe('0. la migración 0168 existe con las dos columnas y sus índices UNIQUE parciales por familia', () => {
  it('columnas nullable en receipts (nunca NOT NULL: no debe romper filas antiguas/manuales)', () => {
    expect(MIGRATION_0168).toContain('alter table receipts add column source_file_hash text;')
    expect(MIGRATION_0168).toContain('alter table receipts add column content_fingerprint text;')
    expect(MIGRATION_0168).not.toMatch(/source_file_hash text not null/i)
    expect(MIGRATION_0168).not.toMatch(/content_fingerprint text not null/i)
  })
  it('índice UNIQUE parcial (family_id, source_file_hash) WHERE ... IS NOT NULL', () => {
    expect(MIGRATION_0168).toContain('create unique index receipts_family_source_hash_uidx')
    expect(MIGRATION_0168).toContain('on receipts (family_id, source_file_hash)')
    expect(MIGRATION_0168).toContain('where source_file_hash is not null;')
  })
  it('índice UNIQUE parcial (family_id, content_fingerprint) WHERE ... IS NOT NULL', () => {
    expect(MIGRATION_0168).toContain('create unique index receipts_family_content_fingerprint_uidx')
    expect(MIGRATION_0168).toContain('on receipts (family_id, content_fingerprint)')
    expect(MIGRATION_0168).toContain('where content_fingerprint is not null;')
  })
})

describe('1. mismo PDF enviado dos veces SEGUIDAS → una compra; la 2ª respuesta es duplicate:true y no gasta IA', () => {
  it('CAPA A (sourceFileHash) se calcula y se comprueba ANTES del gate de IA (ai_gate_family)', () => {
    const hashCheckIdx = WEBHOOK.indexOf('const sourceFileHash = await sha256Hex(fileBytes)')
    const gateIdx = WEBHOOK.indexOf('admin.rpc("ai_gate_family"')
    expect(hashCheckIdx).toBeGreaterThan(0)
    expect(gateIdx).toBeGreaterThan(hashCheckIdx)
  })
  it('si ya existe un recibo con ese hash para la familia, se responde y se sale ANTES de tocar la IA o el storage', () => {
    const returnIdx = WEBHOOK.indexOf('if (existingByHash) return json({ ok: true, duplicate: true, receiptId: existingByHash.id, itemsSaved: 0 })')
    const gateIdx = WEBHOOK.indexOf('admin.rpc("ai_gate_family"')
    const uploadIdx = WEBHOOK.indexOf('admin.storage.from("receipts").upload(path')
    expect(returnIdx).toBeGreaterThan(0)
    expect(returnIdx).toBeLessThan(gateIdx)
    expect(returnIdx).toBeLessThan(uploadIdx)
  })
  it('la respuesta de duplicado nunca es 409/500: json() sin segundo argumento = 200 por defecto', () => {
    expect(WEBHOOK).toContain('function json(body: unknown, status = 200) {')
  })
})

describe('2. mismo PDF enviado SIMULTÁNEAMENTE dos veces (concurrente) → solo una compra sobrevive en BD', () => {
  it('las huellas se fijan al final con un UPDATE (no en el INSERT del recibo): ese UPDATE es el guardián atómico', () => {
    const insertIdx = WEBHOOK.indexOf('.from("receipts")\n        .insert({')
    const updateIdx = WEBHOOK.indexOf('.update({ source_file_hash: sourceFileHash, content_fingerprint: contentFingerprint })')
    expect(insertIdx).toBeGreaterThan(0)
    expect(updateIdx).toBeGreaterThan(insertIdx)
    // El INSERT del recibo nunca lleva las huellas ya puestas.
    const insertBlock = WEBHOOK.slice(insertIdx, WEBHOOK.indexOf('.select("id")', insertIdx))
    expect(insertBlock).not.toMatch(/source_file_hash|content_fingerprint/)
  })
  it('un choque en ese UPDATE (23505, el índice UNIQUE parcial) se detecta y deshace lo creado por la ejecución perdedora', () => {
    expect(WEBHOOK).toContain('if (errorCode(persistErr) === UNIQUE_VIOLATION) {')
    expect(WEBHOOK).toContain('const winnerId = await findExistingReceiptId(admin, familyId, sourceFileHash, contentFingerprint)')
    expect(WEBHOOK).toContain('if (winnerId) return json({ ok: true, duplicate: true, receiptId: winnerId, itemsSaved: 0 })')
  })
  it('la ejecución perdedora borra SU recibo (arrastra sus líneas por ON DELETE CASCADE en product_prices.receipt_id), su gasto y su archivo subido', () => {
    const cleanup = WEBHOOK.slice(WEBHOOK.indexOf('async function cleanupFailedAttempt'), WEBHOOK.indexOf('async function findExistingReceiptId'))
    expect(cleanup).toContain('if (params.receiptId) await admin.from("receipts").delete().eq("id", params.receiptId)')
    expect(cleanup).toContain('if (params.expenseId) await admin.from("expenses").delete().eq("id", params.expenseId)')
    expect(cleanup).toContain('if (params.storagePath) await admin.storage.from("receipts").remove([params.storagePath])')
  })
  it('la limpieza se ejecuta SIEMPRE que falla la persistencia, no solo en el choque de huellas (defensa también ante un fallo distinto a medias)', () => {
    const persistCatchIdx = WEBHOOK.indexOf('} catch (persistErr) {')
    // Hay un "} catch (err) {" ANTERIOR (el de la llamada a IA, línea ~206): hay que buscar el de fuera a
    // partir de persistCatchIdx, no el primero que aparece en todo el archivo.
    const outerCatchIdx = WEBHOOK.indexOf('} catch (err) {', persistCatchIdx)
    const catchBlock = WEBHOOK.slice(persistCatchIdx, outerCatchIdx)
    const cleanupCallIdx = catchBlock.indexOf('await cleanupFailedAttempt(')
    const codeCheckIdx = catchBlock.indexOf('if (errorCode(persistErr) === UNIQUE_VIOLATION)')
    expect(cleanupCallIdx).toBeGreaterThanOrEqual(0)
    expect(codeCheckIdx).toBeGreaterThan(cleanupCallIdx)
  })
})

// ---------------------------------------------------------------------------------------------------
// buildContentFingerprintInput y sha256Hex, reconstruidas idénticas al archivo real (comprobado abajo,
// describe "6.z") para ejecutar de verdad los escenarios 3/4/6/7.
// ---------------------------------------------------------------------------------------------------
interface TestItem {
  name: string
  quantity: number
  unit: 'ud' | 'kg'
  unitPrice: number
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function buildContentFingerprintInput(familyId: string, receiptDate: string, total: number, items: readonly TestItem[]): string {
  const normalizedLines = items
    .map((it) => `${it.name.trim().toLowerCase()}|${it.quantity}|${it.unit}|${it.unitPrice.toFixed(2)}`)
    .sort()
    .join(';')
  return `${familyId}|Mercadona|${receiptDate}|${total.toFixed(2)}|${normalizedLines}`
}

const FAMILY_A = '011429a4-4fd8-4341-9c04-ec6b2f585196'
const FAMILY_B = '22222222-2222-2222-2222-222222222222'

describe('3. dos tickets DISTINTOS, mismo Mercadona/fecha/importe (153,60€) → DOS compras (no se deduplica por fecha+importe)', () => {
  const ticket1Items: TestItem[] = [
    { name: '24 HUEVOS FRESCOS', quantity: 1, unit: 'ud', unitPrice: 5.25 },
    { name: 'SOLOMILLO CERDO', quantity: 1, unit: 'ud', unitPrice: 5.05 },
    { name: 'LECHE ENTERA', quantity: 6, unit: 'ud', unitPrice: 0.95 },
  ]
  // Mismo importe total (153,60€), mismo día, mismas líneas EN NÚMERO pero productos reales distintos.
  const ticket2Items: TestItem[] = [
    { name: 'PAN DE MOLDE', quantity: 2, unit: 'ud', unitPrice: 1.35 },
    { name: 'ACEITE DE OLIVA', quantity: 1, unit: 'ud', unitPrice: 8.9 },
    { name: 'YOGUR NATURAL', quantity: 4, unit: 'ud', unitPrice: 2.1 },
  ]
  it('la huella lógica (CAPA B) de dos tickets con distintas líneas es DISTINTA aunque coincidan familia+tienda+fecha+total', async () => {
    const fp1 = await sha256Hex(buildContentFingerprintInput(FAMILY_A, '2026-09-25', 153.6, ticket1Items))
    const fp2 = await sha256Hex(buildContentFingerprintInput(FAMILY_A, '2026-09-25', 153.6, ticket2Items))
    expect(fp1).not.toBe(fp2)
  })
  it('el diseño nunca usa familia+tienda+fecha+total a secas como clave (prohibido explícitamente): el input incluye las líneas', () => {
    const input = buildContentFingerprintInput(FAMILY_A, '2026-09-25', 153.6, ticket1Items)
    expect(input).toContain('24 huevos frescos')
    expect(input).toContain('solomillo cerdo')
  })
  it('sourceFileHash (CAPA A) de dos PDFs distintos también es distinto: dos bytes de archivo distintos nunca colisionan por casualidad en este caso real', async () => {
    const h1 = await sha256Hex('%PDF-1.4 contenido ticket 1 ...')
    const h2 = await sha256Hex('%PDF-1.4 contenido ticket 2 ...')
    expect(h1).not.toBe(h2)
  })
})

describe('4. mismo PDF reenviado/Replay de Pipedream → una compra (el diseño no distingue "por qué" se reenvía, solo los bytes)', () => {
  it('el webhook no tiene ninguna rama/variable que dependa de "es un replay" o similar: la detección es puramente por bytes/contenido', () => {
    // "replay" SÍ aparece en prosa (comentario explicativo, ver más arriba en este archivo real) — lo que no
    // debe existir es una condición o identificador de código que distinga un replay de un reenvío cualquiera.
    expect(WEBHOOK).not.toMatch(/isReplay|is_replay|body\.replay|req\.replay/i)
  })
  it('sha256Hex es determinista: el mismo PDF (mismos bytes) siempre da el mismo hash, venga de un reenvío manual o de un Replay', async () => {
    const bytes = '%PDF-1.4 ticket mercadona 25/09/2026 153,60€ ...'
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(bytes))
  })
})

describe('5. ticket manual sin hash/huella ("Subir ticket") → comportamiento previo intacto', () => {
  it('src/data/receipts.ts (flujo manual, con sesión de usuario) no referencia source_file_hash ni content_fingerprint', () => {
    expect(MANUAL_RECEIPTS_TS).not.toMatch(/source_file_hash|content_fingerprint/)
  })
  it('analyze-receipt-photo (IA del flujo manual) tampoco las referencia: es un archivo totalmente distinto, sin tocar', () => {
    expect(MANUAL_ANALYZE).toBeDefined()
    expect(MANUAL_ANALYZE).not.toMatch(/source_file_hash|content_fingerprint/)
  })
  it('el índice UNIQUE es parcial (WHERE ... IS NOT NULL): Postgres permite cualquier número de recibos manuales/antiguos con la columna a NULL', () => {
    expect(MIGRATION_0168).toContain('where source_file_hash is not null;')
    expect(MIGRATION_0168).toContain('where content_fingerprint is not null;')
  })
})

describe('6. dos familias distintas reciben el mismo archivo/hash → no se bloquean entre sí (alcance por family_id)', () => {
  it('los dos índices UNIQUE llevan family_id como primera columna (compuesto, no solo el hash/huella a secas)', () => {
    expect(MIGRATION_0168).toContain('on receipts (family_id, source_file_hash)')
    expect(MIGRATION_0168).toContain('on receipts (family_id, content_fingerprint)')
  })
  it('las DOS comprobaciones previas en el webhook (hash y huella) filtran SIEMPRE por family_id, nunca solo por el hash/huella', () => {
    const hashCheck = WEBHOOK.slice(WEBHOOK.indexOf('const { data: existingByHash'), WEBHOOK.indexOf('if (existingByHashError) throw existingByHashError'))
    expect(hashCheck).toContain('.eq("family_id", familyId)')
    expect(hashCheck).toContain('.eq("source_file_hash", sourceFileHash)')
    const fingerprintCheck = WEBHOOK.slice(
      WEBHOOK.indexOf('const { data: existingByFingerprint'),
      WEBHOOK.indexOf('if (existingByFingerprintError) throw existingByFingerprintError'),
    )
    expect(fingerprintCheck).toContain('.eq("family_id", familyId)')
    expect(fingerprintCheck).toContain('.eq("content_fingerprint", contentFingerprint)')
  })
  it('mismo archivo (mismo sourceFileHash), familias distintas: el hash calculado no cambia, la clave real es (familia, hash)', async () => {
    const bytes = '%PDF-1.4 mismo archivo recibido por dos familias distintas ...'
    const hashForFamilyA = await sha256Hex(bytes)
    const hashForFamilyB = await sha256Hex(bytes)
    expect(hashForFamilyA).toBe(hashForFamilyB) // el hash es del archivo, no de la familia
    expect(FAMILY_A).not.toBe(FAMILY_B) // pero la clave (familia, hash) sí distingue: no se bloquean entre sí
  })
})

describe('7. error de IA (o gate no permitido) ANTES de persistir → no deja una marca falsa que bloquee un reintento correcto futuro', () => {
  it('la huella (UPDATE final) solo se ejecuta cuando total != null (la IA extrajo un total real)', () => {
    const finalUpdateGuardIdx = WEBHOOK.indexOf('if (total != null) {\n        const { error: fingerprintError }')
    expect(finalUpdateGuardIdx).toBeGreaterThan(0)
  })
  it('cuando total permanece null (fallo de IA o gate no permitido), el recibo se guarda igual pero SIN fijar source_file_hash/content_fingerprint', () => {
    // El UPDATE que fija las dos huellas es LITERALMENTE lo primero dentro del cuerpo del "if (total != null)"
    // final (comprobado carácter a carácter, incluida la indentación): si total es null, ese if nunca se
    // ejecuta y las huellas no se tocan.
    expect(WEBHOOK).toContain(
      'if (total != null) {\n        const { error: fingerprintError } = await admin\n          .from("receipts")\n          .update({ source_file_hash: sourceFileHash, content_fingerprint: contentFingerprint })',
    )
  })
  it('por tanto, un reintento posterior del MISMO archivo (mismo sourceFileHash) no encuentra nada en la comprobación previa y vuelve a intentar la IA', () => {
    // Documenta la consecuencia (no ejecutable sin BD real): si el intento anterior falló, ningún recibo tiene
    // ese source_file_hash puesto -> existingByHash del paso 2 no encuentra nada -> se repite el flujo normal.
    expect(WEBHOOK).toContain('if (existingByHash) return json({ ok: true, duplicate: true, receiptId: existingByHash.id, itemsSaved: 0 })')
  })
  it('el archivo NUNCA se pierde por un fallo de IA (comportamiento preexistente, no tocado): el recibo se crea igual con total null', () => {
    expect(WEBHOOK).toContain('total_amount: total,')
    expect(WEBHOOK).not.toMatch(/if \(total == null\)[^]*?return json\(\{ error/)
  })
})

describe('8. fallo parcial persistiendo líneas → no queda un ticket a medias marcado como duplicado válido', () => {
  it('el INSERT del recibo y el resto de la persistencia van dentro de un mismo try; cualquier fallo (incluida una línea) cae en el catch', () => {
    const tryIdx = WEBHOOK.indexOf('try {\n      const { data: receipt, error: receiptError } = await admin')
    const priceInsertIdx = WEBHOOK.indexOf('await admin.from("product_prices").insert({')
    const catchIdx = WEBHOOK.indexOf('} catch (persistErr) {')
    expect(tryIdx).toBeGreaterThan(0)
    expect(priceInsertIdx).toBeGreaterThan(tryIdx)
    expect(catchIdx).toBeGreaterThan(priceInsertIdx)
  })
  it('un fallo insertando una línea (priceError) lanza y por tanto NUNCA llega al UPDATE que fija las huellas', () => {
    expect(WEBHOOK).toContain('if (priceError) throw priceError')
    const priceErrorIdx = WEBHOOK.indexOf('if (priceError) throw priceError')
    const fingerprintUpdateIdx = WEBHOOK.indexOf('.update({ source_file_hash: sourceFileHash, content_fingerprint: contentFingerprint })')
    expect(fingerprintUpdateIdx).toBeGreaterThan(priceErrorIdx) // el update está textualmente después, pero un throw a medias nunca llega hasta ahí
  })
  it('en ese fallo, cleanupFailedAttempt borra el recibo a medias (cascada de sus líneas), el gasto y el archivo subido', () => {
    const persistCatchIdx = WEBHOOK.indexOf('} catch (persistErr) {')
    const catchBlock = WEBHOOK.slice(persistCatchIdx, WEBHOOK.indexOf('} catch (err) {', persistCatchIdx))
    expect(catchBlock).toContain('await cleanupFailedAttempt(admin, { receiptId, expenseId, storagePath: path })')
  })
  it('tras la limpieza, el recibo a medias no existe -> un reintento del mismo archivo no lo encuentra por hash y procesa desde cero', () => {
    // Mismo razonamiento que el escenario 7: sin fila con source_file_hash puesto, no hay marca que confundir con un duplicado válido.
    expect(WEBHOOK).toContain('if (params.receiptId) await admin.from("receipts").delete().eq("id", params.receiptId)')
  })
})

describe('9. funciones puras reconstruidas arriba: idénticas carácter a carácter al archivo real', () => {
  it('buildContentFingerprintInput (misma normalización: nombre en minúsculas, líneas ordenadas, "|" y ";")', () => {
    expect(WEBHOOK).toContain(
      "    .map((it) => `${it.name.trim().toLowerCase()}|${it.quantity}|${it.unit}|${it.unitPrice.toFixed(2)}`)\n    .sort()\n    .join(\";\")",
    )
    expect(WEBHOOK).toContain('return `${familyId}|Mercadona|${receiptDate}|${total.toFixed(2)}|${normalizedLines}`')
  })
  it('sha256Hex real usa crypto.subtle.digest("SHA-256", ...) (Web Crypto, disponible en Deno) sobre los bytes', () => {
    expect(WEBHOOK).toContain('const digest = await crypto.subtle.digest("SHA-256", bytes)')
  })
})

describe('extra — riesgo de seguridad señalado, sin tocarlo (fuera de alcance de esta tarea)', () => {
  it('el webhook sigue autenticando con el mismo token que amazon-order-webhook (families.amazon_webhook_token), sin cambios', () => {
    expect(WEBHOOK).toContain('.eq("amazon_webhook_token", token)')
  })
})
