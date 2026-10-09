import { useEffect, useState } from 'react'
import { listAppOwnerFamilies, listAppUsageActivity, type OwnerFamilyRow } from '@/data/appUsageActivity'
import type { AppUsageRow } from '@/data/appUsage'
import { USAGE_SECTIONS } from '@/domain/usageSections'
import { buildAccountActivity, rankOverall, type ActivityRow } from '@/domain/usageActivity'

const DAYS = 30

function dayLabel(day: string | null): string {
  if (!day) return 'sin actividad registrada'
  const days = Math.round((Date.now() - new Date(`${day}T12:00:00`).getTime()) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

// Panel de propietaria: cuánto usa cada cuenta la app (veces que la abre y pantallas, sin ver ningún dato) y qué pantallas se usan más y
// menos en total. El registro empezó con la migración 0226: lo anterior no se puede reconstruir.
export function AppActivityPanel({ accounts }: { accounts: AppUsageRow[] }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null)
  const [families, setFamilies] = useState<OwnerFamilyRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listAppUsageActivity(DAYS), listAppOwnerFamilies()])
      .then(([r, f]) => {
        setRows(r)
        setFamilies(f)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!rows) return <p className="muted">Cargando actividad…</p>

  const lines = buildAccountActivity(accounts, rows)
  const overall = rankOverall(rows, Object.keys(USAGE_SECTIONS))
  const maxHits = Math.max(1, ...overall.map((s) => s.hits))
  const activeAccounts = lines.filter((l) => !l.inactive).length

  return (
    <div>
      <h2 className="section-title">📈 Actividad de cada cuenta (últimos {DAYS} días)</h2>
      <p className="muted">
        {activeAccounts} de {lines.length} cuentas han abierto la app. Solo se cuentan aperturas y pantallas, nunca el contenido. El registro empezó con esta
        versión: lo de antes no se puede recuperar.
      </p>

      <div className="event-list">
        {lines.map((l) => {
          const family = families.find((f) => f.familyId === l.familyId)
          return (
            <details key={l.profileId} className="card" style={{ padding: 12 }}>
              <summary style={{ cursor: 'pointer' }}>
                <strong>{l.displayName}</strong> · {l.familyName}{' '}
                <span className="muted">
                  — {l.inactive ? '⚠️ no la ha abierto' : `${l.opens} ${l.opens === 1 ? 'apertura' : 'aperturas'} · ${l.daysActive} ${l.daysActive === 1 ? 'día' : 'días'}`}
                </span>
              </summary>
              <p className="muted" style={{ margin: '8px 0 4px', fontSize: 13 }}>
                Última actividad: {dayLabel(l.lastActiveDay)} · {l.hasPush ? '🔔 con notificaciones (instalada de verdad)' : '🔕 sin notificaciones'}
                {family ? ` · ${family.membersTotal} ${family.membersTotal === 1 ? 'persona apuntada' : 'personas apuntadas'} en su familia (${family.membersWithAccount} con cuenta)` : ''}
              </p>
              {l.sections.length === 0 ? (
                <p className="muted">Todavía no hay pantallas registradas.</p>
              ) : (
                <ol style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {l.sections.map((s) => (
                    <li key={s.key}>
                      {s.label} — <strong>{s.hits}</strong>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          )
        })}
      </div>

      <h2 className="section-title">🏆 Pantallas más y menos usadas (todas las cuentas)</h2>
      <div className="card">
        {overall.map((s) => (
          <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px', gap: 8, alignItems: 'center', margin: '6px 0' }}>
            <span>{s.label}</span>
            <div style={{ background: '#e8edf5', borderRadius: 6, height: 10 }}>
              <div style={{ width: `${(s.hits / maxHits) * 100}%`, background: s.hits === 0 ? 'transparent' : '#12a594', height: 10, borderRadius: 6 }} />
            </div>
            <span className="muted" style={{ fontSize: 12, textAlign: 'right' }}>
              {s.hits} · {s.accounts} {s.accounts === 1 ? 'cuenta' : 'cuentas'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
