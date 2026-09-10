// Buzón de sugerencias — petición real: "que cuando alguna familia de
// prueba tenga alguna sugerencia, nos la dejen en el buzón y nosotros
// podamos aplicarlo". Cualquier familia deja las suyas; la familia
// dueña de la app las ve TODAS para revisarlas (RLS, ver migración
// 0078 — el mismo id de familia está hardcodeado aquí solo para saber
// si hay que pintar los controles de administración, la seguridad de
// verdad la hace la base de datos, no esta comprobación).
import { FormEvent, useEffect, useState } from 'react'
import {
  createSuggestion,
  getFamilyNameForSuggestion,
  listSuggestions,
  updateSuggestionStatus,
  withdrawSuggestion,
} from '@/data/suggestions'
import { supabase } from '@/data/supabaseClient'
import { errorMessage } from '@/domain/errorMessage'
import { ConfirmIconButton } from '@/ui/ConfirmButton'
import type { Suggestion } from '@/domain/types'

const OWNER_FAMILY_ID = '011429a4-4fd8-4341-9c04-ec6b2f585196'

const STATUS_LABELS: Record<Suggestion['status'], string> = {
  pendiente: '🕓 Pendiente',
  aplicada: '✅ Aplicada',
  descartada: '✕ Descartada',
}

export function SuggestionsScreen() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [familyNames, setFamilyNames] = useState<Map<string, string>>(new Map())
  const [isOwner, setIsOwner] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([
      listSuggestions(),
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) return null
        const { data: profileRow } = await supabase.from('profiles').select('family_id').eq('id', data.user.id).single()
        return profileRow?.family_id ?? null
      }),
    ])
      .then(async ([rows, myFamilyId]) => {
        const owner = myFamilyId === OWNER_FAMILY_ID
        setIsOwner(owner)
        setSuggestions(rows)
        if (owner) {
          const otherFamilyIds = [...new Set(rows.map((r) => r.familyId).filter((id) => id !== myFamilyId))]
          const entries = await Promise.all(
            otherFamilyIds.map(async (id) => [id, await getFamilyNameForSuggestion(id)] as const),
          )
          setFamilyNames(new Map(entries.filter((e): e is [string, string] => !!e[1])))
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    setError(null)
    try {
      await createSuggestion(message)
      setMessage('')
      reload()
    } catch (err) {
      setError(errorMessage(err, String(err)))
    } finally {
      setSending(false)
    }
  }

  if (loading) return <p className="muted">Cargando buzón de sugerencias…</p>

  return (
    <div className="screen">
      <h1>💡 Buzón de sugerencias</h1>
      <p className="muted">
        {isOwner
          ? 'Aquí llegan las sugerencias de todas las familias que usan la app.'
          : '¿Se te ocurre algo que mejorar? Déjalo aquí y lo revisamos.'}
      </p>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSubmit} className="card member-form">
        <label>
          Nueva sugerencia
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Cuéntanos qué añadirías o cambiarías…"
            rows={3}
          />
        </label>
        <button type="submit" disabled={sending || !message.trim()}>
          {sending ? 'Enviando…' : '📮 Enviar sugerencia'}
        </button>
      </form>

      <div className="event-list" style={{ marginTop: 16 }}>
        {suggestions.length === 0 && <p className="muted">Todavía no hay ninguna sugerencia.</p>}
        {suggestions.map((s) => (
          <div key={s.id} className="card task-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>
                {isOwner && s.familyId !== OWNER_FAMILY_ID ? `${familyNames.get(s.familyId) ?? 'Familia'} · ` : ''}
                {STATUS_LABELS[s.status]}
              </strong>
              <span className="muted" style={{ fontSize: 12 }}>
                {s.createdAt.slice(0, 10)}
              </span>
            </div>
            <p style={{ margin: 0 }}>{s.message}</p>
            {s.adminNote && (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Respuesta: {s.adminNote}
              </p>
            )}
            {isOwner && s.status === 'pendiente' && (
              <SuggestionAdminActions suggestionId={s.id} onDone={reload} />
            )}
            {!isOwner && s.status === 'pendiente' && (
              <ConfirmIconButton
                icon="Retirar"
                className="link-button"
                ariaLabel="Retirar sugerencia"
                onConfirm={() => withdrawSuggestion(s.id).then(reload)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SuggestionAdminActions({ suggestionId, onDone }: { suggestionId: string; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function resolve(status: 'aplicada' | 'descartada') {
    setSaving(true)
    try {
      await updateSuggestionStatus(suggestionId, status, note)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inline-fields" style={{ marginTop: 4 }}>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota (opcional)"
        style={{ flex: 1 }}
      />
      <button type="button" onClick={() => resolve('aplicada')} disabled={saving} style={{ flex: 'none' }}>
        ✅ Aplicada
      </button>
      <button type="button" className="link-button" onClick={() => resolve('descartada')} disabled={saving} style={{ flex: 'none' }}>
        Descartar
      </button>
    </div>
  )
}
