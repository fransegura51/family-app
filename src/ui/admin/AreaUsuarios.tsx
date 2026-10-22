import { useEffect, useState } from 'react'
import { listAppUsage, type AppUsageRow } from '@/data/appUsage'
import { deleteFamilyInvite, generateFamilyInvite, listFamilyInvites, type FamilyInvite } from '@/data/familyInvites'
import { errorMessage } from '@/domain/errorMessage'
import { formatDateFromTimestamp } from '@/domain/dateFormat'
import { AppActivityPanel } from '@/ui/AppActivityPanel'
import { AdminGroup } from '@/ui/admin/AdminGroups'
import { InviteFriendsAdminCard } from '@/ui/admin/InviteFriendsAdminCard'
import { formatDate } from '@/ui/admin/adminFormat'

// Área «Usuarios, familias e invitaciones» del Centro de Administración. Es el contenido del antiguo «Panel de admin» (/admin-uso) que trata de personas y familias,
// trasladado SIN cambios de lógica ni de datos: uso de la app (familias y cuentas), actividad, y códigos de invitación para familias nuevas (7 días). El acceso lo decide
// el Centro (am_i_app_owner, verificado en el servidor) antes de montar esta área; los datos siguen protegidos además por is_app_owner en el servidor.
export function AreaUsuarios() {
  const [rows, setRows] = useState<AppUsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Petición real: dar entrada a las primeras familias sin compartir el
  // código maestro — códigos de invitación de un solo uso (ver 0093).
  const [invites, setInvites] = useState<FamilyInvite[]>([])
  const [inviteNote, setInviteNote] = useState('')
  const [generating, setGenerating] = useState(false)
  const [lastCode, setLastCode] = useState<string | null>(null)

  function reloadInvites() {
    listFamilyInvites().then(setInvites).catch(() => setInvites([]))
  }

  async function handleGenerateInvite() {
    setGenerating(true)
    setError(null)
    try {
      const code = await generateFamilyInvite(inviteNote)
      setLastCode(code)
      setInviteNote('')
      reloadInvites()
    } catch (e) {
      setError(errorMessage(e, 'No se pudo generar el código'))
    } finally {
      setGenerating(false)
    }
  }

  async function handleDeleteInvite(code: string) {
    try {
      await deleteFamilyInvite(code)
      reloadInvites()
    } catch (e) {
      setError(errorMessage(e, 'No se pudo borrar el código'))
    }
  }

  useEffect(() => {
    listAppUsage()
      .then(setRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    reloadInvites()
  }, [])

  if (loading) return <p className="muted">Cargando…</p>

  const families = new Map<string, { name: string; rows: AppUsageRow[] }>()
  for (const r of rows) {
    if (!families.has(r.familyId)) families.set(r.familyId, { name: r.familyName, rows: [] })
    families.get(r.familyId)!.rows.push(r)
  }

  return (
    <div className="admin-area">
      {/* Los avisos de error se ven siempre, aunque el bloque donde ocurrieron esté plegado. */}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <AdminGroup area="usuarios" id="invitar-amigos" title="Invitar amigos" summary="Función en preparación (no activa)" badge="No activa">
        <InviteFriendsAdminCard />
      </AdminGroup>

      <AdminGroup
        area="usuarios"
        id="codigos"
        title="🔑 Códigos de invitación para familias nuevas"
        summary="Generar, consultar y anular códigos de un solo uso"
        badge={`${invites.filter((i) => !i.usedAt && new Date(i.expiresAt).getTime() >= Date.now()).length} disponibles`}
        defaultOpen
      >
      <p className="muted">
        Cada código vale para crear UNA familia y caduca a los 7 días de generarse. Se lo das a la familia y ellos lo escriben en
        "Código de acceso" al crear la suya.
      </p>
      <div className="inline-fields">
        <input
          type="text"
          value={inviteNote}
          onChange={(e) => setInviteNote(e.target.value)}
          placeholder="Nota: Familia López (amigos de Paco)"
          style={{ flex: 1 }}
        />
        <button type="button" disabled={generating} onClick={handleGenerateInvite}>
          {generating ? 'Generando…' : 'Generar código'}
        </button>
      </div>
      {lastCode && (
        <p className="points-badge" style={{ fontSize: 18, letterSpacing: 2 }}>
          {lastCode}
        </p>
      )}
      {invites.length > 0 && (
        <div className="event-list">
          {invites.map((inv) => {
            const usedBy = inv.usedByFamily ? families.get(inv.usedByFamily)?.name ?? 'una familia' : null
            const expired = !inv.usedAt && new Date(inv.expiresAt).getTime() < Date.now()
            return (
              <div key={inv.code} className="card task-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong style={{ letterSpacing: 1 }}>{inv.code}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {usedBy ? `✅ Usado por ${usedBy}` : expired ? '⏰ Caducado' : '🟢 Disponible'}
                  </span>
                </div>
                {inv.note && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{inv.note}</p>}
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                  Creado {formatDate(inv.createdAt)}
                  {!inv.usedAt && ` · caduca el ${formatDateFromTimestamp(inv.expiresAt)}`}
                </p>
                {!inv.usedAt && (
                  <button type="button" className="link-button" onClick={() => handleDeleteInvite(inv.code)}>
                    ✕ Anular
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      </AdminGroup>

      <AdminGroup area="usuarios" id="actividad" title="📈 Actividad de uso" summary="Cuánto usa cada cuenta la app y qué pantallas se usan más y menos">
        <AppActivityPanel accounts={rows} />
      </AdminGroup>

      <AdminGroup
        area="usuarios"
        id="familias"
        title="Familias y cuentas"
        summary="Altas, último acceso y notificaciones de cada persona con cuenta"
        badge={`${families.size} ${families.size === 1 ? 'familia' : 'familias'} · ${rows.length} ${rows.length === 1 ? 'cuenta' : 'cuentas'}`}
      >
      <p className="muted">
        Cada persona con cuenta propia (family_members sin cuenta propia no cuentan), en orden de alta.
      </p>
      {!error && rows.length === 0 && (
        <p className="muted">No hay datos, o no tienes acceso a este panel.</p>
      )}
      {[...families.entries()].map(([familyId, group]) => (
        <div key={familyId} className="card" style={{ marginBottom: 16 }}>
          <strong>👨‍👩‍👧‍👦 {group.name}</strong>
          <div className="event-list" style={{ marginTop: 8 }}>
            {group.rows.map((r) => (
              <div key={r.profileId} className="card task-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong>{r.displayName}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{r.role}</span>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>{r.email}</p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>Se dio de alta: {formatDate(r.createdAt)}</p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>Último acceso: {formatDate(r.lastSignInAt)}</p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {r.hasPush ? '🔔 Notificaciones activadas (instalada de verdad)' : '🔕 Sin notificaciones activadas'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
      </AdminGroup>
    </div>
  )
}
