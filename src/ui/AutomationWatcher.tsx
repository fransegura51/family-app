import { useEffect, useRef } from 'react'
import { listAutomationRules, listMemberLocations, listPlaces } from '@/data/location'
import { distanceMeters } from '@/domain/geo'
import { showNotification } from '@/services/notifications'

const CHECK_INTERVAL_MS = 30_000
const NEAR_STATE_KEY = 'family-app:automation-near-state'
const FIRED_TODAY_KEY = 'family-app:automation-fired-today'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage no disponible: la regla podría repetirse una vez, no es grave.
  }
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Motor de automatizaciones (Skill 24): evalúa reglas de llegada/salida y
// hora diaria contra los datos ya sincronizados (member_locations,
// location_places) — no depende del sensor GPS de este dispositivo en
// concreto, solo de lo que la familia haya compartido.
export function AutomationWatcher() {
  const nearState = useRef<Record<string, boolean>>(loadJson(NEAR_STATE_KEY, {}))
  const firedToday = useRef<Record<string, string>>(loadJson(FIRED_TODAY_KEY, {}))

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const [rules, locations, places] = await Promise.all([
          listAutomationRules(),
          listMemberLocations(),
          listPlaces(),
        ])
        if (cancelled) return
        const now = new Date()

        for (const rule of rules) {
          if (!rule.active) continue
          if (rule.mutedUntil && new Date(rule.mutedUntil) > now) continue

          if (rule.triggerType === 'hora_diaria' && rule.timeOfDay) {
            const [h, m] = rule.timeOfDay.split(':').map(Number)
            const target = new Date(now)
            target.setHours(h, m, 0, 0)
            const key = `${rule.id}`
            if (now >= target && firedToday.current[key] !== todayStr()) {
              showNotification(rule.name, rule.message)
              firedToday.current[key] = todayStr()
              saveJson(FIRED_TODAY_KEY, firedToday.current)
            }
            continue
          }

          if ((rule.triggerType === 'llegada' || rule.triggerType === 'salida') && rule.placeId) {
            const place = places.find((p) => p.id === rule.placeId)
            if (!place) continue
            const relevant = rule.memberId
              ? locations.filter((l) => l.memberId === rule.memberId)
              : locations

            for (const loc of relevant) {
              const dist = distanceMeters(loc.latitude, loc.longitude, place.latitude, place.longitude)
              const near = dist <= place.radiusM
              const key = `${rule.id}:${loc.memberId}`
              const wasNear = nearState.current[key] ?? false

              if (rule.triggerType === 'llegada' && near && !wasNear) {
                showNotification(rule.name, rule.message)
              } else if (rule.triggerType === 'salida' && !near && wasNear) {
                showNotification(rule.name, rule.message)
              }

              nearState.current[key] = near
            }
            saveJson(NEAR_STATE_KEY, nearState.current)
          }
        }
      } catch {
        // Fallo puntual de red: no interrumpe el resto de la app.
      }
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return null
}
