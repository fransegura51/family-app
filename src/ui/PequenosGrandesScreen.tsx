import { useState } from 'react'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { useSectionHome } from '@/ui/useSectionHome'
import { RewardsScreen } from '@/ui/RewardsScreen'
import { KidsFinanceTab } from '@/ui/FinanceScreen'
import pequenosGrandesHeaderImg from '@/assets/puntos/pequenos-grandes-header.jpg'
import educacionFinancieraHeaderImg from '@/assets/puntos/educacion-financiera-header.jpg'
import deseosHeaderImg from '@/assets/puntos/deseos-header.jpg'
import recompensasCardImg from '@/assets/puntos/recompensas-card.jpg'
import educacionFinancieraCardImg from '@/assets/puntos/educacion-financiera-card.jpg'
import deseosCardImg from '@/assets/puntos/deseos-card.jpg'
import type { Profile } from '@/domain/types'

// «Pequeños Grandes» (prompt maestro) — sustituye la antigua tarjeta suelta "Puntos" del Inicio por un
// hub con tres accesos: Puntos y recompensas (módulo ya existente, reutilizado tal cual, Fase 4),
// Educación financiera (módulo ya existente, reutilizado tal cual — KidsFinanceTab vive en
// FinanceScreen.tsx y sigue usándose también allí, nunca duplicado — trasladado aquí como punto de
// acceso principal en la Fase 5) y Lista de deseos (módulo nuevo, todavía sin construir — placeholder
// honesto, nunca un enlace roto). Mismo patrón de navegación por estado local que ya usa Eventos
// (openModule), nunca rutas anidadas nuevas — esta pantalla sigue viviendo entera en la ruta /puntos de
// siempre (nunca cambia el id de sección 'puntos' que ya usan los permisos de menor/invitado y el orden
// guardado de Inicio).
type PequenosGrandesModule = 'recompensas' | 'educacion' | 'deseos' | null

// Cada imagen ya lleva el título dibujado dentro (petición real: "imagen a toda tarjeta, sin el emoji ni
// el título en texto encima") — el botón no repite ni el icono ni el <h2>, solo el subtítulo debajo.
const MODULE_CARDS: { key: Exclude<PequenosGrandesModule, null>; label: string; stat: string; img: string }[] = [
  { key: 'recompensas', label: 'Puntos y recompensas', stat: 'Gana puntos y canjea premios', img: recompensasCardImg },
  { key: 'educacion', label: 'Educación financiera', stat: 'Ahorrar, gastar y aportar', img: educacionFinancieraCardImg },
  { key: 'deseos', label: 'Lista de deseos', stat: 'Sueños y regalos', img: deseosCardImg },
]

export function PequenosGrandesScreen({ profile }: { profile: Profile }) {
  const [openModule, setOpenModule] = useState<PequenosGrandesModule>(null)
  useSectionHome(() => setOpenModule(null))

  if (openModule === 'recompensas') return <RewardsScreen profile={profile} />
  if (openModule === 'educacion') return <EducacionFinancieraTab profile={profile} onBack={() => setOpenModule(null)} />
  if (openModule === 'deseos') return <ListaDeseosComingSoon onBack={() => setOpenModule(null)} />

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-wide">
        <img src={pequenosGrandesHeaderImg} alt="Pequeños Grandes" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Inicio" />
      <p className="muted">Aprender, jugar y soñar</p>
      <div className="card-grid" style={{ marginTop: 8 }}>
        {MODULE_CARDS.map((card) => (
          <button key={card.key} type="button" className="card event-module-card home-card-photo" onClick={() => setOpenModule(card.key)}>
            <img src={card.img} alt={card.label} className="home-card-photo-img" />
            <p className="muted home-card-photo-caption">{card.stat}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// Educación financiera (Fase 5 del prompt maestro) — KidsFinanceTab es el mismo componente que ya vive
// en FinanceScreen.tsx (vista restringida de un hijo y pestaña "Educación financiera" de un adulto
// dentro de Economía), aquí solo se reutiliza como punto de acceso principal. Nunca se duplican datos ni
// lógica. Ya no hace falta pasar por /dinero: un hijo con Economía bloqueada (allowed_sections sin
// 'dinero', ver NavShell) llega aquí igual, porque kid_wallet_transactions/kid_goals tienen su propia
// RLS (migración 0097) completamente independiente de 'dinero' — nunca toca bank_accounts/bank_
// connections/bank_transactions, ni directa ni indirectamente.
function EducacionFinancieraTab({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-wide">
        <img src={educacionFinancieraHeaderImg} alt="Educación financiera" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Educación financiera" />
      <button type="button" className="link-button" onClick={onBack}>
        ← Volver a Pequeños Grandes
      </button>
      <KidsFinanceTab profile={profile} />
    </div>
  )
}

// Lista de deseos (Fases 12-16 del prompt maestro) — todavía no construida. Un hueco honesto en vez de
// un enlace roto o una función fingida: nunca se afirma que algo funciona cuando solo está previsto.
function ListaDeseosComingSoon({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-wide">
        <img src={deseosHeaderImg} alt="Lista de deseos" className="kitchen-header-img" />
      </div>
      <SectionBreadcrumb subsection="Lista de deseos" />
      <p className="muted">Esta parte de Pequeños Grandes todavía se está construyendo — vuelve en una próxima actualización.</p>
      <button type="button" className="link-button" onClick={onBack}>
        ← Volver a Pequeños Grandes
      </button>
    </div>
  )
}
