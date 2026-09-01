import { FormEvent, useEffect, useState } from 'react'
import {
  deleteMemberDocument,
  getMemberDocumentUrl,
  listMemberDocuments,
  uploadMemberDocument,
} from '@/data/documents'
import { listFamilyMembers } from '@/data/family'
import type { FamilyMember, MemberDocument } from '@/domain/types'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'

// Las 4 carpetas pedidas. "Casa" y "Familia" normalmente no son de una
// persona en concreto — por eso el miembro es opcional en el formulario,
// no una carpeta más.
const FOLDERS = ['Privada', 'Educación', 'Casa', 'Familia'] as const

export function DocumentsScreen() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [documents, setDocuments] = useState<MemberDocument[]>([])
  const [folder, setFolder] = useState<string>(FOLDERS[0])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listFamilyMembers(), listMemberDocuments()])
      .then(([m, d]) => {
        setMembers(m)
        setDocuments(d)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function handleDelete(doc: MemberDocument) {
    try {
      await deleteMemberDocument(doc)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar')
    }
  }

  const memberById = new Map(members.map((m) => [m.id, m]))
  const folderDocuments = documents.filter((d) => d.category === folder)

  if (loading) return <div className="screen">Cargando documentos…</div>

  return (
    <div className="screen">
      <h1>Documentos</h1>
      {error && <p className="error">{error}</p>}
      <div className="filter-row">
        {FOLDERS.map((f) => (
          <button key={f} className={'chip' + (folder === f ? ' chip-active' : '')} onClick={() => setFolder(f)}>
            {f}
          </button>
        ))}
      </div>

      <div className="event-list">
        {folderDocuments.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} member={memberById.get(doc.memberId ?? '')} onDelete={() => handleDelete(doc)} />
        ))}
        {folderDocuments.length === 0 && <p className="muted">Sin documentos en "{folder}" todavía.</p>}
      </div>

      <AddDocumentForm folder={folder} members={members} onAdded={reload} />
    </div>
  )
}

function DocumentRow({
  doc,
  member,
  onDelete,
}: {
  doc: MemberDocument
  member: FamilyMember | undefined
  onDelete: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  return (
    <div className="card task-card">
      <div className="task-card-main">
        <strong>{doc.title}</strong>
        {member && <p className="muted">{member.name}</p>}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            Ver documento
          </a>
        ) : (
          <button type="button" className="link-button" onClick={() => getMemberDocumentUrl(doc.storagePath).then(setUrl)}>
            Ver documento
          </button>
        )}
      </div>
      <button type="button" className="link-button" onClick={onDelete}>
        Eliminar
      </button>
    </div>
  )
}

function AddDocumentForm({
  folder,
  members,
  onAdded,
}: {
  folder: string
  members: FamilyMember[]
  onAdded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [memberId, setMemberId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Elige un archivo')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await uploadMemberDocument({ memberId: memberId || null, file, title, category: folder })
      setFile(null)
      setTitle('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el documento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Subir a "{folder}"</h2>
      <label>Archivo</label>
      <FileOrPdfPicker file={file} onChange={setFile} />
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="DNI" required />
      </label>
      <label>
        De quién (opcional)
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Nadie en particular</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Subiendo…' : 'Guardar'}
      </button>
    </form>
  )
}
