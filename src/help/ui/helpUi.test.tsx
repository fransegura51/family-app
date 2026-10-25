// @vitest-environment jsdom
// «Pepa te acompaña»: interfaz real (jsdom) de la Ayuda — conversación en memoria, «Llévame», panel no modal que no pierde lo escrito, voz independiente y permisos.
// Servicios simulados (voz, Supabase, estado de Comunidad); la comprobación en dispositivos reales no la sustituye.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/domain/types'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const speech = vi.hoisted(() => ({ spoken: [] as string[], stopped: 0, primed: 0, pending: [] as (() => void)[] }))
vi.mock('@/services/voice', () => ({
  isSpeechSupported: () => true,
  primeSpeech: () => {
    speech.primed++
  },
  // La voz «dura» hasta que la prueba la suelta (como una voz real): así se ve el estado «hablando» y los botones de detener y repetir.
  speakAsync: (t: string) => {
    speech.spoken.push(t)
    return new Promise<void>((resolve) => speech.pending.push(resolve))
  },
  stopSpeech: () => {
    speech.stopped++
  },
}))
const supabaseCalls = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        supabaseCalls.n++
        return () => {
          throw new Error('La Ayuda no debe llamar a Supabase')
        }
      },
    },
  ),
}))
const community = vi.hoisted(() => ({ status: { launched: true, visible: true, isAdmin: false, access: 'participate' } as { visible: boolean; access?: string } | null }))
vi.mock('@/data/communityStatusCache', () => ({
  communityStatusCache: { peek: () => community.status, get: async () => community.status, prime: () => undefined, clear: () => undefined },
}))

const { HelpProvider } = await import('@/help/ui/HelpProvider')
const { HelpPanel } = await import('@/help/ui/HelpPanel')
const { HelpHint } = await import('@/help/ui/HelpHint')
const { HelpConversation } = await import('@/help/ui/HelpConversation')
const { setHelpVoiceMode, getHelpVoiceMode, HELP_VOICE_KEY } = await import('@/help/prefs')
const { useHelp } = await import('@/help/ui/helpContext')
const { isSyncedPrefKey, HELP_PREFS_SYNC_ENABLED, HELP_PREF_PATTERN_SOURCES } = await import('@/state/prefs/prefsRegistry')

const ADULT: Pick<Profile, 'role' | 'allowedSections'> = { role: 'adult', allowedSections: null }
const CHILD: Pick<Profile, 'role' | 'allowedSections'> = { role: 'child', allowedSections: ['calendario'] }

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname}</p>
}
function Opener({ q }: { q: string }) {
  const help = useHelp()
  return (
    <button type="button" onClick={() => help.openHelp({ query: q })}>
      abrir
    </button>
  )
}

function app(profile = ADULT, children?: React.ReactNode, url = '/calendario') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <HelpProvider profile={profile}>
        {children}
        <HelpPanel />
        <Where />
      </HelpProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  speech.spoken.length = 0
  speech.stopped = 0
  speech.primed = 0
  speech.pending.length = 0
  supabaseCalls.n = 0
  community.status = { visible: true, access: 'participate' }
  localStorage.clear()
})
afterEach(() => cleanup())

