// Reglas de coincidencia por alérgeno (DATOS, no lógica) del motor de src/domain/dietaryRestrictions.ts.
// PURO: sin red, sin Supabase, sin IA. Cada alérgeno del catálogo tiene cuatro listas de frases:
//
//   · named  → el ingrediente NOMBRA el alérgeno o un derivado seguro («queso» para la leche): nivel «conflicto».
//   · cls    → clase de producto que NORMALMENTE lo lleva («pan» para el gluten): «conflicto», pero se anula si el propio ingrediente dice
//              que no lo lleva («pan sin gluten»).
//   · review → producto compuesto o ambiguo que PUEDE llevarlo sin decirlo («salsa», «caldo», «pesto», «surimi»): nivel «revisar».
//   · cross  → relación conocida con otro alérgeno (otro fruto de cáscara, cacahuete y altramuz…): «revisar».
//
// Cada frase puede llevar `not`: palabras que, si SIGUEN a la frase, la anulan («leche» + «de coco» → no es leche; «nuez» + «moscada» → es una especia).
// Las frases se escriben de forma natural («salsa de soja»); el motor las normaliza igual que el texto de la receta (sin tildes, sin «de/la/el…», plurales).
//
// LÍMITES CONOCIDOS (también en docs/comunidad/ALERGIAS_INTOLERANCIAS_ANALISIS.md): una lista de palabras nunca cubre todos los productos elaborados, las
// trazas, los nombres regionales ni los errores de escritura. Por eso un resultado sin coincidencias NUNCA significa que la receta sea apta.
import type { DietaryAllergenKey } from './dietaryRestrictions'

export type RuleTerm = string | { p: string; not?: string[]; why?: string }

export interface KeyRules {
  named: RuleTerm[]
  cls?: RuleTerm[]
  review?: RuleTerm[]
  // Frases que, SI VAN NEGADAS («sin gluten», «libre de gluten», «sin gluten ni lactosa»), indican que el ingrediente declara no llevar este alérgeno.
  selfClaim: string[]
  // Frases que declaran la ausencia sin necesidad de negación («gluten free», «vegano»).
  freeClaim?: string[]
  // Declaraciones que solo bajan de nivel (no anulan): «sin gluten» no garantiza ausencia de trigo para quien es alérgico al trigo.
  downgradeClaim?: string[]
}

const VEG_MILK_NOT = ['coco', 'almendra', 'avena', 'soja', 'arroz', 'vegetal', 'vegano', 'vegana', 'anacardo', 'avellana', 'cacahuete', 'quinoa', 'espelta', 'cañamo', 'guisante', 'chufa', 'tigre', 'horchata', 'karite', 'cacao', 'sesamo']
const BUTTER_NOT = [...VEG_MILK_NOT, 'frutos secos']
const NON_WHEAT_FLOUR = ['maiz', 'arroz', 'garbanzo', 'almendra', 'coco', 'sarraceno', 'trigo sarraceno', 'quinoa', 'yuca', 'mandioca', 'tapioca', 'patata', 'castaña', 'lenteja', 'teff', 'mijo', 'sorgo', 'amaranto', 'altramuz', 'cacahuete', 'avellana', 'nuez', 'soja', 'guisante', 'banana', 'platano', 'algarroba', 'legumbre', 'sin gluten']
const PASTA_NOT = ['tomate', 'curry', 'ajo', 'sesamo', 'almendra', 'anchoa', 'pimiento', 'guindilla', 'miso', 'cacahuete', 'avellana', 'aceituna', 'azucar', 'frutos', 'pescado', 'arroz', 'maiz', 'garbanzo', 'lenteja', 'legumbre', 'dientes', 'chile', 'pistacho', 'oliva', 'membrillo', 'guayaba', 'dulce', 'cebolla']

// «Salsa» sin más es ambigua (puede llevar gluten, huevo, soja, leche…), pero la de tomate sola es tan corriente que avisaría de todo: no se marca.
const SALSA: RuleTerm = { p: 'salsa', not: ['tomate'] }
// Embutidos y fiambres: llevan con frecuencia leche, gluten, soja o sulfitos sin que se note.
const CHARCUTERIE: RuleTerm[] = ['chorizo', 'salchichón', 'fuet', 'longaniza', 'morcilla', 'mortadela', 'butifarra', 'paté', 'foie']

