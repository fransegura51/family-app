// Generador de alias divertidos para Comunidad PEPA. Puro (sin red ni estado): la persona puede pedir otro las veces que quiera («🎲 Sugerir otro») o escribir
// el suyo; el alias solo se guarda al confirmar (AliasDialog → community_set_alias).
//
// Reglas que cumple SIEMPRE lo que genera (las mismas que valida el servidor, migración 0265):
//   · 3 a 24 caracteres con letras (con tildes y ñ), números, espacios, puntos, guiones o guiones bajos → aquí solo letras, sin separadores.
//   · Nunca una palabra reservada (Pepa, Equipo, Admin, Soporte, Oficial…): ni siquiera pegada a otra.
//   · Sin nombres propios, apellidos ni datos personales: solo comida, cocina, hogar y adjetivos simpáticos.
// Variedad: seis familias de plantillas con muchas piezas cada una (varios miles de combinaciones distintas) más una lista de alias ya hechos; además
// `suggestAlias` evita repetir lo último que se enseñó.

export const ALIAS_MIN = 3
export const ALIAS_MAX = 24
// Igual que el CHECK de la base de datos (community_alias_format) y la función community_set_alias.
export const ALIAS_PATTERN = /^[A-Za-zÀ-ÿ0-9_. -]{3,24}$/

type Gender = 'm' | 'f'
type Noun = { t: string; g: Gender }
// Adjetivo con las dos formas; si es el mismo para ambos géneros, `f` = `m`.
type Adj = { m: string; f: string }

const NOUNS: Noun[] = [
  { t: 'Croqueta', g: 'f' },
  { t: 'Tortilla', g: 'f' },
  { t: 'Cuchara', g: 'f' },
  { t: 'Sartén', g: 'f' },
  { t: 'Cazuela', g: 'f' },
  { t: 'Tostada', g: 'f' },
  { t: 'Galleta', g: 'f' },
  { t: 'Empanada', g: 'f' },
  { t: 'Lenteja', g: 'f' },
  { t: 'Albóndiga', g: 'f' },
  { t: 'Paella', g: 'f' },
  { t: 'Zanahoria', g: 'f' },
  { t: 'Manzana', g: 'f' },
  { t: 'Nevera', g: 'f' },
  { t: 'Despensa', g: 'f' },
  { t: 'Escoba', g: 'f' },
  { t: 'Libreta', g: 'f' },
  { t: 'Mochila', g: 'f' },
  { t: 'Cucharón', g: 'm' },
  { t: 'Calcetín', g: 'm' },
  { t: 'Tupper', g: 'm' },
  { t: 'Sofrito', g: 'm' },
  { t: 'Bizcocho', g: 'm' },
  { t: 'Garbanzo', g: 'm' },
  { t: 'Pimiento', g: 'm' },
  { t: 'Tomate', g: 'm' },
  { t: 'Delantal', g: 'm' },
  { t: 'Tenedor', g: 'm' },
  { t: 'Fogón', g: 'm' },
  { t: 'Horno', g: 'm' },
  { t: 'Batido', g: 'm' },
  { t: 'Pepino', g: 'm' },
  { t: 'Cojín', g: 'm' },
  { t: 'Paraguas', g: 'm' },
  { t: 'Pastel', g: 'm' },
]

const ADJECTIVES: Adj[] = [
  { m: 'Viajero', f: 'Viajera' },
  { m: 'Despistado', f: 'Despistada' },
  { m: 'Curioso', f: 'Curiosa' },
  { m: 'Travieso', f: 'Traviesa' },
  { m: 'Soñador', f: 'Soñadora' },
  { m: 'Aventurero', f: 'Aventurera' },
  { m: 'Madrugador', f: 'Madrugadora' },
  { m: 'Perdido', f: 'Perdida' },
  { m: 'Ahorrador', f: 'Ahorradora' },
  { m: 'Cocinillas', f: 'Cocinillas' },
  { m: 'Feliz', f: 'Feliz' },
  { m: 'Valiente', f: 'Valiente' },
  { m: 'Sonriente', f: 'Sonriente' },
  { m: 'Chispeante', f: 'Chispeante' },
  { m: 'Elegante', f: 'Elegante' },
  { m: 'Dormilón', f: 'Dormilona' },
  { m: 'Glotón', f: 'Glotona' },
  { m: 'Presumido', f: 'Presumida' },
  { m: 'Rebelde', f: 'Rebelde' },
  { m: 'Alegre', f: 'Alegre' },
  { m: 'Organizado', f: 'Organizada' },
  { m: 'Inquieto', f: 'Inquieta' },
  { m: 'Campeón', f: 'Campeona' },
  { m: 'Misterioso', f: 'Misteriosa' },
]

