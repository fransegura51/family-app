import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { sectionKeyForPath } from '@/domain/usageSections'
import { recordSection, startUsageTracking } from '@/services/usageTracker'

// Componente sin UI: apunta cada apertura de la app y cada pantalla en la que se entra (ver services/usageTracker.ts).
export function UsageTracker() {
  const location = useLocation()
  const last = useRef<string | null>(null)

  useEffect(() => startUsageTracking(), [])

  useEffect(() => {
    const key = sectionKeyForPath(location.pathname)
    if (key && key !== last.current) recordSection(key)
    last.current = key
  }, [location.pathname])

  return null
}