// Frutos de cáscara concretos (cada uno es una alergia distinta). Las claves coinciden con el catálogo.
const NUT_TERMS: Record<string, RuleTerm[]> = {
  almendra: ['almendra', 'almendrado', 'mazapán', 'marzipan', 'turrón', 'polvorón', 'frangipane', 'amaretto', 'ajoblanco', 'romesco', 'horchata de almendra', 'harina de almendra'],
  avellana: ['avellana', 'nutella', 'gianduja', 'crema de avellanas', 'crema de cacao y avellanas'],
  nuez: [{ p: 'nuez', not: ['moscada', 'tierra', 'brasil', 'macadamia', 'pecana', 'pecan', 'cola'] }, 'nogal', 'walnut'],
  anacardo: ['anacardo', 'anacardos', 'cajú', 'caju', 'castaña de cajú', 'nuez de la india'],
  pistacho: ['pistacho', 'pistachos'],
  macadamia: ['macadamia', 'nuez de macadamia'],
  pecana: ['pecana', 'pecán', 'pacana', 'nuez pecana', 'nuez pecán'],
  nuez_de_brasil: ['nuez de Brasil', 'nueces de Brasil', 'castaña de Brasil', 'castaña de Pará'],
}
const NUT_GENERIC: RuleTerm[] = ['frutos secos', 'fruto seco', 'mezcla de frutos secos', 'frutos de cáscara', 'fruto de cáscara', 'frutos secos variados']
const NUT_COMPOUND_REVIEW: RuleTerm[] = ['pesto', 'praliné', 'pralín', 'granola', 'muesli', 'barrita de cereales', 'barrita energética', 'mortadela', 'mantecado', 'turrón blando']

function crossNuts(self: string): RuleTerm[] {
  return Object.entries(NUT_TERMS)
    .filter(([k]) => k !== self)
    .flatMap(([, terms]) => terms.map((t) => (typeof t === 'string' ? { p: t, why: 'Es otro fruto de cáscara: puede dar reacción cruzada. Consúltalo con su médico.' } : { ...t, why: 'Es otro fruto de cáscara: puede dar reacción cruzada. Consúltalo con su médico.' })))
}

const GLUTEN_NAMED: RuleTerm[] = [
  { p: 'trigo', not: ['sarraceno'] }, 'centeno', 'cebada', 'espelta', 'kamut', 'triticale', 'farro', 'escanda', 'seitán', 'cuscús', 'couscous', 'sémola', 'bulgur', 'salvado', 'germen de trigo', 'malta', 'gluten',
]
const GLUTEN_CLS: RuleTerm[] = [
  'pan', 'panecillo', 'baguette', 'barra de pan', 'pan rallado', 'pan de molde', 'pan de hamburguesa', 'tostada', 'picatostes', 'crutones', 'bollo', 'bocadillo',
  { p: 'pasta', not: PASTA_NOT }, 'macarrones', 'espaguetis', 'espagueti', 'tallarines', 'fideos', 'lasaña', 'canelones', 'ravioli', 'tortellini', 'ñoquis', 'noquis',
  'galleta', 'galletas', 'bizcocho', 'magdalena', 'croissant', 'brioche', 'donut', 'empanadilla', 'empanada', 'pizza', 'masa de pizza', 'hojaldre', 'masa quebrada', 'masa brisa', 'obleas', 'oblea', 'rebozado', 'empanado', 'tempura', 'bechamel', 'besamel',
  'cerveza',
]
const GLUTEN_REVIEW: RuleTerm[] = [
  { p: 'harina', not: NON_WHEAT_FLOUR }, 'avena', 'copos de avena', 'harina integral', 'salsa de soja', 'teriyaki', 'salsa worcestershire', 'miso', 'embutido', ...CHARCUTERIE, 'salchicha', 'hamburguesa', 'albóndiga', 'croqueta', 'nuggets', 'sopa',
  'caldo', 'cubito', 'pastilla de caldo', 'cereales de desayuno', 'muesli', 'granola', 'surimi', 'tarta', 'pastel', 'wrap', 'tortita', SALSA, 'sucedáneo', 'seitan',
]

// Productos compuestos genéricos: si el propio ingrediente dice «casero» (lo has hecho tú), no se avisa de ellos (salvo el apio, que casi siempre va en el caldo).
export const GENERIC_COMPOUNDS: readonly string[] = [
  'salsa', 'caldo', 'cubito', 'pastilla de caldo', 'sofrito', 'sopa', 'sopa de verduras', 'caldo de verduras', 'aliño', 'aderezo', 'vinagreta', 'sazonador', 'embutido', 'salchicha', 'hamburguesa', 'albóndiga', 'croqueta', 'nuggets',
  ...CHARCUTERIE.map((t) => (typeof t === 'string' ? t : t.p)),
]

