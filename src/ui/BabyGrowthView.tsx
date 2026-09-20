import { useState } from 'react'
import { tone } from '@/domain/colors'
import {
  ageInMonths,
  CURVE_PERCENTILES,
  curvePoints,
  formatPercentile,
  GROWTH_MEASURE_LABEL,
  MAX_GROWTH_MONTHS,
  percentileBand,
  percentileFor,
  type GrowthMeasure,
  type PercentileBand,
} from '@/domain/growth'
import type { BodyMeasurement, FamilyMember } from '@/domain/types'
import { ConfirmIconButton } from '@/ui/ConfirmButton'

// Percentiles de crecimiento con los patrones de la OMS: peso, altura y
// perímetro cefálico de un bebé (o niño pequeño, hasta los 5 años) con su
// percentil exacto, una gráfica con las curvas de referencia y una tabla
// de todas las medidas. Petición real: "para bebés quiero que calcule los
// percentiles según las definiciones actuales y los enseñe en una tabla al
// estilo de [la web de referencia], pero mejor".

export const BAND_COLOR: Record<PercentileBand, string> = {
  'muy-bajo': '#e03131',
  bajo: '#f08c00',
  normal: '#2f9e44',
  alto: '#f08c00',
  'muy-alto': '#e03131',
}

const MEASURE_FIELD: Record<GrowthMeasure, keyof Pick<BodyMeasurement, 'weightKg' | 'heightCm' | 'headCm'>> = {
  weight: 'weightKg',
  length: 'heightCm',
  head: 'headCm',
}

const MEASURE_TABS: { key: GrowthMeasure; icon: string }[] = [
  { key: 'weight', icon: '⚖️' },
  { key: 'length', icon: '📏' },
  { key: 'head', icon: '👶' },
]

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatAge(months: number): string {
  if (months < 1) {
    const d = Math.round(months * 30.4375)
    return `${d} ${d === 1 ? 'día' : 'días'}`
  }
  if (months < 24) {
    const m = Math.floor(months)
    const days = Math.round((months - m) * 30.4375)
    return days > 0 && m < 6 ? `${m} ${m === 1 ? 'mes' : 'meses'} y ${days} ${days === 1 ? 'día' : 'días'}` : `${m} ${m === 1 ? 'mes' : 'meses'}`
  }
  const years = Math.floor(months / 12)
  const rest = Math.floor(months - years * 12)
  return rest > 0 ? `${years} años y ${rest} ${rest === 1 ? 'mes' : 'meses'}` : `${years} años`
}

const fmtNum = (v: number, digits = 1) => v.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const fmtDate = (d: string) => new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

interface PointInfo {
  id: string
  date: string
  months: number
  value: number
  percentile: number
}

function pointsFor(measure: GrowthMeasure, member: FamilyMember, measurements: BodyMeasurement[]): PointInfo[] {
  if (!member.birthDate || !member.sex) return []
  const sex = member.sex
  const field = MEASURE_FIELD[measure]
  const out: PointInfo[] = []
  for (const m of measurements) {
    const value = m[field]
    if (value == null) continue
    const months = ageInMonths(member.birthDate, m.measuredDate)
    const percentile = percentileFor(measure, sex, months, Number(value))
    if (percentile == null) continue
    out.push({ id: m.id, date: m.measuredDate, months, value: Number(value), percentile })
  }
  return out
}

