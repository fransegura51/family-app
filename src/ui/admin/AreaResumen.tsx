import { useState } from 'react'
import { ADMIN_AREAS, type AdminAreaId } from '@/admin/adminAreas'
import { FEATURE_INVENTORY } from '@/admin/features/featureInventory'
import { FEATURE_STATE_LABEL, HELP_COVERAGE_LABEL, type FeatureState, type HelpCoverage } from '@/admin/features/featureTypes'
import { listAppUsage } from '@/data/appUsage'
import { listClientErrors } from '@/data/errorReports'
import { InviteFriendsAdminCard } from '@/ui/admin/InviteFriendsAdminCard'
import { useFeatureRows } from '@/ui/admin/useFeatureRows'

// Área «Resumen general»: vista de conjunto y puerta a las demás áreas. Los números del inventario y de la Ayuda salen del propio código (sin consultas). Los datos en vivo
// (familias, cuentas, errores) se piden SOLO si se pulsa el botón, para no gastar consultas de Supabase cada vez que se abre el Centro.
const DESCRIPTIONS: Record<AdminAreaId, string> = {
  resumen: 'Esta vista.',
  usuarios: 'Familias y cuentas, actividad de uso y códigos de invitación para familias nuevas.',
  comunidad: 'El Centro de Mando de Comunidad completo: moderación, usuarios, contenido oficial, encuestas, destacados, configuración e historial.',
  funcionalidades: 'Qué hace PEPA hoy, función por función, con su estado, lo que falta y cómo se ha comprobado.',
  ayuda: 'Qué cubre la Ayuda, qué tutoriales hay y qué funciones no están contadas todavía.',
  sistema: 'Errores de la app, automatizaciones técnicas y vistas administrativas de Sugerencias y Reseñas.',
}

interface Live {
  families: number
  accounts: number
  errors: number
}

export function AreaResumen({ onGo }: { onGo: (area: AdminAreaId) => void }) {
  const rows = useFeatureRows()
  const [live, setLive] = useState<Live | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const byState = (s: FeatureState) => rows.filter((r) => r.entry.state === s).length
  const byHelp = (c: HelpCoverage) => rows.filter((r) => r.help.coverage === c).length
  const attention = FEATURE_INVENTORY.filter((e) => e.state !== 'operativa').length

  async function loadLive() {
    setLoading(true)
    setLiveError(null)
    try {
      const [usage, errors] = await Promise.all([listAppUsage(), listClientErrors()])
      setLive({
        families: new Set(usage.map((u) => u.familyId)).size,
        accounts: usage.length,
        errors: errors.filter((e) => !e.message.startsWith('prefs-diag')).length,
      })
    } catch {
      setLiveError('No se pudieron cargar los datos en vivo. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-area">
      <p className="muted">
        Centro de Administración de PEPA. Solo lo ven las cuentas propietarias de la app (se comprueba en el servidor). No es lo mismo que el administrador de una familia.
      </p>

      <h2 className="section-title">Las seis áreas</h2>
      <ul className="admin-area-cards">
        {ADMIN_AREAS.filter((a) => a.id !== 'resumen').map((a) => (
          <li key={a.id}>
            <button type="button" className="card admin-area-card" onClick={() => onGo(a.id)}>
              <strong>
                <span aria-hidden="true">{a.icon} </span>
                {a.label}
              </strong>
              <span className="muted">{DESCRIPTIONS[a.id]}</span>
            </button>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Estado de las funcionalidades</h2>
      <p className="admin-counts">
        {(['operativa', 'parcial', 'desactivada'] as FeatureState[]).map((s) => (
          <span key={s}>
            {FEATURE_STATE_LABEL[s]}: <strong>{byState(s)}</strong>{' '}
          </span>
        ))}
        <span className="muted">({rows.length} en total; {attention} piden atención)</span>
      </p>
      <p className="admin-counts">
        Ayuda:{' '}
        {(['completa', 'parcial', 'inexistente', 'pendiente'] as HelpCoverage[]).map((c) => (
          <span key={c}>
            {HELP_COVERAGE_LABEL[c]} <strong>{byHelp(c)}</strong>{' '}
          </span>
        ))}
      </p>

      <h2 className="section-title">Datos en vivo</h2>
      {live ? (
        <ul className="admin-plain-list">
          <li className="card">👨‍👩‍👧‍👦 Familias: <strong>{live.families}</strong></li>
          <li className="card">👤 Cuentas: <strong>{live.accounts}</strong></li>
          <li className="card">🚨 Errores registrados (sin el diagnóstico temporal): <strong>{live.errors}</strong></li>
        </ul>
      ) : (
        <p className="muted">Para no gastar consultas de la base de datos, estos números solo se piden al pulsar el botón.</p>
      )}
      {liveError && <p className="error">{liveError}</p>}
      <button type="button" className="cadm-btn cadm-btn-secondary" disabled={loading} onClick={() => void loadLive()}>
        {loading ? 'Cargando…' : live ? 'Actualizar datos' : 'Cargar datos en vivo'}
      </button>

      <h2 className="section-title">Invitar amigos</h2>
      <InviteFriendsAdminCard />
    </div>
  )
}
