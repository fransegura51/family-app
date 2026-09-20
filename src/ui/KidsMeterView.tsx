import { useEffect, useRef, useState } from 'react'
import { DEFAULT_KIDS_THEME_ID, KIDS_THEMES, type KidsMeter } from '@/ui/kidsThemes'
import type { BodyMeasurement, FamilyMember } from '@/domain/types'

// Medidor de altura para niños: una escena con temática (cohete...) cuya
// columna lisa hace de regla. Las marcas y los números los dibuja el código
// (siempre nítidos), y el personaje se coloca a la altura de la última medida;
// al guardar una medida nueva celebra. Petición real: "para niños quiero
// hacer algo más visual, colorido, con una imagen en plan metro".

const SPRITE_SCALE = 0.85 // tamaño del personaje respecto a su imagen original
const SPRITE_AREA = 250 // hueco a la derecha de la escena para el personaje

const themeKey = (memberId: string) => `familyapp:kids-theme:${memberId}`
const spriteKey = (memberId: string) => `familyapp:kids-sprite:${memberId}`

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Sin almacenamiento: se olvida la elección al recargar, no es grave.
  }
}

const fmtCm = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
const fmtDate = (d: string) => new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

function yFor(meter: KidsMeter, cm: number): number {
  const clamped = Math.min(meter.maxCm, Math.max(meter.minCm, cm))
  const t = (clamped - meter.minCm) / (meter.maxCm - meter.minCm)
  return meter.column.bottom - t * (meter.column.bottom - meter.column.top)
}