// Barra 0-100 con las zonas de percentil y un marcador donde está el niño.
function PercentileGauge({ percentile }: { percentile: number }) {
  const band = percentileBand(percentile)
  const left = Math.min(98, Math.max(2, percentile))
  return (
    <div style={{ position: 'relative', height: 30, margin: '14px 0 4px' }} aria-hidden="true">
      <div style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
        {[
          [3, '#ffc9c9'],
          [12, '#ffe8cc'],
          [70, '#d3f9d8'],
          [12, '#ffe8cc'],
          [3, '#ffc9c9'],
        ].map(([w, c], i) => (
          <div key={i} style={{ width: `${w}%`, background: c as string }} />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: `${left}%`,
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop: `11px solid ${BAND_COLOR[band.band]}`,
        }}
      />
    </div>
  )
}

interface ChartProps {
  measure: GrowthMeasure
  member: FamilyMember
  points: PointInfo[]
  maxMonth: number
  selectedId: string | null
  onSelect: (id: string) => void
}

function GrowthChart({ measure, member, points, maxMonth, selectedId, onSelect }: ChartProps) {
  const sex = member.sex!
  const width = 340
  const height = 210
  const padL = 34
  const padR = 26
  const padT = 10
  const padB = 28
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const curves = CURVE_PERCENTILES.map((c) => ({ ...c, pts: curvePoints(measure, sex, c.z, 0, maxMonth) }))
  const all = [...curves.flatMap((c) => c.pts.map((p) => p.value)), ...points.map((p) => p.value)]
  const rawMin = Math.min(...all)
  const rawMax = Math.max(...all)
  const step = rawMax - rawMin > 60 ? 20 : rawMax - rawMin > 25 ? 10 : rawMax - rawMin > 14 ? 5 : 2
  const yMin = Math.floor(rawMin / step) * step
  const yMax = Math.ceil(rawMax / step) * step
  const xAt = (m: number) => padL + (m / maxMonth) * plotW
  const yAt = (v: number) => padT + plotH * (1 - (v - yMin) / (yMax - yMin || 1))

  const yTicks: number[] = []
  for (let v = yMin; v <= yMax + 0.001; v += step) yTicks.push(v)
  const xStep = maxMonth <= 24 ? 3 : maxMonth <= 36 ? 6 : 12
  const xTicks: number[] = []
  for (let m = 0; m <= maxMonth; m += xStep) xTicks.push(m)

  const line = (pts: { month: number; value: number }[]) => pts.map((p) => `${xAt(p.month).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ')
  const p3 = curves.find((c) => c.percentile === 3)!.pts
  const p97 = curves.find((c) => c.percentile === 97)!.pts
  const bandPoly = [...p97.map((p) => `${xAt(p.month).toFixed(1)},${yAt(p.value).toFixed(1)}`), ...[...p3].reverse().map((p) => `${xAt(p.month).toFixed(1)},${yAt(p.value).toFixed(1)}`)].join(' ')
  const childColor = '#364fc7'

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`Curva de ${GROWTH_MEASURE_LABEL[measure].name.toLowerCase()} con percentiles de la OMS`}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={padL} y1={yAt(v)} x2={width - padR} y2={yAt(v)} stroke="#e9ecef" strokeWidth={1} />
          <text x={padL - 5} y={yAt(v) + 3} textAnchor="end" fontSize="9" fill="#868e96">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((m) => (
        <text key={m} x={xAt(m)} y={height - 12} textAnchor="middle" fontSize="9" fill="#868e96">
          {m}
        </text>
      ))}
      <text x={padL + plotW / 2} y={height - 1} textAnchor="middle" fontSize="8.5" fill="#868e96">
        meses
      </text>
      <polygon points={bandPoly} fill={tone(150, 50, 88, 'chart')} fillOpacity={0.55} />
      {curves.map((c) => {
        const main = c.percentile === 50
        const edge = c.percentile === 3 || c.percentile === 97
        return (
          <g key={c.percentile}>
            <polyline
              points={line(c.pts)}
              fill="none"
              stroke={main ? '#2f9e44' : '#d4a72c'}
              strokeWidth={main ? 1.6 : edge ? 1.3 : 1}
              strokeDasharray={main || edge ? undefined : '3 3'}
            />
            <text x={width - padR + 3} y={yAt(c.pts[c.pts.length - 1].value) + 3} fontSize="8.5" fill={main ? '#2f9e44' : '#a07d10'}>
              P{c.percentile}
            </text>
          </g>
        )
      })}
      {points.length > 1 && <polyline points={points.map((p) => `${xAt(p.months).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ')} fill="none" stroke={childColor} strokeWidth={2} />}
      {points.map((p) => {
        const selected = p.id === selectedId
        return (
          <g key={p.id} onClick={() => onSelect(p.id)} style={{ cursor: 'pointer' }}>
            <circle cx={xAt(p.months)} cy={yAt(p.value)} r={14} fill="transparent" />
            <circle cx={xAt(p.months)} cy={yAt(p.value)} r={selected ? 6 : 4.2} fill={childColor} stroke="#fff" strokeWidth={1.5} />
          </g>
        )
      })}
    </svg>
  )
}

export function BabyGrowthView({
  member,
  measurements,
  onDeleteMeasurement,
}: {
  member: FamilyMember
  measurements: BodyMeasurement[]
  onDeleteMeasurement: (id: string) => void
}) {
  const [measure, setMeasure] = useState<GrowthMeasure>('weight')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!member.birthDate || !member.sex) {
    return (
      <div className="card">
        <strong>📈 Percentiles de crecimiento</strong>
        <p className="muted" style={{ marginTop: 6 }}>
          Para calcular los percentiles con las curvas de la OMS hace falta la <strong>fecha de nacimiento</strong> y el <strong>sexo</strong> de{' '}
          {member.name}. Añádelos en su ficha (pestaña Miembros → ⋯ → Editar) y aquí aparecerán las gráficas.
        </p>
      </div>
    )
  }

  const today = todayStr()
  const ageNow = ageInMonths(member.birthDate, today)
  const points = pointsFor(measure, member, measurements)
  const latest = points[points.length - 1]
  const selected = points.find((p) => p.id === selectedId) ?? latest
  const lastMonth = Math.max(ageNow, ...points.map((p) => p.months))
  const maxMonth = lastMonth <= 21 ? 24 : lastMonth <= 33 ? 36 : MAX_GROWTH_MONTHS
  const label = GROWTH_MEASURE_LABEL[measure]
  const band = selected ? percentileBand(selected.percentile) : null
  const outOfRange = ageNow > MAX_GROWTH_MONTHS

  const rows = [...measurements]
    .filter((m) => m.weightKg != null || m.heightCm != null || m.headCm != null)
    .sort((a, b) => b.measuredDate.localeCompare(a.measuredDate))

  function cell(m: BodyMeasurement, measureKey: GrowthMeasure) {
    const v = m[MEASURE_FIELD[measureKey]]
    if (v == null) return <span className="muted">—</span>
    const months = ageInMonths(member.birthDate!, m.measuredDate)
    const p = percentileFor(measureKey, member.sex!, months, Number(v))
    const b = p == null ? null : percentileBand(p)
    return (
      <span>
        <strong>{fmtNum(Number(v), measureKey === 'weight' ? 2 : 1)}</strong> {GROWTH_MEASURE_LABEL[measureKey].unit}
        {p != null && b && (
          <span className="percentile-pill" style={{ background: `${BAND_COLOR[b.band]}22`, color: BAND_COLOR[b.band] }}>
            P{formatPercentile(p)}
          </span>
        )}
      </span>
    )
  }

  return (
    <div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="segmented" role="tablist" style={{ margin: 10 }}>
          {MEASURE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={measure === t.key}
              className={measure === t.key ? 'segmented-active' : ''}
              onClick={() => {
                setMeasure(t.key)
                setSelectedId(null)
              }}
            >
              {t.icon} {GROWTH_MEASURE_LABEL[t.key].name === 'Perímetro cefálico' ? 'Cabeza' : GROWTH_MEASURE_LABEL[t.key].name}
            </button>
          ))}
        </div>

        <div style={{ padding: '0 14px 14px' }}>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
            {member.name} tiene <strong>{formatAge(ageNow)}</strong>
            {measure === 'head' && ' · perímetro cefálico'}
          </p>

          {outOfRange && <p className="muted">Las curvas de la OMS llegan hasta los 5 años; a partir de ahí se usan otras tablas.</p>}

          {!selected || !band ? (
            <p className="muted">Todavía no hay {label.name.toLowerCase()} registrado. Añade una medida abajo y verás su percentil.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {selected.id === latest.id ? 'Última medida' : 'Medida seleccionada'} · {fmtDate(selected.date)}
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
                    {fmtNum(selected.value, measure === 'weight' ? 2 : 1)} <span style={{ fontSize: 16, fontWeight: 600 }}>{label.unit}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Percentil
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, color: BAND_COLOR[band.band] }}>{formatPercentile(selected.percentile)}</div>
                </div>
              </div>
              <PercentileGauge percentile={selected.percentile} />
              <p style={{ margin: '4px 0 0', fontSize: 14 }}>
                <strong style={{ color: BAND_COLOR[band.band] }}>{band.label}.</strong> {band.text}
              </p>
            </>
          )}

          <div style={{ marginTop: 10 }}>
            <GrowthChart measure={measure} member={member} points={points} maxMonth={maxMonth} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            <p className="muted" style={{ fontSize: 11, margin: '2px 0 0' }}>
              Curvas de la OMS (P3 a P97) — toca un punto para ver esa medida. Orientativo: consulta siempre con el pediatra.
            </p>
          </div>
        </div>
      </div>

      <h2 className="section-title" style={{ marginTop: 16 }}>
        Historial de medidas
      </h2>
      {rows.length === 0 ? (
        <p className="muted">Todavía no hay medidas registradas.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="growth-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Peso</th>
                <th>Altura</th>
                <th>Cabeza</th>
                <th aria-label="Borrar" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{fmtDate(m.measuredDate)}</strong>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {formatAge(ageInMonths(member.birthDate!, m.measuredDate))}
                    </div>
                  </td>
                  <td>{cell(m, 'weight')}</td>
                  <td>{cell(m, 'length')}</td>
                  <td>{cell(m, 'head')}</td>
                  <td>
                    <ConfirmIconButton icon="✕" className="link-button" ariaLabel="Borrar medida" onConfirm={() => onDeleteMeasurement(m.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
