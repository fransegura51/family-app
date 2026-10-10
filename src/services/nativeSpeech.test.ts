// Pepa habla la respuesta dentro de la app nativa: la síntesis de voz del navegador no suena dentro de una app.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))
const native = vi.hoisted(() => ({ value: true }))

vi.mock('@capacitor-community/text-to-speech', () => ({ TextToSpeech: tts, QueueStrategy: { Flush: 0, Add: 1 } }))
vi.mock('@/services/nativeApp', () => ({ isNativeApp: () => native.value }))
vi.mock('@capacitor-community/speech-recognition', () => ({ SpeechRecognition: {} }))
const report = vi.hoisted(() => vi.fn())
vi.mock('@/data/errorReports', () => ({ reportClientError: report }))

import { isSpeechSupported, primeSpeech, speakAsync } from '@/services/voice'
import capacitorConfig from '../../capacitor.config.ts?raw'
import ttsManifest from '../../node_modules/@capacitor-community/text-to-speech/android/src/main/AndroidManifest.xml?raw'
import capSettings from '../../android/capacitor.settings.gradle?raw'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  native.value = true
  tts.speak.mockResolvedValue(undefined)
  tts.stop.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

describe('Pepa habla en la app nativa', () => {
  it('dentro de la app se da por soportado y no depende de la voz del navegador', () => {
    expect(isSpeechSupported()).toBe(true)
  })

  it('habla en español de España, cortando lo que estuviera sonando, y avisa al terminar', async () => {
    const done = vi.fn()
    void speakAsync('He añadido Mercadona Pam a la lista de la compra').then(done)
    await vi.advanceTimersByTimeAsync(0)
    expect(tts.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'He añadido Mercadona Pam a la lista de la compra', lang: 'es-ES', queueStrategy: 0 }))
    expect(done).toHaveBeenCalled() // el complemento resuelve al terminar de hablar
  })

  it('si el español de España no está en el móvil, prueba el siguiente; no se queda colgada', async () => {
    tts.speak.mockRejectedValueOnce(new Error('This language is not supported.')).mockResolvedValueOnce(undefined)
    const done = vi.fn()
    void speakAsync('hola').then(done)
    await vi.advanceTimersByTimeAsync(0)
    expect(tts.speak).toHaveBeenCalledTimes(2)
    expect(tts.speak.mock.calls[1][0].lang).toBe('es-US')
    expect(done).toHaveBeenCalled()
  })

  it('si no hay voz en el móvil, termina sin ruido (nunca rechaza, para no romper el flujo de Pepa)', async () => {
    tts.speak.mockRejectedValue(new Error('Not yet initialized or not available on this device.'))
    await expect(speakAsync('hola')).resolves.toBeUndefined()
    expect(tts.speak).toHaveBeenCalledTimes(1)
  })

  it('nunca se queda colgada: si la voz no avisa del final, se da por terminada pasado un tiempo razonable', async () => {
    tts.speak.mockReturnValue(new Promise(() => {}))
    const done = vi.fn()
    void speakAsync('hola').then(done)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000) // 6 s + 4 letras
    expect(done).toHaveBeenCalled()
  })

  it('si la voz falla, deja el motivo en el servidor (para poder diagnosticarlo sin tener el móvil delante)', async () => {
    tts.speak.mockRejectedValue(new Error('"TextToSpeech" plugin is not implemented on android'))
    await speakAsync('hola')
    expect(report).toHaveBeenCalledTimes(1)
    expect((report.mock.calls[0][0] as Error).message).toContain('[voz nativa] no se pudo hablar')
    expect((report.mock.calls[0][0] as Error).message).toContain('not implemented')
  })

  it('si «termina» al instante una frase larga (no sonó: volumen, motor de voz...), también lo anota', async () => {
    await speakAsync('He añadido Mercadona Patatas a la lista de la compra')
    expect(report).toHaveBeenCalledTimes(1)
    expect((report.mock.calls[0][0] as Error).message).toContain('probablemente no sonó')
  })

  it('una frase corta que termina rápido es normal y no se anota', async () => {
    await speakAsync('ok')
    expect(report).not.toHaveBeenCalled()
  })

  it('«preparar» la voz (truco de Safari/iOS) no hace nada en la app', () => {
    primeSpeech()
    expect(tts.speak).not.toHaveBeenCalled()
  })

  it('el complemento va dentro del APK y declara el servicio de voz que Android 11+ exige para verlo', () => {
    expect(capacitorConfig).toContain("'@capacitor-community/text-to-speech'")
    expect(capSettings).toContain(':capacitor-community-text-to-speech')
    expect(ttsManifest).toContain('android.intent.action.TTS_SERVICE')
  })
})