export function KidsMeterView({ member, measurements }: { member: FamilyMember; measurements: BodyMeasurement[] }) {
  const [themeId, setThemeId] = useState(() => readStored(themeKey(member.id)) ?? DEFAULT_KIDS_THEME_ID)
  const [spriteKind, setSpriteKind] = useState<'boy' | 'girl'>(() => {
    const stored = readStored(spriteKey(member.id))
    if (stored === 'boy' || stored === 'girl') return stored
    return member.sex === 'female' ? 'girl' : 'boy'
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [celebrating, setCelebrating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const points = measurements
    .filter((m) => m.heightCm != null)
    .map((m) => ({ id: m.id, date: m.measuredDate, cm: Number(m.heightCm) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const latest = points[points.length - 1]
  const first = points[0]
  const selected = points.find((p) => p.id === selectedId) ?? latest

  // Celebra cuando aparece una medida de altura nueva (no la primera vez que se abre la pantalla).
  const previousLatestId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const id = latest?.id ?? null
    if (previousLatestId.current !== undefined && id && id !== previousLatestId.current) {
      setCelebrating(true)
      const t = window.setTimeout(() => setCelebrating(false), 4500)
      previousLatestId.current = id
      return () => window.clearTimeout(t)
    }
    previousLatestId.current = id
  }, [latest?.id])

  const theme = KIDS_THEMES.find((t) => t.id === themeId && t.meter) ?? KIDS_THEMES[0]
  const meter = theme.meter!

  function chooseTheme(id: string) {
    const t = KIDS_THEMES.find((x) => x.id === id)
    if (!t) return
    if (!t.meter) {
      setNotice(`El medidor de «${t.name}» todavía no está listo — muy pronto.`)
      return
    }
    setNotice(null)
    setThemeId(id)
    writeStored(themeKey(member.id), id)
  }

  function toggleSprite() {
    const next = spriteKind === 'boy' ? 'girl' : 'boy'
    setSpriteKind(next)
    writeStored(spriteKey(member.id), next)
  }

  const viewW = meter.sceneWidth + SPRITE_AREA
  const viewH = meter.sceneHeight
  const col = meter.column
  const labelSize = Math.min(24, col.width * 0.28)
  const ticks: { cm: number; major: boolean }[] = []
  for (let cm = meter.minCm; cm <= meter.maxCm; cm += 5) ticks.push({ cm, major: cm % 10 === 0 })

  const sprite = latest ? meter.sprites[spriteKind][celebrating ? 'celebrate' : 'stand'] : null
  const spriteW = sprite ? sprite.width * SPRITE_SCALE : 0
  const spriteH = sprite ? sprite.height * SPRITE_SCALE : 0
  // El personaje se centra en la altura medida, sin salirse de la imagen.
  const spriteY = latest ? Math.min(viewH - spriteH - 4, Math.max(40, yFor(meter, selected.cm) - spriteH / 2)) : 0
  const spriteX = meter.sceneWidth + (SPRITE_AREA - spriteW) / 2

  return (
    <div>
      <div className="kids-themes" role="listbox" aria-label="Elige el diseño del medidor">
        {KIDS_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="option"
            aria-selected={t.id === theme.id}
            className={'kids-theme' + (t.id === theme.id ? ' kids-theme-active' : '') + (t.meter ? '' : ' kids-theme-locked')}
            onClick={() => chooseTheme(t.id)}
          >
            <img src={t.thumb} alt="" />
            <span>{t.name}</span>
          </button>
        ))}
      </div>
      {notice && <p className="muted" style={{ fontSize: 13, margin: '4px 2px 8px' }}>{notice}</p>}

      <div className="card kids-meter-card">
        {latest ? (
          <div className="kids-meter-head">
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                {selected.id === latest.id ? 'Última medida' : 'Medida seleccionada'} · {fmtDate(selected.date)}
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>
                {fmtCm(selected.cm)} <span style={{ fontSize: 18, fontWeight: 600 }}>cm</span>
              </div>
            </div>
            {first && latest.id !== first.id && (
              <div className="kids-grown">
                🌟 ¡{latest.cm - first.cm >= 0 ? 'Has crecido' : 'Cambio'} {fmtCm(Math.abs(latest.cm - first.cm))} cm desde el {fmtDate(first.date)}!
              </div>
            )}
          </div>
        ) : (
          <p className="muted" style={{ margin: '0 0 8px' }}>
            Añade la altura de {member.name} abajo y aparecerá en el medidor.
          </p>
        )}

        <svg viewBox={`0 0 ${viewW} ${viewH}`} width="100%" className="kids-meter-svg" role="img" aria-label={`Medidor de altura de ${member.name}`}>
          <image href={meter.scene} x={0} y={0} width={meter.sceneWidth} height={meter.sceneHeight} />

          {ticks.map(({ cm, major }) => {
            const y = yFor(meter, cm)
            return (
              <g key={cm}>
                <line x1={col.x + col.width - col.width * (major ? 0.34 : 0.2)} y1={y} x2={col.x + col.width} y2={y} stroke="#24336b" strokeWidth={major ? 4 : 2.5} strokeLinecap="round" />
                {major && (
                  <text x={col.x + Math.max(6, col.width * 0.08)} y={y + labelSize / 3} fontSize={labelSize} fontWeight="700" fill="#24336b" fontFamily="system-ui, sans-serif">
                    {cm}
                  </text>
                )}
              </g>
            )
          })}
          <text x={col.x + col.width / 2} y={col.top - 14} fontSize="22" fontWeight="700" fill="#24336b" textAnchor="middle" fontFamily="system-ui, sans-serif">
            cm
          </text>

          {points.map((p) => {
            const y = yFor(meter, p.cm)
            const isSel = p.id === selected?.id
            return (
              <g key={p.id} onClick={() => setSelectedId(p.id)} style={{ cursor: 'pointer' }}>
                <circle cx={col.x + col.width + 14} cy={y} r={26} fill="transparent" />
                <circle cx={col.x + col.width + 14} cy={y} r={isSel ? 13 : 9} fill={member.color} stroke="#fff" strokeWidth={3} />
              </g>
            )
          })}

          {latest && sprite && (
            <g>
              <line
                x1={col.x + col.width + 24}
                y1={yFor(meter, selected.cm)}
                x2={spriteX + 10}
                y2={yFor(meter, selected.cm)}
                stroke="#ffffff"
                strokeWidth={4}
                strokeDasharray="10 10"
                strokeLinecap="round"
              />
              <image
                href={sprite.src}
                x={spriteX}
                y={spriteY}
                width={spriteW}
                height={spriteH}
                onClick={toggleSprite}
                style={{ cursor: 'pointer' }}
              />
              <g transform={`translate(${spriteX + spriteW / 2}, ${Math.max(34, spriteY - 4)})`}>
                <rect x={-58} y={-30} width={116} height={40} rx={20} fill="#ffffff" stroke="#24336b" strokeWidth={3} />
                <text x={0} y={-3} fontSize="24" fontWeight="800" fill="#24336b" textAnchor="middle" fontFamily="system-ui, sans-serif">
                  {fmtCm(selected.cm)} cm
                </text>
              </g>
            </g>
          )}
        </svg>
        <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
          Toca un punto de colores para ver una medida anterior, o al personaje para cambiar entre niño y niña.
        </p>
      </div>
    </div>
  )
}
