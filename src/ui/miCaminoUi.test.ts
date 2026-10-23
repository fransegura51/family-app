import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// «Mi Camino» (PEPA-MICAMINO) — cableado en la app real: qué modo enseña qué, que el componente es de
// SOLO LECTURA (nunca toca la base de datos ni crea un saldo), que lo mide con los puntos GANADOS y que
// limpia todo al salir. El comportamiento del dibujo se prueba en miCaminoEngine.test.ts y la lógica de
// mundos/vueltas en domain/miCamino.test.ts.
const files = import.meta.glob(['/src/ui/RewardsScreen.tsx', '/src/ui/MiCamino.tsx', '/src/ui/miCaminoEngine.js'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const REWARDS = files['/src/ui/RewardsScreen.tsx']
const COMPONENT = files['/src/ui/MiCamino.tsx']
const ENGINE = files['/src/ui/miCaminoEngine.js']
// Vite no devuelve el CSS en bruto con ?raw, así que la hoja de estilos se lee directamente del disco.
const CSS = readFileSync('src/ui/styles.css', 'utf8')

describe('Mi Camino — dónde aparece', () => {
  it('el modo Camino enseña Mi Camino y la Carrera conserva la pista V6 intacta', () => {
    expect(REWARDS).toContain("mode === 'camino' ? <MiCamino runners={raceRunners} /> : <RaceTrack runners={raceRunners} />")
    expect(REWARDS).toContain("import { MiCamino } from '@/ui/MiCamino'")
    expect(REWARDS).toContain("import { RaceTrack } from '@/ui/RaceTrack'")
  })

  it('el progreso de cada niño sigue siendo memberLifetimePoints (puntos GANADOS), nunca el saldo', () => {
    expect(REWARDS).toContain("const points = mode === 'camino' ? memberLifetimePoints(m.id, completions, grants) : (standing?.points ?? 0)")
    expect(COMPONENT).not.toContain('memberPointsBalance')
    expect(COMPONENT).not.toContain('redemptions')
  })

  it('la ficha de cada niño (Puntos disponibles, Catálogo, Historial, Trofeos) no se ha tocado', () => {
    expect(REWARDS).toContain('<span className="points-badge">⭐ Puntos disponibles: {balance}</span>')
    expect(REWARDS).toContain('<MemberRewardsPanel')
  })
})

describe('Mi Camino — es de solo lectura y no crea ningún saldo', () => {
  it('el componente y el motor no importan ninguna función de escritura de datos', () => {
    expect(COMPONENT).not.toMatch(/from '@\/data\/(?!family')/)
    expect(COMPONENT).not.toMatch(/givePoints|requestRewardRedemption|createReward|updateReward|supabase/)
    expect(ENGINE).not.toMatch(/supabase|fetch\(|localStorage|indexedDB/)
  })

  it('los botones de demostración del prototipo no se trasladaron: solo existe el modo de pruebas de desarrollo', () => {
    for (const demo of ['Eric +5', 'Fernando +5', 'Mismos puntos', 'Cruzar portal', 'Entrar en Espacio', 'Eric: 145 puntos']) {
      expect(COMPONENT).not.toContain(demo)
    }
    expect(COMPONENT).toContain("import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('micaminoqa')")
    expect(COMPONENT).toContain('{qa && (')
  })
})

describe('Mi Camino — ciclo de vida seguro en móvil', () => {
  it('se pausa cuando no se ve (IntersectionObserver y visibilitychange) y se limpia todo al desmontar', () => {
    expect(COMPONENT).toContain('new IntersectionObserver')
    expect(COMPONENT).toContain("document.addEventListener('visibilitychange', sync)")
    expect(COMPONENT).toContain("document.removeEventListener('visibilitychange', sync)")
    expect(COMPONENT).toContain('observer?.disconnect()')
    expect(COMPONENT).toContain('engine.destroy()')
  })

  it('respeta prefers-reduced-motion', () => {
    expect(COMPONENT).toContain('(prefers-reduced-motion: reduce)')
    expect(COMPONENT).toContain('createMiCaminoEngine(')
  })

  it('el motor limita el pixel ratio, cancela su animación y quita su listener', () => {
    expect(ENGINE).toContain('Math.min(window.devicePixelRatio||1,2)')
    expect(ENGINE).toContain('cancelAnimationFrame(raf)')
    expect(ENGINE).toContain("cv.removeEventListener('click',onCanvasClick)")
  })

  it('no inyecta HTML sin control: las fichas de los planetas se pintan como texto de React', () => {
    expect(COMPONENT).not.toContain('dangerouslySetInnerHTML')
    expect(ENGINE).not.toContain('innerHTML')
    expect(COMPONENT).toContain('<li key={f}>{f}</li>')
  })
})

describe('Mi Camino — accesibilidad', () => {
  it('lienzo con descripción, niños seleccionables con aria-pressed y ficha como diálogo que se cierra con Escape', () => {
    expect(COMPONENT).toContain('role="img"')
    expect(COMPONENT).toContain('aria-pressed={isSelected}')
    expect(COMPONENT).toContain('role="dialog" aria-modal="true"')
    expect(COMPONENT).toContain("e.key === 'Escape'")
  })

  it('los planetas también se pueden abrir con teclado o lector de pantalla', () => {
    expect(COMPONENT).toContain('aria-label="Curiosidades del sistema solar"')
    expect(CSS).toContain('.visually-hidden-until-focus:not(:focus-within)')
  })
})

describe('Mi Camino — el arte aprobado se conserva', () => {
  it('conserva los tres mundos, el portal de regreso a golosinas, las transiciones y la pista de interacción', () => {
    for (const marker of ['REINO SUBMARINO', 'PLANETA ESPACIAL', '¡NUEVO MUNDO DESCUBIERTO!', '¡VUELTA AL MUNDO DE LAS CHUCHES!', 'Toca los planetas para descubrir sus secretos', 'function underwater()', 'function spaceScene()', 'function scenery(']) {
      expect(ENGINE, marker).toContain(marker)
    }
  })
})
