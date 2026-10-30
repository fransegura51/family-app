import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  FREEZE_BADGE_TEXT,
  MENU_DAYS,
  MENU_MAX_SERVINGS,
  MENU_MEALS,
  MENU_MIN_SERVINGS,
  dayLabel,
  dayShort,
  formatDayMonth,
  formatRecipeTime,
  formatWeekRange,
  ingredientQuantityText,
  addDays,
  isMonday,
  recipeBaseServings,
  type CommunityMenu,
  type MenuDay,
  type MenuMealKey,
  type MenuRecipe,
  type SelectedRecipe,
  type MenuSelection,
} from '@/domain/communityMenu'
import { TextWithPostLinks } from '@/ui/community/PostLink'
import { MenuImportSheet } from '@/ui/community/menu/MenuImportSheet'
import { MenuShoppingSheet } from '@/ui/community/menu/MenuShoppingSheet'
import '@/ui/community/recipes/communityRecipes.css'
import '@/ui/community/menu/communityMenu.css'

// Plan semanal OFICIAL de Pepa (publicación de tipo «menú»): de lunes a domingo, comida y cena de cada día con su acompañamiento y las recetas completas
// (ingredientes escalados a las raciones elegidas y pasos). Mirar el menú es libre; las acciones (importar a la Cocina y añadir a Compras) necesitan acceso
// completo a Comunidad y una familia: con permiso solo de lectura se ve todo, pero esas acciones no aparecen y se explica por qué.
// Todo el texto del menú se pinta como texto de React (nunca como HTML).
// Elementos SENCILLOS (`simple`: una pieza de fruta, pan tostado…): se enseñan con sus ingredientes y cantidades escaladas, sin pasos y sin el botón «Guardar esta receta»
// (no son recetas de Cocina: al importar el día o la comida se apuntan en el menú como texto). Sus ingredientes sí se pueden añadir a Compras.
// Insignia «Ideal para cocinar de más y congelar», «Truco de Pepa» y tiempos (trabajo activo / total) son informativos y opcionales: cada familia decide cómo cocina.
export interface MenuPlanViewProps {
  postId: string
  menu: CommunityMenu
  // Puede importar y añadir a Compras (acceso completo a Comunidad). El servidor lo vuelve a comprobar en cada llamada.
  canUseKitchen: boolean
  // Punto de extensión (avisos de alergias): recibe las recetas elegidas para importar y puede devolver avisos que se enseñan en la confirmación.
  renderWarnings?: (items: SelectedRecipe[]) => ReactNode
}

type Sheet = { type: 'import'; selection: MenuSelection } | { type: 'shopping'; selection: MenuSelection } | null

const mealKeyId = (day: string, meal: MenuMealKey) => `${day}:${meal}`

