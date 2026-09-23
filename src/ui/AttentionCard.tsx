import { Link } from 'react-router-dom'
import type { AttentionItem } from '@/domain/attention'

// Fase 3 — componente GENÉRICO ("PEPA te avisa"), sin ningún import ni
// referencia a Eventos: solo sabe pintar AttentionItem[], venga de
// donde venga. Eventos es hoy el único módulo que produce estos
// avisos (ver eventAlertsToAttentionItems en domain/events.ts), pero
// Economía/Documentos podrían sumar los suyos sin tocar este archivo.
// Tocar cualquier tarjeta lleva directo a item.to (deep-link real, ver
// Fase 4). "No llenar Inicio de tarjetas": el límite de cuántas se
// muestran es decisión de quien llama (ver maxItems), no de este
// componente.
export function AttentionCard({ items, maxItems = 3 }: { items: AttentionItem[]; maxItems?: number }) {
  if (items.length === 0) return null
  const visible = items.slice(0, maxItems)
  const rest = items.length - visible.length

  return (
    <div className="card attention-card" style={{ marginBottom: 12, background: '#fff7ed', borderColor: '#fdba74' }}>
      <strong>🔔 PEPA te avisa</strong>
      <div className="event-list" style={{ marginTop: 6 }}>
        {visible.map((item) => (
          <Link key={item.id} to={item.to} className="card-link">
            <div className="card" style={{ padding: 10 }}>
              <strong>
                {item.icon} {item.title}
              </strong>
              {item.lines.map((line, i) => (
                <p key={i} className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                  {line}
                </p>
              ))}
            </div>
          </Link>
        ))}
      </div>
      {rest > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          +{rest} {rest === 1 ? 'evento más necesita' : 'eventos más necesitan'} atención
        </p>
      )}
    </div>
  )
}
