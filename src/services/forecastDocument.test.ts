// @vitest-environment jsdom
// Importar desde foto o documento (28/10/2026): llamadas a la IA controladas y mensajes comprensibles. No usa la red ni la IA real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizedAiMimeType, prepareImageForAi } from '@/domain/imageCompression'

vi.mock('@/data/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } } }))

import { analyzeForecastDocument, ForecastDocumentReadError } from '@/services/forecastDocument'

const GOOD = { provider: 'X', concept: 'Cuadro', totalAmount: 658.75, installmentCount: 6, installmentAmounts: [116.21, 107.93, 108.21, 108.52, 108.81, 109.07] }
const EMPTY = {}
const photo = () => new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' })
const pdf = () => new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' })
const prepared = (tag: string) => vi.fn(async (f: File, variant?: 'standard' | 'enhanced') => (f.type === 'application/pdf' ? { file: f, reencoded: false } : { file: new File([tag + String(variant)], 'p.jpg', { type: 'image/jpeg' }), reencoded: true }))

let calls: string[] = []
let fetchMock: ReturnType<typeof vi.fn>
function mockFetch(...responses: Array<{ status: number; body?: unknown } | 'network'>) {
  const queue = [...responses]
  fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body).mimeType)
      const next = queue.shift() ?? { status: 200, body: EMPTY }
      if (next === 'network') throw new TypeError('network')
      return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body ?? {} }
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  calls = []
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('lectura de un documento: cuántas veces se llama a la IA', () => {
  it('lectura buena: UNA sola llamada', async () => {
    mockFetch({ status: 200, body: GOOD })
    const scan = await analyzeForecastDocument(photo(), { prepare: prepared('a'), pauseMs: 0 })
    expect(scan.installmentAmounts).toHaveLength(6)
    expect(calls).toHaveLength(1)
  })

  it('respuesta vacía con una FOTO: un segundo intento con otro procesamiento, y se queda con el que lee', async () => {
    mockFetch({ status: 200, body: EMPTY }, { status: 200, body: GOOD })
    const prep = prepared('a')
    const scan = await analyzeForecastDocument(photo(), { prepare: prep, pauseMs: 0 })
    expect(scan.totalAmount).toBe(658.75)
    expect(calls).toHaveLength(2)
    expect(prep.mock.calls.map((c) => c[1])).toEqual(['standard', 'enhanced'])
  })

  it('vacía las dos veces: devuelve la lectura vacía (la pantalla explica qué hacer) y NO hace un tercer intento', async () => {
    mockFetch({ status: 200, body: EMPTY }, { status: 200, body: EMPTY }, { status: 200, body: GOOD })
    const scan = await analyzeForecastDocument(photo(), { prepare: prepared('a'), pauseMs: 0 })
    expect(scan.totalAmount).toBeNull()
    expect(calls).toHaveLength(2)
  })

  it('respuesta vacía con un PDF: no hay otro procesamiento que probar, una sola llamada', async () => {
    mockFetch({ status: 200, body: EMPTY })
    const scan = await analyzeForecastDocument(pdf(), { prepare: prepared('a'), pauseMs: 0 })
    expect(scan.totalAmount).toBeNull()
    expect(calls).toEqual(['application/pdf'])
  })

  it('fallo pasajero del servicio (502): se repite UNA vez el mismo documento', async () => {
    mockFetch({ status: 502 }, { status: 200, body: GOOD })
    const scan = await analyzeForecastDocument(photo(), { prepare: prepared('a'), pauseMs: 0 })
    expect(scan.totalAmount).toBe(658.75)
    expect(calls).toHaveLength(2)
  })

  it('sin conexión dos veces: mensaje comprensible y solo dos intentos', async () => {
    mockFetch('network', 'network')
    await expect(analyzeForecastDocument(photo(), { prepare: prepared('a'), pauseMs: 0 })).rejects.toMatchObject({ kind: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('IA no permitida (403): no se reintenta y el mensaje explica por qué', async () => {
    mockFetch({ status: 403, body: { error: 'ai_not_allowed' } })
    const err = await analyzeForecastDocument(photo(), { prepare: prepared('a'), pauseMs: 0 }).catch((e) => e)
    expect(err).toBeInstanceOf(ForecastDocumentReadError)
    expect(err.kind).toBe('not_allowed')
    expect(err.message).toMatch(/cuentas adultas/)
    expect(calls).toHaveLength(1)
  })
})

describe('preparación de la foto (igual para Android, iPhone y escritorio)', () => {
  it('el tipo MIME se corrige: «image/jpg», vacío o raro → un tipo que la IA acepta', () => {
    expect(normalizedAiMimeType({ type: 'image/jpg', name: 'a.jpg' })).toBe('image/jpeg')
    expect(normalizedAiMimeType({ type: '', name: 'IMG_1.HEIC' })).toBe('image/heic')
    expect(normalizedAiMimeType({ type: 'application/octet-stream', name: 'scan.pdf' })).toBe('application/pdf')
    expect(normalizedAiMimeType({ type: '', name: 'sin-extension' })).toBe('image/jpeg')
    expect(normalizedAiMimeType({ type: 'image/png', name: 'a.png' })).toBe('image/png')
  })

  it('un PDF pasa tal cual; un formato que el navegador no decodifica pasa con su tipo corregido (nunca se pierde el archivo)', async () => {
    const p = await prepareImageForAi(pdf())
    expect(p.reencoded).toBe(false)
    expect(p.file.type).toBe('application/pdf')
    const odd = new File([new Uint8Array([1])], 'foto.HEIC', { type: '' })
    const q = await prepareImageForAi(odd) // en jsdom no hay createImageBitmap: simula un navegador que no sabe decodificarlo
    expect(q.reencoded).toBe(false)
    expect(q.file.type).toBe('image/heic')
  })
})
