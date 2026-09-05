import { FormEvent, useEffect, useState } from 'react'
import {
  deleteMemberDocument,
  getMemberDocumentUrl,
  listMemberDocuments,
  uploadMemberDocument,
} from '@/data/documents'
import { createDocumentCategory, listDocumentCategories, type DocumentCategory } from '@/data/documentCategories'
import { listFamilyMembers } from '@/data/family'
import type { FamilyMember, MemberDocument } from '@/domain/types'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { AddMemberForm } from '@/ui/FamilyScreen'

const UNCATEGORIZED = '__uncategorized__'
const UNSPECIFIED = '__unspecified__'

// Carpetas grandes de colores con un icono relacionado, en vez de una
// fila de texto con un emoji pequeño delante — petición real: "las
// carpetas que sean de este estilo más dinámicas" (captura de
// referencia con Familia/Privado/Educación/Casa como iconos de colores
// en una rejilla). Las categorías propias de la familia tienen su
// icono ya pensado; cualquier categoría nueva que se añada cae en el
// estilo por defecto.
const CATEGORY_STYLES: Record<string, { emoji: string; color: string }> = {
  familia: { emoji: '❤️', color: '#4c6ef5' },
  privado: { emoji: '🔒', color: '#12b886' },
  educación: { emoji: '🎓', color: '#f2b705' },
  educacion: { emoji: '🎓', color: '#f2b705' },
  casa: { emoji: '🏠', color: '#f08a4b' },
  salud: { emoji: '➕', color: '#e0495c' },
}
const DEFAULT_CATEGORY_STYLE = { emoji: '🗂️', color: '#868e96' }

function categoryStyle(name: string): { emoji: string; color: string } {
  return CATEGORY_STYLES[name.trim().toLowerCase()] ?? DEFAULT_CATEGORY_STYLE
}

