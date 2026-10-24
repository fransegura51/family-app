import type { HelpExplainer } from '@/help/explainers/types'

// «Cómo funciona PEPA» de La cocina de Pepa. Cada texto se apoya en el código citado en `basedOn`.

export const expCocinaMenuACompras: HelpExplainer = {
  id: 'exp-cocina-menu-a-compras',
  module: 'cocina',
  title: 'Cómo pasa PEPA el menú a la lista de la compra',
  summary: 'Qué ingredientes suma, para cuántas personas calcula las cantidades y por qué siempre te deja revisar antes de añadir nada.',
  sections: [
    {
      heading: 'Qué platos entran',
      paragraphs: [
        'Puedes pasar a Compras la semana entera (los 7 días que ves en el Menú semanal), un día o un solo plato.',
        'Un plato con receta guardada aporta los ingredientes de esa receta. Un plato escrito a mano aporta un solo producto con ese texto: PEPA no se inventa ingredientes. Si repites el mismo texto varias veces, sale una sola vez.',
        'Una receta que no tiene ingredientes no aporta nada, y los huecos vacíos tampoco.',
      ],
      example: 'Si el lunes comes «Tortilla de patatas» (con receta) y el martes «Fruta de temporada» (a mano), saldrán los ingredientes de la tortilla y un producto llamado «Fruta de temporada».',
    },
    {
      heading: 'Cuánto compra: las personas',
      paragraphs: [
        'La hoja tiene un selector «Personas». Empieza con las personas de la familia que comen en casa (administración, adultos y niños; los bebés y las personas invitadas no cuentan; mínimo 1 y máximo 12; sin fichas, 4). Puedes cambiarlo.',
        'Si la receta tiene sus raciones, PEPA ajusta las cantidades en proporción a las personas. Si la receta no tiene raciones, no puede ajustar nada y deja las cantidades tal como están escritas.',
        'Si un ingrediente sale en varias recetas, se suman las cantidades cuando son del mismo tipo (peso con peso, líquido con líquido). Las piezas que no se pueden partir (huevos, lechugas…) se redondean hacia arriba para comprar. Una «pizca» de algo (sal, pimienta…) queda como «al gusto».',
      ],
      example: 'Tortilla para 4 raciones con 4 huevos y 500 g de patatas, calculada para 2 personas: 2 huevos y 250 g de patatas.',
    },
    {
      heading: 'La revisión previa',
      paragraphs: [
        'Se abre una hoja «🛒 Añadir a Compras» con una fila por ingrediente. No se guarda nada hasta que pulses «Añadir N a Compras»; entonces se guarda todo de una vez.',
        'Lo que ya está en tu lista de la compra sin comprar sale con «Ya está en tu lista» y sin marcar, para no duplicarlo. PEPA lo compara solo por el nombre: no sabe si lo que tienes apuntado es suficiente. Si quieres otra unidad, márcalo tú.',
        'Puedes desmarcar lo que ya tengas en casa («Marcar todo» y «Desmarcar todo» ayudan) y, si la familia tiene tiendas guardadas, elegir la tienda de destino.',
      ],
    },
    {
      heading: 'Lo que no hace',
      paragraphs: [
        'No cambia tus recetas ni el menú, no quita nada de la lista de la compra y no mira lo que tienes en casa: PEPA no lleva un inventario de la despensa.',
      ],
    },
  ],
  limits: [
    'El menú solo muestra 7 días a partir de hoy, así que «semana» significa esos 7 días.',
    'Las cantidades dependen de lo que esté escrito en la receta: «un puñado» o «al gusto» no se pueden sumar ni ajustar.',
    'Si dos ingredientes se llaman distinto («tomate» y «tomates triturados»), PEPA los trata como productos diferentes.',
  ],
  ifWrong: [
    'Si una cantidad no te cuadra, mira las raciones de la receta (Recetas → ✏️ Editar): sin raciones no se ajusta. Puedes corregirla ahí y volver a abrir la hoja.',
    'Si ya has añadido algo de más, la lista de la compra se corrige en Compras.',
    'Es normal que la hoja no sepa lo que tienes en casa. Si algo no funciona como aquí se cuenta (por ejemplo, la hoja no se abre o da error al añadir), cuéntalo en Soporte técnico, o en Sugerencias si todavía no lo ves.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/AlimentacionScreen.tsx',
    'src/ui/KitchenMenuShoppingSheet.tsx',
    'src/ui/ShoppingLinesSheet.tsx',
    'src/domain/kitchenMenuShopping.ts',
    'src/domain/menuShoppingPlan.ts',
    'src/domain/recipeScaling.ts',
    'src/domain/communityMenu.ts',
  ],
  tour: 'tut-cocina-menu-a-compras',
  go: { path: '/alimentacion', dest: 'cocina.menu' },
  labels: ['🛒 Añadir semana a Compras', '🛒 Añadir a Compras', 'Personas', 'Ya está en tu lista', 'Marcar todo', 'Desmarcar todo'],
  cardIds: ['coc-menu-a-compras', 'coc-menu-semanal'],
  synonyms: ['ingredientes a la compra', 'menu a compras', 'por que sale esta cantidad', 'cuantos ingredientes anade', 'como calcula la compra', 'por que no anade todo', 'ya esta en tu lista', 'cantidades de la compra del menu'],
}