export const KEY_RULES: Record<DietaryAllergenKey, KeyRules> = {
  gluten: { named: GLUTEN_NAMED, cls: GLUTEN_CLS, review: GLUTEN_REVIEW, selfClaim: ['gluten', 'tacc'], freeClaim: ['gluten free', 'para celiacos', 'apto celiacos', 'apto para celiacos', 'celiacos'] },
  gluten_no_celiaco: { named: GLUTEN_NAMED, cls: GLUTEN_CLS, review: GLUTEN_REVIEW, selfClaim: ['gluten', 'tacc'], freeClaim: ['gluten free', 'para celiacos', 'apto celiacos', 'apto para celiacos', 'celiacos'] },
  trigo: {
    named: [{ p: 'trigo', not: ['sarraceno'] }, 'espelta', 'kamut', 'farro', 'escanda', 'seitán', 'cuscús', 'couscous', 'sémola', 'bulgur', 'salvado', 'germen de trigo', 'triticale'],
    cls: [
      'pan', 'panecillo', 'baguette', 'barra de pan', 'pan rallado', 'pan de molde', 'pan de hamburguesa', 'tostada', 'picatostes', 'crutones', 'bollo', 'bocadillo',
      { p: 'pasta', not: PASTA_NOT }, 'macarrones', 'espaguetis', 'espagueti', 'tallarines', 'fideos', 'lasaña', 'canelones', 'ravioli', 'tortellini', 'ñoquis', 'noquis',
      'galleta', 'galletas', 'bizcocho', 'magdalena', 'croissant', 'brioche', 'donut', 'empanadilla', 'empanada', 'pizza', 'masa de pizza', 'hojaldre', 'masa quebrada', 'masa brisa', 'obleas', 'oblea', 'rebozado', 'empanado', 'tempura', 'bechamel', 'besamel',
    ],
    review: [
      { p: 'harina', not: NON_WHEAT_FLOUR }, 'harina integral', 'cerveza', 'salsa de soja', 'teriyaki', 'embutido', ...CHARCUTERIE, 'salchicha', 'hamburguesa', 'albóndiga', 'croqueta', 'nuggets', 'caldo', 'cubito', 'pastilla de caldo', 'sopa', 'cereales de desayuno', 'muesli',
      'granola', 'surimi', 'tarta', 'pastel', 'wrap', 'tortita', SALSA, 'centeno', 'cebada', 'malta', 'gluten',
    ],
    selfClaim: ['trigo'],
    downgradeClaim: ['gluten', 'tacc'],
  },
  crustaceos: {
    named: ['gamba', 'langostino', 'camarón', 'cigala', 'langosta', 'bogavante', 'cangrejo', 'centollo', 'buey de mar', 'percebe', 'krill', 'quisquilla', 'carabinero', 'galera', 'nécora', 'txangurro', 'crustáceo', 'bisque'],
    review: ['marisco', 'mariscos', 'surimi', 'paella', 'fumet', 'caldo de pescado', 'salsa de pescado', 'sopa de marisco', 'salsa americana', 'cubito de pescado'],
    selfClaim: ['crustaceos', 'marisco'],
  },
  moluscos: {
    named: ['mejillón', 'almeja', 'berberecho', 'ostra', 'vieira', 'navaja', 'calamar', 'chipirón', 'sepia', 'pulpo', 'caracol', 'bígaro', 'zamburiña', 'coquina', 'cefalópodo', 'molusco', 'tinta de calamar', 'tinta de sepia', 'volandeira'],
    review: ['marisco', 'mariscos', 'paella', 'fumet', 'caldo de pescado', 'salsa de pescado', 'sopa de marisco', 'surimi', 'cubito de pescado'],
    selfClaim: ['moluscos', 'marisco'],
  },
  huevo: {
    named: [{ p: 'huevo', not: ['vegetal', 'vegano', 'vegana'] }, 'clara', 'yema', 'ovoalbúmina', 'albúmina', 'lisozima', 'ovomucoide', 'merengue', { p: 'mayonesa', not: ['vegano', 'vegana', 'vegetal'] }, 'salsa holandesa', 'salsa bearnesa', 'natillas', 'flan', 'crema pastelera', 'tiramisú', 'tortilla francesa', 'tortilla de patatas', 'tortilla de patata'],
    review: [
      'alioli', 'allioli', { p: 'tortilla', not: ['maiz', 'trigo', 'harina', 'wrap', 'mexicana', 'integral', 'avena'] }, 'pasta fresca', 'lasaña', 'canelones', 'ravioli', 'tortellini', 'bizcocho', 'tarta', 'magdalena', 'bollo', 'croissant', 'brioche', 'donut', 'pastel', 'rebozado', 'empanado', 'croqueta', 'nuggets',
      'albóndiga', 'helado', 'mousse', 'turrón', SALSA, 'surimi', 'galleta',
    ],
    selfClaim: ['huevo', 'ovoproductos'],
    freeClaim: ['vegano', 'vegana', 'sin ingredientes de origen animal'],
  },
  pescado: {
    named: [
      'pescado', 'merluza', 'bacalao', 'salmón', 'atún', 'bonito', 'caballa', 'sardina', 'anchoa', 'boquerón', 'lubina', 'dorada', 'rape', 'lenguado', 'trucha', 'pez espada', 'emperador', 'rodaballo', 'besugo', 'pargo', 'mero', 'abadejo', 'arenque', 'anguila',
      'tilapia', 'pangasius', 'eglefino', 'fletán', 'surimi', 'kamaboko', 'huevas', 'caviar', 'ventresca', 'mojama', 'cola de pescado', 'fumet', 'salsa de pescado', 'nuoc mam',
    ],
    review: ['salsa worcestershire', 'salsa césar', 'paella', 'sushi', 'poke', 'sopa de pescado', 'marisco'],
    selfClaim: ['pescado'],
  },
  cacahuete: {
    named: ['cacahuete', 'cacahuate', 'maní', 'mani', 'nuez de tierra', 'satay', 'aceite de cacahuete', 'mantequilla de cacahuete', 'crema de cacahuete'],
    review: [
      'frutos secos', 'mezcla de frutos secos', 'fruto seco', 'granola', 'muesli', 'barrita de cereales', 'barrita energética', 'praliné', 'salsa asiática', 'turrón',
      { p: 'altramuz', why: 'El altramuz es una legumbre emparentada con el cacahuete: puede dar reacción cruzada. Consúltalo con su médico.' },
    ],
    selfClaim: ['cacahuete', 'cacahuetes'],
  },
  soja: {
    named: ['soja', 'soya', 'tofu', 'tempeh', 'edamame', 'miso', 'tamari', 'shoyu', 'teriyaki', 'natto', 'okara', 'lecitina de soja', 'proteína de soja', 'soja texturizada'],
    review: [SALSA, 'caldo', 'cubito', 'embutido', ...CHARCUTERIE, 'salchicha', 'hamburguesa', 'nuggets', 'salsa worcestershire', 'chocolate', 'margarina', 'proteína vegetal', 'hamburguesa vegetal', 'salsa asiática', 'sucedáneo'],
    selfClaim: ['soja', 'soya'],
  },
  leche: {
    named: [
      { p: 'leche', not: VEG_MILK_NOT }, { p: 'nata', not: VEG_MILK_NOT }, { p: 'crema de leche', not: VEG_MILK_NOT }, { p: 'queso', not: ['vegano', 'vegana', 'vegetal', 'anacardo', 'soja', 'almendra', 'tofu'] },
      'mozzarella', 'mozarela', 'parmesano', 'parmigiano', 'grana padano', 'cheddar', 'gouda', 'emmental', 'emmenthal', 'brie', 'camembert', 'mascarpone', 'ricotta', 'requesón', 'feta', 'cabrales', 'manchego', 'roquefort',
      'gorgonzola', 'burrata', 'halloumi', 'provolone', 'pecorino', 'edam', 'havarti', 'cottage', 'philadelphia', 'tetilla', 'idiazábal', 'gruyère', 'gruyere', 'raclette', 'cuajada', 'yogur', 'yogurt', 'yoghurt', 'kéfir', 'kefir',
      { p: 'mantequilla', not: BUTTER_NOT }, 'ghee', 'caseína', 'caseinato', 'lactosuero', 'suero de leche', 'proteína de leche', 'lactoalbúmina', 'lactoglobulina', 'lactosa', 'lácteo', 'lácteos', 'productos lácteos', 'bechamel', 'besamel', 'natillas',
      'crema pastelera', 'chantilly', 'nata montada',
    ],
    review: [
      { p: 'manteca', not: ['cerdo', 'cacao', 'karite', 'coco'] }, 'helado', 'flan', 'batido', 'cacao soluble', 'colacao', 'chocolate', 'bizcocho', 'tarta', 'magdalena', 'bollo', 'croissant', 'brioche', 'donut', 'pastel', 'pan de molde',
      'puré de patata', SALSA, 'cubito', 'pastilla de caldo', 'pizza', 'lasaña', 'canelones', 'embutido', ...CHARCUTERIE, 'salchicha', 'jamón cocido', 'fiambre', 'gratinado', 'mousse', 'galleta',
    ],
    selfClaim: ['leche', 'lacteos', 'lacteo'],
    freeClaim: ['vegano', 'vegana', 'sin ingredientes de origen animal'],
  },
  frutos_de_cascara: {
    named: [...Object.values(NUT_TERMS).flat(), ...NUT_GENERIC],
    review: [...NUT_COMPOUND_REVIEW, 'piñón', 'piñones', 'castaña', 'nutella'],
    selfClaim: ['frutos secos', 'frutos de cascara', 'fruto seco'],
  },
  almendra: { named: NUT_TERMS.almendra, review: [...NUT_GENERIC, ...NUT_COMPOUND_REVIEW, ...crossNuts('almendra')], selfClaim: ['almendra'] },
  avellana: { named: NUT_TERMS.avellana, review: [...NUT_GENERIC, ...NUT_COMPOUND_REVIEW, 'praliné', 'turrón', 'romesco', ...crossNuts('avellana')], selfClaim: ['avellana'] },
  nuez: { named: NUT_TERMS.nuez, review: [...NUT_GENERIC, ...NUT_COMPOUND_REVIEW, ...crossNuts('nuez')], selfClaim: ['nuez', 'nueces'] },
  anacardo: { named: NUT_TERMS.anacardo, review: [...NUT_GENERIC, ...NUT_COMPOUND_REVIEW, ...crossNuts('anacardo')], selfClaim: ['anacardo'] },
  pistacho: { named: NUT_TERMS.pistacho, review: [...NUT_GENERIC, ...NUT_COMPOUND_REVIEW, ...crossNuts('pistacho')], selfClaim: ['pistacho'] },
  macadamia: { named: NUT_TERMS.macadamia, review: [...NUT_GENERIC, ...NUT_COMPOUND_REVIEW, ...crossNuts('macadamia')], selfClaim: ['macadamia'] },
  pecana: { named: NUT_TERMS.pecana, review: [...NUT_GENERIC, ...NUT_COMPOUND_REVIEW, ...crossNuts('pecana')], selfClaim: ['pecana', 'pecan'] },
  nuez_de_brasil: { named: NUT_TERMS.nuez_de_brasil, review: [...NUT_GENERIC, ...NUT_COMPOUND_REVIEW, ...crossNuts('nuez_de_brasil')], selfClaim: ['nuez de brasil'] },
  apio: {
    named: ['apio', 'apionabo', 'apio nabo', 'semilla de apio', 'sal de apio', 'mirepoix'],
    review: ['caldo', 'caldo de verduras', 'cubito', 'pastilla de caldo', 'sofrito', SALSA, 'sopa', 'sopa de verduras', 'mezcla de especias', 'especias', 'boloñesa', 'zumo de verduras', 'sazonador'],
    selfClaim: ['apio'],
  },
  mostaza: {
    named: ['mostaza', 'semilla de mostaza', 'semillas de mostaza', 'dijon', 'salsa de mostaza', 'aceite de mostaza'],
    review: [SALSA, 'vinagreta', 'aliño', 'aderezo', 'mayonesa', 'embutido', ...CHARCUTERIE, 'salchicha', 'curry', 'mezcla de especias', 'especias', 'salsa barbacoa', 'pepinillo', 'encurtido', 'sazonador', 'kétchup', 'ketchup', 'cubito'],
    selfClaim: ['mostaza'],
  },
  sesamo: {
    named: ['sésamo', 'ajonjolí', 'tahini', 'tahina', 'tahín', 'halva', 'halvah', 'za\'atar', 'zaatar', 'gomasio', 'aceite de sésamo'],
    cls: ['hummus', 'humus', 'baba ganoush', 'falafel'],
    review: ['pan de hamburguesa', 'bagel', 'panecillo', SALSA, 'mezcla de especias', 'especias', 'dukkah', 'barrita de cereales', 'granola', 'muesli', 'turrón', 'sazonador', 'wok', 'sushi'],
    selfClaim: ['sesamo', 'ajonjoli'],
  },
  sulfitos: {
    named: ['sulfito', 'sulfitos', 'dióxido de azufre', 'metabisulfito', 'anhídrido sulfuroso', 'e220', 'e221', 'e222', 'e223', 'e224', 'e225', 'e226', 'e227', 'e228'],
    cls: ['vino', 'cava', 'champán', 'champagne', 'vermut', 'jerez', 'brandy', 'coñac', 'mosto', 'sidra'],
    review: [
      'vinagre', 'fruta seca', 'orejones', 'albaricoque seco', 'ciruela pasa', 'higo seco', 'fruta desecada', 'pasas', 'patata deshidratada', 'puré instantáneo', 'zumo', 'mermelada', 'confitura', 'encurtido', 'pepinillo', 'aceitunas',
      'cerveza', 'gambas', 'langostinos', 'mostaza', SALSA, 'caldo', 'cubito', 'embutido', ...CHARCUTERIE, 'salchicha', 'hamburguesa', 'en conserva', 'conserva', 'coco rallado', 'licor', 'cóctel',
    ],
    selfClaim: ['sulfitos', 'sulfito'],
  },
  altramuces: {
    named: ['altramuz', 'altramuces', 'lupino', 'lupinos', 'lupin', 'harina de altramuz', 'tarwi', 'chocho'],
    review: [
      'harina', 'pan', 'pasta', 'galleta', 'bizcocho', 'rebozado', 'empanado',
      { p: 'cacahuete', why: 'El cacahuete es una legumbre emparentada con el altramuz: puede dar reacción cruzada. Consúltalo con su médico.' },
    ],
    selfClaim: ['altramuz', 'altramuces', 'lupino'],
  },
  lactosa: {
    named: ['lactosa', 'suero de leche', 'lactosuero', 'leche en polvo', 'leche condensada', 'leche evaporada'],
    cls: [
      { p: 'leche', not: VEG_MILK_NOT }, { p: 'nata', not: VEG_MILK_NOT }, { p: 'crema de leche', not: VEG_MILK_NOT }, 'yogur', 'yogurt', 'yoghurt', 'kéfir', 'kefir', 'helado', 'requesón', 'queso fresco', 'queso crema', 'queso de untar',
      'mascarpone', 'ricotta', 'mozzarella', 'mozarela', 'burrata', 'cottage', 'philadelphia', 'cuajada', 'bechamel', 'besamel', 'natillas', 'flan', 'crema pastelera', 'chantilly', 'nata montada', 'batido', 'cacao soluble', 'colacao', 'chocolate con leche',
    ],
    review: [
      { p: 'queso', not: ['vegano', 'vegana', 'vegetal', 'anacardo', 'soja', 'almendra', 'tofu'] }, { p: 'mantequilla', not: BUTTER_NOT }, 'parmesano', 'manchego', 'cheddar', 'gouda', 'emmental', 'chocolate', 'bizcocho', 'tarta', 'magdalena', 'bollo', 'croissant',
      'brioche', 'donut', 'puré de patata', SALSA, 'cubito', 'pizza', 'lasaña', 'canelones', 'embutido', ...CHARCUTERIE, 'salchicha', 'jamón cocido', 'fiambre', 'pan de molde', 'gratinado', 'mousse', 'galleta', 'pastel',
    ],
    selfClaim: ['lactosa'],
  },
  fructosa: {
    named: ['fructosa', 'jarabe de fructosa', 'jarabe de maíz', 'jarabe de agave', 'sirope de agave', 'agave', 'azúcar invertido', 'jarabe invertido', 'miel'],
    review: [
      'manzana', 'pera', 'mango', 'sandía', 'cereza', 'uva', 'higo', 'ciruela', 'melocotón', 'albaricoque', 'fruta seca', 'pasas', 'dátil', 'dátiles', 'zumo', 'mermelada', 'sirope', 'refresco', 'kétchup', 'ketchup', 'salsa barbacoa', 'bebida azucarada',
    ],
    selfClaim: ['fructosa'],
  },
}

// Relaciones documentadas entre claves del catálogo (para el texto de ayuda y para las pruebas).
export const CROSS_REACTIONS: { a: DietaryAllergenKey; b: DietaryAllergenKey; note: string }[] = [
  { a: 'cacahuete', b: 'altramuces', note: 'Legumbres emparentadas.' },
  { a: 'almendra', b: 'frutos_de_cascara', note: 'Cada fruto de cáscara es una alergia distinta; los demás se avisan como «revisar».' },
]