describe('conversación: solo en memoria', () => {
  it('preguntar muestra la pregunta y la respuesta verificada de la ficha', async () => {
    app(ADULT, <Opener q="crear un evento" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary', { name: /Pepa te acompaña/ })
    expect(within(panel).getByText('crear un evento')).toBeTruthy()
    expect(within(panel).getByRole('heading', { name: 'Crear un evento en el calendario' })).toBeTruthy()
    expect(within(panel).getByText(/pulsa «\+ Nuevo evento»/)).toBeTruthy()
  })

  it('«Llévame» abre la pantalla real, minimiza el panel y la conversación SIGUE al volver', async () => {
    app(ADULT, <Opener q="añadir leche a la lista de la compra" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    fireEvent.click(within(panel).getByRole('button', { name: 'Llévame' }))
    expect(screen.getByTestId('where').textContent).toBe('/compras')
    expect(screen.queryByRole('complementary')).toBeNull() // minimizado
    fireEvent.click(screen.getByText('abrir')) // vuelve a abrir (sin pregunta nueva no: aquí sí pregunta) — la conversación anterior sigue
    const again = await screen.findByRole('complementary')
    expect(within(again).getAllByText(/añadir leche a la lista de la compra/).length).toBeGreaterThanOrEqual(1)
  })

  it('cerrar la Ayuda borra la conversación; minimizar la conserva', async () => {
    const Reopen = () => {
      const help = useHelp()
      return (
        <button type="button" onClick={() => help.openHelp()}>
          reabrir
        </button>
      )
    }
    app(ADULT, (
      <>
        <Opener q="cambiar los colores" />
        <Reopen />
      </>
    ))
    fireEvent.click(screen.getByText('abrir'))
    let panel = await screen.findByRole('complementary')
    expect(within(panel).getAllByText('cambiar los colores').length).toBe(1)
    fireEvent.click(within(panel).getByRole('button', { name: /Minimizar la Ayuda/ }))
    fireEvent.click(screen.getByText('reabrir'))
    panel = await screen.findByRole('complementary')
    expect(within(panel).getAllByText('cambiar los colores').length).toBe(1) // conservada
    fireEvent.click(within(panel).getByRole('button', { name: /Cerrar la Ayuda/ }))
    fireEvent.click(screen.getByText('reabrir'))
    panel = await screen.findByRole('complementary')
    expect(within(panel).queryByText('cambiar los colores')).toBeNull() // borrada
  })

  it('nada de la conversación se guarda en el dispositivo ni se envía: ni almacenamiento ni Supabase', async () => {
    app(ADULT, <Opener q="frase muy privada sobre mi economia" />)
    fireEvent.click(screen.getByText('abrir'))
    await screen.findByRole('complementary')
    const stored = JSON.stringify({ ...localStorage })
    expect(stored).not.toContain('privada')
    expect(supabaseCalls.n).toBe(0)
    const code = (f: string) => read(f).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code('src/help/session.ts') + code('src/help/ui/HelpProvider.tsx')).not.toMatch(/localStorage|sessionStorage|indexedDB|supabase|fetch\(/)
  })
})

describe('panel contextual: no modal y sin perder lo que se está escribiendo', () => {
  it('abrir la Ayuda desde un «?» no desmonta el formulario ni borra lo escrito; Esc la minimiza', async () => {
    app(ADULT, (
      <form>
        <label>
          Título
          <input aria-label="titulo-evento" />
        </label>
        <HelpHint cardId="cal-crear-evento" label="Ayuda para crear un evento" />
      </form>
    ))
    const input = screen.getByLabelText('titulo-evento') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Cumple de Eric' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ayuda para crear un evento' }))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).getByRole('heading', { name: 'Crear un evento en el calendario' })).toBeTruthy()
    expect(document.body.contains(input)).toBe(true)
    expect((screen.getByLabelText('titulo-evento') as HTMLInputElement).value).toBe('Cumple de Eric')
    // No modal: ni aria-modal ni el resto de la página marcado como inerte.
    expect(panel.getAttribute('aria-modal')).toBeNull()
    expect(document.querySelector('[inert]')).toBeNull()
    expect(document.querySelector('[aria-hidden="true"] input')).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('complementary')).toBeNull()
    expect((screen.getByLabelText('titulo-evento') as HTMLInputElement).value).toBe('Cumple de Eric')
  })

  it('en la propia pantalla de Ayuda no se pinta el panel (la conversación ya está en la pantalla)', async () => {
    app(ADULT, <Opener q="crear un evento" />, '/ayuda')
    fireEvent.click(screen.getByText('abrir'))
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})

