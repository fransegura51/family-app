// Clasificación de productos de Alimentación por TIPO de alimento
// (Verdura, Fruta, Carne...) — petición real: "la estadística de tipos
// de alimentos no sirve para mucho así por categoría [Supermercado /
// Restaurantes], puedes clasificar los alimentos... Verdura, fruta,
// carne, etc". Sin IA (todo gratis, como el resto del proyecto):
// coincidencia de PALABRA COMPLETA (o su plural simple) contra el
// nombre del producto — es un heurístico, no perfecto; un producto
// que no encaje en ningún grupo cae en "Otros alimentos" en vez de
// forzarlo a uno equivocado.

export interface FoodType {
  key: string
  label: string
  icon: string
}

// COM-03 — "Bebidas" genérica se elimina: los productos se clasificaban ahí en vez de en las dos
// específicas que la familia ya tenía (Bebidas alcohólicas/no alcohólicas), porque antes era una única
// clave que mezclaba palabras de ambos tipos. Los mismos emojis e icono por defecto que ya usaba el
// catálogo PEPA (food.bebidas_alcoholicas/food.bebidas_no_alcoholicas, 0139_catalog_base.sql) para que
// el nombre resuelto por regla coincida exactamente con esas clases reales, nunca con una tercera.
export const FOOD_TYPES: FoodType[] = [
  { key: 'bebidas_alcoholicas', label: 'Bebidas alcohólicas', icon: '🍺' },
  { key: 'bebidas_no_alcoholicas', label: 'Bebidas no alcohólicas', icon: '🥤' },
  { key: 'congelados', label: 'Congelados y helados', icon: '🧊' },
  { key: 'snacks', label: 'Snacks y dulces', icon: '🍬' },
  { key: 'panaderia', label: 'Panadería y bollería', icon: '🍞' },
  { key: 'lacteos', label: 'Lácteos y huevos', icon: '🥛' },
  // Pescado antes que Carne: "filete" o "brocheta" solos no dicen de
  // qué es, pero "merluza"/"gamba"/"atún" sí — si se miraran en el
  // orden contrario, "FILETE MERLUZA" caería en Carne por "filete".
  { key: 'pescado', label: 'Pescado y marisco', icon: '🐟' },
  { key: 'carne', label: 'Carne', icon: '🥩' },
  { key: 'fruta', label: 'Fruta', icon: '🍎' },
  { key: 'verdura', label: 'Verdura y hortalizas', icon: '🥦' },
  { key: 'despensa', label: 'Despensa (arroz, pasta, aceite, conservas...)', icon: '🥫' },
  { key: 'otros', label: 'Otros alimentos', icon: '🍽️' },
]

const OTROS: FoodType = FOOD_TYPES[FOOD_TYPES.length - 1]

// Clases de fábrica para "Otros" (todo lo que no es comida: ropa,
// electrónica, limpieza...) — petición real: "reestructuramos la
// creación de clases y la hacemos para todos los productos, misma
// separación por un botón Alimentos y Otros". A diferencia de
// FOOD_TYPES, no hay ningún classifyFoodType equivalente para estas
// (es un catálogo demasiado heterogéneo para adivinar por palabra
// clave con fiabilidad) — se eligen siempre a mano, nunca solas.
export const NO_FOOD_TYPES: FoodType[] = [
  { key: 'ropa', label: 'Ropa y calzado', icon: '👕' },
  { key: 'electronica', label: 'Electrónica y hogar', icon: '📺' },
  { key: 'limpieza', label: 'Limpieza del hogar', icon: '🧽' },
  { key: 'papeleria', label: 'Papelería y oficina', icon: '📓' },
  { key: 'juguetes', label: 'Juguetes', icon: '🧸' },
  { key: 'mascotas', label: 'Mascotas', icon: '🐾' },
  { key: 'bricolaje', label: 'Ferretería y bricolaje', icon: '🔧' },
  { key: 'cuidado_personal', label: 'Cuidado personal', icon: '🧴' },
  { key: 'salud', label: 'Farmacia y salud', icon: '💊' },
  { key: 'otros_no_alimentos', label: 'Otros', icon: '🛍️' },
]

