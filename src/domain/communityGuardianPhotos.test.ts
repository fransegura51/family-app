// Declaración de madre/padre/tutor legal al ACTIVAR permisos de Comunidad (0277), personas menores sin fotos (0265/0277) y sus errores.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyMinorToggle,
  guardianDeclarationLabel,
  guardianDialogText,
  minorPermissionErrorText,
  MINORS_NO_PHOTOS_NOTE,
  MINORS_RULES_NOTE,
  needsGuardianDeclaration,
  photosAllowedFrom,
  type MinorFlags,
} from '@/domain/communityAccess'
import { COMMUNITY_ERROR_MESSAGES, CommunityError, communityErrorCode, communityErrorText, toCommunityError } from '@/domain/communityErrors'
import {
  forbidPhotos,
  loadPhotosAllowed,
  peekPhotosAllowed,
  PHOTOS_ALLOWED_TTL_MS,
  resetPhotosAllowedStore,
  subscribePhotosAllowed,
} from '@/ui/community/communityPhotosAllowedStore'

const off: MinorFlags = { canRead: false, canParticipate: false }
const readOnly: MinorFlags = { canRead: true, canParticipate: false }
const both: MinorFlags = { canRead: true, canParticipate: true }

// Lo que hace la tarjeta: aplica la regla de los dos interruptores y pregunta si hay que pedir la declaración.
const asks = (current: MinorFlags, field: 'read' | 'participate', value: boolean) => needsGuardianDeclaration(current, applyMinorToggle(current, field, value))

describe('declaración de madre, padre o tutor legal', () => {
  it('ACTIVAR leer o participar (de desactivado a activado) exige la declaración', () => {
    expect(asks(off, 'read', true)).toBe(true)
    expect(asks(off, 'participate', true)).toBe(true) // participar activa también leer
    expect(asks(readOnly, 'participate', true)).toBe(true)
  })

  it('QUITAR permisos es inmediato: nunca pide declaración', () => {
    expect(asks(both, 'participate', false)).toBe(false)
    expect(asks(both, 'read', false)).toBe(false) // quitar leer quita también participar
    expect(asks(readOnly, 'read', false)).toBe(false)
  })

  it('no pide nada cuando el cambio no activa nada nuevo', () => {
    expect(asks(off, 'read', false)).toBe(false)
    expect(asks(both, 'read', true)).toBe(false)
    expect(asks(both, 'participate', true)).toBe(false)
    expect(asks(readOnly, 'read', true)).toBe(false)
  })

  it('la frase de la casilla es la aprobada y lleva el nombre de la persona', () => {
    expect(guardianDeclarationLabel('Lucía')).toBe('Soy madre, padre o tutor legal de Lucía y autorizo que use Comunidad')
  })

  it('el diálogo explica qué se permite: participar manda sobre leer, y se avisa de que es sin fotos', () => {
    expect(guardianDialogText('Lucía', off, applyMinorToggle(off, 'read', true))).toContain('Lucía lea Comunidad')
    const part = guardianDialogText('Lucía', off, applyMinorToggle(off, 'participate', true))
    expect(part).toContain('Lucía participe en Comunidad')
    expect(part).toContain('sin fotos')
    expect(guardianDialogText('Lucía', readOnly, both)).toContain('participe')
  })

  it('el texto informativo dice que participan sin fotos y que la familia recibe un aviso', () => {
    expect(MINORS_RULES_NOTE).toContain('sin fotos')
    expect(MINORS_RULES_NOTE).toContain('recibirán un aviso')
    expect(MINORS_NO_PHOTOS_NOTE).toBe('Las personas menores de edad participan sin fotos.')
  })
})

describe('errores nuevos', () => {
  it('GUARDIAN_DECLARATION_REQUIRED y PHOTOS_NOT_ALLOWED se reconocen y dan frases amables en español', () => {
    expect(toCommunityError({ message: 'GUARDIAN_DECLARATION_REQUIRED' }).code).toBe('GUARDIAN_DECLARATION_REQUIRED')
    expect(toCommunityError({ message: 'PHOTOS_NOT_ALLOWED' }).code).toBe('PHOTOS_NOT_ALLOWED')
    expect(COMMUNITY_ERROR_MESSAGES.GUARDIAN_DECLARATION_REQUIRED).toContain('madre, padre o tutor legal')
    expect(COMMUNITY_ERROR_MESSAGES.PHOTOS_NOT_ALLOWED).toContain('sin fotos')
    // Ninguna frase enseña el código técnico.
    for (const code of ['GUARDIAN_DECLARATION_REQUIRED', 'PHOTOS_NOT_ALLOWED'] as const) expect(COMMUNITY_ERROR_MESSAGES[code]).not.toMatch(/[A-Z]{4,}_/)
  })

  it('los mensajes de error de Supabase con prefijo también se reconocen', () => {
    expect(communityErrorCode({ message: 'Error: PHOTOS_NOT_ALLOWED' })).toBe('PHOTOS_NOT_ALLOWED')
    expect(communityErrorText({ message: 'PHOTOS_NOT_ALLOWED' })).toContain('sin fotos')
  })

  it('un error ya convertido conserva su código (no se vuelve a analizar su frase en español)', () => {
    const converted = toCommunityError({ message: 'PHOTOS_NOT_ALLOWED' })
    expect(converted).toBeInstanceOf(CommunityError)
    expect(communityErrorCode(converted)).toBe('PHOTOS_NOT_ALLOWED')
    // Con toCommunityError sobre la frase ya traducida se perdería (UNKNOWN): por eso existe communityErrorCode.
    expect(toCommunityError(converted).code).toBe('UNKNOWN')
  })

  it('el panel de permisos da el mensaje de la declaración, y NOT_ADMIN llega bien aunque el error ya venga convertido', () => {
    expect(minorPermissionErrorText({ message: 'GUARDIAN_DECLARATION_REQUIRED' })).toContain('madre, padre o tutor legal')
    expect(minorPermissionErrorText(toCommunityError({ message: 'GUARDIAN_DECLARATION_REQUIRED' }))).toContain('madre, padre o tutor legal')
    expect(minorPermissionErrorText(toCommunityError({ message: 'NOT_ADMIN' }))).toContain('administra la familia')
  })
})

