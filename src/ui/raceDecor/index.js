// Capa de decoración mensual de la Carrera: UN solo motor para los doce meses.
//
// Contrato con la Carrera (lo único que la Carrera real necesita para usarla):
//   · RaceTrack recibe un `decorator` opcional y llama, en cada fotograma, a:
//       drawHills(ctx, env)   tras pintar las colinas, ANTES de los árboles (fondo lejano)
//       drawScenery(ctx, env) al acabar el paisaje (velos de cielo, nieve sobre las flores…)
//       drawGround(ctx, env)  tras la pista y antes de los animales del paisaje
//       drawBack(ctx, env)    justo DETRÁS de los corredores
//       drawFront(ctx, env)   justo detrás de los nombres, solo en zonas sin corredores
//       fauna(ctx, env, tipo, datos)  para sustituir un animal del paisaje (true = ya lo he dibujado)
//   · env = { W, H, t, dt, reduced, ground, laneTop(x), laneMid(x), laneBottom(x), camera, offset, anchors, markers,
//             runnerCount }: tamaño, tiempo, las líneas del paisaje, dónde hay árboles y dónde están las etiquetas
//     de distancia. La decoración nunca lee puntos, miembros, recompensas ni datos de la familia.
//   · Cambiar de mes (setMonth) descarta por completo el estado del mes anterior: no se acumula nada.
import { setCtx } from './toolkit.js'
import { MONTH_INFO, createMonth } from './months/index.js'

export { MONTH_INFO }

// Fecha local de España (Europe/Madrid): { month: 0-11, day: 1-31 }. En producción decide la decoración; el prototipo la deja elegir.
export function spainDate(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', month: 'numeric', day: 'numeric' }).formatToParts(date)
    const m = Number(parts.find((p) => p.type === 'month')?.value)
    const d = Number(parts.find((p) => p.type === 'day')?.value)
    if (m >= 1 && m <= 12 && d >= 1) return { month: m - 1, day: d }
  } catch {
    // sin Intl con zona horaria: se usa la hora local del dispositivo
  }
  return { month: date.getMonth(), day: date.getDate() }
}
export const currentMonthInSpain = (date = new Date()) => spainDate(date).month
// Enero tiene dos aspectos: del 1 al 6, los Reyes Magos; del 7 al 31, niños jugando en la nieve.
export function januaryVariantInSpain(date = new Date()) {
  const { month, day } = spainDate(date)
  return month === 0 && day <= 6 ? 'reyes' : 'nieve'
}

export function createRaceDecorator({ month = currentMonthInSpain(), variant = januaryVariantInSpain(), enabled = true } = {}) {
  let current = month
  let currentVariant = variant
  let on = enabled
  let paused = false
  let impl = null
  let lastError = null
  let clock = 0

  function ensure() {
    if (!impl) impl = createMonth(current, currentVariant)
    return impl
  }
  function step(env) {
    const dt = env.reduced ? 0 : Math.min(0.06, env.dt || 0)
    // Una sola actualización por fotograma (el primer gancho de dibujo que se llame la hace).
    if (env.__decorStepped) return
    env.__decorStepped = true
    clock += dt
    ensure().update(dt, env)
  }
  // Ejecuta un gancho protegido: un error en la decoración nunca rompe la Carrera.
  function run(name, ctx, env, ...extra) {
    if (!on) return false
    ctx.save()
    try {
      setCtx(ctx)
      step(env)
      const fn = ensure()[name]
      return fn ? fn(ctx, env, ...extra) : false
    } catch (e) {
      lastError = e
      console.error('Decoración mensual (' + name + '):', e)
      return false
    } finally {
      ctx.restore()
    }
  }
  return {
    setMonth(m, v) {
      const nextVariant = v ?? currentVariant
      if (m === current && nextVariant === currentVariant && impl) return
      current = m
      currentVariant = nextVariant
      impl?.reset?.()
      impl = null // se vuelve a crear, limpio, en el siguiente fotograma
    },
    getMonth: () => current,
    getVariant: () => currentVariant,
    setEnabled(v) {
      on = !!v
    },
    isEnabled: () => on,
    setPaused(v) {
      paused = !!v
    },
    isPaused: () => paused,
    frozen: () => paused,
    getError: () => lastError,
    debugClock: () => clock,
    drawHills(ctx, env) {
      run('hills', ctx, env)
    },
    drawScenery(ctx, env) {
      run('scenery', ctx, env)
    },
    drawGround(ctx, env) {
      run('ground', ctx, env)
    },
    fauna(ctx, env, type, f) {
      return run('fauna', ctx, env, type, f) === true
    },
    drawBack(ctx, env) {
      if (!on) return
      try {
        setCtx(ctx)
        step(env)
        ctx.save()
        // Garantía dura: nada de la decoración puede pintar encima de las etiquetas de distancia de la pista (los números
        // de posición). Se recorta cada etiqueta del área de dibujo (relleno par/impar): por mucho que cambie el arte, una
        // hoja, un charco o una sombrilla pasan «por detrás» de los números, nunca por encima.
        ctx.beginPath()
        ctx.rect(0, 0, env.W, env.H)
        for (const m of env.markers || []) ctx.rect(m.x - m.w / 2 - 1, m.y - 1, m.w + 2, m.h + 2)
        ctx.clip('evenodd')
        ensure().back(ctx, env)
        ctx.restore()
      } catch (e) {
        lastError = e
        console.error('Decoración mensual:', e)
      }
    },
    drawFront(ctx, env) {
      if (!on) return
      try {
        setCtx(ctx)
        ctx.save()
        ensure().front(ctx, env)
        ctx.restore()
      } catch (e) {
        lastError = e
        console.error('Decoración mensual (delante):', e)
      }
    },
  }
}