const ROLES: Noun[] = [
  { t: 'Capitán', g: 'm' },
  { t: 'Reina', g: 'f' },
  { t: 'Rey', g: 'm' },
  { t: 'Maestro', g: 'm' },
  { t: 'Maestra', g: 'f' },
  { t: 'Detective', g: 'm' },
  { t: 'Doctor', g: 'm' },
  { t: 'Doctora', g: 'f' },
  { t: 'Chef', g: 'm' },
  { t: 'Inspector', g: 'm' },
  { t: 'Inspectora', g: 'f' },
  { t: 'Agente', g: 'm' },
  { t: 'Mago', g: 'm' },
  { t: 'Maga', g: 'f' },
  { t: 'Domador', g: 'm' },
  { t: 'Domadora', g: 'f' },
  { t: 'Explorador', g: 'm' },
  { t: 'Exploradora', g: 'f' },
]

// Cosas con su artículo («del Tupper», «de la Despensa»).
const OF_THINGS: { t: string; de: 'Del' | 'DeLa' }[] = [
  { t: 'Tupper', de: 'Del' },
  { t: 'Orden', de: 'Del' },
  { t: 'Sofrito', de: 'Del' },
  { t: 'Horno', de: 'Del' },
  { t: 'Calcetín', de: 'Del' },
  { t: 'Caos', de: 'Del' },
  { t: 'Mercado', de: 'Del' },
  { t: 'Tenedor', de: 'Del' },
  { t: 'Fogón', de: 'Del' },
  { t: 'Cucharón', de: 'Del' },
  { t: 'Recreo', de: 'Del' },
  { t: 'Domingo', de: 'Del' },
  { t: 'Delantal', de: 'Del' },
  { t: 'Cocina', de: 'DeLa' },
  { t: 'Despensa', de: 'DeLa' },
  { t: 'Nevera', de: 'DeLa' },
  { t: 'Sartén', de: 'DeLa' },
  { t: 'Lista', de: 'DeLa' },
  { t: 'Compra', de: 'DeLa' },
  { t: 'Siesta', de: 'DeLa' },
  { t: 'Tostada', de: 'DeLa' },
  { t: 'Paella', de: 'DeLa' },
  { t: 'Receta', de: 'DeLa' },
  { t: 'Merienda', de: 'DeLa' },
  { t: 'Olla', de: 'DeLa' },
]

// Plato o rol + complemento directo («CapitánSofrito», «ChefDespistado» sale de ROLES × ADJECTIVES).
const ROLE_OBJECTS = ['Sofrito', 'Tupper', 'Croqueta', 'Fogón', 'Cucharón', 'Mandil', 'Bizcocho', 'Tostada', 'Merienda', 'Cremita', 'Albóndiga', 'Colador']

const WITH_FLAIR: string[] = ['Arte', 'Chispa', 'Salero', 'Cariño', 'Gracia', 'Sabor', 'Estilo', 'Encanto', 'Duende', 'Ternura', 'Sorpresa']
const FLAIR_THINGS = ['Tortilla', 'Croqueta', 'Sartén', 'Cucharón', 'Receta', 'Tostada', 'Paella', 'Galleta', 'Cazuela', 'Escoba', 'Bizcocho', 'Mochila']

const HOMES = ['Familia', 'Casa', 'Hogar', 'Cocina', 'Despensa', 'Nevera', 'Tupper', 'Colada', 'Sofá', 'Mochila', 'Tertulia']
const STATES = ['Acción', 'Marcha', 'Órbita', 'Equilibrio', 'Llamas', 'Obras', 'Racha', 'Forma', 'Fiesta', 'Calma']

const WORLDS = ['Planeta', 'Universo', 'Galaxia', 'Isla', 'Reino', 'Mundo', 'Rincón', 'Valle', 'Pueblo', 'Ciudad']
const WORLD_THINGS = ['Recetas', 'Croquetas', 'Sofrito', 'Tupper', 'Calcetines', 'Postres', 'Tostadas', 'Siestas', 'Sabores', 'Trucos', 'Meriendas', 'Cucharones']

