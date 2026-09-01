import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  completeTask,
  createReward,
  createTask,
  deleteReward,
  deleteTask,
  listCompletions,
  listRedemptions,
  listRewards,
  listTasks,
  redeemReward,
  uncompleteTask,
} from '@/data/tasks'
import { listFamilyMembers } from '@/data/family'
import { WEEKDAY_LABELS } from '@/domain/calendar'
import { calculateStreak, isCompletedToday, isTaskDueOn, memberPointsBalance } from '@/domain/tasks'
import type {
  FamilyMember,
  Reward,
  RewardRedemption,
  Task,
  TaskCompletion,
  TaskType,
} from '@/domain/types'

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'unica', label: 'Única' },
  { value: 'recurrente', label: 'Recurrente' },
  { value: 'rutina', label: 'Rutina' },
  { value: 'mision', label: 'Misión' },
]

const FREQ_OPTIONS = [
  { value: '', label: 'No se repite' },
  { value: 'DAILY', label: 'Cada día' },
  { value: 'WEEKLY', label: 'Cada semana' },
  { value: 'MONTHLY', label: 'Cada mes' },
  { value: 'YEARLY', label: 'Cada año' },
]

// Mismo orden que WEEKDAY_LABELS (L M X J V S D) pero en código RFC 5545,
// para poder montar "FREQ=WEEKLY;BYDAY=MO,TU,..." a partir de los chips
// que el usuario marque (p. ej. "de lunes a viernes").
const BYDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

function buildRecurrenceRule(freq: string, byDay: string[]): string | null {
  if (!freq) return null
  if (freq === 'WEEKLY' && byDay.length > 0) return `FREQ=WEEKLY;BYDAY=${byDay.join(',')}`
  return `FREQ=${freq}`
}

function parseRecurrenceRule(rule: string | null): { freq: string; byDay: string[] } {
  if (!rule) return { freq: '', byDay: [] }
  const parts = Object.fromEntries(rule.split(';').map((p) => p.split('=')))
  return { freq: parts.FREQ ?? '', byDay: parts.BYDAY ? parts.BYDAY.split(',') : [] }
}

function recurrenceLabel(rule: string | null): string {
  const { freq, byDay } = parseRecurrenceRule(rule)
  if (!freq) return ''
  const base = FREQ_OPTIONS.find((f) => f.value === freq)?.label ?? ''
  if (freq === 'WEEKLY' && byDay.length > 0) {
    const days = byDay.map((code) => WEEKDAY_LABELS[BYDAY_CODES.indexOf(code)]).join('')
    return `${base} (${days})`
  }
  return base
}

function WeekdayPicker({ selected, onToggle }: { selected: string[]; onToggle: (code: string) => void }) {
  return (
    <div className="filter-row">
      {BYDAY_CODES.map((code, i) => (
        <button
          type="button"
          key={code}
          className={'chip' + (selected.includes(code) ? ' chip-active' : '')}
          onClick={() => onToggle(code)}
        >
          {WEEKDAY_LABELS[i]}
        </button>
      ))}
    </div>
  )
}

