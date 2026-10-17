import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { importPostRecipes } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { importResultSummary, ingredientLine, orderedKeys, parsePostRecipes, toggleKey, type PostRecipe, type PostRecipeImportResult } from '@/domain/communityPostRecipes'
import './communityRecipes.css'

// «Importar a mi Cocina» para las recetas (y variantes) que trae una publicación. Cada receta se puede importar SOLA, o varias a la vez marcándolas.
// Las recetas vienen ya estructuradas del servidor (nombre, raciones, ingredientes con su cantidad y la preparación): NO se sacan del texto libre, así que nunca
// se inventa una cantidad ni un paso. Antes de importar se enseña, en la propia ficha, lo que se va a guardar; el servidor guarda SOLO lo elegido en la Cocina de
// tu familia (se puede usar luego en el menú semanal y en la lista de la compra) y no toca la publicación ni las recetas de otras familias. Cada confirmación lleva
// una clave: pulsar dos veces o reintentar tras un corte no duplica nada. «Guardar publicación» sigue siendo aparte (en las acciones de la publicación).
function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function errorText(e: unknown): string {
  return e instanceof Error && e.name === 'CommunityPostRecipeError' ? e.message : communityErrorText(e)
}

export function PostRecipesPanel({ postId, variants }: { postId: string; variants: unknown }) {
  const recipes = useMemo(() => parsePostRecipes(variants), [variants])
  // Marcadas para importar varias a la vez.
  const [selected, setSelected] = useState<string[]>([])
  // Claves que se van a importar en este momento (el recuadro de confirmación con la vista previa está abierto).
  const [pending, setPending] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PostRecipeImportResult | null>(null)
  const sending = useRef(false)
  const confirmRef = useRef<HTMLDivElement>(null)
  // Al pedir confirmar, el recuadro se acerca a la vista (en móvil queda debajo de la receta y de la lista).
  useEffect(() => {
    if (pending)
      confirmRef.current?.scrollIntoView?.({
        block: 'nearest',
        behavior: 'smooth',
      })
  }, [pending])
  // Misma clave mientras no cambie lo elegido (dobles toques y reintentos); otra si cambia.
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null)

  if (recipes.length === 0) return null

  const byKey = new Map(recipes.map((r) => [r.key, r]))
  const pendingRecipes = (pending ?? []).map((k) => byKey.get(k)).filter((r): r is PostRecipe => !!r)

  function ask(keys: string[]) {
    setError(null)
    setResult(null)
    setPending(keys)
  }

  async function confirm() {
    if (!pending || pending.length === 0 || sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    const keys = orderedKeys(recipes, pending)
    const fingerprint = keys.join(',')
    if (!keyRef.current || keyRef.current.fingerprint !== fingerprint) keyRef.current = { fingerprint, key: newKey() }
    try {
      const r = await importPostRecipes(postId, keys, keyRef.current.key)
      setResult(r)
      setPending(null)
      setSelected([])
      keyRef.current = null
    } catch (e) {
      setError(errorText(e))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const confirmBox =
    pending && pendingRecipes.length > 0 ? (
      <div ref={confirmRef} className="community-post-recipes-confirm" role="group" aria-label="Confirmar la importación">
        <p>
          <strong>Se guardará en tu Cocina:</strong>
        </p>
        <ul>
          {pendingRecipes.map((r) => (
            <li key={r.key}>
              {r.title} — {r.servings === 1 ? '1 ración' : `${r.servings} raciones`}, {r.ingredients.length} ingredientes y {r.steps.length} pasos
            </li>
          ))}
        </ul>
        <p className="muted">Si ya tienes una receta con el mismo nombre, no se duplica: se usa la que ya tienes. La publicación y las recetas de otras familias no cambian.</p>
        <div className="community-post-recipes-confirm-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Guardando…' : pendingRecipes.length === 1 ? 'Sí, importar esta receta' : `Sí, importar ${pendingRecipes.length} recetas`}
          </button>
          <button type="button" className="link-button" disabled={busy} onClick={() => setPending(null)}>
            Cancelar
          </button>
        </div>
      </div>
    ) : null

  return (
    <section className="community-post-recipes" aria-labelledby="post-recipes-title">
      <h2 id="post-recipes-title">🍳 Recetas de esta publicación</h2>
      <p className="muted">Puedes guardar cada receta en tu Cocina (solo la que elijas). Luego la tienes para tu menú semanal y para la lista de la compra.</p>

      <ul className="community-post-recipes-list">
        {recipes.map((r) => {
          const checked = selected.includes(r.key)
          const isPending = pending?.includes(r.key) ?? false
          return (
            <li key={r.key} className={'community-post-recipe' + (isPending ? ' pending' : '')}>
              <div className="community-post-recipe-head">
                {recipes.length > 1 && (
                  <label className="community-post-recipe-pick">
                    <input type="checkbox" checked={checked} onChange={() => setSelected((s) => toggleKey(s, r.key))} aria-label={`Elegir «${r.title}» para importar`} />
                  </label>
                )}
                <div className="community-post-recipe-title">
                  <h3>{r.title}</h3>
                  <p className="muted">
                    {r.servings === 1 ? '1 ración' : `${r.servings} raciones`} · {r.ingredients.length} ingredientes
                  </p>
                </div>
              </div>

              <details className="community-post-recipe-details" open={isPending || undefined}>
                <summary>Ver ingredientes y preparación</summary>
                <h4>Ingredientes</h4>
                <ul>
                  {r.ingredients.map((i) => (
                    <li key={i.name}>{ingredientLine(i)}</li>
                  ))}
                </ul>
                <h4>Preparación</h4>
                <ol>
                  {r.steps.map((s, n) => (
                    <li key={n}>{s}</li>
                  ))}
                </ol>
                {r.tip && (
                  <p className="community-post-recipe-tip">
                    <strong>Truco:</strong> {r.tip}
                  </p>
                )}
              </details>

              <button type="button" className="primary community-post-recipe-import" disabled={busy} onClick={() => ask([r.key])}>
                📥 Importar a mi Cocina
              </button>
              {isPending && pending && pending.length === 1 && confirmBox}
            </li>
          )
        })}
      </ul>

      {recipes.length > 1 && selected.length > 0 && !pending && (
        <div className="community-post-recipes-bar" role="group" aria-label="Importar varias recetas">
          <span>{selected.length === 1 ? '1 receta elegida' : `${selected.length} recetas elegidas`}</span>
          <button type="button" className="primary" disabled={busy} onClick={() => ask(orderedKeys(recipes, selected))}>
            📥 Importar las elegidas
          </button>
          <button type="button" className="link-button" onClick={() => setSelected([])}>
            Quitar la selección
          </button>
        </div>
      )}

      {pending && pending.length > 1 && confirmBox}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="community-post-recipes-done" role="status">
          <p>
            <strong>✅ Listo.</strong> {importResultSummary(result)}
          </p>
          <ul>
            {result.recipes.map((r) => (
              <li key={r.id}>{r.title}</li>
            ))}
          </ul>
          <Link to="/alimentacion?tab=Recetas" className="link-button">
            📖 Ver mis recetas en La cocina de Pepa
          </Link>
        </div>
      )}
    </section>
  )
}
