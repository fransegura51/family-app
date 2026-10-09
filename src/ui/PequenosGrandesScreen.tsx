import { useState } from 'react'
import { Link } from 'react-router-dom'
import { pastelPalette } from '@/domain/colors'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { useSectionHome } from '@/ui/useSectionHome'
import { RewardsScreen } from '@/ui/RewardsScreen'
import type { Profile } from '@/domain/types'

// «Pequeños Grandes» (prompt maestro) — sustituye la antigua tarjeta suelta "Puntos" del Inicio por un
// hub con tres accesos: Puntos y recompensas (módulo ya existente, reutilizado tal cual, Fase 4),
// Educación financiera (todavía vive en Economía — su traslado real es la Fase 5, aquí solo se enlaza) y
// Lista de deseos (módulo nuevo, todavía sin construir — placeholder honesto, nunca un enlace roto).
// Mismo patrón de navegación por estado local que ya usa Eventos (openModule), nunca rutas anidadas
// nuevas — esta pantalla sigue viviendo entera en la ruta /puntos de siempre (nunca cambia el id de
// sección 'puntos' que ya usan los permisos de menor/invitado y el orden guardado de Inicio).
type PequenosGrandesModule = 'recompensas' | 'deseos' | null

const MODULE_CARDS: { key: Exclude<PequenosGrandesModule, null>; label: string; stat: string; icon: string }[] = [
  { key: 'recompensas', label: 'Puntos y recompensas', stat: 'Gana puntos y canjea premios', icon: '⭐' },
  { key: 'deseos', label: 'Lista de deseos', stat: 'Sueños y regalos', icon: '🎁' },
]

export function PequenosGrandesScreen({ profile }: { profile: Profile }) {
  const [openModule, setOpenModule] = useState<PequenosGrandesModule>(null)
  useSectionHome(() => setOpenModule(null))

  if (openModule === 'recompensas') return <RewardsScreen profile={profile} />
  if (openModule === 'deseos') return <ListaDeseosComingSoon onBack={() => setOpenModule(null)} />

  const cardColors = pastelPalette(MODULE_CARDS.length + 1)

  return (
    <div className="screen">
      {/* Cabecera MASTER propia (Fase 3, prompt maestro) — Pepa con Eric, Susana y Fernando bebé.
          Pendiente de la imagen oficial definitiva: en vez de improvisar una ilustración, de momento no
          se pinta ninguna imagen aquí (nunca un boceto hecho pasar por oficial) — en cuanto llegue el
          archivo real, basta con añadir el import y este mismo bloque "kitchen-header", igual que en el
          resto de la app (ver AlimentacionScreen.tsx, EventosScreen.tsx...). */}
      <SectionBreadcrumb subsection="Inicio" />
      <h1 className="section-title">👨‍👩‍👧‍👦 Pequeños Grandes</h1>
      <p className="muted">Aprender, jugar y soñar</p>
      <div className="card-grid" style={{ marginTop: 8 }}>
        {MODULE_CARDS.map((card, i) => (
          <button key={card.key} type="button" className="card event-module-card home-card" style={{ background: cardColors[i] }} onClick={() => setOpenModule(card.key)}>
            <div>
              <h2>{card.label}</h2>
              <p className="muted">{card.stat}</p>
            </div>
            <span className="home-card-icon">{card.icon}</span>
          </button>
        ))}
        {/* Educación financiera ya existe dentro de Economía — su traslado real al hub es la Fase 5 del
            prompt maestro (reutilizar el componente tal cual, sin duplicar datos); de momento este
            acceso enlaza a donde el módulo vive hoy, nunca una copia nueva. */}
        <Link to="/dinero" className="card event-module-card home-card" style={{ background: cardColors[2] }}>
          <div>
            <h2>Educación financiera</h2>
            <p className="muted">Ahorrar, gastar y aportar</p>
          </div>
          <span className="home-card-icon">🐷</span>
        </Link>
      </div>
    </div>
  )
}

// Lista de deseos (Fases 12-16 del prompt maestro) — todavía no construida. Un hueco honesto en vez de
// un enlace roto o una función fingida: nunca se afirma que algo funciona cuando solo está previsto.
function ListaDeseosComingSoon({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen">
      <SectionBreadcrumb subsection={[{ label: 'Pequeños Grandes', to: '/puntos', state: { sectionHome: true } }, { label: 'Lista de deseos' }]} />
      <h1 className="section-title">🎁 Lista de deseos</h1>
      <p className="muted">Esta parte de Pequeños Grandes todavía se está construyendo — vuelve en una próxima actualización.</p>
      <button type="button" className="link-button" onClick={onBack}>
        ← Volver a Pequeños Grandes
      </button>
    </div>
  )
}
