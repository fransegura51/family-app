// Autoguardado TEMPORAL del editor (localStorage): por persona, con tope, sin romper si el almacenamiento falla y sin pasar por encima de lo guardado a mano.
import { describe, expect, it } from 'vitest'
import {
  MAX_BUFFER_ENTRIES,
  bufferKey,
  bufferScope,
  clearBuffer,
  isBufferNewer,
  pruneStore,
  readBuffer,
  shouldOfferBuffer,
  writeBuffer,
  type StorageLike,
} from '@/domain/communityDraftBuffer'
import { emptyForm, type PostForm } from '@/domain/communityPostForm'

class MemoryStorage implements StorageLike {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}

const throwing: StorageLike = {
  getItem() {
    throw new Error('bloqueado')
  },
  setItem() {
    throw new Error('lleno')
  },
  removeItem() {
    throw new Error('bloqueado')
  },
}

const NOW = 1_800_000_000_000
const form = (over: Partial<PostForm> = {}): PostForm => ({ ...emptyForm('consejo', 'hogar'), title: 'Truco', body: 'Texto', ...over })

describe('ámbitos', () => {
  it('distingue publicación nueva, borrador guardado y edición', () => {
    expect(bufferScope({})).toBe('new')
    expect(bufferScope({ draftId: 'd1' })).toBe('draft:d1')
    expect(bufferScope({ postId: 'p1' })).toBe('edit:p1')
    expect(bufferScope({ postId: 'p1', draftId: 'd1' })).toBe('edit:p1')
  })
})

describe('escribir y leer', () => {
  it('guarda y recupera lo escrito, por persona', () => {
    const s = new MemoryStorage()
    expect(writeBuffer('ana', 'new', form(), s, NOW)).toBe(true)
    expect(readBuffer('ana', 'new', s, NOW + 1000)?.form.title).toBe('Truco')
    expect(readBuffer('ana', 'new', s, NOW + 1000)?.savedAt).toBe(NOW)
    // Otra persona en el mismo dispositivo no ve nada.
    expect(readBuffer('luis', 'new', s, NOW)).toBeNull()
    expect(s.getItem(bufferKey('ana'))).not.toBeNull()
    expect(s.getItem(bufferKey('luis'))).toBeNull()
  })

  it('un formulario vacío no se guarda y borra lo que hubiera', () => {
    const s = new MemoryStorage()
    writeBuffer('ana', 'new', form(), s, NOW)
    writeBuffer('ana', 'new', emptyForm(), s, NOW + 5)
    expect(readBuffer('ana', 'new', s, NOW + 10)).toBeNull()
    expect(s.getItem(bufferKey('ana'))).toBeNull()
  })

  it('borrar un ámbito no toca los demás', () => {
    const s = new MemoryStorage()
    writeBuffer('ana', 'new', form(), s, NOW)
    writeBuffer('ana', 'draft:d1', form({ title: 'Otro' }), s, NOW)
    clearBuffer('ana', 'new', s, NOW)
    expect(readBuffer('ana', 'new', s, NOW)).toBeNull()
    expect(readBuffer('ana', 'draft:d1', s, NOW)?.form.title).toBe('Otro')
  })

  it('caduca a los 30 días: no es una copia permanente', () => {
    const s = new MemoryStorage()
    writeBuffer('ana', 'new', form(), s, NOW)
    expect(readBuffer('ana', 'new', s, NOW + 29 * 86400000)).not.toBeNull()
    expect(readBuffer('ana', 'new', s, NOW + 31 * 86400000)).toBeNull()
  })

  it('guarda como mucho unas pocas entradas (las más recientes)', () => {
    const s = new MemoryStorage()
    for (let i = 0; i < MAX_BUFFER_ENTRIES + 3; i++) writeBuffer('ana', `draft:${i}`, form({ title: `T${i}` }), s, NOW + i)
    expect(readBuffer('ana', 'draft:0', s, NOW + 100)).toBeNull()
    expect(readBuffer('ana', `draft:${MAX_BUFFER_ENTRIES + 2}`, s, NOW + 100)?.form.title).toBe(`T${MAX_BUFFER_ENTRIES + 2}`)
    expect(Object.keys(JSON.parse(s.getItem(bufferKey('ana')) as string))).toHaveLength(MAX_BUFFER_ENTRIES)
  })
})

describe('robustez', () => {
  it('con localStorage roto o ausente no lanza: simplemente no hay autoguardado', () => {
    expect(() => writeBuffer('ana', 'new', form(), throwing, NOW)).not.toThrow()
    expect(writeBuffer('ana', 'new', form(), throwing, NOW)).toBe(false)
    expect(readBuffer('ana', 'new', throwing, NOW)).toBeNull()
    expect(() => clearBuffer('ana', 'new', throwing, NOW)).not.toThrow()
    expect(writeBuffer('ana', 'new', form(), null, NOW)).toBe(false)
    expect(readBuffer('ana', 'new', null, NOW)).toBeNull()
  })

  it('datos corruptos o manipulados se ignoran', () => {
    const s = new MemoryStorage()
    s.setItem(bufferKey('ana'), '{no es json')
    expect(readBuffer('ana', 'new', s, NOW)).toBeNull()
    s.setItem(bufferKey('ana'), JSON.stringify({ new: { savedAt: NOW, form: { kind: 'hackeo', title: 5 } }, otro: 'texto' }))
    expect(readBuffer('ana', 'new', s, NOW)).toBeNull()
    s.setItem(bufferKey('ana'), '[1,2,3]')
    expect(readBuffer('ana', 'new', s, NOW)).toBeNull()
    expect(pruneStore({ a: null as never }, NOW)).toEqual({})
  })
})

describe('cuándo se ofrece «Recuperar lo que estabas escribiendo»', () => {
  const baseline = emptyForm('consejo', 'hogar')

  it('sin guardado manual, cualquier autoguardado con contenido se ofrece', () => {
    const entry = { savedAt: NOW, form: form() }
    expect(shouldOfferBuffer(entry, baseline, null)).toBe(true)
  })

  it('solo si es más nuevo que el último guardado manual', () => {
    const entry = { savedAt: NOW, form: form() }
    expect(isBufferNewer(entry, new Date(NOW - 1000).toISOString())).toBe(true)
    expect(shouldOfferBuffer(entry, baseline, new Date(NOW - 1000).toISOString())).toBe(true)
    expect(shouldOfferBuffer(entry, baseline, new Date(NOW + 1000).toISOString())).toBe(false)
  })

  it('no se ofrece si no hay nada, está en blanco o es igual a lo que ya se ve', () => {
    expect(shouldOfferBuffer(null, baseline, null)).toBe(false)
    expect(shouldOfferBuffer({ savedAt: NOW, form: emptyForm() }, baseline, null)).toBe(false)
    expect(shouldOfferBuffer({ savedAt: NOW, form: form() }, form(), null)).toBe(false)
  })
})
