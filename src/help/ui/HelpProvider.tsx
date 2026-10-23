import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { communityStatusCache } from '@/data/communityStatusCache'
import type { Profile } from '@/domain/types'
import { cardAccess, canOfferActions, type HelpAccessResult, type HelpCommunityState, type HelpContext } from '@/help/access'
import { HELP_CARD_BY_ID, HELP_CARDS, HELP_MODULE_BY_ID, LEGACY_ENTRIES } from '@/help/catalog'
import { buildHelpContext, communityStateFrom, moduleForPath } from '@/help/context'
import { getHelpVoiceMode, HELP_VOICE_KEY, setHelpVoiceMode, setWelcomeState, type HelpVoiceMode } from '@/help/prefs'
import { buildIndex, searchHelp, type SearchDoc, type SearchHit, type SearchResponse } from '@/help/search/searchEngine'
import { addAnswer, addPepaText, addUserMessage, emptySession, recentQueries, replaceMessage, type HelpSession } from '@/help/session'
import { isHelpAiEnabled } from '@/help/ai'
import { rankHelpWithAi } from '@/help/aiClient'
import { clearDestination, closeOpenMenus, requestDestination, revealDestination, waitForDestination } from '@/help/destinations'
import { HelpNudges } from '@/help/ui/HelpNudges'
import { getTour, hasTour } from '@/help/tours/registry'
import type { TourNextOption } from '@/help/tours/TourRunner'
import type { HelpCard, HelpModuleId } from '@/help/types'
import { primeHelpVoice, speakHelp, stopHelpSpeech } from '@/help/voice'
import { usePrefChange } from '@/state/prefs/usePrefChange'
import { peekAppOwner } from '@/state/useAppOwner'
import { HelpUiContext } from '@/help/ui/helpContext'

// Estado de la Ayuda «Pepa te acompaña»: abierta o minimizada, conversación (solo en memoria), permisos de la persona, búsqueda y voz. Se monta una vez en NavShell,
// por encima de las rutas, así que la conversación sobrevive a «Llévame» (cambiar de pantalla) y a minimizar, pero NO a cerrar la Ayuda ni a recargar la app.
// El corredor de tutoriales solo se descarga la primera vez que se empieza uno.
const TourRunner = lazy(() => import('@/help/tours/TourRunner').then((m) => ({ default: m.TourRunner })))

let cachedIndex: ReturnType<typeof buildIndex> | null = null
function helpIndex() {
  cachedIndex ??= buildIndex(HELP_CARDS, LEGACY_ENTRIES)
  return cachedIndex
}

interface OpenOptions {
  query?: string
  cardId?: string
  moduleId?: HelpModuleId
}

export interface HelpApi {
  ctx: HelpContext
  /** La memoria dice que esta cuenta administra PEPA (sin consultar al servidor): solo para enseñar el estado interno de las fichas. */
  ownerKnown: boolean
  voiceMode: HelpVoiceMode
  setVoiceMode: (m: HelpVoiceMode) => void
  panelOpen: boolean
  session: HelpSession
  /** Módulo de la pantalla donde está la persona (ayuda contextual). */
  currentModule: HelpModuleId | null
  /** Módulo pedido al abrir la ayuda contextual (el «?» de una pantalla o formulario). */
  focusModule: HelpModuleId | null
  accessOf: (doc: SearchDoc) => HelpAccessResult
  accessOfCard: (card: HelpCard) => HelpAccessResult
  search: (query: string) => SearchResponse
  ask: (query: string) => void
  /** Añade a la conversación la respuesta de una ficha concreta (sin escribir una pregunta). */
  showCard: (cardId: string) => void
  openHelp: (opts?: OpenOptions) => void
  /** Oculta el panel pero conserva la conversación (para «Llévame»). */
  minimize: () => void
  /** Cierra del todo: borra la conversación y para la voz. */
  closeHelp: () => void
  goTo: (card: HelpCard) => void
  startTour: (card: HelpCard) => void
  /** Empieza un tutorial por su identificador (recorrido de bienvenida, sugerencias al terminar otro). */
  startTourById: (tourId: string) => void
  activeTour: string | null
  canStartTour: (card: HelpCard) => boolean
  speak: (text: string) => void
  stopSpeaking: () => void
  speakingText: string | null
  /** Pregunta (una vez, con la memoria compartida de Comunidad) si esta cuenta puede ver Comunidad. */
  ensureCommunity: () => void
}

