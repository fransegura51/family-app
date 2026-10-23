// «Mi Camino» (Pequeños Grandes → Puntos y recompensas, modo Camino) — integración del prototipo
// aprobado V32 en la app real. El dibujo y las animaciones (tres mundos: Pueblo de las Golosinas, Reino
// Submarino y Planeta Espacial) son los del prototipo, trasladados sin rediseñar a ui/miCaminoEngine.js;
// este componente solo aporta lo que el prototipo no tenía: los miembros y sus puntos REALES, el
// selector de niño, las fichas educativas de los planetas y el ciclo de vida seguro en móvil (pausa
// cuando no se ve, limpieza de bucle y de listeners, movimiento reducido).
//
// Regla de oro: es de SOLO LECTURA. Recibe el total de puntos GANADOS de cada niño
// (memberLifetimePoints — nunca el saldo canjeable) y lo dibuja. No escribe nada, no crea ningún saldo
// y no resta puntos por verse: el recorrido nunca retrocede al canjear una recompensa.
import { useEffect, useMemo, useRef, useState } from 'react'
import { getMemberPhotoUrl } from '@/data/family'
import {
  MI_CAMINO_WORLD_POINTS,
  MI_CAMINO_WORLD_TAGS,
  MI_CAMINO_WORLD_TITLES,
  miCaminoFigureSlots,
  miCaminoPosition,
  miCaminoProgressText,
} from '@/domain/miCamino'
import { PLANET_FACTS, createMiCaminoEngine, type MiCaminoEngine } from '@/ui/miCaminoEngine'
import type { FamilyMember } from '@/domain/types'

