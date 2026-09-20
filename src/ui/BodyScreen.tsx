import { FormEvent, useEffect, useState } from 'react'
import {
  addBodyMeasurement,
  deleteBodyMeasurement,
  deleteBodyPhoto,
  getBodyPhotoUrl,
  listBodyMeasurements,
  listBodyPhotos,
  uploadBodyPhoto,
} from '@/data/bodyTracking'
import { listFamilyMembers } from '@/data/family'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { errorMessage } from '@/domain/errorMessage'
import type { BodyMeasurement, BodyPhoto, FamilyMember } from '@/domain/types'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Petición real: Peso y medidas sale de "La cocina de Pepa" y es una
// sección propia dentro de Familia (pestaña "Peso y medidas"), no ligada
// a las fichas de los miembros.
export function BodyTab() {
  return <WeightTab />
}

function WeightTab() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('')
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([])
  const [photos, setPhotos] = useState<BodyPhoto[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listFamilyMembers()
      .then((m) => {
        setMembers(m)
        if (m.length > 0) setActiveMemberId(m[0].id)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  function reload() {
    if (!activeMemberId) return
    setLoading(true)
    Promise.all([listBodyMeasurements(activeMemberId), listBodyPhotos(activeMemberId)])
      .then(async ([m, p]) => {
        setMeasurements(m)
        setPhotos(p)
        const entries = await Promise.all(p.map(async (ph) => [ph.id, await getBodyPhotoUrl(ph.storagePath)] as const))
        setPhotoUrls(Object.fromEntries(entries))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [activeMemberId])

  async function handleDeleteMeasurement(id: string) {
    await deleteBodyMeasurement(id)
    reload()
  }

  async function handleDeletePhoto(photo: BodyPhoto) {
    await deleteBodyPhoto(photo)
    reload()
  }

  const withWeight = measurements.filter((m) => m.weightKg != null)
  const first = withWeight[0]
  const latest = withWeight[withWeight.length - 1]
  const weightDiff = latest && first && latest.id !== first.id ? latest.weightKg! - first.weightKg! : null

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="filter-row">
        {members.map((m) => (
          <button
            key={m.id}
            className={'chip' + (activeMemberId === m.id ? ' chip-active' : '')}
            style={{ borderColor: m.color }}
            onClick={() => setActiveMemberId(m.id)}
          >
            <MemberAvatar member={m} size={18} />
            {m.name}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          {withWeight.length >= 2 && (
            <div className="card">
              <h2>Evolución del peso</h2>
              {weightDiff != null && (
                <p className="muted">
                  {weightDiff <= 0
                    ? `Ha perdido ${Math.abs(weightDiff).toFixed(1)} kg desde el `
                    : `Ha ganado ${weightDiff.toFixed(1)} kg desde el `}
                  {new Date(first.measuredDate + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </p>
              )}
              <WeightChart measurements={withWeight} />
            </div>
          )}

          <div className="event-list">
            {[...measurements].reverse().map((m) => (
              <div key={m.id} className="card task-card">
                <div className="task-card-main">
                  <strong>
                    {new Date(m.measuredDate + 'T00:00').toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </strong>
                  <p className="muted">
                    {m.weightKg != null && `${m.weightKg} kg`}
                    {m.waistCm != null && ` · Cintura ${m.waistCm} cm`}
                    {m.abdomenCm != null && ` · Abdomen ${m.abdomenCm} cm`}
                    {m.armCm != null && ` · Brazo ${m.armCm} cm`}
                    {m.legCm != null && ` · Pierna ${m.legCm} cm`}
                  </p>
                </div>
                <ConfirmButton label="Eliminar" onConfirm={() => handleDeleteMeasurement(m.id)} />
              </div>
            ))}
            {measurements.length === 0 && <p className="muted">Todavía no hay medidas registradas.</p>}
          </div>

          {activeMemberId && <AddMeasurementForm memberId={activeMemberId} onAdded={reload} />}

          <h2>Fotos de evolución</h2>
          <div className="gallery-grid">
            {photos.map((p) => (
              <div key={p.id} className="gallery-item">
                {photoUrls[p.id] && <img src={photoUrls[p.id]} alt={p.caption ?? ''} />}
                <ConfirmIconButton
                  className="gallery-item-delete"
                  ariaLabel="Borrar foto"
                  onConfirm={() => handleDeletePhoto(p)}
                />
                {p.caption && <p className="muted">{p.caption}</p>}
                <p className="muted gallery-item-date">
                  {new Date(p.photoDate + 'T00:00').toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            ))}
            {photos.length === 0 && <p className="muted">Todavía no hay fotos de evolución.</p>}
          </div>

          {activeMemberId && <AddPhotoFormBody memberId={activeMemberId} onAdded={reload} />}
        </>
      )}
    </div>
  )
}

// Petición real: "un gráfico para registrar el peso... una línea que
// vaya subiendo o bajando, marcando la fecha que es" — el gráfico ya
// existía pero no marcaba ninguna fecha, solo el kg máximo/mínimo. Con
// pocos puntos cabe la fecha debajo de cada uno; con muchos se
// solaparían, así que solo se marcan los extremos (mismo criterio que
// ya usaban las etiquetas de kg).
function WeightChart({ measurements }: { measurements: BodyMeasurement[] }) {
  const points = measurements as (BodyMeasurement & { weightKg: number })[]
  if (points.length < 2) return null

  const width = 300
  const height = 130
  const padding = 24
  const dateRowY = height - 10
  const chartBottom = dateRowY - 14
  const weights = points.map((p) => p.weightKg)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const range = max - min || 1

  const coords = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2)
    const y = chartBottom - ((p.weightKg - min) / range) * (chartBottom - padding)
    return { x, y }
  })

  const shortDate = (d: string) => new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  const showEveryDate = points.length <= 6

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="weight-chart" role="img" aria-label="Gráfico de evolución del peso">
      <polyline points={coords.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2" />
      {coords.map((c, i) => {
        const isEdge = i === 0 || i === coords.length - 1
        return (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r="3" fill="var(--primary)" />
            {(showEveryDate || isEdge) && (
              <text
                x={c.x}
                y={dateRowY}
                fontSize="9"
                fill="#6b7280"
                textAnchor={i === 0 ? 'start' : i === coords.length - 1 ? 'end' : 'middle'}
              >
                {shortDate(points[i].measuredDate)}
              </text>
            )}
          </g>
        )
      })}
      <text x={padding} y={12} fontSize="10" fill="#6b7280">
        {max} kg
      </text>
      <text x={padding} y={chartBottom - 4} fontSize="10" fill="#6b7280">
        {min} kg
      </text>
    </svg>
  )
}

function AddMeasurementForm({ memberId, onAdded }: { memberId: string; onAdded: () => void }) {
  const [date, setDate] = useState(() => toDateStr(new Date()))
  const [weightKg, setWeightKg] = useState('')
  const [waistCm, setWaistCm] = useState('')
  const [abdomenCm, setAbdomenCm] = useState('')
  const [armCm, setArmCm] = useState('')
  const [legCm, setLegCm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addBodyMeasurement({
        memberId,
        date,
        weightKg: weightKg ? Number(weightKg) : null,
        waistCm: waistCm ? Number(waistCm) : null,
        abdomenCm: abdomenCm ? Number(abdomenCm) : null,
        armCm: armCm ? Number(armCm) : null,
        legCm: legCm ? Number(legCm) : null,
      })
      setWeightKg('')
      setWaistCm('')
      setAbdomenCm('')
      setArmCm('')
      setLegCm('')
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Registrar peso y medidas</h2>
      <label>
        Fecha
        <input type="date" value={date} max={toDateStr(new Date())} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Peso (kg)
        <input type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      </label>
      <label>
        Cintura (cm, opcional)
        <input type="number" step="0.1" value={waistCm} onChange={(e) => setWaistCm(e.target.value)} />
      </label>
      <label>
        Abdomen (cm, opcional)
        <input type="number" step="0.1" value={abdomenCm} onChange={(e) => setAbdomenCm(e.target.value)} />
      </label>
      <label>
        Brazo (cm, opcional)
        <input type="number" step="0.1" value={armCm} onChange={(e) => setArmCm(e.target.value)} />
      </label>
      <label>
        Pierna (cm, opcional)
        <input type="number" step="0.1" value={legCm} onChange={(e) => setLegCm(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}

function AddPhotoFormBody({ memberId, onAdded }: { memberId: string; onAdded: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [date, setDate] = useState(() => toDateStr(new Date()))
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Elige una foto')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await uploadBodyPhoto({ memberId, date, file, caption })
      setFile(null)
      setCaption('')
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo subir la foto'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Subir foto de evolución</h2>
      <label>
        Foto
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      </label>
      <label>
        Fecha
        <input type="date" value={date} max={toDateStr(new Date())} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Nota (opcional)
        <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Subiendo…' : 'Subir'}
      </button>
    </form>
  )
}