export function HelpProvider({ profile, children }: { profile: Pick<Profile, 'role' | 'allowedSections'> & { id?: string }; children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [community, setCommunity] = useState<HelpCommunityState>(() => communityStateFrom(communityStatusCache.peek()))
  const [voiceMode, setVoiceModeState] = useState<HelpVoiceMode>(() => getHelpVoiceMode())
  const [panelOpen, setPanelOpen] = useState(false)
  const [session, setSession] = useState<HelpSession>(() => emptySession())
  const [focusModule, setFocusModule] = useState<HelpModuleId | null>(null)
  const [speakingText, setSpeakingText] = useState<string | null>(null)
  // Tutorial «Enséñame» en marcha (null = ninguno) y un contador para reiniciar el mismo si se elige otra vez.
  const [activeTour, setActiveTour] = useState<string | null>(null)
  const [tourRun, setTourRun] = useState(0)
  const voiceRef = useRef(voiceMode)
  voiceRef.current = voiceMode
  // Copia de la conversación para el camino asíncrono de la IA (que necesita el identificador del mensaje «Pensando…»).
  const sessionRef = useRef(session)
  sessionRef.current = session

  usePrefChange(HELP_VOICE_KEY, () => setVoiceModeState(getHelpVoiceMode()))

  const ctx = useMemo(() => buildHelpContext(profile, community), [profile, community])
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  // Comunidad: se pregunta el estado una sola vez (y se comparte con Inicio y Cocina por la memoria de 2 minutos) la primera vez que se abre la Ayuda.
  const askedCommunity = useRef(false)
  const ensureCommunity = useCallback(() => {
    if (askedCommunity.current || communityStatusCache.peek()) {
      const peeked = communityStatusCache.peek()
      if (peeked) setCommunity(communityStateFrom(peeked))
      return
    }
    askedCommunity.current = true
    communityStatusCache
      .get()
      .then((s) => setCommunity(communityStateFrom(s)))
      .catch(() => {
        askedCommunity.current = false // sin red: se reintentará la próxima vez
      })
  }, [])

  const accessOf = useCallback((doc: SearchDoc): HelpAccessResult => {
    if (doc.kind === 'legacy') return { status: 'allowed' }
    return cardAccess(doc.card, HELP_MODULE_BY_ID.get(doc.card.module), ctxRef.current)
  }, [])
  const accessOfCard = useCallback((card: HelpCard) => cardAccess(card, HELP_MODULE_BY_ID.get(card.module), ctxRef.current), [])

  const search = useCallback((query: string) => searchHelp(helpIndex(), query, { access: accessOf }), [accessOf])

  const speak = useCallback((text: string) => {
    setSpeakingText(text)
    void speakHelp(text, () => setSpeakingText((cur) => (cur === text ? null : cur)))
  }, [])
  const stopSpeaking = useCallback(() => {
    stopHelpSpeech()
    setSpeakingText(null)
  }, [])

  // Lo que se lee de una respuesta: la respuesta breve (y el límite si la función está a medias). Mismo texto que se ve.
  const spokenTextOf = useCallback((hit: SearchHit): string => {
    if (hit.doc.kind === 'card') return hit.doc.card.state === 'disponible' ? hit.doc.card.quick : `${hit.doc.card.quick} ${hit.doc.card.limits ?? ''}`
    return `${hit.doc.entry.title}. ${hit.doc.entry.text.slice(0, 280)}`
  }, [])

  const ask = useCallback(
    (raw: string) => {
      const query = raw.trim()
      if (!query) return
      primeHelpVoice() // dentro del toque que envía la pregunta (Safari/iOS)
      const res = search(query)
      const adult = ctxRef.current.role === 'admin' || ctxRef.current.role === 'adult'
      if (isHelpAiEnabled() && adult && res.confidence !== 'clear') {
        // La búsqueda local no tiene un resultado claro: la IA puede ELEGIR entre fichas verificadas que esta persona puede ver. Si falla o no elige nada, se queda lo local.
        const withQuestion = addUserMessage(sessionRef.current, query)
        const thinking = addPepaText(withQuestion, 'Déjame pensarlo un momento…')
        const thinkingId = thinking.messages[thinking.messages.length - 1].id
        sessionRef.current = thinking
        setSession(thinking)
        const pool = HELP_CARDS.filter((c) => cardAccess(c, HELP_MODULE_BY_ID.get(c.module), ctxRef.current).status !== 'hidden').map((c) => ({ id: c.id, title: c.title }))
        void rankHelpWithAi(query, pool, recentQueries(withQuestion)).then((ids) => {
          const aiHits: SearchHit[] = (ids ?? []).flatMap((id, i) => {
            const card = HELP_CARD_BY_ID.get(id)
            return card ? [{ doc: { kind: 'card' as const, id: card.id, module: card.module, card }, score: 0.9 - i * 0.1, coverage: 1, rank: 0.9 - i * 0.1 }] : []
          })
          const usedAi = aiHits.length > 0
          const hits = usedAi ? aiHits : res.hits
          const answer = { id: thinkingId, role: 'pepa' as const, kind: 'answer' as const, query, hits, confidence: usedAi ? ('clear' as const) : res.confidence, usedAi }
          const next = replaceMessage(sessionRef.current, thinkingId, answer)
          sessionRef.current = next
          setSession(next)
          if (voiceRef.current === 'voice' && hits[0]) {
            const a = accessOf(hits[0].doc)
            if (a.status === 'allowed') speak(spokenTextOf(hits[0]))
            else if (a.status === 'restricted' && a.reason) speak(a.reason)
          }
        })
        return
      }
      setSession((s) => addAnswer(addUserMessage(s, query), query, res.hits, res.confidence))
      if (voiceRef.current === 'voice' && res.hits[0]) {
        const first = res.hits[0]
        // Solo se lee lo que la persona puede ver completo; una restricción se lee como la explicación.
        const access = accessOf(first.doc)
        if (access.status === 'allowed') speak(spokenTextOf(first))
        else if (access.status === 'restricted' && access.reason) speak(access.reason)
      } else if (!res.hits[0]) {
        stopHelpSpeech()
      }
    },
    [accessOf, search, speak, spokenTextOf],
  )

  const showCard = useCallback(
    (cardId: string) => {
      const card = HELP_CARD_BY_ID.get(cardId)
      if (!card) return
      primeHelpVoice()
      const hit: SearchHit = { doc: { kind: 'card', id: card.id, module: card.module, card }, score: 1, coverage: 1, rank: 1 }
      setSession((s) => addAnswer(s, card.title, [hit], 'clear'))
      if (voiceRef.current === 'voice') {
        const a = cardAccess(card, HELP_MODULE_BY_ID.get(card.module), ctxRef.current)
        if (a.status === 'allowed') speak(spokenTextOf(hit))
        else if (a.status === 'restricted' && a.reason) speak(a.reason)
      }
    },
    [speak, spokenTextOf],
  )

  const openHelp = useCallback(
    (opts?: OpenOptions) => {
      primeHelpVoice()
      ensureCommunity()
      setPanelOpen(true)
      setFocusModule(opts?.moduleId ?? null)
      if (opts?.cardId) showCard(opts.cardId)
      else if (opts?.query) ask(opts.query)
    },
    [ask, ensureCommunity, showCard],
  )

  const minimize = useCallback(() => setPanelOpen(false), [])
  const closeHelp = useCallback(() => {
    stopHelpSpeech()
    setSpeakingText(null)
    setPanelOpen(false)
    setSession(emptySession())
    setFocusModule(null)
  }, [])

  // «Llévame»: va al destino EXACTO (pestaña, tema, formulario…), no solo a la portada del módulo. Cierra los menús abiertos, pide el destino a la pantalla, navega y COMPRUEBA en
  // pantalla que ha llegado (sin temporizadores de cortesía). Si no llega (cuenta sin acceso, pantalla que no carga), lo dice y vuelve a abrir la Ayuda; nunca finge haber llegado.
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const goTo = useCallback(
    (card: HelpCard) => {
      if (!card.go) return
      setPanelOpen(false)
      closeOpenMenus()
      const dest = card.go.dest
      const intent = dest ? requestDestination(dest) : null
      navigate(card.go.path, { replace: pathRef.current === card.go.path })
      if (!dest || !intent) return
      void waitForDestination(dest).then((r) => {
        clearDestination(intent)
        if (r === 'reached') {
          revealDestination(dest)
          return
        }
        setSession((s) => addPepaText(s, `No he podido llegar a «${card.title}». Puede que tu cuenta no tenga acceso a esa parte o que la pantalla aún se esté cargando. Prueba otra vez o búscalo en el menú.`))
        setPanelOpen(true)
      })
    },
    [navigate],
  )

  const canStartTour = useCallback((card: HelpCard) => Boolean(card.tour) && hasTour(card.tour) && canOfferActions(card, cardAccess(card, HELP_MODULE_BY_ID.get(card.module), ctxRef.current)), [])
  const startTourById = useCallback((tourId: string) => {
    if (!getTour(tourId)) return
    setPanelOpen(false)
    closeOpenMenus()
    stopHelpSpeech()
    setSpeakingText(null)
    setTourRun((n) => n + 1)
    setActiveTour(tourId)
  }, [])

  const startTour = useCallback(
    (card: HelpCard) => {
      if (!card.tour || !hasTour(card.tour)) {
        setSession((s) => addPepaText(s, 'Este recorrido todavía no está disponible. Puedes seguir los pasos de la ficha.'))
        return
      }
      startTourById(card.tour)
    },
    [startTourById],
  )

  // Fin de un tutorial: cierra su capa. Si era el recorrido de bienvenida, se recuerda que ya se ha visto (o que se ha dejado).
  const onTourClosed = useCallback((tourId: string, reason: 'completed' | 'exited') => {
    setActiveTour(null)
    if (tourId === 'bienvenida') setWelcomeState(reason === 'completed' ? 'done' : 'skipped')
  }, [])

  // Al salir de la app o cerrar sesión se para la voz. (La conversación es de React: desaparece sola al desmontar.)
  useEffect(() => () => stopHelpSpeech(), [])

  const api = useMemo<HelpApi>(
    () => ({
      ctx,
      ownerKnown: peekAppOwner(profile.id),
      voiceMode,
      setVoiceMode: (m) => {
        setHelpVoiceMode(m)
        setVoiceModeState(m)
        if (m === 'text') {
          stopHelpSpeech()
          setSpeakingText(null)
        }
      },
      panelOpen,
      session,
      currentModule: moduleForPath(location.pathname),
      focusModule,
      accessOf,
      accessOfCard,
      search,
      ask,
      showCard,
      openHelp,
      minimize,
      closeHelp,
      goTo,
      startTour,
      startTourById,
      activeTour,
      canStartTour,
      speak,
      stopSpeaking,
      speakingText,
      ensureCommunity,
    }),
    [ctx, profile.id, voiceMode, panelOpen, session, location.pathname, focusModule, accessOf, accessOfCard, search, ask, showCard, openHelp, minimize, closeHelp, goTo, startTour, startTourById, activeTour, canStartTour, speak, stopSpeaking, speakingText, ensureCommunity],
  )

  const runningTour = activeTour ? getTour(activeTour) : undefined
  const nextOptions: TourNextOption[] = (runningTour?.next ?? []).flatMap((cardId): TourNextOption[] => {
    const card = HELP_CARD_BY_ID.get(cardId)
    if (!card) return []
    const a = cardAccess(card, HELP_MODULE_BY_ID.get(card.module), ctx)
    if (a.status !== 'allowed') return []
    return card.tour && hasTour(card.tour) && card.tour !== runningTour?.id ? [{ kind: 'tour', id: card.tour, label: card.title }] : [{ kind: 'card', id: card.id, label: card.title }]
  })

  return (
    <HelpUiContext.Provider value={api}>
      {children}
      {/* Sugerencias discretas: bienvenida opcional (cuentas nuevas) y primera visita a un módulo. */}
      <HelpNudges />
      {runningTour && (
        <Suspense fallback={null}>
          <TourRunner
            key={`${runningTour.id}:${tourRun}`}
            tour={runningTour}
            voiceMode={voiceMode}
            nextOptions={nextOptions}
            onClose={(reason) => onTourClosed(runningTour.id, reason)}
            onPick={(o) => {
              if (o.kind === 'tour') startTourById(o.id)
              else openHelp({ cardId: o.id })
            }}
          />
        </Suspense>
      )}
    </HelpUiContext.Provider>
  )
}