describe('voz de la Ayuda: independiente de «Hablar con PEPA»', () => {
  it('«Por escrito» (por defecto): no lee nada solo, pero el texto se ve y hay controles para escuchar', async () => {
    app(ADULT, <Opener q="crear un evento" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(speech.spoken).toEqual([])
    expect(within(panel).getByText(/pulsa «\+ Nuevo evento»/)).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: /Escuchar la explicación/ }))
    expect(speech.spoken.length).toBe(1)
    expect(speech.spoken[0]).toContain('+ Nuevo evento')
  })

  it('«Hablando»: la respuesta se lee automáticamente (con el MISMO texto que se ve) y se puede detener y repetir', async () => {
    setHelpVoiceMode('voice')
    app(ADULT, <Opener q="crear un evento" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(speech.spoken.length).toBe(1)
    expect(panel.textContent).toContain(speech.spoken[0])
    expect(speech.primed).toBeGreaterThan(0)
    const stop = await within(panel).findByRole('button', { name: /Detener la voz/ })
    expect(within(panel).getByRole('button', { name: /Repetir la explicación/ })).toBeTruthy()
    fireEvent.click(stop)
    expect(speech.stopped).toBeGreaterThan(0)
  })

  it('la preferencia de Ayuda NO toca la de «Hablar con PEPA» (otra clave) y viaja por el sistema de preferencias existente', () => {
    localStorage.setItem('familyapp:voice-response-mode', 'text')
    setHelpVoiceMode('voice')
    expect(getHelpVoiceMode()).toBe('voice')
    expect(localStorage.getItem(HELP_VOICE_KEY)).toBe('voice')
    expect(HELP_VOICE_KEY).not.toBe('familyapp:voice-response-mode')
    expect(localStorage.getItem('familyapp:voice-response-mode')).toBe('text')
    const prefs = read('src/help/prefs.ts')
    expect(prefs).toContain("from '@/state/prefs/prefsWrite'")
    expect(prefs.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')).not.toContain('voice-response-mode')
  })

  it('cambiar a «Por escrito» corta la voz que estuviera sonando', async () => {
    setHelpVoiceMode('voice')
    app(ADULT, <Opener q="crear un evento" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    const before = speech.stopped
    fireEvent.click(within(panel).getByRole('radio', { name: /Por escrito/ }))
    expect(speech.stopped).toBeGreaterThan(before)
    expect(getHelpVoiceMode()).toBe('text')
  })

  it('usa el motor de voz oficial sin tocarlo: solo importa de services/voice, nunca speechSynthesis directamente', () => {
    const src = read('src/help/voice.ts')
    expect(src).toContain("from '@/services/voice'")
    expect(src).not.toMatch(/speechSynthesis|SpeechSynthesisUtterance/)
  })

  it('sincronización: las claves de Ayuda solo viajan cuando se enciende el interruptor (tras aplicar 0306); apagado, son locales', () => {
    expect(HELP_PREFS_SYNC_ENABLED).toBe(false)
    for (const k of ['pepa:help-voice-mode', 'pepa:help-welcome', 'pepa:help-hint:calendario', 'pepa:help-tour:cal-crear-evento']) expect(isSyncedPrefKey(k), k).toBe(false)
    // Y los patrones preparados aceptan exactamente las claves previstas.
    const res = HELP_PREF_PATTERN_SOURCES.map((p) => new RegExp(p))
    for (const k of ['pepa:help-voice-mode', 'pepa:help-welcome', 'pepa:help-hint:calendario', 'pepa:help-tour:cal-crear-evento']) expect(res.some((r) => r.test(k)), k).toBe(true)
    for (const k of ['pepa:help-voice-mode-x', 'pepa:help-tour:Mal Id', 'familyapp:voice-response-mode']) expect(res.some((r) => r.test(k)), k).toBe(false)
  })
})

describe('permisos: la Ayuda explica restricciones y no ofrece botones que no van a funcionar', () => {
  it('un niño que pregunta por añadir un miembro ve la explicación («solo la administración») y NINGÚN botón Llévame', async () => {
    app(CHILD, <Opener q="añadir un miembro a la familia" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).getByText(/solo lo puede hacer la administración de tu familia/i)).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Llévame' })).toBeNull()
  })

  it('una sección bloqueada para la cuenta (Compras) se explica como restringida, sin «Llévame»', async () => {
    app(CHILD, <Opener q="añadir leche a la lista de la compra" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).queryByRole('button', { name: 'Llévame' })).toBeNull()
    expect(within(panel).getByText(/no tiene acceso a esta sección/i)).toBeTruthy()
  })

  it('Comunidad sin acceso (menor de 18, sin fecha de nacimiento): no aparece NINGUNA ficha de uso de Comunidad; la general sí', async () => {
    community.status = { visible: false }
    app(ADULT, <Opener q="publicar una receta en comunidad" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).queryByRole('heading', { name: 'Publicar en Comunidad' })).toBeNull()
    expect(within(panel).queryByRole('heading', { name: /Mi alias y mi perfil en Comunidad/ })).toBeNull()
  })

  it('Comunidad con acceso: la ficha de publicar se ofrece y lleva a /comunidad', async () => {
    app(ADULT, <Opener q="publicar en comunidad" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).getByRole('heading', { name: 'Publicar en Comunidad' })).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Llévame' }))
    expect(screen.getByTestId('where').textContent).toBe('/comunidad')
  })

  it('una función desactivada se explica como desactivada, sin «Llévame» ni «Enséñame»', async () => {
    app(ADULT, <Opener q="alergias en las recetas" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).getByText('Todavía no está disponible')).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Llévame' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Enséñame' })).toBeNull()
  })

  it('una función a medias dice con claridad cuál es su límite', async () => {
    app(ADULT, <Opener q="qué cocino hoy" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    // Para cualquier persona: sin etiquetas técnicas de estado; la limitación que afecta al uso, dicha con naturalidad.
    expect(within(panel).queryByText('Funciona, pero con limitaciones')).toBeNull()
    expect(within(panel).getByText(/Ten en cuenta: La versión con IA/)).toBeTruthy()
    expect(within(panel).queryByTestId('help-admin-state')).toBeNull()
  })

  it('el estado interno (parcial, motivo técnico) solo lo ve la administración de PEPA y sin consultar al servidor', async () => {
    const { rememberAppOwnerForTests, clearAppOwnerCache } = await import('@/state/useAppOwner')
    rememberAppOwnerForTests('admin-1', true)
    const calls = supabaseCalls.n
    app({ ...ADULT, id: 'admin-1' } as never, <Opener q="qué cocino hoy" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).getByTestId('help-admin-state').textContent).toMatch(/Solo administración PEPA · estado: parcial/)
    expect(supabaseCalls.n).toBe(calls)
    clearAppOwnerCache()
  })

  it('un motivo técnico (interruptor, pantalla pendiente) nunca se enseña a una persona normal', async () => {
    app(ADULT, <Opener q="alergias en las recetas" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).getByText('Todavía no está disponible')).toBeTruthy()
    expect(within(panel).queryByText(/Interruptor|preparada pero apagada|migración/i)).toBeNull()
  })

  it('«Enséñame» solo se ofrece cuando el tutorial existe (nunca un botón que no lleva a nada)', async () => {
    app(ADULT, <Opener q="próximos cumpleaños" />) // ficha sin tutorial: sin botón
    fireEvent.click(screen.getByText('abrir'))
    const sin = await screen.findByRole('complementary')
    expect(within(sin).queryByRole('button', { name: /Enséñame/ })).toBeNull()
  })

  it('«Enséñame» sí aparece en «Crear un evento», que ya tiene su tutorial real', async () => {
    app(ADULT, <Opener q="crear un evento" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).getAllByRole('button', { name: /Enséñame/ }).length).toBeGreaterThan(0)
  })
})

