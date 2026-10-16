import { useMemo } from 'react'
import {
  checkRecipeIngredients,
  DIETARY_GENERAL_DISCLAIMER,
  DIETARY_KIND_LABELS,
  DIETARY_SEVERITY_LABELS,
  NO_MATCH_DISCLAIMER,
  type DietaryFinding,
  type DietaryRestrictionInput,
  type RecipeDietaryCheck,
} from '@/domain/dietaryRestrictions'
import { MENU_MEALS, type SelectedRecipe } from '@/domain/communityMenu'
import type { DietaryOverview } from '@/data/dietaryRestrictions'
import { useFamilyDietary } from '@/ui/useFamilyDietary'
import { DIETARY_RETRY_LABEL, WARN_LEVEL_LABELS, WARN_LOAD_ERROR, WARN_REGION_LABEL, WARN_TITLE_FINDINGS, WARN_TITLE_NO_DATA, WARN_TITLE_NO_MATCH, WARN_WHO } from '@/ui/familyDietaryText'
import '@/ui/familyDietary.css'

// Avisos de alergias e intolerancias ANTES de importar un menú de Comunidad (DATOS DE SALUD, RGPD art. 9). Misma política que DietaryWarnings:
//  · solo lo ve quien puede ver todas las restricciones de la familia (administradores y adultos); sin restricciones no se pinta nada;
//  · indica el DÍA y el PLATO de cada aviso, nunca el nombre de ninguna persona ni el texto de la ficha;
//  · NUNCA dice «segura» ni lleva insignia verde: sin coincidencias enseña el descargo fijo;
//  · no bloquea la importación, no modifica recetas y no se oculta: es un aviso informativo que se ve antes de confirmar;
//  · Coste: ninguna llamada por plato; usa la lectura compartida de useFamilyDietary (una por sesión, y otra si los datos tienen más de 10 minutos).
// Vive FUERA de src/ui/community/ a propósito (el candado de privacidad prohíbe nombrar las alergias dentro de Comunidad); la hoja de importación solo
// recibe esta pieza como «renderWarnings».
const MAX_AGE_MS = 10 * 60 * 1000

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

interface Checked {
  item: SelectedRecipe
  check: RecipeDietaryCheck
}

function Place({ item }: { item: SelectedRecipe }) {
  const meal = MENU_MEALS.find((m) => m.key === item.meal)?.label ?? item.meal
  return (
    <h4 className="fd-group-title">
      {cap(item.day)} · {meal} · {item.recipe.title}
    </h4>
  )
}

function Finding({ f }: { f: DietaryFinding }) {
  const who = f.kind ? [DIETARY_KIND_LABELS[f.kind], f.severity ? DIETARY_SEVERITY_LABELS[f.severity].toLowerCase() : null].filter(Boolean).join(' · ') : null
  return (
    <li className="fd-finding">
      <span className="fd-group-count">{WARN_LEVEL_LABELS[f.level]}: </span>
      {f.ingredient ? <strong className="fd-finding-ingredient">{f.ingredient}</strong> : null} <span className="fd-finding-reason">{f.reason}</span>
      {who ? <span className="fd-finding-who muted"> {who}</span> : null}
    </li>
  )
}

// Parte visible (sin red ni estado): la usan el componente real y las pruebas.
export function MenuDietaryWarningsBlock({ items, restrictions }: { items: readonly SelectedRecipe[]; restrictions: readonly DietaryRestrictionInput[] }) {
  const checked: Checked[] = useMemo(
    () => items.map((item) => ({ item, check: checkRecipeIngredients(item.recipe.ingredients, restrictions) })),
    [items, restrictions],
  )
  if (restrictions.length === 0 || items.length === 0) return null
  const flagged = checked.filter((c) => c.check.status === 'hallazgos' || c.check.status === 'sin_datos')
  const hasConflict = flagged.some((c) => c.check.findings.some((f) => f.level === 'conflicto'))
  const hasFindings = flagged.some((c) => c.check.status === 'hallazgos')
  const title = hasFindings ? WARN_TITLE_FINDINGS : flagged.length > 0 ? WARN_TITLE_NO_DATA : WARN_TITLE_NO_MATCH
  const cls = flagged.length > 0 ? (hasFindings ? 'fd-warnings-hallazgos' : 'fd-warnings-sin_datos') : 'fd-warnings-ninguna_coincidencia'
  return (
    <section className={'fd-warnings ' + cls} aria-label={WARN_REGION_LABEL}>
      <h3 className="fd-warnings-title">
        <span aria-hidden="true">{flagged.length > 0 ? '⚠️ ' : 'ℹ️ '}</span>
        {title}
      </h3>
      {flagged.length === 0 ? (
        <p className="fd-warnings-message">{NO_MATCH_DISCLAIMER}</p>
      ) : (
        <>
          <p className="fd-warnings-message">
            {hasConflict ? 'Hay platos con ingredientes que chocan con lo registrado.' : 'Hay platos que conviene revisar.'} Puedes importar igualmente: el menú no se modifica.
          </p>
          {hasFindings && <p className="fd-warnings-who muted">{WARN_WHO}</p>}
          {flagged.map((c, i) => (
            <div key={`${c.item.day}-${c.item.meal}-${c.item.recipeIndex}-${i}`} className="fd-group">
              <Place item={c.item} />
              <ul className="fd-findings">
                {c.check.findings.map((f, j) => (
                  <Finding key={`${f.restrictionId ?? 'r'}-${f.ingredientIndex ?? 'x'}-${j}`} f={f} />
                ))}
              </ul>
            </div>
          ))}
          <p className="fd-warnings-disclaimer muted">{NO_MATCH_DISCLAIMER}</p>
        </>
      )}
      <p className="fd-warnings-disclaimer muted">{DIETARY_GENERAL_DISCLAIMER}</p>
    </section>
  )
}

export function MenuDietaryWarningsView({
  overview,
  loadFailed = false,
  onRetry,
  items,
}: {
  overview: DietaryOverview | null
  loadFailed?: boolean
  onRetry?: () => void
  items: readonly SelectedRecipe[]
}) {
  if (!overview) {
    if (!loadFailed) return null
    return (
      <p className="fd-warnings-error muted" role="status">
        {WARN_LOAD_ERROR}{' '}
        {onRetry && (
          <button type="button" className="link-button" onClick={onRetry}>
            {DIETARY_RETRY_LABEL}
          </button>
        )}
      </p>
    )
  }
  if (overview.canManage !== true) return null
  return <MenuDietaryWarningsBlock items={items} restrictions={overview.restrictions} />
}

export function MenuDietaryWarnings({ items }: { items: readonly SelectedRecipe[] }) {
  const dietary = useFamilyDietary({ maxAgeMs: MAX_AGE_MS })
  return <MenuDietaryWarningsView overview={dietary.overview} loadFailed={dietary.status === 'error'} onRetry={() => void dietary.reload()} items={items} />
}
