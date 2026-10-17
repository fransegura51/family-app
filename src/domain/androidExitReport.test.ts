// Pantalla «Informe del fallo» de la app de Android (LauncherActivity): solo para fallos de verdad. Que el sistema cierre PEPA por poca memoria o por una
// señal es normal (la ubicación con la app cerrada sigue por NativeLocationReceiver) y solo se anota en el registro del móvil.
import { describe, expect, it } from 'vitest'
import launcher from '../../android/app/src/main/java/es/pepafamilyapp/app/LauncherActivity.java?raw'

const norm = (text: string) => text.replace(/\r\n/g, '\n')

describe('LauncherActivity: cuándo se enseña el informe del fallo', () => {
  const src = norm(launcher)
  const bad = /boolean bad = ([^;]+);/.exec(src)?.[1] ?? ''
  const kill = /boolean systemKill = ([^;]+);/.exec(src)?.[1] ?? ''

  it('un fallo, un bloqueo o un arranque fallido SÍ enseñan la pantalla', () => {
    for (const reason of ['REASON_CRASH', 'REASON_CRASH_NATIVE', 'REASON_ANR', 'REASON_INITIALIZATION_FAILURE']) expect(bad).toContain(reason)
  })

  it('poca memoria, una señal del sistema, uso excesivo o un servicio caído NO la enseñan', () => {
    for (const reason of ['REASON_SIGNALED', 'REASON_LOW_MEMORY', 'REASON_EXCESSIVE_RESOURCE_USAGE', 'REASON_DEPENDENCY_DIED']) {
      expect(bad).not.toContain(reason)
      expect(kill).toContain(reason)
    }
  })

  it('esos cierres del sistema se anotan en el registro del móvil, que la app sube al abrirse', () => {
    expect(src).toContain('NativeLocationReceiver.diag(this, "Android cerró PEPA: "')
  })
})