export function MenuPlanView({ postId, menu, canUseKitchen, renderWarnings }: MenuPlanViewProps) {
  const uid = useId()
  const [servings, setServings] = useState(menu.servings)
  const [dayIndex, setDayIndex] = useState(0)
  // Recetas desplegadas (por comida/cena). Cerradas por defecto: la pantalla se lee como un plan, no como un libro.
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [sheet, setSheet] = useState<Sheet>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const day: MenuDay = menu.days[Math.min(dayIndex, menu.days.length - 1)]
  const dated = menu.weekStart !== null && isMonday(menu.weekStart)

  function dateOf(d: MenuDay): string | null {
    return dated && menu.weekStart ? addDays(menu.weekStart, MENU_DAYS.indexOf(d.day)) : null
  }

  function changeServings(next: number) {
    if (next < MENU_MIN_SERVINGS || next > MENU_MAX_SERVINGS) return
    setServings(next)
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Pestañas de los días: flechas, Inicio y Fin cambian de día (patrón de pestañas accesibles).
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = menu.days.length - 1
    const target = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (target === null) return
    e.preventDefault()
    setDayIndex(target)
    tabRefs.current[target]?.focus()
  }

  const tabId = (i: number) => `${uid}-tab-${i}`
  const panelId = `${uid}-panel`
  const dayDate = dateOf(day)

  return (
    <section className="community-menu" aria-label="Plan semanal del menú">
      <div className="community-menu-head">
        <p className="community-menu-weeks">
          {dated && menu.weekStart ? (
            <>
              🗓️ Semana {formatWeekRange(menu.weekStart)}
            </>
          ) : (
            <>🗓️ Menú de ejemplo: sirve para cualquier semana (tú eliges las fechas al importarlo)</>
          )}
        </p>

        <div className="community-servings" role="group" aria-label="Cambiar las raciones del menú">
          <button type="button" aria-label="Una ración menos" onClick={() => changeServings(servings - 1)} disabled={servings <= MENU_MIN_SERVINGS}>
            −
          </button>
          <span className="community-servings-value" aria-live="polite">
            Para {servings} {servings === 1 ? 'persona' : 'personas'}
          </span>
          <button type="button" aria-label="Una ración más" onClick={() => changeServings(servings + 1)} disabled={servings >= MENU_MAX_SERVINGS}>
            +
          </button>
          {servings !== menu.servings && (
            <button type="button" className="link-button" onClick={() => setServings(menu.servings)}>
              Volver a {menu.servings}
            </button>
          )}
        </div>
        <p className="muted community-menu-small">
          {servings === menu.servings
            ? `El menú está pensado para ${menu.servings} personas.`
            : `Las cantidades están calculadas para ${servings} y son orientativas: el menú original es para ${menu.servings}.`}
        </p>

        {canUseKitchen ? (
          <div className="community-menu-actions" role="group" aria-label="Acciones del menú completo">
            <button type="button" className="primary" onClick={() => setSheet({ type: 'import', selection: { scope: 'week' } })}>
              📥 Importar menú completo
            </button>
            <button type="button" onClick={() => setSheet({ type: 'shopping', selection: { scope: 'week' } })}>
              🛒 Añadir todo a Compras
            </button>
          </div>
        ) : (
          <aside className="community-notice community-menu-locked" role="note">
            <p>
              <strong>Puedes leer el menú y todas sus recetas.</strong> Para guardarlas en tu Cocina o añadir ingredientes a Compras hace falta acceso completo a
              Comunidad (no solo de lectura) y que tu cuenta pertenezca a una familia de PEPA. Quien administra tu familia puede cambiarlo.
            </p>
          </aside>
        )}
      </div>

      <div className="community-menu-tabs" role="tablist" aria-label="Días de la semana">
        {menu.days.map((d, i) => {
          const date = dateOf(d)
          const selected = i === dayIndex
          return (
            <button
              key={d.day}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={tabId(i)}
              aria-selected={selected}
              aria-controls={panelId}
              aria-label={dayLabel(d.day) + (date ? `, ${formatDayMonth(date)}` : '')}
              tabIndex={selected ? 0 : -1}
              className={'community-menu-tab' + (selected ? ' active' : '')}
              onClick={() => setDayIndex(i)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              <span>{dayShort(d.day)}</span>
              {date && <span className="community-menu-tab-date">{Number(date.slice(8))}</span>}
            </button>
          )
        })}
      </div>

      <div className="community-menu-day" role="tabpanel" id={panelId} aria-labelledby={tabId(Math.min(dayIndex, menu.days.length - 1))}>
        <div className="community-menu-day-head">
          <h2>
            {dayLabel(day.day)}
            {dayDate && <span className="muted"> · {formatDayMonth(dayDate)}</span>}
          </h2>
          {canUseKitchen && (
            <div className="community-menu-day-actions" role="group" aria-label={`Acciones del ${day.day}`}>
              <button type="button" onClick={() => setSheet({ type: 'import', selection: { scope: 'day', day: day.day } })}>
                📥 Importar este día
              </button>
              <button type="button" onClick={() => setSheet({ type: 'shopping', selection: { scope: 'day', day: day.day } })}>
                🛒 Compras de este día
              </button>
            </div>
          )}
        </div>

        {MENU_MEALS.map(({ key, label, icon }) => {
          const meal = day.meals[key]
          if (!meal) return null
          const id = mealKeyId(day.day, key)
          const expanded = open.has(id)
          const bodyId = `${uid}-${id}`.replace(/[^a-zA-Z0-9_-]/g, '-')
          // Si todo lo del plato es sencillo no hay receta que ver, solo ingredientes.
          const onlySimple = meal.recipes.every((r) => r.simple)
          const main = meal.recipes[0]
          const freezable = meal.recipes.some((r) => r.freeze?.ideal)
          return (
            <article key={key} className="community-menu-meal" aria-label={`${label} del ${day.day}`}>
              <p className="community-menu-meal-label">
                <span aria-hidden="true">{icon}</span> {label}
              </p>
              <h3 className="community-menu-meal-title">{meal.title}</h3>
              {meal.side && (
                <p className="community-menu-side">
                  <span className="muted">Acompañamiento:</span> {meal.side}
                </p>
              )}
              {!expanded && main?.time && (
                <p className="community-menu-time muted community-menu-small">
                  <span aria-hidden="true">⏱️</span> {formatRecipeTime(main.time)}
                </p>
              )}
              {!expanded && freezable && (
                <p className="community-menu-freeze community-menu-small">
                  <span aria-hidden="true">❄️</span> {FREEZE_BADGE_TEXT}
                </p>
              )}
              <div className="community-menu-meal-actions">
                <button type="button" className="community-menu-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={() => toggle(id)}>
                  {expanded ? (onlySimple ? 'Ocultar ingredientes' : 'Ocultar receta') : onlySimple ? 'Ver ingredientes' : 'Ver receta'}
                </button>
                {canUseKitchen && (
                  <>
                    <button type="button" aria-label={`Importar la ${label.toLowerCase()} del ${day.day}`} onClick={() => setSheet({ type: 'import', selection: { scope: 'meal', day: day.day, meal: key } })}>
                      📥 Importar
                    </button>
                    <button type="button" aria-label={`Añadir a Compras la ${label.toLowerCase()} del ${day.day}`} onClick={() => setSheet({ type: 'shopping', selection: { scope: 'meal', day: day.day, meal: key } })}>
                      🛒 Compras
                    </button>
                  </>
                )}
              </div>

              {expanded && (
                <div id={bodyId} className="community-menu-recipes">
                  {meal.recipes.map((recipe, index) => (
                    <RecipeBlock
                      key={`${recipe.title}-${index}`}
                      recipe={recipe}
                      menu={menu}
                      servings={servings}
                      role={recipe.simple ? (index === 0 ? 'Plato sencillo' : 'Acompañamiento sencillo') : index === 0 ? 'Plato principal' : 'Acompañamiento'}
                      canUseKitchen={canUseKitchen}
                      onSave={() => setSheet({ type: 'import', selection: { scope: 'recipe', day: day.day, meal: key, recipeIndex: index } })}
                      onShop={() => setSheet({ type: 'shopping', selection: { scope: 'recipe', day: day.day, meal: key, recipeIndex: index } })}
                    />
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>

      {sheet?.type === 'import' && (
        <MenuImportSheet
          postId={postId}
          menu={menu}
          initial={sheet.selection}
          initialServings={servings}
          renderWarnings={renderWarnings}
          onClose={() => setSheet(null)}
          onAddToShopping={(selection, s) => {
            setServings(s)
            setSheet({ type: 'shopping', selection })
          }}
        />
      )}
      {sheet?.type === 'shopping' && <MenuShoppingSheet menu={menu} selection={sheet.selection} servings={servings} onClose={() => setSheet(null)} />}
    </section>
  )
}

export function RecipeBlock({
  recipe,
  menu,
  servings,
  role,
  canUseKitchen,
  onSave,
  onShop,
}: {
  recipe: MenuRecipe
  menu: CommunityMenu
  servings: number
  role: string
  canUseKitchen: boolean
  onSave: () => void
  onShop: () => void
}) {
  const base = recipeBaseServings(recipe, menu)
  const scaled = useMemo(() => recipe.ingredients.map((i) => ({ i, text: ingredientQuantityText(i, base, servings) })), [recipe, base, servings])
  return (
    <section className={'community-menu-recipe' + (recipe.simple ? ' simple' : '')} aria-label={`${recipe.simple ? 'Elemento sencillo' : 'Receta'}: ${recipe.title}`}>
      <p className="community-menu-recipe-role">{role}</p>
      <h4>{recipe.title}</h4>
      <p className="muted community-menu-small">Para {servings} {servings === 1 ? 'persona' : 'personas'}</p>
      {recipe.time && (
        <p className="community-menu-time community-menu-small">
          <span aria-hidden="true">⏱️</span> {formatRecipeTime(recipe.time)}
        </p>
      )}
      {recipe.freeze?.ideal && (
        <div className="community-menu-freeze" role="note">
          <p className="community-menu-freeze-title">
            <span aria-hidden="true">❄️</span> {FREEZE_BADGE_TEXT}
          </p>
          {recipe.freeze.note && <p className="community-menu-small">{recipe.freeze.note}</p>}
        </div>
      )}
      <h5>Ingredientes</h5>
      {scaled.length > 0 ? (
        <ul className="community-recipe-ingredients">
          {scaled.map(({ i, text }, k) => (
            <li key={`${i.name}-${k}`}>
              {i.name}
              {text && ` — ${text}`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{recipe.simple ? 'Este elemento no tiene ingredientes escritos.' : 'Esta receta no tiene ingredientes escritos.'}</p>
      )}
      {recipe.simple ? (
        <p className="muted community-menu-small">Es un acompañamiento sencillo: no necesita receta. Al importar el menú se apunta en tu menú como texto.</p>
      ) : (
        <>
          <h5>Preparación</h5>
          {recipe.steps.length > 0 ? (
            <ol className="community-recipe-steps">
              {recipe.steps.map((s, k) => (
                <li key={k}>{s}</li>
              ))}
            </ol>
          ) : (
            <p className="muted">Esta receta no tiene pasos escritos.</p>
          )}
        </>
      )}
      {recipe.tip && (
        <aside className="community-menu-tip" aria-label="Truco de Pepa">
          <p className="community-menu-tip-title">
            <span aria-hidden="true">💡</span> Truco de Pepa
          </p>
          <p>
            <TextWithPostLinks text={recipe.tip} />
          </p>
        </aside>
      )}
      {canUseKitchen && (
        <div className="community-menu-recipe-actions">
          {!recipe.simple && (
            <button type="button" className="primary" onClick={onSave}>
              📥 Guardar esta receta
            </button>
          )}
          <button type="button" className={recipe.simple ? 'primary' : undefined} onClick={onShop}>
            🛒 Ingredientes a Compras
          </button>
        </div>
      )}
    </section>
  )
}