export const expCocinaQueCocinoHoy: HelpExplainer = {
  id: 'exp-cocina-que-cocino-hoy',
  module: 'cocina',
  title: 'Cómo funciona «¿Qué cocino hoy?»',
  summary: 'Qué hace gratis con lo que escribes, qué pasa si pides ideas a la IA y qué se guarda (nada, si tú no lo decides).',
  sections: [
    {
      heading: 'Lo que hace gratis',
      paragraphs: [
        'Escribes lo que tienes («pepino, lechuga y tomate») y pulsas «🔍 Buscar qué cocinar (gratis)». PEPA separa tus ingredientes por comas o «y» y hace dos cosas, sin usar la IA.',
        'Primero mira tus recetas guardadas y te enseña hasta 5 que se pueden hacer con lo que tienes. Una receta solo sale si te falta como mucho 3 ingredientes; sal, aceite, agua, pimienta y vinagre se dan por tenidos. Salen primero las que ya tienes enteras. Reconoce «tomate» y «tomates» como lo mismo, pero no todas las variantes.',
        'Después busca en internet (Cookpad) y te enseña hasta 5 recetas. Para esa búsqueda se usan los tres primeros ingredientes que hayas escrito. Si internet falla, te enseña igualmente las guardadas.',
      ],
      example: 'Con «huevos, patata, cebolla», una tortilla guardada que lleva huevos, patata, cebolla, sal y aceite sale como «Tienes todo lo necesario».',
    },
    {
      heading: 'Lo que usa la IA',
      paragraphs: [
        'La IA solo se usa si tú pulsas «💡 Pedir ideas a la IA». Propone hasta 3 platos con su receta. A la IA solo viajan los ingredientes y las raciones: ningún nombre de familia, calendario ni dato de otros módulos.',
        'Solo funciona en cuentas de adultos. Si tu cuenta no lo es, la IA está apagada o se ha llegado al límite del día, la pantalla te lo dice con un mensaje.',
      ],
    },
    {
      heading: 'Qué se guarda',
      paragraphs: [
        'Nada se guarda solo. «💾 Guardar en mis recetas» (en las de internet) y «📖 Ver la receta y guardarla» (en las ideas de la IA) abren una hoja para que revises la receta antes de guardarla.',
        'Los ingredientes de lo que guardes se pueden mandar después a la lista de la compra, pero eso también lo decides tú.',
      ],
    },
  ],
  limits: [
    'PEPA solo sabe lo que escribes: no mira lo que hay en tu nevera ni en tu despensa. La foto de la nevera todavía no existe.',
    'Las recetas de internet dependen de la web de terceros; a veces no salen o no se pueden leer enteras.',
    'La IA puede proponer platos que no encajen contigo: revisa siempre la receta antes de guardarla.',
  ],
  ifWrong: [
    'Si no sale ninguna receta tuya, es normal cuando faltan más de 3 ingredientes en todas: prueba con más ingredientes o con otros nombres.',
    'Si un ingrediente se interpreta mal, escríbelo más simple («tomate» en vez de «tomate maduro de la huerta»).',
    'Si la búsqueda da error o la IA no responde aunque tu cuenta sea de adulto, es un fallo técnico: cuéntalo en Soporte técnico, o en Sugerencias si todavía no lo ves.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/CocinarTab.tsx',
    'src/domain/cookFromSaved.ts',
    'src/domain/cookIdeas.ts',
    'src/services/whatToCook.ts',
    'supabase/functions/_shared/ai/purposes/whatToCook.ts',
  ],
  tour: 'tut-cocina-que-cocino',
  go: { path: '/alimentacion', dest: 'cocina.cocinar' },
  labels: ['¿Qué cocino hoy?', '🔍 Buscar qué cocinar (gratis)', '💡 Pedir ideas a la IA', '💾 Guardar en mis recetas', '📖 Ver la receta y guardarla'],
  cardIds: ['coc-que-cocino-hoy', 'coc-receta'],
  synonyms: ['que cocino', 'que hago de comer', 'receta con lo que tengo', 'por que no sale mi receta', 'usa ia', 'es gratis', 'tengo pepino lechuga y tomate', 'ideas de comida', 'por que me falta un ingrediente'],
}

export const EXPLAINERS_COCINA: HelpExplainer[] = [expCocinaMenuACompras, expCocinaQueCocinoHoy]