describe('sin resultados y accesos frecuentes', () => {
  it('una pregunta sin respuesta lo dice con amabilidad y sugiere probar otras palabras', async () => {
    app(ADULT, <Opener q="cotizacion del bitcoin" />)
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).getByText(/No he encontrado nada sobre eso/)).toBeTruthy()
  })

  it('la conversación vacía enseña acciones frecuentes y la ayuda del módulo en el que se está', async () => {
    app(ADULT, <HelpHint label="Ayuda sobre Calendario" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ayuda sobre Calendario' }))
    const panel = await screen.findByRole('complementary')
    // «Ayuda de [módulo]» desplegada por defecto; «Acciones frecuentes» plegada (el buscador queda a la vista sin listas enormes).
    const mod = within(panel).getByText(/Ayuda de Calendario/).closest('details')!
    expect(mod.hasAttribute('open')).toBe(true)
    expect(within(mod).getAllByRole('button').length).toBeGreaterThanOrEqual(4)
    const frequent = within(panel).getByText('Acciones frecuentes').closest('details')!
    expect(frequent.hasAttribute('open')).toBe(false)
    expect(frequent.querySelectorAll('button').length).toBeGreaterThanOrEqual(4) // están ahí, solo plegadas
  })

  it('el cuadro de pregunta se llama «¿Qué quieres hacer o saber?» y envía con Enter', async () => {
    render(
      <MemoryRouter>
        <HelpProvider profile={ADULT}>
          <HelpConversation />
        </HelpProvider>
      </MemoryRouter>,
    )
    const input = screen.getByLabelText('¿Qué quieres hacer o saber?')
    fireEvent.change(input, { target: { value: 'cambiar mi contraseña' } })
    await act(async () => {
      fireEvent.submit(input.closest('form')!)
    })
    expect(screen.getByRole('heading', { name: 'Cambiar mi correo o mi contraseña' })).toBeTruthy()
  })
})
