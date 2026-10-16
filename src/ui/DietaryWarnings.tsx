import { useMemo } from 'react'
import {
  checkRecipeIngredients,
  DIETARY_KIND_LABELS,
  DIETARY_SEVERITY_LABELS,
  type DietaryFinding,
  type RecipeDietaryCheck,
  type RecipeIngredientInput,
} from '@/domain/dietaryRestrictions'
import type { DietaryOverview } from '@/data/dietaryRestrictions'
import { useFamilyDietary } from '@/ui/useFamilyDietary'
import {
  DIETARY_RETRY_LABEL,
  WARN_LEVEL_LABELS,
  WARN_LOAD_ERROR,
  WARN_REGION_LABEL,
  WARN_TITLE_FINDINGS,
  WARN_TITLE_NO_DATA,
  WARN_TITLE_NO_MATCH,
  WARN_WHO,
} from '@/ui/familyDietaryText'
import '@/ui/familyDietary.css'

// Aviso de alergias e intolerancias para una receta (DATOS DE SALUD, RGPD art. 9). Reutilizable: Cocina (visor y selector del menú), la importación de menús y
// Comunidad lo enchufan con solo pasarle los ingredientes. REGLAS:
//  · Solo lo ve quien puede ver TODAS las restricciones de la familia (administradores y adultos). Una cuenta de niño o de invitado solo recibe lo suyo, así que
//    un aviso hecho con datos incompletos podría confundir: no se enseña nada y la receta se comporta como siempre.
//  · Sin restricciones registradas (o sin consentimiento de nadie) no se pinta nada.
//  · NUNCA dice que una receta es «segura», ni lleva insignia verde: si no hay coincidencias enseña el descargo fijo de siempre.
//  · Jamás lleva nombres de personas («alguien de tu familia»), ni el texto que se escribió en la ficha.
//  · No bloquea, no modifica la receta y no escribe nada en ningún sitio (ni almacenamiento del navegador, ni URL, ni registros).
//  · Coste: ninguna llamada por receta; usa la lectura compartida de useFamilyDietary (una por sesión, y otra si los datos tienen más de 10 minutos).
const MAX_AGE_MS = 10 * 60 * 1000

function FindingItem({ f }: { f: DietaryFinding }) {
  // Solo el tipo y la gravedad («Alergia · grave»): nada que identifique a la persona.
  const who = f.kind ? [DIETARY_KIND_LABELS[f.kind], f.severity ? DIETARY_SEVERITY_LABELS[f.severity].toLowerCase() : null].filter(Boolean).join(' · ') : null
  return (
    <li className="fd-finding">
      {f.ingredient ? <strong className="fd-finding-ingredient">{f.ingredient}</strong> : null}
      <span className="fd-finding-reason">{f.reason}</span>
      {who ? <span className="fd-finding-who muted">{who}</span> : null}
    </li>
  )
}

function Group({ level, findings }: { level: DietaryFinding['level']; findings: DietaryFinding[] }) {
  if (findings.length === 0) return null
  return (
    <div className={`fd-group fd-group-${level}`}>
      <h4 className="fd-group-title">
        {WARN_LEVEL_LABELS[level]} <span className="fd-group-count">({findings.length})</span>
      </h4>
      <ul className="fd-findings">
        {findings.map((f, i) => (
          <FindingItem key={`${f.restrictionId ?? 'r'}-${f.ingredientIndex ?? 'x'}-${i}`} f={f} />
        ))}
      </ul>
    </div>
  )
}

// Parte visible (sin red ni estado): la usan el componente real y las pruebas. `check` ya viene calculado.
export function DietaryWarningsBlock({ check, className }: { check: RecipeDietaryCheck; className?: string }) {
  if (check.status === 'sin_restricciones') return null
  const wrapClass = 'fd-warnings fd-warnings-' + check.status + (className ? ' ' + className : '')
  const byLevel = (level: DietaryFinding['level']) => check.findings.filter((f) => f.level === level)
  const title = check.status === 'hallazgos' ? WARN_TITLE_FINDINGS : check.status === 'sin_datos' ? WARN_TITLE_NO_DATA : WARN_TITLE_NO_MATCH
  return (
    <section className={wrapClass} aria-label={WARN_REGION_LABEL}>
      <h3 className="fd-warnings-title">
        <span aria-hidden="true">{check.status === 'ninguna_coincidencia' ? 'ℹ️ ' : '⚠️ '}</span>
        {title}
      </h3>
      <p className="fd-warnings-message">{check.message}</p>
      {check.status === 'hallazgos' && <p className="fd-warnings-who muted">{WARN_WHO}</p>}
      {check.status !== 'ninguna_coincidencia' && (
        <>
          <Group level="conflicto" findings={byLevel('conflicto')} />
          <Group level="revisar" findings={byLevel('revisar')} />
          <Group level="sin_datos" findings={byLevel('sin_datos')} />
        </>
      )}
      <p className="fd-warnings-disclaimer muted">{check.disclaimer}</p>
    </section>
  )
}

// Decide qué enseñar a partir de lo ya cargado. Devuelve null (nada) si no hay permiso, no hay restricciones o aún no hay datos.
export function DietaryWarningsView({
  overview,
  loadFailed = false,
  onRetry,
  ingredients,
  className,
}: {
  overview: DietaryOverview | null
  loadFailed?: boolean
  onRetry?: () => void
  ingredients: readonly RecipeIngredientInput[]
  className?: string
}) {
  const manages = overview?.canManage === true
  const restrictions = overview?.restrictions
  const check = useMemo(() => (manages && restrictions ? checkRecipeIngredients(ingredients, restrictions) : null), [manages, restrictions, ingredients])
  if (!overview) {
    // Sin datos por un fallo de red: se dice con una frase fija y discreta (sin ella, quien sí tiene alergias anotadas creería que todo está comprobado).
    if (!loadFailed) return null
    return (
      <p className={'fd-warnings-error muted' + (className ? ' ' + className : '')} role="status">
        {WARN_LOAD_ERROR}{' '}
        {onRetry && (
          <button type="button" className="link-button" onClick={onRetry}>
            {DIETARY_RETRY_LABEL}
          </button>
        )}
      </p>
    )
  }
  if (!check) return null
  return <DietaryWarningsBlock check={check} className={className} />
}

export interface DietaryWarningsProps {
  ingredients: readonly RecipeIngredientInput[]
  className?: string
}

// Componente listo para enchufar: carga (una vez, compartida) y pinta el aviso. Con datos recientes en memoria no hace ninguna llamada.
export function DietaryWarnings({ ingredients, className }: DietaryWarningsProps) {
  const dietary = useFamilyDietary({ maxAgeMs: MAX_AGE_MS })
  return <DietaryWarningsView overview={dietary.overview} loadFailed={dietary.status === 'error'} onRetry={() => void dietary.reload()} ingredients={ingredients} className={className} />
}