// Alias ya hechos (los ejemplos aprobados y más de la misma familia).
const READY_MADE: string[] = [
  'CroquetaViajera',
  'CapitánSofrito',
  'TortillaConArte',
  'FamiliaEnAcción',
  'DetectiveDelOrden',
  'CucharónFeliz',
  'PlanetaRecetas',
  'CalcetínPerdido',
  'ReinaDelTupper',
  'ChefDespistado',
  'MaestraDelSofrito',
  'LaCazuelaFeliz',
  'ElTupperValiente',
  'NochesDeTortilla',
  'DomingoDeCroquetas',
  'MerendandoAndo',
  'AbrazoDeLentejas',
  'CocinaConChispa',
  'TodoSeArregla',
  'HogarDulceHogar',
  'AventurasEnLaCocina',
  'MiradaDeCocinero',
  'SomosTodoCocina',
  'CorazónDeMigas',
  'PaellaDeDomingo',
  'SopaDeLetras',
  'LentejasConEstilo',
  'RecetaSecreta',
  'ElRincónDelSofrito',
  'TuVecinoCocinillas',
]

export type Rng = () => number

function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

function adjFor(g: Gender, a: Adj): string {
  return g === 'f' ? a.f : a.m
}

// Una propuesta, sin comprobar longitud (`suggestAlias` la comprueba).
function once(rng: Rng): string {
  const kind = Math.floor(rng() * 8)
  switch (kind) {
    case 0:
    case 1: {
      // CroquetaViajera, CalcetínPerdido, CucharónFeliz…
      const n = pick(NOUNS, rng)
      return n.t + adjFor(n.g, pick(ADJECTIVES, rng))
    }
    case 2: {
      // ReinaDelTupper, DetectiveDelOrden, DomadoraDeLaDespensa…
      const r = pick(ROLES, rng)
      const o = pick(OF_THINGS, rng)
      return r.t + o.de + o.t
    }
    case 3: {
      // ChefDespistado, CapitanaValiente…
      const r = pick(ROLES, rng)
      return r.t + adjFor(r.g, pick(ADJECTIVES, rng))
    }
    case 4:
      // CapitánSofrito, MagaCroqueta…
      return pick(ROLES, rng).t + pick(ROLE_OBJECTS, rng)
    case 5:
      // TortillaConArte, GalletaConSalero…
      return pick(FLAIR_THINGS, rng) + 'Con' + pick(WITH_FLAIR, rng)
    case 6:
      // FamiliaEnAcción, CocinaEnLlamas…
      return pick(HOMES, rng) + 'En' + pick(STATES, rng)
    default:
      // PlanetaRecetas, IslaSabores…
      return pick(WORLDS, rng) + pick(WORLD_THINGS, rng)
  }
}

// Texto sin tildes, minúsculas y sin separadores, para comparar con las palabras reservadas igual que el servidor.
function flat(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ ._-]/g, '')
}

const RESERVED_PARTS = ['pepa', 'equipo', 'admin', 'moderador', 'moderadora', 'soporte', 'oficial', 'administra']

// ¿Es un alias válido para el servidor y sin palabras reservadas?
export function isSuggestableAlias(alias: string): boolean {
  if (!ALIAS_PATTERN.test(alias)) return false
  const f = flat(alias)
  return !RESERVED_PARTS.some((r) => f.includes(r))
}

// Devuelve una propuesta válida (3-24 caracteres, sin reservadas) distinta de todos los alias de `avoid` (sin distinguir mayúsculas). `rng` solo se
// inyecta en las pruebas. Siempre termina: tras muchos intentos fallidos cae a un alias de la lista hecha.
export function suggestAlias(avoid: readonly string[] = [], rng: Rng = Math.random): string {
  const seen = new Set(avoid.map((a) => a.toLowerCase()))
  for (let i = 0; i < 60; i++) {
    const candidate = rng() < 0.2 ? pick(READY_MADE, rng) : once(rng)
    if (isSuggestableAlias(candidate) && !seen.has(candidate.toLowerCase())) return candidate
  }
  const fallback = READY_MADE.filter((a) => isSuggestableAlias(a) && !seen.has(a.toLowerCase()))
  return fallback.length > 0 ? pick(fallback, rng) : pick(READY_MADE, rng)
}

// Para las pruebas: tamaño aproximado del espacio de combinaciones.
export function aliasCombinationCount(): number {
  return (
    NOUNS.length * ADJECTIVES.length +
    ROLES.length * OF_THINGS.length +
    ROLES.length * ADJECTIVES.length +
    ROLES.length * ROLE_OBJECTS.length +
    FLAIR_THINGS.length * WITH_FLAIR.length +
    HOMES.length * STATES.length +
    WORLDS.length * WORLD_THINGS.length +
    READY_MADE.length
  )
}