// Petición real: "de paso si puedes poner una gama más amplia de
// emojis estaría bien" — para elegir el icono de una clase (nueva o
// editada) sin depender de que el teclado de emoji del móvil esté a
// mano. No pretende ser exhaustivo, solo cubrir bien comida y compras
// no-alimentos a la vez.
export const ICON_CHOICES: string[] = [
  '🍎', '🍌', '🍊', '🍇', '🍓', '🍍', '🥝', '🍑', '🍉', '🥭',
  '🥦', '🥕', '🥔', '🍅', '🥒', '🧄', '🧅', '🌽', '🥬', '🍄',
  '🥩', '🍗', '🥓', '🌭', '🍔', '🍕', '🥚', '🧀', '🥛', '🧈',
  '🐟', '🍤', '🦐', '🦀', '🦑', '🐙',
  '🍞', '🥐', '🥖', '🧁', '🍰', '🍩', '🍪', '🍫', '🍬', '🍭',
  '🥤', '☕', '🍵', '🍺', '🍷', '🥂', '🧃', '💧',
  '🧊', '🥫', '🍚', '🍝', '🫒', '🧂',
  '🛍️', '👕', '👖', '👗', '👟', '🧦', '🧣', '👜',
  '📺', '💻', '📱', '🔌', '💡', '🔋',
  '🧽', '🧴', '🧻', '🧹', '🪥', '🧼',
  '📓', '✏️', '📎', '🖊️',
  '🧸', '🎲', '⚽', '🎈',
  '🐾', '🦴',
  '🔧', '🔨', '🪛', '🔩',
  '⛽', '🛢️', '🧪', '🚗',
  '💊', '🩹', '💅', '🪒',
  '🎁', '🌸', '🕯️', '🍽️',
]