describe('fotos de personas menores de edad', () => {
  it('solo un «no» claro del servidor oculta las fotos', () => {
    expect(photosAllowedFrom({ photosAllowed: false })).toBe(false)
    expect(photosAllowedFrom({ photosAllowed: true })).toBe(true)
    expect(photosAllowedFrom({})).toBe(true) // servidor anterior a la regla
    expect(photosAllowedFrom(null)).toBe(true)
    expect(photosAllowedFrom(undefined)).toBe(true)
  })
})

describe('memoria de «¿puede adjuntar fotos?» (una consulta por persona y sesión)', () => {
  beforeEach(() => resetPhotosAllowedStore())

  it('la primera vez pregunta; después responde de memoria sin volver a preguntar', async () => {
    let calls = 0
    const fetcher = async () => {
      calls++
      return { photosAllowed: false }
    }
    expect(peekPhotosAllowed('yo')).toBeNull()
    expect(await loadPhotosAllowed('yo', fetcher)).toBe(false)
    expect(await loadPhotosAllowed('yo', fetcher)).toBe(false)
    expect(peekPhotosAllowed('yo')).toBe(false)
    expect(calls).toBe(1)
  })

  it('las consultas simultáneas se comparten (una sola llamada)', async () => {
    let calls = 0
    const fetcher = async () => {
      calls++
      return { photosAllowed: true }
    }
    const results = await Promise.all([loadPhotosAllowed('yo', fetcher), loadPhotosAllowed('yo', fetcher), loadPhotosAllowed('yo', fetcher)])
    expect(results).toEqual([true, true, true])
    expect(calls).toBe(1)
  })

  it('cada persona tiene la suya (otra persona en el mismo dispositivo no hereda la respuesta)', async () => {
    const adulta = async () => ({ photosAllowed: true })
    const menor = async () => ({ photosAllowed: false })
    expect(await loadPhotosAllowed('adulta', adulta)).toBe(true)
    expect(peekPhotosAllowed('menor')).toBeNull()
    expect(await loadPhotosAllowed('menor', menor)).toBe(false)
    expect(peekPhotosAllowed('adulta')).toBeNull() // la memoria guarda solo a la última persona
  })

  it('caduca a los 30 minutos', async () => {
    const now = 1_000
    const fetcher = async () => ({ photosAllowed: false })
    await loadPhotosAllowed('yo', fetcher, () => now)
    expect(peekPhotosAllowed('yo', now + PHOTOS_ALLOWED_TTL_MS - 1)).toBe(false)
    expect(peekPhotosAllowed('yo', now + PHOTOS_ALLOWED_TTL_MS)).toBeNull()
  })

  it('si la consulta falla no se recuerda nada y se deja ver el selector (el servidor decide)', async () => {
    let calls = 0
    const failing = async () => {
      calls++
      throw new Error('sin red')
    }
    expect(await loadPhotosAllowed('yo', failing)).toBe(true)
    expect(peekPhotosAllowed('yo')).toBeNull()
    expect(await loadPhotosAllowed('yo', async () => ({ photosAllowed: false }))).toBe(false)
    expect(calls).toBe(1)
  })

  it('un fallo síncrono de la función tampoco rompe nada', async () => {
    const throwing = (() => {
      throw new Error('boom')
    }) as () => Promise<{ photosAllowed?: boolean }>
    expect(await loadPhotosAllowed('yo', throwing)).toBe(true)
  })

  it('PHOTOS_NOT_ALLOWED del servidor oculta el selector al instante y avisa a las pantallas abiertas', () => {
    let notified = 0
    const off = subscribePhotosAllowed(() => notified++)
    forbidPhotos('yo')
    expect(peekPhotosAllowed('yo')).toBe(false)
    expect(notified).toBe(1)
    off()
    forbidPhotos('yo')
    expect(notified).toBe(1)
  })
})
