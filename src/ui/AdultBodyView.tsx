import { ReactNode, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { updateMemberWeightGoal } from '@/data/family'
import { bmi, bmiBand, changeOverDays, filterRange, goalProgress, RANGE_DAYS, type BmiBand, type RangeKey } from '@/domain/bodyStats'
import { errorMessage } from '@/domain/errorMessage'
import type { BodyMeasurement, BodyPhoto, FamilyMember } from '@/domain/types'
import { ConfirmIconButton } from '@/ui/ConfirmButton'

// Vista de adultos de Peso y medidas, con un diseño más profesional:
// peso actual con su tendencia, objetivo con barra de progreso, IMC con
// escala de color, gráfica de área con rango de fechas y valor exacto al
// tocar, medidas con su mini gráfica y fotos de antes / ahora.

const BAND_COLOR: Record<BmiBand, string> = { bajo: '#1c7ed6', normal: '#2f9e44', sobrepeso: '#f08c00', obesidad: '#e03131' }
const ACCENT = '#364fc7'

const fmt = (v: number, digits = 1) => v.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const fmtDate = (d: string) => new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtShort = (d: string) => new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Pt {
  id: string
  date: string
  value: number
}

// Gráfica de área con rejilla, objetivo punteado y, al tocar, una raya con el valor exacto que se apaga sola.
function AreaChart({ points, goal, unit }: { points: Pt[]; goal: number | null; unit: string }) {
  const width = 340
  const height = 200
  const padL = 36
  const padR = 10
  const padT = 12
  const padB = 24
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const [cursor, setCursor] = useState<{ idx: number; visible: boolean } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  if (points.length === 0) return <p className="muted">No hay medidas en este periodo.</p>

  const values = points.map((p) => p.value).concat(goal != null ? [goal] : [])
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const span = Math.max(rawMax - rawMin, 1)
  const yMin = rawMin - span * 0.15
  const yMax = rawMax + span * 0.15
  const t0 = new Date(points[0].date + 'T00:00:00Z').getTime()
  const t1 = new Date(points[points.length - 1].date + 'T00:00:00Z').getTime()
  const xAt = (date: string) => {
    if (t1 === t0) return padL + plotW / 2
    return padL + ((new Date(date + 'T00:00:00Z').getTime() - t0) / (t1 - t0)) * plotW
  }
  const yAt = (v: number) => padT + plotH * (1 - (v - yMin) / (yMax - yMin))

  const coords = points.map((p) => ({ x: xAt(p.date), y: yAt(p.value) }))
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${coords[0].x.toFixed(1)},${padT + plotH} ${line} ${coords[coords.length - 1].x.toFixed(1)},${padT + plotH}`
  const ticks = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3)

  function showAt(e: ReactPointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const scale = rect.width / width
    const vx = (e.clientX - rect.left) / scale
    let best = 0
    for (let i = 1; i < coords.length; i++) if (Math.abs(coords[i].x - vx) < Math.abs(coords[best].x - vx)) best = i
    setCursor({ idx: best, visible: true })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCursor((c) => (c ? { ...c, visible: false } : c)), 3000)
  }

  const sel = cursor ? points[Math.min(cursor.idx, points.length - 1)] : null
  const sc = cursor ? coords[Math.min(cursor.idx, coords.length - 1)] : null
  const boxW = 96
  const boxX = sc ? Math.min(width - padR - boxW, Math.max(padL, sc.x - boxW / 2)) : 0

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={showAt}
      onPointerMove={showAt}
      role="img"
      aria-label={`Gráfica de evolución en ${unit}`}
    >
      <defs>
        <linearGradient id="adult-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={yAt(v)} x2={width - padR} y2={yAt(v)} stroke="#e9ecef" strokeWidth={1} />
          <text x={padL - 5} y={yAt(v) + 3} textAnchor="end" fontSize="9" fill="#868e96">
            {fmt(v, 0)}
          </text>
        </g>
      ))}
      {goal != null && (
        <g>
          <line x1={padL} y1={yAt(goal)} x2={width - padR} y2={yAt(goal)} stroke="#2f9e44" strokeWidth={1.4} strokeDasharray="5 4" />
          <text x={width - padR} y={yAt(goal) - 4} textAnchor="end" fontSize="9" fontWeight="700" fill="#2f9e44">
            🎯 {fmt(goal)}
          </text>
        </g>
      )}
      <polygon points={area} fill="url(#adult-area)" />
      <polyline points={line} fill="none" stroke={ACCENT} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {coords.length <= 40 && coords.map((c, i) => <circle key={points[i].id} cx={c.x} cy={c.y} r={2.8} fill="#fff" stroke={ACCENT} strokeWidth={1.6} />)}
      <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r={4.6} fill={ACCENT} stroke="#fff" strokeWidth={1.8} />
      <text x={padL} y={height - 6} fontSize="9" fill="#868e96">
        {fmtShort(points[0].date)}
      </text>
      <text x={width - padR} y={height - 6} textAnchor="end" fontSize="9" fill="#868e96">
        {fmtShort(points[points.length - 1].date)}
      </text>
      {sel && sc && cursor && (
        <g style={{ opacity: cursor.visible ? 1 : 0, transition: 'opacity 0.4s', pointerEvents: 'none' }}>
          <line x1={sc.x} y1={padT} x2={sc.x} y2={padT + plotH} stroke="#495057" strokeWidth={0.8} strokeDasharray="2 2" />
          <circle cx={sc.x} cy={sc.y} r={5} fill={ACCENT} stroke="#fff" strokeWidth={2} />
          <rect x={boxX} y={padT} width={boxW} height={30} rx={6} fill="#fff" stroke={ACCENT} strokeWidth={1.3} />
          <text x={boxX + boxW / 2} y={padT + 13} textAnchor="middle" fontSize="11" fontWeight="800" fill="#111827">
            {fmt(sel.value)} {unit}
          </text>
          <text x={boxX + boxW / 2} y={padT + 24} textAnchor="middle" fontSize="8.5" fill="#6b7280">
            {fmtDate(sel.date)}
          </text>
        </g>
      )}
    </svg>
  )
}

function Sparkline({ points }: { points: Pt[] }) {
  if (points.length < 2) return <span className="muted" style={{ fontSize: 11 }}>1 medida</span>
  const w = 96
  const h = 30
  const min = Math.min(...points.map((p) => p.value))
  const max = Math.max(...points.map((p) => p.value))
  const span = max - min || 1
  const step = (w - 6) / (points.length - 1)
  const c = points.map((p, i) => [3 + i * step, 3 + (h - 6) * (1 - (p.value - min) / span)] as const)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline points={c.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={c[c.length - 1][0]} cy={c[c.length - 1][1]} r={3} fill={ACCENT} />
    </svg>
  )
}

function BmiGauge({ value }: { value: number }) {
  const min = 15
  const max = 40
  const pos = Math.min(98, Math.max(2, ((value - min) / (max - min)) * 100))
  const zones: [number, string][] = [
    [((18.5 - min) / (max - min)) * 100, '#a5d8ff'],
    [((25 - 18.5) / (max - min)) * 100, '#b2f2bb'],
    [((30 - 25) / (max - min)) * 100, '#ffd8a8'],
    [((max - 30) / (max - min)) * 100, '#ffc9c9'],
  ]
  const band = bmiBand(value)
  return (
    <div style={{ position: 'relative', height: 30, margin: '12px 0 2px' }} aria-hidden="true">
      <div style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
        {zones.map(([w, c], i) => (
          <div key={i} style={{ width: `${w}%`, background: c }} />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: `${pos}%`,
          transform: 'translateX(-50%)',
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop: `11px solid ${BAND_COLOR[band.band]}`,
        }}
      />
    </div>
  )
}

type MeasureKey = 'waistCm' | 'abdomenCm' | 'armCm' | 'legCm' | 'heightCm'
const MEASURES: { key: MeasureKey; label: string; icon: string }[] = [
  { key: 'waistCm', label: 'Cintura', icon: '📏' },
  { key: 'abdomenCm', label: 'Abdomen', icon: '⭕' },
  { key: 'armCm', label: 'Brazo', icon: '💪' },
  { key: 'legCm', label: 'Pierna', icon: '🦵' },
  { key: 'heightCm', label: 'Altura', icon: '↕️' },
]

export function AdultBodyView({
  member,
  measurements,
  photos,
  photoUrls,
  photosSlot,
  onDeleteMeasurement,
  onEditMeasurement,
  onGoalSaved,
}: {
  member: FamilyMember
  measurements: BodyMeasurement[]
  photos: BodyPhoto[]
  photoUrls: Record<string, string>
  photosSlot: ReactNode
  onDeleteMeasurement: (id: string) => void
  onEditMeasurement: (id: string) => void
  onGoalSaved: (goalKg: number | null) => void
}) {
  const [tab, setTab] = useState<'peso' | 'medidas' | 'fotos'>('peso')
  const [range, setRange] = useState<RangeKey>('3M')
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalText, setGoalText] = useState('')
  const [goalError, setGoalError] = useState<string | null>(null)
  const [beforeId, setBeforeId] = useState<string | null>(null)
  const [afterId, setAfterId] = useState<string | null>(null)

  const sorted = [...measurements].sort((a, b) => a.measuredDate.localeCompare(b.measuredDate))
  const weightPts: Pt[] = sorted.filter((m) => m.weightKg != null).map((m) => ({ id: m.id, date: m.measuredDate, value: Number(m.weightKg) }))
  const latest = weightPts[weightPts.length - 1]
  const first = weightPts[0]
  const goal = member.weightGoalKg
  const today = todayStr()
  const month = changeOverDays(weightPts, 30)
  const latestHeight = [...sorted].reverse().find((m) => m.heightCm != null)?.heightCm
  const bmiValue = latest && latestHeight != null ? bmi(latest.value, Number(latestHeight)) : null
  const band = bmiValue != null ? bmiBand(bmiValue) : null
  const visible = filterRange(weightPts, range, today)

  // Un cambio "bueno" es acercarse al objetivo; sin objetivo, es neutro.
  const towardGoal = month && goal != null && latest ? Math.abs(latest.value - goal) < Math.abs(latest.value - month.delta - goal) : null
  const trendColor = month == null || month.delta === 0 ? '#868e96' : towardGoal == null ? '#495057' : towardGoal ? '#2f9e44' : '#f08c00'

  async function saveGoal(kg: number | null) {
    setGoalError(null)
    try {
      await updateMemberWeightGoal(member.id, kg)
      onGoalSaved(kg)
      setEditingGoal(false)
    } catch (err) {
      setGoalError(errorMessage(err, 'No se pudo guardar el objetivo'))
    }
  }

  function submitGoal() {
    const n = Number(goalText.replace(',', '.'))
    if (!Number.isFinite(n) || n < 20 || n > 300) {
      setGoalError('Escribe un peso en kg (por ejemplo 68,5).')
      return
    }
    void saveGoal(n)
  }

  const tabs = [
    ['peso', '⚖️ Peso'],
    ['medidas', '📏 Medidas'],
    ['fotos', '📷 Fotos'],
  ] as const

  const beforePhoto = photos.find((p) => p.id === beforeId) ?? photos[photos.length - 1]
  const afterPhoto = photos.find((p) => p.id === afterId) ?? photos[0]

  return (
    <div>
      <div className="segmented" role="tablist" style={{ margin: '4px 0 12px' }}>
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'segmented-active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'peso' && (
        <>
          <div className="card adult-hero">
            {latest ? (
              <>
                <div className="muted" style={{ fontSize: 12 }}>
                  Peso actual · {fmtDate(latest.date)}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{fmt(latest.value)}</span>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>kg</span>
                  {month && (
                    <span className="adult-trend" style={{ background: `${trendColor}1f`, color: trendColor }}>
                      {month.delta === 0 ? '＝ igual' : `${month.delta < 0 ? '▼' : '▲'} ${fmt(Math.abs(month.delta))} kg`} desde el {fmtShort(month.since)}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Todavía no hay peso registrado. Añade el primero abajo.
              </p>
            )}

            <div className="adult-goal">
              {editingGoal ? (
                <div className="recipe-inline-row" style={{ marginTop: 8 }}>
                  <input type="text" inputMode="decimal" placeholder="Peso objetivo en kg" value={goalText} onChange={(e) => setGoalText(e.target.value)} aria-label="Peso objetivo" autoFocus />
                  <button type="button" onClick={submitGoal}>
                    Guardar
                  </button>
                  <button type="button" className="link-button" onClick={() => setEditingGoal(false)}>
                    Cancelar
                  </button>
                </div>
              ) : goal != null ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>🎯 Objetivo: <strong>{fmt(goal)} kg</strong></span>
                    <span className="muted">
                      {latest && Math.abs(latest.value - goal) < 0.05 ? '¡Conseguido! 🎉' : latest ? `Faltan ${fmt(Math.abs(latest.value - goal))} kg` : ''}
                    </span>
                  </div>
                  {latest && first && (
                    <div className="adult-progress" aria-hidden="true">
                      <div style={{ width: `${Math.round(goalProgress(first.value, latest.value, goal) * 100)}%` }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                    <button
                      type="button"
                      className="link-button"
                      style={{ fontSize: 12, padding: 0 }}
                      onClick={() => {
                        setGoalText(String(goal).replace('.', ','))
                        setEditingGoal(true)
                      }}
                    >
                      ✏️ Cambiar
                    </button>
                    <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => saveGoal(null)}>
                      Quitar objetivo
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="link-button"
                  style={{ padding: '8px 0 0', fontSize: 13 }}
                  onClick={() => {
                    setGoalText('')
                    setEditingGoal(true)
                  }}
                >
                  🎯 Fijar un peso objetivo
                </button>
              )}
              {goalError && <p className="error" style={{ margin: '4px 0 0' }}>{goalError}</p>}
            </div>
          </div>

          {bmiValue != null && band && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>IMC</strong>
                <span>
                  <strong style={{ fontSize: 20 }}>{fmt(bmiValue)}</strong>{' '}
                  <span style={{ color: BAND_COLOR[band.band], fontWeight: 700, fontSize: 13 }}>{band.label}</span>
                </span>
              </div>
              <BmiGauge value={bmiValue} />
              <p className="muted" style={{ fontSize: 11, margin: '2px 0 0' }}>
                Con tu altura de {fmt(Number(latestHeight), 0)} cm y tu último peso. Es solo orientativo.
              </p>
            </div>
          )}

          <div className="card" style={{ padding: 12 }}>
            <div className="adult-ranges" role="tablist" aria-label="Periodo">
              {(Object.keys(RANGE_DAYS) as RangeKey[]).map((r) => (
                <button key={r} type="button" role="tab" aria-selected={range === r} className={range === r ? 'adult-range-active' : ''} onClick={() => setRange(r)}>
                  {r}
                </button>
              ))}
            </div>
            <AreaChart points={visible} goal={goal} unit="kg" />
            <p className="muted" style={{ fontSize: 11, margin: '2px 0 0' }}>
              Toca o desliza por la gráfica para ver el peso exacto de cada día.
            </p>
          </div>

          <div className="card" style={{ padding: '4px 12px' }}>
            {weightPts.length === 0 && <p className="muted">Todavía no hay medidas registradas.</p>}
            {[...weightPts].reverse().map((p, i, arr) => {
              const prev = arr[i + 1]
              const d = prev ? p.value - prev.value : null
              return (
                <div key={p.id} className="adult-row">
                  <div style={{ flex: 1 }}>
                    <strong>{fmtDate(p.date)}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{fmt(p.value)} kg</strong>
                    {d != null && d !== 0 && (
                      <div style={{ fontSize: 11, color: d < 0 ? '#2f9e44' : '#f08c00' }}>
                        {d < 0 ? '▼' : '▲'} {fmt(Math.abs(d))}
                      </div>
                    )}
                  </div>
                  <button type="button" className="link-button" aria-label="Editar medida" title="Editar" onClick={() => onEditMeasurement(p.id)}>
                    ✏️
                  </button>
                  <ConfirmIconButton icon="✕" className="link-button" ariaLabel="Borrar medida" onConfirm={() => onDeleteMeasurement(p.id)} />
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'medidas' && (
        <>
          <div className="adult-measures">
            {MEASURES.map((m) => {
              const pts: Pt[] = sorted.filter((x) => x[m.key] != null).map((x) => ({ id: x.id, date: x.measuredDate, value: Number(x[m.key]) }))
              const last = pts[pts.length - 1]
              const firstPt = pts[0]
              const delta = last && firstPt && last.id !== firstPt.id ? last.value - firstPt.value : null
              return (
                <div key={m.key} className="card adult-measure">
                  <div className="muted" style={{ fontSize: 12 }}>
                    {m.icon} {m.label}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15 }}>
                    {last ? fmt(last.value) : '—'} <span style={{ fontSize: 13, fontWeight: 600 }}>{last ? 'cm' : ''}</span>
                  </div>
                  <div style={{ fontSize: 12, color: delta == null || delta === 0 ? '#868e96' : delta < 0 ? '#2f9e44' : '#f08c00', minHeight: 16 }}>
                    {delta == null ? '' : delta === 0 ? '= igual' : `${delta < 0 ? '▼' : '▲'} ${fmt(Math.abs(delta))} cm`}
                  </div>
                  <Sparkline points={pts} />
                </div>
              )
            })}
          </div>

          <h2 className="section-title" style={{ marginTop: 14 }}>
            Historial
          </h2>
          <div className="card" style={{ padding: '4px 12px' }}>
            {sorted.length === 0 && <p className="muted">Todavía no hay medidas registradas.</p>}
            {[...sorted].reverse().map((m) => (
              <div key={m.id} className="adult-row">
                <div style={{ flex: 1 }}>
                  <strong>{fmtDate(m.measuredDate)}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {[
                      m.weightKg != null && `${fmt(Number(m.weightKg))} kg`,
                      m.heightCm != null && `Altura ${fmt(Number(m.heightCm), 0)}`,
                      m.waistCm != null && `Cintura ${fmt(Number(m.waistCm))}`,
                      m.abdomenCm != null && `Abdomen ${fmt(Number(m.abdomenCm))}`,
                      m.armCm != null && `Brazo ${fmt(Number(m.armCm))}`,
                      m.legCm != null && `Pierna ${fmt(Number(m.legCm))}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <button type="button" className="link-button" aria-label="Editar medida" title="Editar" onClick={() => onEditMeasurement(m.id)}>
                  ✏️
                </button>
                <ConfirmIconButton icon="✕" className="link-button" ariaLabel="Borrar medida" onConfirm={() => onDeleteMeasurement(m.id)} />
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'fotos' && (
        <>
          {photos.length >= 2 && beforePhoto && afterPhoto && (
            <div className="card">
              <strong>Antes y ahora</strong>
              <div className="adult-compare">
                {[
                  { label: 'Antes', photo: beforePhoto, set: setBeforeId },
                  { label: 'Ahora', photo: afterPhoto, set: setAfterId },
                ].map(({ label, photo, set }) => (
                  <div key={label}>
                    <div className="adult-compare-img">{photoUrls[photo.id] && <img src={photoUrls[photo.id]} alt={label} />}</div>
                    <select value={photo.id} onChange={(e) => set(e.target.value)} aria-label={`Foto ${label}`}>
                      {photos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {label}: {fmtShort(p.photoDate)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
          {photosSlot}
        </>
      )}
    </div>
  )
}
