import { formatMoney, shortDay, shareOf } from '@/domain/aiControl'
import '@/ui/admin/ia/aiControl.css'

// Gráficos sencillos y accesibles (sin librerías): barras horizontales y barras diarias en SVG que se ajustan al ancho. Siempre acompañados de los datos en texto.

export interface BarItem {
  key: string
  label: string
  value: number
  sub?: string
}

export function BarList({ items, format = formatMoney, total }: { items: BarItem[]; format?: (n: number) => string; total?: number }) {
  const max = Math.max(...items.map((i) => i.value), 0)
  const sum = total ?? items.reduce((s, i) => s + i.value, 0)
  if (items.length === 0) return <p className="muted">Sin datos en este periodo.</p>
  return (
    <ul className="ai-rows">
      {items.map((i) => (
        <li key={i.key} className="ai-row">
          <div className="ai-row-top">
            <strong>{i.label}</strong>
            <span>
              {format(i.value)} · {shareOf(i.value, sum)}
            </span>
          </div>
          <span className="ai-bar" aria-hidden="true">
            <span style={{ width: `${max > 0 ? Math.max((i.value / max) * 100, i.value > 0 ? 2 : 0) : 0}%` }} />
          </span>
          {i.sub && <div className="ai-row-sub">{i.sub}</div>}
        </li>
      ))}
    </ul>
  )
}

export function DailyChart({ data, label }: { data: { day: string; cost: number; calls: number }[]; label: string }) {
  if (data.length === 0) return <p className="muted">Sin datos en este periodo.</p>
  const W = 300
  const H = 110
  const padB = 16
  const max = Math.max(...data.map((d) => d.cost), 0)
  const useCalls = max === 0
  const vals = data.map((d) => (useCalls ? d.calls : d.cost))
  const vmax = Math.max(...vals, 1)
  const bw = W / data.length
  return (
    <div>
      <svg className="ai-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. ${data.length} días.`} preserveAspectRatio="xMidYMid meet">
        <line className="ai-chart-axis" x1="0" y1={H - padB} x2={W} y2={H - padB} />
        {vals.map((v, i) => {
          const h = Math.max((v / vmax) * (H - padB - 6), v > 0 ? 1.5 : 0)
          return <rect key={data[i].day} className="ai-chart-bar" x={i * bw + bw * 0.12} y={H - padB - h} width={Math.max(bw * 0.76, 1)} height={h} rx="1.5" />
        })}
        <text x="0" y={H - 3}>
          {shortDay(data[0].day)}
        </text>
        <text x={W} y={H - 3} textAnchor="end">
          {shortDay(data[data.length - 1].day)}
        </text>
      </svg>
      <p className="ai-note">{useCalls ? 'Llamadas por día (aún sin coste calculable).' : `Coste estimado por día. Máximo: ${formatMoney(max)}.`}</p>
      <details>
        <summary>Ver los datos día a día</summary>
        <ul className="ai-rows">
          {data.map((d) => (
            <li key={d.day} className="ai-row ai-row-top">
              <strong>{shortDay(d.day)}</strong>
              <span>
                {formatMoney(d.cost)} · {d.calls} {d.calls === 1 ? 'llamada' : 'llamadas'}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
