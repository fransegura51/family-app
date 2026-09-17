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

export const FOOD_TYPES: FoodType[] = [
  { key: 'bebidas', label: 'Bebidas', icon: '🥤' },
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

// Orden de comprobación = prioridad: "bebidas" y "zero" se miran antes
// que "fruta" para que "Naranja Zero" (refresco) no caiga en Fruta
// solo por llevar "naranja" en el nombre.
const KEYWORDS_BY_TYPE: Record<string, string[]> = {
  bebidas: [
    'cerveza', 'vino', 'mosto', 'vermut', 'vermout', 'sidra', 'cava', 'champan',
    'refresco', 'refres', 'cola', 'zumo', 'nectar', 'bebida', 'licor', 'ron',
    'vodka', 'whisky', 'ginebra', 'cafe', 'nescafe', 'agua', 'zero',
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

export function classifyFoodType(displayName: string): FoodType {
  const tokens = tokenize(displayName)
  for (const type of FOOD_TYPES) {
    const keywords = KEYWORDS_BY_TYPE[type.key]
    if (keywords?.some((k) => tokens.some((t) => tokenMatches(t, k)))) return type
  }
  return OTROS
}