// Dos niveles de carpeta, como se pidió: "una carpeta dentro de cada
// sección... Casa: Paco, Jennifer, Fernando... Familia: Paco, Eric,
// Jennifer, Fernando, con los documentos de cada uno". Primero la
// categoría (Privada/Educación/Casa/Familia + las que se añadan),
// dentro de cada una una carpeta por persona ("Sin especificar" +
// cada miembro), y dentro de esa ya los documentos — mismo patrón de
// carpetas plegables que Tickets, anidado un nivel más.
export function DocumentsScreen() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [documents, setDocuments] = useState<MemberDocument[]>([])
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [addingCategory, setAddingCategory] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [uploading, setUploading] = useState(false)

  function reload() {
    setLoading(true)
    Promise.all([listFamilyMembers(), listMemberDocuments(), listDocumentCategories()])
      .then(([m, d, c]) => {
        setMembers(m)
        setDocuments(d)
        setCategories(c)
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

  function selectCategory(name: string) {
    setExpandedMember(null)
    setExpandedCategory(expandedCategory === name ? null : name)
  }

  if (loading) return <div className="screen">Cargando documentos…</div>

  // Categorías conocidas (persistidas) + cualquier categoría suelta que
  // ya tuviera algún documento de antes (para no perder documentos
  // antiguos si su categoría ya no está en la lista persistida) + los
  // documentos sin categoría, en su propia carpeta.
  const categoryNames = new Set(categories.map((c) => c.name))
  for (const d of documents) {
    if (d.category?.trim()) categoryNames.add(d.category.trim())
  }
  const hasUncategorized = documents.some((d) => !d.category?.trim())
  const sortedCategoryNames = [...categoryNames].sort((a, b) => a.localeCompare(b))

  const docsForCategory = (catName: string) =>
    catName === UNCATEGORIZED
      ? documents.filter((d) => !d.category?.trim())
      : documents.filter((d) => (d.category?.trim() || null) === catName)

  const expandedDocs = expandedCategory ? docsForCategory(expandedCategory) : []

  return (
    <div className="screen">
      <h1>Documentos</h1>
      {error && <p className="error">{error}</p>}

      {/* Carpetas grandes de colores en rejilla, con el icono de cada
          categoría — petición real: "las carpetas que sean de este
          estilo más dinámicas" (captura de referencia). Tocar una la
          abre debajo, en vez de navegar a otra pantalla, para no
          perder de vista el resto de carpetas. */}
      <div className="doc-folder-grid">
        {sortedCategoryNames.map((catName) => {
          const catDocs = docsForCategory(catName)
          const style = categoryStyle(catName)
          return (
            <button
              key={catName}
              type="button"
              className={'doc-folder-card' + (expandedCategory === catName ? ' doc-folder-card-active' : '')}
              onClick={() => selectCategory(catName)}
            >
              <span className="doc-folder-icon" style={{ background: style.color }}>
                {style.emoji}
              </span>
              <strong className="doc-folder-name">{catName}</strong>
              <span className="muted doc-folder-count">
                {catDocs.length === 0 ? 'Vacío' : `${catDocs.length} ${catDocs.length === 1 ? 'archivo' : 'archivos'}`}
              </span>
            </button>
          )
        })}

        {hasUncategorized && (
          <button
            type="button"
            className={'doc-folder-card' + (expandedCategory === UNCATEGORIZED ? ' doc-folder-card-active' : '')}
            onClick={() => selectCategory(UNCATEGORIZED)}
          >
            <span className="doc-folder-icon" style={{ background: DEFAULT_CATEGORY_STYLE.color }}>
              📄
            </span>
            <strong className="doc-folder-name">Sin categoría</strong>
            <span className="muted doc-folder-count">
              {docsForCategory(UNCATEGORIZED).length === 0
                ? 'Vacío'
                : `${docsForCategory(UNCATEGORIZED).length} ${docsForCategory(UNCATEGORIZED).length === 1 ? 'archivo' : 'archivos'}`}
            </span>
          </button>
        )}

        <button
          type="button"
          className={'doc-folder-card doc-folder-card-add' + (addingCategory ? ' doc-folder-card-active' : '')}
          onClick={() => setAddingCategory((v) => !v)}
        >
          <span className="doc-folder-icon doc-folder-icon-add">➕</span>
          <strong className="doc-folder-name">Nueva carpeta</strong>
        </button>
      </div>

      {addingCategory && (
        <div className="card member-form" style={{ marginTop: 12 }}>
          <AddCategoryInline
            onAdded={() => {
              setAddingCategory(false)
              reload()
            }}
          />
        </div>
      )}

      {expandedCategory && (
        <div className="doc-folder-expanded">
          <h2 className="section-title">
            {expandedCategory === UNCATEGORIZED ? 'Sin categoría' : expandedCategory}
          </h2>
          <MemberFolders
            members={members}
            documents={expandedDocs}
            expandedMember={expandedMember}
            onSelectMember={setExpandedMember}
            addingMember={addingMember}
            onToggleAddingMember={() => setAddingMember((v) => !v)}
            onDelete={handleDelete}
            onReload={reload}
          />
        </div>
      )}

      {/* Antes había que entrar en la carpeta de la persona para
          subirle algo — petición real: "que se pueda elegir desde el
          botón flotante a dónde se sube, a Casa Jennifer, a Casa Eric,
          a Familia Paco o donde sea", en vez de tener un formulario
          repetido dentro de cada carpeta. Un único botón, y el destino
          (categoría + persona) se elige en el propio formulario. */}
      <button type="button" className="screen-fab" onClick={() => setUploading(true)}>
        + Subir foto
      </button>

      {uploading && (
        <div className="modal-overlay" onClick={() => setUploading(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Subir documento
              </h2>
              <button type="button" className="modal-close" onClick={() => setUploading(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <AddDocumentForm
              members={members}
              categories={sortedCategoryNames}
              defaultCategory={expandedCategory && expandedCategory !== UNCATEGORIZED ? expandedCategory : ''}
              defaultMemberId={expandedMember && expandedMember !== UNSPECIFIED ? expandedMember : ''}
              onAdded={() => {
                setUploading(false)
                reload()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function MemberFolders({
  members,
  documents,
  expandedMember,
  onSelectMember,
  addingMember,
  onToggleAddingMember,
  onDelete,
  onReload,
}: {
  members: FamilyMember[]
  documents: MemberDocument[]
  expandedMember: string | null
  onSelectMember: (id: string | null) => void
  addingMember: boolean
  onToggleAddingMember: () => void
  onDelete: (doc: MemberDocument) => void
  onReload: () => void
}) {
  const folders: { id: string; member: FamilyMember | null; name: string }[] = [
    { id: UNSPECIFIED, member: null, name: 'Sin especificar' },
    ...members.map((m) => ({ id: m.id, member: m, name: m.name })),
  ]

  return (
    <div className="event-list store-folder-contents">
      <div className="store-folder-grid">
        {folders.map((f) => {
          const memberDocs = documents.filter((d) => (d.memberId ?? UNSPECIFIED) === f.id)
          const isOpen = expandedMember === f.id
          return (
            <div key={f.id} className="store-folder">
              <button
                type="button"
                className="store-folder-header"
                onClick={() => onSelectMember(isOpen ? null : f.id)}
              >
                <span className="store-folder-icon">
                  {f.member ? <MemberAvatar member={f.member} size={22} /> : '📁'}
                </span>
                <span className="store-folder-info">
                  <strong>{f.name}</strong>
                  <span className="muted">
                    {memberDocs.length} {memberDocs.length === 1 ? 'documento' : 'documentos'}
                  </span>
                </span>
                <span className="store-folder-chevron">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="event-list store-folder-contents">
                  {memberDocs.map((doc) => (
                    <DocumentRow key={doc.id} doc={doc} onDelete={() => onDelete(doc)} />
                  ))}
                  {memberDocs.length === 0 && <p className="muted">Sin documentos todavía.</p>}
                </div>
              )}
            </div>
          )
        })}

        <div className="store-folder">
          <button type="button" className="store-folder-header" onClick={onToggleAddingMember}>
            <span className="store-folder-icon">➕</span>
            <span className="store-folder-info">
              <strong>Añadir miembro</strong>
            </span>
            <span className="store-folder-chevron">{addingMember ? '▾' : '▸'}</span>
          </button>
          {addingMember && (
            <div className="store-folder-contents">
              <AddMemberForm onAdded={onReload} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DocumentRow({ doc, onDelete }: { doc: MemberDocument; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null)

  return (
    <div className="card task-card">
      <div className="task-card-main">
        <strong>{doc.title}</strong>
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
      <ConfirmButton label="Eliminar" onConfirm={onDelete} />
    </div>
  )
}

function AddCategoryInline({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createDocumentCategory(name.trim())
      setName('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir la categoría')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="inline-fields">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría (p. ej. Salud)" />
      <button type="submit" disabled={saving || !name.trim()}>
        + Añadir categoría
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

function AddDocumentForm({
  members,
  categories,
  defaultCategory,
  defaultMemberId,
  onAdded,
}: {
  members: FamilyMember[]
  categories: string[]
  defaultCategory: string
  defaultMemberId: string
  onAdded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [memberId, setMemberId] = useState(defaultMemberId)
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
      await uploadMemberDocument({ memberId: memberId || null, file, title, category })
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
    <form onSubmit={handleSubmit} className="member-form">
      <label>Archivo</label>
      <FileOrPdfPicker file={file} onChange={setFile} />
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="DNI" required />
      </label>
      <label>
        A qué carpeta (categoría)
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        A quién
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Sin especificar</option>
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