export interface MiCaminoRunner {
  member: FamilyMember
  /** Total de puntos ganados alguna vez (memberLifetimePoints). */
  points: number
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Controles de prueba (+5, +150…) SOLO en desarrollo y con ?micaminoqa=1 en la dirección: en producción
// `import.meta.env.DEV` es false y todo este bloque desaparece. Nunca escriben nada en la base de datos:
// suman puntos de mentira únicamente en pantalla para ver los cruces de mundo y de vuelta.
function qaEnabled(): boolean {
  return import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('micaminoqa')
}

const PLANET_ORDER = ['Sol', 'Mercurio', 'Venus', 'Tierra', 'Marte', 'Júpiter', 'Saturno', 'Urano', 'Neptuno']

export function MiCamino({ runners }: { runners: MiCaminoRunner[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<MiCaminoEngine | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const photos = useRef<Record<string, { path: string; img: HTMLImageElement }>>({})
  const [photosVersion, setPhotosVersion] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(runners[0]?.member.id ?? null)
  const [planet, setPlanet] = useState<string | null>(null)
  const [qaBonus, setQaBonus] = useState<Record<string, number>>({})
  const qa = qaEnabled()

  // Puntos que se dibujan: los reales (más, solo en la simulación de desarrollo, un extra de pantalla).
  const shown = useMemo(
    () => runners.map((r) => ({ member: r.member, points: r.points + (qa ? qaBonus[r.member.id] ?? 0 : 0) })),
    [runners, qa, qaBonus],
  )
  const selected = shown.find((r) => r.member.id === selectedId) ?? shown[0] ?? null
  const selectedKey = selected?.member.id ?? null
  const [shownWorld, setShownWorld] = useState<number>(() => miCaminoPosition(selected?.points ?? 0).world)

  // --- motor: se crea una vez por montaje y se limpia del todo al salir --------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduced = prefersReducedMotion()
    const engine = createMiCaminoEngine(
      canvas,
      {
        onWorldShown: setShownWorld,
        onPlanet: setPlanet,
        figureSlots: miCaminoFigureSlots,
        onError: () => {},
      },
      reduced,
    )
    engineRef.current = engine

    // Solo anima mientras se ve: fuera de pantalla o con la app en segundo plano el bucle se para.
    let inView = true
    function sync() {
      if (inView && !document.hidden) engine.start()
      else engine.stop()
    }
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          inView = entries.some((e) => e.isIntersecting)
          sync()
        })
      : null
    observer?.observe(canvas)
    document.addEventListener('visibilitychange', sync)
    sync()

    return () => {
      document.removeEventListener('visibilitychange', sync)
      observer?.disconnect()
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  // --- fotos reales: una por miembro, cargada una vez (misma URL firmada que <MemberAvatar>) ------------
  const photoKey = runners.map((r) => `${r.member.id}:${r.member.photoPath ?? ''}`).join('|')
  useEffect(() => {
    let cancelled = false
    for (const { member } of runners) {
      const path = member.photoPath
      const cached = photos.current[member.id]
      if (!path) {
        if (cached) {
          delete photos.current[member.id]
          setPhotosVersion((v) => v + 1)
        }
        continue
      }
      if (cached?.path === path) continue
      getMemberPhotoUrl(path)
        .then((url) => {
          if (cancelled) return
          const img = new Image()
          img.onload = () => {
            if (cancelled) return
            photos.current[member.id] = { path, img }
            setPhotosVersion((v) => v + 1)
          }
          img.src = url
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey])

  // --- datos reales -> motor ---------------------------------------------------------------------------
  const dataKey = shown.map((r) => `${r.member.id}|${r.member.name}|${r.member.color}|${r.points}`).join(';')
  useEffect(() => {
    engineRef.current?.setKids(
      shown.map((r) => ({
        id: r.member.id,
        name: r.member.name,
        letter: r.member.name.charAt(0).toUpperCase() || '?',
        color: r.member.color,
        points: r.points,
        photo: photos.current[r.member.id]?.img ?? null,
      })),
      selectedKey,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, selectedKey, photosVersion])

  // --- ficha educativa del planeta: Escape cierra, el foco va al botón de cerrar ------------------------
  useEffect(() => {
    if (!planet) return
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPlanet(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [planet])

  if (!selected) return null
  const selectedPosition = miCaminoPosition(selected.points)
  const facts = planet ? PLANET_FACTS[planet] : undefined

  return (
    <section className="mi-camino" aria-label="Mi Camino">
      <div className="mi-camino-top">
        <strong>{MI_CAMINO_WORLD_TITLES[shownWorld] ?? MI_CAMINO_WORLD_TITLES[0]}</strong>
        <span className="mi-camino-tag">{MI_CAMINO_WORLD_TAGS[shownWorld] ?? MI_CAMINO_WORLD_TAGS[0]}</span>
      </div>
      <canvas
        ref={canvasRef}
        className="mi-camino-canvas"
        role="img"
        aria-label={`Camino de ${selected.member.name}: ${selected.points} puntos, vuelta ${selectedPosition.lap}, ${MI_CAMINO_WORLD_TITLES[selectedPosition.world]}`}
      />
      {shownWorld === 2 && (
        <div className="mi-camino-planets visually-hidden-until-focus" role="group" aria-label="Curiosidades del sistema solar">
          {PLANET_ORDER.map((name) => (
            <button key={name} type="button" onClick={() => setPlanet(name)}>
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="mi-camino-stats">
        {shown.map((r) => {
          const pos = miCaminoPosition(r.points)
          const isSelected = r.member.id === selected.member.id
          return (
            <button
              key={r.member.id}
              type="button"
              className={'mi-camino-stat' + (isSelected ? ' mi-camino-stat-selected' : '')}
              aria-pressed={isSelected}
              title={`Ver el camino de ${r.member.name}`}
              onClick={() => setSelectedId(r.member.id)}
            >
              <strong>
                <span className="mi-camino-dot" style={{ background: r.member.color }} aria-hidden="true" /> {r.member.name} · {pos.total} puntos
              </strong>
              <small>{miCaminoProgressText(r.points)}</small>
              <span className="mi-camino-bar" aria-hidden="true">
                <span style={{ width: `${(pos.pointsInWorld / MI_CAMINO_WORLD_POINTS) * 100}%` }} />
              </span>
            </button>
          )
        })}
      </div>

      {qa && (
        <div className="mi-camino-qa">
          <strong>Prueba (solo desarrollo, no guarda nada)</strong>
          <div>
            {[5, 50, 150].map((n) => (
              <button key={n} type="button" onClick={() => setQaBonus((b) => ({ ...b, [selected.member.id]: (b[selected.member.id] ?? 0) + n }))}>
                +{n}
              </button>
            ))}
            <button type="button" onClick={() => setQaBonus({})}>
              Quitar simulado
            </button>
          </div>
        </div>
      )}

      {planet && facts && (
        <div className="mi-camino-planet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPlanet(null) }}>
          <div className="mi-camino-planet-card" role="dialog" aria-modal="true" aria-label="Curiosidades del planeta">
            <button ref={closeRef} type="button" className="mi-camino-planet-close" aria-label="Cerrar" onClick={() => setPlanet(null)}>
              ×
            </button>
            <div className="mi-camino-planet-kicker">EXPLORA EL SISTEMA SOLAR</div>
            <h2>{planet}</h2>
            <ul>
              {facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p>Toca fuera o pulsa × para volver al viaje.</p>
          </div>
        </div>
      )}
    </section>
  )
}
