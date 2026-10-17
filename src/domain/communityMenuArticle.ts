// Comunidad PEPA — ARTÍCULO que acompaña a cada menú semanal oficial. Código puro (sin red ni React).
// Regla editorial (plantilla en supabase/seed/community_initial_posts/_plantilla-menu-semanal.md): el artículo es BREVE y solo resume la semana (día a día, con
// comidas, cenas y acompañamientos). Los tiempos, la congelación y los trucos NO van en el texto: van en las fichas de las recetas (campos time, freeze y tip del
// menú), que son las que enseña el importador. Esta función comprueba que un artículo nuevo cumple esas reglas; no cambia nada.

export const WEEKLY_MENU_ARTICLE_MAX_CHARS = 3000

export const WEEKLY_MENU_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const

// Forma mínima del menú que se necesita para cruzar los platos (compatible con el payload.menu del menú oficial).
export interface MenuArticleMenu {
  days: { day: string; meals: { comida?: { title: string } | null; cena?: { title: string } | null } }[]
}

const TIME_RE = /⏱|\b\d+\s*(?:min\b|minutos?\b|h\b|horas?\b|segundos?\b)|\b(?:media|una|dos|tres)\s+horas?\b/i
const FREEZE_RE = /❄|congel/i
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)
const clean = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()

// Devuelve la lista de problemas (vacía si el artículo cumple). Con `menu`, comprueba también que cada comida y cada cena del texto son las del menú.
export function validateWeeklyMenuArticle(body: string, menu?: MenuArticleMenu): string[] {
  const problems: string[] = []
  const text = body.replace(/\r\n/g, '\n')
  if (text.length > WEEKLY_MENU_ARTICLE_MAX_CHARS) problems.push(`el artículo tiene ${text.length} caracteres y el máximo es ${WEEKLY_MENU_ARTICLE_MAX_CHARS}`)
  if (TIME_RE.test(text)) problems.push('el texto no debe llevar tiempos de preparación (los enseña el importador)')
  if (FREEZE_RE.test(text)) problems.push('el texto no debe hablar de congelación (va en la nota de congelación de cada receta)')
  if (/https?:\/\//.test(text)) problems.push('el texto no debe llevar enlaces')
  if (/^#{1,6}\s/m.test(text)) problems.push('el texto no debe llevar títulos con #')
  if (/^\s*\|.*\|\s*$/m.test(text)) problems.push('el texto no debe llevar tablas')
  if (/por qu[eé] funciona|trucos? para|truco de pepa|seguridad en la cocina/i.test(text)) problems.push('los trucos y consejos van en las fichas de las recetas, no en el texto')

  // Estructura: los siete días, en orden, cada uno con una comida y una cena.
  const lines = text.split('\n')
  let at = -1
  for (const [i, day] of WEEKLY_MENU_DAYS.entries()) {
    const idx = lines.findIndex((l, n) => n > at && l.trim() === `**${day}**`)
    if (idx === -1) {
      problems.push(`falta el día «${day}» (o no está en orden)`)
      continue
    }
    at = idx
    const end = lines.findIndex((l, n) => n > idx && /^\*\*[^*]+\*\*\s*$/.test(l.trim()))
    const block = lines.slice(idx + 1, end === -1 ? undefined : end).filter((l) => l.startsWith('- '))
    const comida = block.filter((l) => /^- \*\*Comida:/.test(l))
    const cena = block.filter((l) => /^- \*\*Cena:/.test(l))
    if (comida.length !== 1 || cena.length !== 1 || block.length !== 2) problems.push(`«${day}» debe tener exactamente una comida y una cena`)
    if (menu) {
      const meals = menu.days[i]?.meals
      for (const [kind, label, found] of [['comida', 'Comida', comida[0]], ['cena', 'Cena', cena[0]]] as const) {
        const title = meals?.[kind]?.title
        if (!title) problems.push(`el menú no tiene ${kind} el ${day}`)
        else if (found && !clean(found).includes(`${label.toLowerCase()}: ${clean(lowerFirst(title))}`)) problems.push(`${day}, ${kind}: el texto no coincide con el plato del menú («${title}»)`)
      }
    }
  }
  return problems
}