// Orden de comprobación = prioridad: las bebidas y "zero" se miran antes
// que "fruta" para que "Naranja Zero" (refresco) no caiga en Fruta
// solo por llevar "naranja" en el nombre.
//
// COM-03 — separadas por si CONTIENEN alcohol, nunca mezcladas: "mosto" se saca de alcohólicas (es
// mosto de uva SIN fermentar, un refresco habitual, no vino) y se reparte entre las dos lista según
// corresponda. "Cerveza/vino/sidra sin alcohol" se gestiona aparte con hasAlcoholNegation() más abajo —
// nunca se asume alcohol solo por la palabra, el propio fabricante lo dice explícitamente cuando no lo
// hay. Una palabra ausente de ambas listas no cae en ninguna — "Sin clasificar" antes que adivinar
// (mismo principio ya documentado en domain/productClass.ts, "PEPA NO DEBE ADIVINAR").
const KEYWORDS_BY_TYPE: Record<string, string[]> = {
  bebidas_alcoholicas: [
    'cerveza', 'vino', 'vermut', 'vermout', 'sidra', 'cava', 'champan',
    'licor', 'ron', 'vodka', 'whisky', 'ginebra',
  ],
  bebidas_no_alcoholicas: [
    'refresco', 'refres', 'cola', 'zumo', 'nectar', 'bebida', 'mosto',
    'cafe', 'nescafe', 'agua', 'zero', 'te', 'isotonica', 'isotonico',
    'energetica', 'energetico',
  ],
  congelados: ['helado', 'congelado', 'congelada', 'sorbete', 'granizado'],
  snacks: [
    'lays', 'ruffles', 'doritos', 'bugles', 'pringles', 'nachos', 'palomitas',
    'chocolate', 'bombon', 'turron', 'caramelo', 'chuche', 'golosina',
    'gominola', 'cacahuete', 'almendra', 'pipas', 'oreo',
  ],
  panaderia: [
    'pan', 'panecillo', 'baguette', 'croissant', 'bolleria', 'magdalena',
    'bizcocho', 'galleta', 'donut', 'ensaimada', 'hojaldre', 'trenza',
    'artesanitos', 'bollo',
  ],
  lacteos: [
    'leche', 'queso', 'yogur', 'yogomix', 'huevo', 'nata', 'mantequilla',
    'mozzarella', 'batido', 'requeson', 'flan', 'natilla', 'cuajada',
  ],
  carne: [
    'pollo', 'cerdo', 'ternera', 'vacuno', 'carne', 'lomo', 'solomillo',
    'chuleta', 'chorizo', 'salchicha', 'salami', 'fuet', 'longaniza',
    'sobrasada', 'bacon', 'panceta', 'jamon', 'hamburguesa', 'burger',
    'filete', 'pechuga', 'muslo', 'costilla', 'carrillera', 'torrezno',
    'morcilla', 'pavo', 'conejo', 'cordero', 'brocheta',
  ],
  pescado: [
    'pescado', 'merluza', 'salmon', 'atun', 'gamba', 'langostino', 'calamar',
    'pulpo', 'marisco', 'bacalao', 'sardina', 'boqueron', 'mejillon',
    'trucha', 'lubina', 'dorada', 'sepia', 'surimi',
  ],
  fruta: [
    'manzana', 'platano', 'banana', 'naranja', 'limon', 'pera', 'uva',
    'fresa', 'frambuesa', 'mora', 'cereza', 'melon', 'sandia', 'kiwi',
    'mango', 'pina', 'melocoton', 'albaricoque', 'ciruela', 'nectarina',
    'aguacate', 'higo', 'granada', 'arandano', 'fruta',
  ],
  verdura: [
    'tomate', 'cebolla', 'patata', 'pimiento', 'lechuga', 'zanahoria',
    'calabacin', 'calabaza', 'pepino', 'berenjena', 'brocoli', 'coliflor',
    'espinaca', 'acelga', 'puerro', 'ajo', 'judia', 'guisante', 'apio',
    'remolacha', 'champinon', 'seta', 'verdura', 'hortaliza', 'ensalada',
    'cogollo', 'canonigo',
  ],
  despensa: [
    'arroz', 'pasta', 'macarron', 'espagueti', 'aceite', 'vinagre', 'harina',
    'azucar', 'especia', 'salsa', 'mayonesa', 'ketchup', 'mostaza',
    'conserva', 'lenteja', 'garbanzo', 'alubia', 'legumbre', 'caldo',
    'sopa', 'cereal', 'mermelada', 'miel',
  ],
}

function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function tokenize(name: string): string[] {
  return normalize(name)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

// Palabra completa o su plural simple (+s / +es) — nunca un prefijo
// suelto, para que "pan" no confunda "panceta" con Panadería (bug que
// se vio al probar con datos reales).
function tokenMatches(token: string, keyword: string): boolean {
  return token === keyword || token === `${keyword}s` || token === `${keyword}es`
}

// COM-03 — "sin alcohol" en cualquier posición del nombre ("Cerveza sin alcohol", "Vino sin alcohol
// 0,0 San Miguel") — el fabricante lo dice explícitamente cuando una bebida que normalmente lleva
// alcohol no lo lleva; nunca se asume alcohol en ese caso.
function hasAlcoholNegation(tokens: string[]): boolean {
  return tokens.some((t, i) => t === 'sin' && tokens[i + 1] === 'alcohol')
}

export function classifyFoodType(displayName: string): FoodType {
  const tokens = tokenize(displayName)
  // "Cerveza/vino/sidra sin alcohol" → no alcohólica, aunque la palabra en sí esté en la lista de
  // alcohólicas — se resuelve ANTES del recorrido normal para que nunca caiga en esa categoría.
  if (hasAlcoholNegation(tokens) && KEYWORDS_BY_TYPE.bebidas_alcoholicas.some((k) => tokens.some((t) => tokenMatches(t, k)))) {
    return FOOD_TYPES.find((t) => t.key === 'bebidas_no_alcoholicas')!
  }
  for (const type of FOOD_TYPES) {
    const keywords = KEYWORDS_BY_TYPE[type.key]
    if (keywords?.some((k) => tokens.some((t) => tokenMatches(t, k)))) return type
  }
  return OTROS
}
