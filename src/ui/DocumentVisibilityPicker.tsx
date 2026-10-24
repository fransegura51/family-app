import type { FamilyMember } from '@/domain/types'

// «Quién puede ver este documento»: toda la familia (lo de siempre), solo yo, o personas concretas. El servidor lo hace cumplir (RLS, migración 0317):
// quien no figura en la lista no recibe ni el documento ni el archivo.
export type DocumentAudience = { mode: 'family' } | { mode: 'me' } | { mode: 'some'; ids: string[] }

export const FAMILY_AUDIENCE: DocumentAudience = { mode: 'family' }

/** Lo que se guarda en la columna visible_to_member_ids: null = toda la familia; lista = solo esas fichas (y quien lo sube). */
export function audienceToIds(audience: DocumentAudience): string[] | null {
  if (audience.mode === 'family') return null
  if (audience.mode === 'me') return []
  return audience.ids
}

export function idsToAudience(ids: string[] | null): DocumentAudience {
  if (ids === null) return { mode: 'family' }
  if (ids.length === 0) return { mode: 'me' }
  return { mode: 'some', ids }
}

/** Texto corto para la fila del documento; null si lo ve toda la familia. */
export function describeAudience(ids: string[] | null, members: FamilyMember[]): string | null {
  if (ids === null) return null
  const names = ids.map((id) => members.find((m) => m.id === id)?.name).filter((n): n is string => !!n)
  if (names.length === 0) return '🔒 Solo quien lo subió'
  return `🔒 Lo ven: ${names.join(', ')} y quien lo subió`
}

export function DocumentVisibilityPicker({
  members,
  value,
  onChange,
}: {
  members: FamilyMember[]
  value: DocumentAudience
  onChange: (next: DocumentAudience) => void
}) {
  const chosen = value.mode === 'some' ? value.ids : []

  function toggle(id: string) {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]
    onChange(next.length === 0 ? { mode: 'some', ids: [] } : { mode: 'some', ids: next })
  }

  return (
    <fieldset className="member-form" style={{ border: 'none', padding: 0, margin: '8px 0' }} data-help-id="documentos.quien-ve">
      <legend style={{ padding: 0, fontWeight: 600 }}>¿Quién puede ver este documento?</legend>
      <label className="inline-fields" style={{ alignItems: 'center' }}>
        <input type="radio" name="doc-audience" checked={value.mode === 'family'} onChange={() => onChange({ mode: 'family' })} style={{ width: 'auto' }} />
        Toda la familia
      </label>
      <label className="inline-fields" style={{ alignItems: 'center' }}>
        <input type="radio" name="doc-audience" checked={value.mode === 'me'} onChange={() => onChange({ mode: 'me' })} style={{ width: 'auto' }} />
        Solo yo
      </label>
      <label className="inline-fields" style={{ alignItems: 'center' }}>
        <input type="radio" name="doc-audience" checked={value.mode === 'some'} onChange={() => onChange({ mode: 'some', ids: chosen })} style={{ width: 'auto' }} />
        Elegir personas
      </label>
      {value.mode === 'some' && (
        <div style={{ marginLeft: 24 }} data-help-id="documentos.quien-ve-personas">
          {members.map((m) => (
            <label key={m.id} className="inline-fields" style={{ alignItems: 'center' }}>
              <input type="checkbox" checked={chosen.includes(m.id)} onChange={() => toggle(m.id)} style={{ width: 'auto' }} />
              {m.name}
            </label>
          ))}
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Tú siempre lo ves. Si no marcas a nadie, solo lo verás tú.
          </p>
        </div>
      )}
    </fieldset>
  )
}
