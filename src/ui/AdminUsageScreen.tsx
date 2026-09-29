import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAppUsage, type AppUsageRow } from '@/data/appUsage'
import { deleteClientErrors, listClientErrors, type ClientErrorRow } from '@/data/errorReports'
import { deleteFamilyInvite, generateFamilyInvite, listFamilyInvites, type FamilyInvite } from '@/data/familyInvites'
import { getAmazonWebhookToken, regenerateAmazonWebhookToken } from '@/data/family'
import { errorMessage } from '@/domain/errorMessage'
import { ConfirmButton } from '@/ui/ConfirmButton'

function formatDate(iso: string | null): string {
  if (!iso) return 'Nunca'
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  const when = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  if (days === 0) return `Hoy (${when})`
  if (days === 1) return `Ayer (${when})`
  return `Hace ${days} días (${when})`
}

// Petición real: "quiero un contador para ver la gente que se ha
// descargado la aplicación... para ver en cuanto a orden de descarga" —
// panel solo para Jennifer y Paco (is_app_owner, ver
// 0085_app_owner_usage_panel.sql), no listado en el menú principal:
// se llega desde el enlace que aparece en Ajustes solo si list_app_usage()
// devuelve algo.
//
// Reorganización "Familia / Panel de admin" — este panel (antes "Panel de uso de la app") pasa a llamarse
// "🛠️ Panel de admin" y agrupa TODA la herramienta técnica que solo necesitamos nosotros como
// administradores de PEPA, no las familias normales: la sección "📊 Uso de la app" es exactamente el
// contenido de siempre (sin cambios de lógica), y "⚙️ Automatizaciones" es AmazonWebhookSettings, movida
// tal cual desde FamilyScreen.tsx (mismos webhooks, mismo token, mismos botones, ninguna reimplementación)
// — antes vivía dentro de Familia detrás de isAdmin (admin de CADA familia, p. ej. Fran en "Familia
// prueba"), ahora vive aquí detrás del mismo mecanismo is_app_owner de arriba (ver AdminUsageLink en
// MenuSettingsScreen.tsx) — el acceso real sigue dependiendo de list_app_usage(), no de una ruta nueva.
export function AdminUsageScreen() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<AppUsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Petición real: "que no falle" — los errores que sufre cualquier
  // familia llegan a client_errors (ver 0092) y se ven aquí, agrupados
  // por mensaje para distinguir "un fallo que se repite en 40 móviles"
  // de "40 fallos distintos".
  const [clientErrors, setClientErrors] = useState<ClientErrorRow[]>([])
  const [expandedError, setExpandedError] = useState<string | null>(null)

  function reloadErrors() {
    listClientErrors().then(setClientErrors).catch(() => setClientErrors([]))
  }

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
    reloadErrors()
    reloadInvites()
  }, [])

  async function clearErrors(ids: string[]) {
    try {
      await deleteClientErrors(ids)
      reloadErrors()
    } catch (e) {
      setError(errorMessage(e, 'No se pudieron borrar'))
    }
  }

  if (loading) return <div className="screen">Cargando…</div>

  const families = new Map<string, { name: string; rows: AppUsageRow[] }>()
  for (const r of rows) {
    if (!families.has(r.familyId)) families.set(r.familyId, { name: r.familyName, rows: [] })
    families.get(r.familyId)!.rows.push(r)
  }

  const errorGroups = new Map<string, ClientErrorRow[]>()
  for (const e of clientErrors) {
    const key = e.message
    if (!errorGroups.has(key)) errorGroups.set(key, [])
    errorGroups.get(key)!.push(e)
  }

  // Mismo mecanismo que AdminUsageLink (MenuSettingsScreen.tsx) para decidir qué se ve dentro de esta
  // pantalla: list_app_usage() es security definer y devuelve 0 filas para cualquiera que no sea
  // is_app_owner, así que "hay filas" es la misma señal real de "soy dueño de la app" que ya decide si el
  // enlace aparece — sin ella, alguien podría llegar aquí escribiendo /admin-uso a mano y ver de todos
  // modos la sección de Automatizaciones (su fetch, getAmazonWebhookToken, no comprueba is_app_owner, solo
  // pertenencia a la familia vía RLS). Reutiliza el mecanismo existente, no crea uno nuevo.
  const isAppOwnerView = rows.length > 0

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ margin: 0 }}>🛠️ Panel de admin</h1>
        <button type="button" className="modal-close" onClick={() => navigate('/menu-organizar')} aria-label="Cerrar">
          ✕
        </button>
      </div>

      <h2 className="section-title" style={{ marginTop: 0 }}>📊 Uso de la app</h2>

      <h2 className="section-title">
        🚨 Errores de la app {clientErrors.length > 0 && <span className="muted">({clientErrors.length})</span>}
      </h2>
      {clientErrors.length === 0 ? (
        <p className="muted">Ningún error registrado. Cada fallo de pantalla que sufra cualquier familia aparecerá aquí.</p>
      ) : (
        <>
          <div className="event-list">
            {[...errorGroups.entries()].map(([message, group]) => {
              const latest = group[0]
              const open = expandedError === message
              return (
                <div key={message} className="card task-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <button
                    type="button"
                    className="link-button"
                    style={{ textAlign: 'left', padding: 0 }}
                    onClick={() => setExpandedError(open ? null : message)}
                  >
                    <strong>
                      {group.length > 1 && `×${group.length} · `}
                      {message}
                    </strong>
                  </button>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    Último: {formatDate(latest.createdAt)}
                    {latest.url && ` · ${latest.url.replace(/^https?:\/\/[^/]+/, '')}`}
                  </p>
                  {open && (
                    <>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#6b7280', margin: 0 }}>
                        {latest.stack ?? '(sin traza)'}
                        {latest.componentStack ? `\n\n— Componentes —${latest.componentStack}` : ''}
                      </pre>
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{latest.userAgent}</p>
                      <button type="button" className="link-button" onClick={() => clearErrors(group.map((g) => g.id))}>
                        ✕ Borrar estos {group.length}
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <button type="button" className="link-button" onClick={() => clearErrors(clientErrors.map((e) => e.id))}>
            ✕ Borrar todos
          </button>
        </>
      )}

      <h2 className="section-title">🔑 Códigos de invitación para familias nuevas</h2>
      <p className="muted">
        Cada código vale para crear UNA familia y caduca a los 30 días. Se lo das a la familia y ellos lo escriben en
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
                  {!inv.usedAt && ` · caduca el ${new Date(inv.expiresAt).toLocaleDateString('es-ES')}`}
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

      <h2 className="section-title">Familias y cuentas</h2>
      <p className="muted">
        Cada persona con cuenta propia (family_members sin cuenta propia no cuentan), en orden de alta.
      </p>
      {error && <p className="error">{error}</p>}
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

      {isAppOwnerView && (
        <>
          <h2 className="section-title">⚙️ Automatizaciones</h2>
          <AmazonWebhookSettings />
        </>
      )}
    </div>
  )
}

// Movida tal cual desde FamilyScreen.tsx (reorganización "Familia / Panel de admin") — mismos webhooks,
// mismo token, mismos botones "Copiar URL"/"Regenerar token", ninguna reimplementación. Antes vivía detrás
// de isAdmin (el admin de CADA familia, p. ej. Fran en "Familia prueba" también la veía); ahora solo se
// monta cuando isAppOwnerView es true (ver más arriba), así que una familia normal no llega aquí ni
// escribiendo /admin-uso a mano. Sigue operando sobre la familia de quien la ve (current_family_id() en la
// RPC/consulta, no cambia): para Jennifer/Paco, sigue siendo exactamente la automatización de su propia
// familia, ahora reubicada en vez de reimplementada.
//
// Muestra las URLs + el token secreto que hay que poner en los
// workflows de Pipedream (ver conversación con el usuario) para que los
// pedidos de Amazon, los tickets de Mercadona y los correos con
// eventos reenviados por Outlook lleguen aquí solos — mismo token para
// las tres automatizaciones, es el mismo mecanismo (identificar a la
// familia sin un login de verdad). "Regenerar" invalida el token
// anterior — útil si se ha compartido por error (rompe las TRES
// automatizaciones a la vez, hay que actualizar el token en los tres
// workflows de Pipedream si se regenera).
function AmazonWebhookSettings() {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    getAmazonWebhookToken()
      .then(setToken)
      .catch((e: Error) => setError(e.message))
  }, [])

  const base = import.meta.env.VITE_SUPABASE_URL as string
  const amazonUrl = `${base}/functions/v1/amazon-order-webhook`
  const mercadonaUrl = `${base}/functions/v1/mercadona-ticket-webhook`
  const eventEmailUrl = `${base}/functions/v1/import-event-email-webhook`

  async function handleRegenerate() {
    setBusy(true)
    setError(null)
    try {
      setToken(await regenerateAmazonWebhookToken())
    } catch (err) {
      setError(errorMessage(err, 'No se pudo regenerar el token'))
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy(field: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1500)
    } catch {
      // Sin permiso de portapapeles: el texto ya está visible para copiar a mano.
    }
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p className="muted" style={{ marginTop: 0 }}>
        Datos para los workflows de Pipedream que reciben, reenviados desde Outlook, los pedidos de
        Amazon, los tickets digitales de Mercadona y correos con eventos (boletines del colegio,
        confirmaciones de citas...) para crearlos solos en el Calendario.
      </p>
      {error && <p className="error">{error}</p>}
      {token && (
        <>
          <label>
            URL del webhook — Amazon
            <input type="text" readOnly value={amazonUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('amazon', amazonUrl)}>
            {copiedField === 'amazon' ? '✓ Copiado' : 'Copiar URL'}
          </button>
          <label style={{ marginTop: 8, display: 'block' }}>
            URL del webhook — Mercadona
            <input type="text" readOnly value={mercadonaUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('mercadona', mercadonaUrl)}>
            {copiedField === 'mercadona' ? '✓ Copiado' : 'Copiar URL'}
          </button>
          <label style={{ marginTop: 8, display: 'block' }}>
            URL del webhook — Eventos por correo (Calendario)
            <input type="text" readOnly value={eventEmailUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('eventEmail', eventEmailUrl)}>
            {copiedField === 'eventEmail' ? '✓ Copiado' : 'Copiar URL'}
          </button>
          <label style={{ marginTop: 8, display: 'block' }}>
            Token de la familia (el mismo para las tres)
            <input type="text" readOnly value={token} onFocus={(e) => e.target.select()} />
          </label>
          <button type="button" className="link-button" onClick={() => handleCopy('token', token)}>
            {copiedField === 'token' ? '✓ Copiado' : 'Copiar token'}
          </button>
          <div style={{ marginTop: 8 }}>
            <ConfirmButton label={busy ? 'Regenerando…' : 'Regenerar token'} onConfirm={handleRegenerate} />
          </div>
        </>
      )}
    </div>
  )
}
