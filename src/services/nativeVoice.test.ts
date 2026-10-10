// Dictado por voz en la app nativa: el reconocimiento del navegador no funciona dentro de la app (siempre «not-allowed»), así que se usa el de Android.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (data: unknown) => void
const plugin = vi.hoisted(() => {
  const listeners = new Map<string, (data: unknown) => void>()
  return {
    listeners,
    available: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    addListener: vi.fn(async (name: string, fn: (data: unknown) => void) => {
      listeners.set(name, fn)
      return { remove: vi.fn(async () => void listeners.delete(name)) }
    }),
  }
})
const native = vi.hoisted(() => ({ value: true }))

vi.mock('@capacitor-community/speech-recognition', () => ({ SpeechRecognition: plugin }))
vi.mock('@/services/nativeApp', () => ({ isNativeApp: () => native.value }))

import { isDictationSupported, listenContinuous } from '@/services/voice'
import voiceSrc from '@/services/voice.ts?raw'
import manifestPlugin from '../../node_modules/@capacitor-community/speech-recognition/android/src/main/AndroidManifest.xml?raw'
import capSettings from '../../android/capacitor.settings.gradle?raw'

const emit = (name: string, data: unknown) => (plugin.listeners.get(name) as Listener)(data)
async function flush() {
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  plugin.listeners.clear()
  native.value = true
  plugin.available.mockResolvedValue({ available: true })
  plugin.checkPermissions.mockResolvedValue({ speechRecognition: 'granted' })
  plugin.requestPermissions.mockResolvedValue({ speechRecognition: 'granted' })
  plugin.start.mockResolvedValue({})
  plugin.stop.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

describe('dictado por voz en la app nativa', () => {
  it('dentro de la app nativa se da por disponible sin depender del reconocimiento del navegador', () => {
    expect(isDictationSupported()).toBe(true)
  })

  it('empieza a escuchar en español con resultados parciales y sin ventana del sistema', async () => {
    listenContinuous({ onTranscript: vi.fn(), onError: vi.fn() })
    await flush()
    expect(plugin.start).toHaveBeenCalledWith({ language: 'es-ES', maxResults: 1, partialResults: true, popup: false })
  })

  it('pide el permiso del micrófono si no lo tiene, y si se deniega lo dice sin empezar a escuchar', async () => {
    plugin.checkPermissions.mockResolvedValue({ speechRecognition: 'prompt' })
    plugin.requestPermissions.mockResolvedValue({ speechRecognition: 'denied' })
    const onError = vi.fn()
    listenContinuous({ onTranscript: vi.fn(), onError })
    await flush()
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1)
    expect(plugin.start).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Necesito permiso para usar el micrófono'))
  })

  it('no vuelve a pedir el permiso si ya está concedido', async () => {
    listenContinuous({ onTranscript: vi.fn(), onError: vi.fn() })
    await flush()
    expect(plugin.requestPermissions).not.toHaveBeenCalled()
  })

  it('sin servicio interno de reconocimiento pasa a la ventana de voz del sistema y entrega lo que se ha dicho', async () => {
    plugin.available.mockResolvedValue({ available: false })
    plugin.start.mockResolvedValue({ matches: ['pon leche en la lista'] })
    const seen: string[] = []
    listenContinuous({ onTranscript: (t) => seen.push(t), onError: vi.fn() })
    await flush()
    expect(plugin.start).toHaveBeenCalledWith(expect.objectContaining({ popup: true, language: 'es-ES' }))
    expect(seen).toEqual(['pon leche en la lista'])
  })

  it('si el servicio interno se cierra solo dos veces seguidas sin oír nada, pasa a la ventana de voz en vez de quedarse mudo', async () => {
    const seen: string[] = []
    listenContinuous({ onTranscript: (t) => seen.push(t), onError: vi.fn() })
    await flush()
    emit('listeningState', { status: 'stopped' }) // 1.ª: se cierra al instante sin oír nada
    await vi.advanceTimersByTimeAsync(500) // se reintenta una vez
    expect(plugin.start).toHaveBeenCalledTimes(2)
    plugin.start.mockResolvedValue({ matches: ['hola pepa'] })
    emit('listeningState', { status: 'stopped' }) // 2.ª seguida: plan B
    await flush()
    expect(plugin.start).toHaveBeenLastCalledWith(expect.objectContaining({ popup: true }))
    expect(seen).toEqual(['hola pepa'])
  })

  it('si el servicio interno no arranca, prueba la ventana del sistema; si también falla, dice la causa real de los dos fallos', async () => {
    plugin.start.mockRejectedValueOnce(new Error('Missing permission')).mockRejectedValueOnce(new Error('Activity not found'))
    const onError = vi.fn()
    listenContinuous({ onTranscript: vi.fn(), onError })
    await flush()
    expect(plugin.start).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Activity not found'))
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Missing permission'))
  })

  it('un fallo al preparar el dictado nombra el paso y la causa, no un mensaje genérico', async () => {
    plugin.checkPermissions.mockRejectedValueOnce(new Error('Plugin is not implemented'))
    const onError = vi.fn()
    listenContinuous({ onTranscript: vi.fn(), onError })
    await flush()
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Plugin is not implemented'))
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('pedir el permiso del micrófono'))
  })

  it('lo que se va oyendo llega como texto; al terminar la frase se abre otra sesión y las frases se unen con coma (separan los productos de una lista)', async () => {
    const seen: string[] = []
    listenContinuous({ onTranscript: (t) => seen.push(t), onError: vi.fn() })
    await flush()
    emit('partialResults', { matches: ['patatas'] })
    expect(seen.at(-1)).toBe('patatas')

    emit('listeningState', { status: 'stopped' }) // el motor da por terminada la frase
    await vi.advanceTimersByTimeAsync(500)
    expect(plugin.start).toHaveBeenCalledTimes(2) // sesión nueva para la siguiente frase

    emit('partialResults', { matches: ['queso'] })
    expect(seen.at(-1)).toBe('patatas, queso')
  })

  it('al parar deja de escuchar, retira los avisos y ya no abre sesiones nuevas', async () => {
    const session = listenContinuous({ onTranscript: vi.fn(), onError: vi.fn() })
    await flush()
    emit('listeningState', { status: 'stopped' })
    session.stop()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(plugin.stop).toHaveBeenCalledTimes(1)
    expect(plugin.start).toHaveBeenCalledTimes(1) // la de antes; ninguna más tras parar
    expect(plugin.listeners.size).toBe(0)
  })

  it('en el navegador sigue usando el reconocimiento del navegador, sin tocar el complemento', () => {
    native.value = false
    const onError = vi.fn()
    vi.stubGlobal('window', {}) // sin SpeechRecognition
    listenContinuous({ onTranscript: vi.fn(), onError })
    expect(onError).toHaveBeenCalledWith('Este navegador no admite dictado por voz.')
    expect(plugin.available).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('proyecto Android', () => {
  it('el complemento declara el permiso de micrófono y el servicio de reconocimiento, y está registrado en el proyecto', () => {
    expect(manifestPlugin).toContain('android.permission.RECORD_AUDIO')
    expect(manifestPlugin).toContain('android.speech.RecognitionService')
    expect(capSettings).toContain(':capacitor-community-speech-recognition')
  })
  it('voice.ts elige el reconocedor nativo solo dentro de la app', () => {
    expect(voiceSrc).toContain('if (isNativeApp()) return listenContinuousNative(handlers)')
  })
})
