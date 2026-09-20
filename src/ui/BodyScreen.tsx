import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  addBodyMeasurement,
  deleteBodyMeasurement,
  updateBodyMeasurement,
  updateBodyPhoto,
  deleteBodyPhoto,
  getBodyPhotoUrl,
  listBodyMeasurements,
  listBodyPhotos,
  uploadBodyPhoto,
} from '@/data/bodyTracking'
import { DEFAULT_BABY_UNTIL_MONTHS, getBabyUntilMonths, listFamilyMembers } from '@/data/family'
import { effectiveMemberType, normalizeHeightCm } from '@/domain/growth'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { BabyGrowthView } from '@/ui/BabyGrowthView'
import { KidsMeterView } from '@/ui/KidsMeterView'
import { AdultBodyView } from '@/ui/AdultBodyView'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { errorMessage } from '@/domain/errorMessage'
import type { BodyMeasurement, BodyPhoto, FamilyMember } from '@/domain/types'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Qué vista le toca a cada persona: los bebés (y los niños pequeños con
// fecha de nacimiento y sexo) ven percentiles de la OMS; el resto, la vista
// de peso y medidas.
type BodyVariant = 'baby' | 'kid' | 'other'

// Bebés: percentiles (solo aquí). Niños: medidor visual de altura. Adultos e
// invitados: peso y medidas. Un bebé pasa solo a niño a la edad configurada en
// la familia (por defecto 2 años).
function variantFor(member: FamilyMember, babyUntilMonths: number): BodyVariant {
  const type = effectiveMemberType(member.memberType, member.birthDate, babyUntilMonths, toDateStr(new Date()))
  if (type === 'baby') return 'baby'
  if (type === 'child') return 'kid'
  return 'other'
}

// Petición real: Peso y medidas sale de "La cocina de Pepa" y es una
// sección propia dentro de Familia (pestaña "Peso y medidas"), no ligada
// a las fichas de los miembros.
export function BodyTab() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('')
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([])
  const [photos, setPhotos] = useState<BodyPhoto[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [babyUntilMonths, setBabyUntilMonths] = useState(DEFAULT_BABY_UNTIL_MONTHS)
  const [editingMeasurementId, setEditingMeasurementId] = useState<string | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<BodyPhoto | null>(null)
  // Solo se muestra "Cargando…" la primera vez que se abre cada persona; al guardar una medida
  // la pantalla se queda como está (así el medidor infantil puede celebrar la medida nueva).
  const loadedFor = useRef<string | null>(null)

  useEffect(() => {
    listFamilyMembers()
      .then((m) => {
        setMembers(m)
        if (m.length > 0) setActiveMemberId(m[0].id)
      })
      .catch((e: Error) => setError(e.message))
    getBabyUntilMonths()
      .then(setBabyUntilMonths)
      .catch(() => {})
  }, [])

  function reload() {
    if (!activeMemberId) return
    if (loadedFor.current !== activeMemberId) setLoading(true)
    const requested = activeMemberId
    Promise.all([listBodyMeasurements(activeMemberId), listBodyPhotos(activeMemberId)])
      .then(async ([m, p]) => {
        setMeasurements(m)
        setPhotos(p)
        const entries = await Promise.all(p.map(async (ph) => [ph.id, await getBodyPhotoUrl(ph.storagePath)] as const))
        setPhotoUrls(Object.fromEntries(entries))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        loadedFor.current = requested
        setLoading(false)
      })
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

  const member = members.find((m) => m.id === activeMemberId)
  const variant = member ? variantFor(member, babyUntilMonths) : 'other'
  const editingMeasurement = measurements.find((m) => m.id === editingMeasurementId) ?? null
  // Alturas guardadas en metros (p. ej. 1,07) — se pueden convertir a centímetros de una vez.
  const metresHeights = measurements.filter((m) => m.heightCm != null && Number(m.heightCm) <= 2.6)

  async function fixMetresHeights() {
    try {
      for (const m of metresHeights) {
        const fixed = normalizeHeightCm(Number(m.heightCm))
        if (fixed == null) continue
        await updateBodyMeasurement(m.id, {
          date: m.measuredDate,
          weightKg: m.weightKg,
          heightCm: fixed,
          headCm: m.headCm,
          waistCm: m.waistCm,
          abdomenCm: m.abdomenCm,
          armCm: m.armCm,
          legCm: m.legCm,
        })
      }
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron convertir las alturas'))
    }
  }

  // Galería + subida de fotos: al final de la pantalla (bebés y niños) o dentro de la pestaña Fotos (adultos).
  const photosSection = member ? (
    <>
  <h2>Fotos de evolución</h2>
  <div className="gallery-grid">
    {photos.map((p) => (
      <div key={p.id} className="gallery-item">
        {photoUrls[p.id] && <img src={photoUrls[p.id]} alt={p.caption ?? ''} />}
        <ConfirmIconButton className="gallery-item-delete" ariaLabel="Borrar foto" onConfirm={() => handleDeletePhoto(p)} />
        <button type="button" className="gallery-item-edit" aria-label="Editar foto" title="Editar" onClick={() => setEditingPhoto(p)}>
          ✏️
        </button>
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

  <AddPhotoFormBody memberId={member.id} onAdded={reload} />
    </>
  ) : null

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

      {loading || !member ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          {metresHeights.length > 0 && (
            <div className="card" style={{ borderColor: '#f08c00' }}>
              <strong>📏 Hay alturas que parecen estar en metros</strong>
              <p className="muted" style={{ margin: '4px 0 8px', fontSize: 13 }}>
                {metresHeights.map((m) => `${String(m.heightCm).replace('.', ',')} → ${Math.round(Number(m.heightCm) * 100)} cm`).join(' · ')}
              </p>
              <button type="button" onClick={fixMetresHeights}>
                Convertir a centímetros
              </button>
            </div>
          )}

          {variant === 'baby' ? (
            <BabyGrowthView
              member={member}
              measurements={measurements}
              onDeleteMeasurement={handleDeleteMeasurement}
              onEditMeasurement={setEditingMeasurementId}
            />
          ) : variant === 'kid' ? (
            <>
              <KidsMeterView key={member.id} member={member} measurements={measurements} onEdit={setEditingMeasurementId} />
              <GeneralWeightView measurements={measurements} onDeleteMeasurement={handleDeleteMeasurement} onEditMeasurement={setEditingMeasurementId} />
            </>
          ) : (
            <AdultBodyView
              member={member}
              measurements={measurements}
              photos={photos}
              photoUrls={photoUrls}
              photosSlot={photosSection}
              onDeleteMeasurement={handleDeleteMeasurement}
              onEditMeasurement={setEditingMeasurementId}
              onGoalSaved={(kg) => setMembers((list) => list.map((x) => (x.id === member.id ? { ...x, weightGoalKg: kg } : x)))}
            />
          )}

          <MeasurementForm memberId={member.id} mode={variant === 'baby' ? 'baby' : variant === 'kid' ? 'kid' : 'general'} onSaved={reload} />

          {editingMeasurement && (
            <div className="modal-overlay" onClick={() => setEditingMeasurementId(null)}>
              <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2 className="section-title" style={{ margin: 0 }}>
                    Editar medida
                  </h2>
                  <button type="button" className="modal-close" onClick={() => setEditingMeasurementId(null)} aria-label="Cerrar">
                    ✕
                  </button>
                </div>
                <MeasurementForm
                  memberId={member.id}
                  mode="all"
                  initial={editingMeasurement}
                  onSaved={() => {
                    setEditingMeasurementId(null)
                    reload()
                  }}
                  onCancel={() => setEditingMeasurementId(null)}
                />
              </div>
            </div>
          )}

          {variant !== 'other' && photosSection}

          {editingPhoto && (
            <div className="modal-overlay" onClick={() => setEditingPhoto(null)}>
              <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2 className="section-title" style={{ margin: 0 }}>
                    Editar foto
                  </h2>
                  <button type="button" className="modal-close" onClick={() => setEditingPhoto(null)} aria-label="Cerrar">
                    ✕
                  </button>
                </div>
                <EditPhotoForm
                  photo={editingPhoto}
                  onSaved={() => {
                    setEditingPhoto(null)
                    reload()
                  }}
                  onCancel={() => setEditingPhoto(null)}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function GeneralWeightView({
  measurements,
  onDeleteMeasurement,
  onEditMeasurement,
}: {
  measurements: BodyMeasurement[]
  onDeleteMeasurement: (id: string) => void
  onEditMeasurement: (id: string) => void
}) {
  const withWeight = measurements.filter((m) => m.weightKg != null)
  const first = withWeight[0]
  const latest = withWeight[withWeight.length - 1]
  const weightDiff = latest && first && latest.id !== first.id ? latest.weightKg! - first.weightKg! : null

  return (
    <>
      {withWeight.length >= 2 && (
        <div className="card">
          <h2>Evolución del peso</h2>
          {weightDiff != null && (
            <p className="muted">
              {weightDiff <= 0 ? `Ha perdido ${Math.abs(weightDiff).toFixed(1)} kg desde el ` : `Ha ganado ${weightDiff.toFixed(1)} kg desde el `}
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
                {m.heightCm != null && ` · Altura ${m.heightCm} cm`}
                {m.waistCm != null && ` · Cintura ${m.waistCm} cm`}
                {m.abdomenCm != null && ` · Abdomen ${m.abdomenCm} cm`}
                {m.armCm != null && ` · Brazo ${m.armCm} cm`}
                {m.legCm != null && ` · Pierna ${m.legCm} cm`}
              </p>
            </div>
            <button type="button" className="link-button" onClick={() => onEditMeasurement(m.id)}>
              ✏️ Editar
            </button>
            <ConfirmButton label="Eliminar" onConfirm={() => onDeleteMeasurement(m.id)} />
          </div>
        ))}
        {measurements.length === 0 && <p className="muted">Todavía no hay medidas registradas.</p>}
      </div>
    </>
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
              <text x={c.x} y={dateRowY} fontSize="9" fill="#6b7280" textAnchor={i === 0 ? 'start' : i === coords.length - 1 ? 'end' : 'middle'}>
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

type MeasurementFormMode = 'baby' | 'kid' | 'general' | 'all'

const numToText = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))

// Alta de una medida nueva o, con `initial`, edición de una ya guardada (mode "all"
// enseña todos los campos para no perder ninguno al guardar).
function MeasurementForm({
  memberId,
  mode,
  initial,
  onSaved,
  onCancel,
}: {
  memberId: string
  mode: MeasurementFormMode
  initial?: BodyMeasurement
  onSaved: () => void
  onCancel?: () => void
}) {
  const [date, setDate] = useState(() => initial?.measuredDate ?? toDateStr(new Date()))
  const [weightKg, setWeightKg] = useState(numToText(initial?.weightKg ?? null))
  const [heightCm, setHeightCm] = useState(numToText(initial?.heightCm ?? null))
  const [headCm, setHeadCm] = useState(numToText(initial?.headCm ?? null))
  const [waistCm, setWaistCm] = useState(numToText(initial?.waistCm ?? null))
  const [abdomenCm, setAbdomenCm] = useState(numToText(initial?.abdomenCm ?? null))
  const [armCm, setArmCm] = useState(numToText(initial?.armCm ?? null))
  const [legCm, setLegCm] = useState(numToText(initial?.legCm ?? null))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const showHead = mode === 'baby' || mode === 'all'
  const showBody = mode === 'general' || mode === 'all'
  const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const rawHeight = num(heightCm)
    const height = rawHeight == null ? null : normalizeHeightCm(rawHeight)
    if (rawHeight != null && height == null) {
      setError('La altura tiene que estar en centímetros (por ejemplo 112) o en metros (1,12).')
      return
    }
    setSaving(true)
    try {
      const values = {
        weightKg: num(weightKg),
        heightCm: height,
        headCm: showHead ? num(headCm) : null,
        waistCm: showBody ? num(waistCm) : null,
        abdomenCm: showBody ? num(abdomenCm) : null,
        armCm: showBody ? num(armCm) : null,
        legCm: showBody ? num(legCm) : null,
      }
      if (initial) {
        await updateBodyMeasurement(initial.id, { date, ...values })
      } else {
        await addBodyMeasurement({ memberId, date, ...values })
        setWeightKg('')
        setHeightCm('')
        setHeadCm('')
        setWaistCm('')
        setAbdomenCm('')
        setArmCm('')
        setLegCm('')
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={initial ? 'member-form' : 'card member-form'}>
      {!initial && <h2>Registrar {mode === 'baby' || mode === 'kid' ? 'una medida' : 'peso y medidas'}</h2>}
      <label>
        Fecha
        <input type="date" value={date} max={toDateStr(new Date())} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Peso (kg)
        <input type="text" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      </label>
      <label>
        Altura (en cm, p. ej. 112 — también vale 1,12 m — opcional)
        <input type="text" inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
      </label>
      {showHead && (
        <label>
          Perímetro cefálico (cm, opcional)
          <input type="text" inputMode="decimal" value={headCm} onChange={(e) => setHeadCm(e.target.value)} />
        </label>
      )}
      {showBody && (
        <>
          <label>
            Cintura (cm, opcional)
            <input type="text" inputMode="decimal" value={waistCm} onChange={(e) => setWaistCm(e.target.value)} />
          </label>
          <label>
            Abdomen (cm, opcional)
            <input type="text" inputMode="decimal" value={abdomenCm} onChange={(e) => setAbdomenCm(e.target.value)} />
          </label>
          <label>
            Brazo (cm, opcional)
            <input type="text" inputMode="decimal" value={armCm} onChange={(e) => setArmCm(e.target.value)} />
          </label>
          <label>
            Pierna (cm, opcional)
            <input type="text" inputMode="decimal" value={legCm} onChange={(e) => setLegCm(e.target.value)} />
          </label>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Guardar'}
        </button>
        {onCancel && (
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

function EditPhotoForm({ photo, onSaved, onCancel }: { photo: BodyPhoto; onSaved: () => void; onCancel: () => void }) {
  const [date, setDate] = useState(photo.photoDate)
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateBodyPhoto(photo.id, { date, caption })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="member-form">
      <label>
        Fecha
        <input type="date" value={date} max={toDateStr(new Date())} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Nota (opcional)
        <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
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
