import superDumboLogo from '@/assets/store-logos/superdumbo.png'

// Icono por tienda para que se reconozcan de un vistazo en vez de solo
// el nombre (petición real: "en vez de ponerme Aldi con la x, me lo
// pones con el nombre, pero con el logotipo también"). Para cadenas con
// logo real se referencia en vivo el favicon de su propia web (no se
// descarga ni se guarda ningún logo aquí, solo la URL pública de
// siempre — como hace el propio navegador). Para cadenas regionales sin
// favicon fiable (p. ej. superDumbo) se usa un logo real que el usuario
// ha dado, empaquetado en la propia app. Para tiendas sin una marca
// única (el chino de turno, una ferretería...) se usa un icono
// relacionado en su lugar.
interface StoreIconLogo {
  kind: 'logo'
  domain: string
}
interface StoreIconImage {
  kind: 'image'
  src: string
}
interface StoreIconEmoji {
  kind: 'emoji'
  icon: string
}
export type StoreIcon = StoreIconLogo | StoreIconImage | StoreIconEmoji

// Dominio real de cada cadena, normalizado (sin acentos/mayúsculas) para
// comparar — lista de las principales cadenas españolas, para que
// cualquier tienda real que se añada ya tenga su logo de entrada sin
// tener que pedirlo cada vez (petición real: "cada vez que se añade una
// tienda, si encuentras el logotipo... lo pones"). "Hipervel" es la
// mejor suposición para HiperBer, la cadena regional (Alicante/Murcia)
// que mejor encaja con cómo se ha dictado ("Hyper Beard", "Hiperver",
// "Hipervel") — si no es la tienda correcta, dímelo y lo cambio.
const STORE_LOGOS: Record<string, string> = {
  mercadona: 'mercadona.es',
  aldi: 'aldi.es',
  hipervel: 'hiperber.es',
  hiperber: 'hiperber.es',
  lidl: 'lidl.es',
  carrefour: 'carrefour.es',
  caprabo: 'caprabo.com',
  eroski: 'eroski.es',
  consum: 'consum.es',
  alcampo: 'alcampo.es',
  dia: 'dia.es',
  spar: 'spar.es',
}

// Cadenas regionales cuyo logo real ha dado el usuario directamente
// (petición real: "este es el logo de Super Dumbo, pónlo también en su
// tienda") porque no tienen un favicon fiable que se pueda referenciar
// en vivo.
const STORE_IMAGE_LOGOS: Record<string, string> = {
  superdumbo: superDumboLogo,
  'super dumbo': superDumboLogo,
}

// Para tiendas sin una marca única reconocible, un icono relacionado en
// vez de dejarlas sin nada (petición real: "el que no tenga logotipo
// como el chino, le pones algo relacionado, lo que veas"). Se puede ir
// ampliando con el nombre normalizado de cada tienda nueva.
const STORE_EMOJIS: Record<string, string> = {
  chino: '🏮',
  'todo a cien': '💯',
  bricolaje: '🛠️',
  ferreteria: '🔧',
  panaderia: '🥖',
  fruteria: '🍎',
  carniceria: '🥩',
  pescaderia: '🐟',
  farmacia: '💊',
}

const DEFAULT_EMOJI = '🏬'

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

export function getStoreIcon(name: string): StoreIcon {
  const key = normalizeKey(name)
  if (STORE_IMAGE_LOGOS[key]) return { kind: 'image', src: STORE_IMAGE_LOGOS[key] }
  if (STORE_LOGOS[key]) return { kind: 'logo', domain: STORE_LOGOS[key] }
  return { kind: 'emoji', icon: STORE_EMOJIS[key] ?? DEFAULT_EMOJI }
}