export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [completions, setCompletions] = useState<TaskCompletion[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('all')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  function reload() {
    setLoading(true)
    Promise.all([listTasks(), listCompletions(), listRewards(), listRedemptions(), listFamilyMembers()])
      .then(([t, c, r, red, m]) => {
        setTasks(t)
        setCompletions(c)
        setRewards(r)
        setRedemptions(red)
        setMembers(m)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const visibleTasks = useMemo(() => {
    const byMember =
      activeMemberId === 'all'
        ? tasks
        : tasks.filter((t) => t.memberId === null || t.memberId === activeMemberId)
    return showAll ? byMember : byMember.filter((t) => isTaskDueOn(t, todayStr))
  }, [tasks, activeMemberId, showAll, todayStr])

  const balance =
    activeMemberId === 'all' ? null : memberPointsBalance(activeMemberId, completions, redemptions)

  async function handleToggle(task: Task, done: boolean) {
    if (activeMemberId === 'all') return
    setError(null)
    try {
      if (done) await uncompleteTask(task.id, activeMemberId)
      else await completeTask(task.id, activeMemberId, task.points)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la tarea')
    }
  }

  async function handleRedeem(reward: Reward) {
    if (activeMemberId === 'all') return
    setError(null)
    try {
      await redeemReward(reward.id, activeMemberId, reward.pointsCost)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo canjear la recompensa')
    }
  }

  if (loading) return <div className="screen">Cargando tareas…</div>

  return (
    <div className="screen">
      <h1>Tareas</h1>
      {error && <p className="error">{error}</p>}

      <div className="filter-row">
        <button
          className={'chip' + (activeMemberId === 'all' ? ' chip-active' : '')}
          onClick={() => setActiveMemberId('all')}
        >
          Todos
        </button>
        {members.map((m) => (
          <button
            key={m.id}
            className={'chip' + (activeMemberId === m.id ? ' chip-active' : '')}
            style={{ borderColor: m.color }}
            onClick={() => setActiveMemberId(m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <button className={'chip' + (!showAll ? ' chip-active' : '')} onClick={() => setShowAll(false)}>
          Hoy
        </button>
        <button className={'chip' + (showAll ? ' chip-active' : '')} onClick={() => setShowAll(true)}>
          Todas
        </button>
      </div>

      {activeMemberId === 'all' ? (
        <p className="muted">Selecciona un miembro para marcar tareas y ver sus puntos.</p>
      ) : (
        <p className="points-badge">⭐ {balance} puntos</p>
      )}

      <div className="event-list">
        {visibleTasks.map((task) => {
          const memberForStreak = activeMemberId === 'all' ? task.memberId : activeMemberId
          const taskCompletions = completions
            .filter((c) => c.taskId === task.id && c.memberId === memberForStreak)
            .map((c) => c.completedDate)
          const done = activeMemberId !== 'all' && isCompletedToday(taskCompletions)
          const streak = memberForStreak ? calculateStreak(taskCompletions) : 0
          const owner = members.find((m) => m.id === task.memberId)

          return (
            <div key={task.id} className="card task-card">
              <div className="task-card-main">
                <strong>{task.title}</strong>
                <p className="muted">
                  {TASK_TYPES.find((t) => t.value === task.taskType)?.label} · {task.points} pts
                  {streak > 0 && ` · 🔥 ${streak}`}
                  {!owner && ' · Familiar'}
                  {task.timeOfDay && ` · ${task.timeOfDay.slice(0, 5)}`}
                  {recurrenceLabel(task.recurrenceRule) && ` · ${recurrenceLabel(task.recurrenceRule)}`}
                </p>
              </div>
              <button
                type="button"
                className={'task-toggle' + (done ? ' task-toggle-done' : '')}
                disabled={activeMemberId === 'all'}
                onClick={() => handleToggle(task, done)}
              >
                {done ? '✓ Hecho' : 'Marcar hecho'}
              </button>
              <button type="button" className="link-button" onClick={() => deleteTask(task.id).then(reload)}>
                Borrar
              </button>
            </div>
          )
        })}
        {visibleTasks.length === 0 && <p className="muted">No hay tareas todavía.</p>}
      </div>

      <AddTaskForm members={members} onAdded={reload} />

      <h2 className="section-title">Recompensas</h2>
      <div className="event-list">
        {rewards.map((reward) => (
          <div key={reward.id} className="card task-card">
            <div className="task-card-main">
              <strong>{reward.title}</strong>
              <p className="muted">⭐ {reward.pointsCost} puntos</p>
            </div>
            <button
              type="button"
              className="task-toggle"
              disabled={activeMemberId === 'all' || (balance ?? 0) < reward.pointsCost}
              onClick={() => handleRedeem(reward)}
            >
              Canjear
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => deleteReward(reward.id).then(reload)}
            >
              Borrar
            </button>
          </div>
        ))}
        {rewards.length === 0 && <p className="muted">No hay recompensas todavía.</p>}
      </div>

      <AddRewardForm onAdded={reload} />
    </div>
  )
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function AddTaskForm({ members, onAdded }: { members: FamilyMember[]; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('unica')
  const [memberId, setMemberId] = useState<string>('')
  const [points, setPoints] = useState(5)
  const [startDate, setStartDate] = useState(todayIso())
  const [timeOfDay, setTimeOfDay] = useState('')
  const [freq, setFreq] = useState('')
  const [byDay, setByDay] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function toggleDay(code: string) {
    setByDay((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createTask({
        title,
        taskType,
        memberId: memberId || null,
        points,
        recurrenceRule: buildRecurrenceRule(freq, byDay),
        startDate,
        timeOfDay: timeOfDay || null,
      })
      setTitle('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nueva tarea</h2>
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Tipo
        <select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)}>
          {TASK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Para quién
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Toda la familia</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Puntos
        <input
          type="number"
          min={0}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
        />
      </label>
      <label>
        Fecha de inicio
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </label>
      <label>
        Hora (opcional)
        <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
      </label>
      <label>
        Repetir
        <select value={freq} onChange={(e) => setFreq(e.target.value)}>
          {FREQ_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {freq === 'WEEKLY' && (
        <div>
          <p className="muted">¿Qué días? (deja vacío para repetir cada 7 días desde la fecha de inicio)</p>
          <WeekdayPicker selected={byDay} onToggle={toggleDay} />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear tarea'}
      </button>
    </form>
  )
}

function AddRewardForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [pointsCost, setPointsCost] = useState(20)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createReward({ title, pointsCost })
      setTitle('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la recompensa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nueva recompensa</h2>
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Coste en puntos
        <input
          type="number"
          min={1}
          value={pointsCost}
          onChange={(e) => setPointsCost(Number(e.target.value))}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear recompensa'}
      </button>
    </form>
  )
}
