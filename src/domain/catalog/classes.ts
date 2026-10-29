// CLASES CAT-1 (las clases de producto del catálogo base de PEPA) tal como las conoce el catálogo maestro. Es un ESPEJO de la tabla del catálogo base
// (migraciones 0139 + 0294 + 0334 + 0348): la prueba catalog/catalogClasses.test.ts comprueba que las claves y los nombres coinciden con las migraciones. La base de
// datos sigue siendo la fuente de verdad de lo que ve cada familia; aquí solo está lo necesario para clasificar sin red.
export type ClassKind = 'alimentacion' | 'no_alimentos'

export interface CatalogClass {
  key: string
  name: string
  kind: ClassKind
  icon: string
}

export const CATALOG_CLASSES: readonly CatalogClass[] = [
  { key: 'food.carne', name: 'Carne', kind: 'alimentacion', icon: '🥩' },
  { key: 'food.panaderia_bolleria', name: 'Panadería y bollería', kind: 'alimentacion', icon: '🍞' },
  { key: 'food.lacteos_huevos', name: 'Lácteos', kind: 'alimentacion', icon: '🥛' },
  { key: 'food.huevos', name: 'Huevos', kind: 'alimentacion', icon: '🥚' },
  { key: 'food.congelados_helados', name: 'Congelados y helados', kind: 'alimentacion', icon: '🧊' },
  { key: 'food.snacks_dulces', name: 'Snacks y dulces', kind: 'alimentacion', icon: '🍬' },
  { key: 'food.despensa', name: 'Despensa (arroz, pasta, aceite, conservas...)', kind: 'alimentacion', icon: '🥫' },
  { key: 'food.verdura_hortalizas', name: 'Verdura y hortalizas', kind: 'alimentacion', icon: '🥦' },
  { key: 'food.fruta', name: 'Fruta', kind: 'alimentacion', icon: '🍎' },
  { key: 'food.pescado_marisco', name: 'Pescado y marisco', kind: 'alimentacion', icon: '🐟' },
  { key: 'food.otros_alimentos', name: 'Otros alimentos', kind: 'alimentacion', icon: '🍽️' },
  { key: 'food.condimentos_hierbas', name: 'Condimentos y Hierbas', kind: 'alimentacion', icon: '🧂' },
  { key: 'food.bebidas_no_alcoholicas', name: 'Bebidas no alcohólicas', kind: 'alimentacion', icon: '🥤' },
  { key: 'food.bebidas_alcoholicas', name: 'Bebidas alcohólicas', kind: 'alimentacion', icon: '🍺' },
  { key: 'food.postres', name: 'Postres', kind: 'alimentacion', icon: '🍰' },
  // Nuevas en la 0334 (catálogo maestro): familias que no estaban representadas.
  { key: 'food.alimentacion_infantil', name: 'Alimentación infantil', kind: 'alimentacion', icon: '🍼' },
  { key: 'food.platos_preparados', name: 'Platos preparados', kind: 'alimentacion', icon: '🥘' },
  { key: 'other.limpieza_hogar', name: 'Limpieza del hogar', kind: 'no_alimentos', icon: '🧽' },
  { key: 'other.cuidado_personal', name: 'Cuidado personal', kind: 'no_alimentos', icon: '🧴' },
  { key: 'other.ropa_calzado', name: 'Ropa y calzado', kind: 'no_alimentos', icon: '👕' },
  { key: 'other.electronica_hogar', name: 'Electrónica y hogar', kind: 'no_alimentos', icon: '📺' },
  { key: 'other.utensilios_cocina', name: 'Utensilios cocina', kind: 'no_alimentos', icon: '🧼' },
  { key: 'other.jardin', name: 'Jardín', kind: 'no_alimentos', icon: '🌸' },
  { key: 'other.combustible_aceite_adblue', name: 'Combustible, Aceite y AdBlue', kind: 'no_alimentos', icon: '🚗' },
  { key: 'other.ferreteria_bricolaje', name: 'Ferretería y bricolaje', kind: 'no_alimentos', icon: '🔧' },
  { key: 'other.farmacia_salud', name: 'Farmacia y salud', kind: 'no_alimentos', icon: '💊' },
  { key: 'other.juguetes', name: 'Juguetes', kind: 'no_alimentos', icon: '🧸' },
  { key: 'other.mascotas', name: 'Mascotas', kind: 'no_alimentos', icon: '🐾' },
  { key: 'other.papeleria_oficina', name: 'Papelería y oficina', kind: 'no_alimentos', icon: '📓' },
  { key: 'other.cuidado_bebe', name: 'Higiene y cuidado del bebé', kind: 'no_alimentos', icon: '👶' },
  // Nuevas en la 0348 (COR-06): muebles (un archivador de 5 cajones no es papelería ni ferretería) y manualidades/actividades creativas (no son juguetes ni comida).
  { key: 'other.muebles_organizacion', name: 'Muebles y organización', kind: 'no_alimentos', icon: '🗄️' },
  { key: 'other.manualidades_creatividad', name: 'Manualidades y creatividad', kind: 'no_alimentos', icon: '🎨' },
  { key: 'other.otros', name: 'Otros', kind: 'no_alimentos', icon: '🛍️' },
]

/** Códigos cortos con los que se escribe el catálogo (catalogData*.ts) → clave estable de la clase. */
export const CLASS_CODES: Readonly<Record<string, string>> = {
  carne: 'food.carne',
  pan: 'food.panaderia_bolleria',
  lac: 'food.lacteos_huevos',
  hue: 'food.huevos',
  cong: 'food.congelados_helados',
  snk: 'food.snacks_dulces',
  desp: 'food.despensa',
  ver: 'food.verdura_hortalizas',
  fru: 'food.fruta',
  pes: 'food.pescado_marisco',
  otr: 'food.otros_alimentos',
  cond: 'food.condimentos_hierbas',
  bna: 'food.bebidas_no_alcoholicas',
  bal: 'food.bebidas_alcoholicas',
  pos: 'food.postres',
  inf: 'food.alimentacion_infantil',
  pre: 'food.platos_preparados',
  limp: 'other.limpieza_hogar',
  cui: 'other.cuidado_personal',
  ropa: 'other.ropa_calzado',
  elec: 'other.electronica_hogar',
  uten: 'other.utensilios_cocina',
  jard: 'other.jardin',
  comb: 'other.combustible_aceite_adblue',
  ferr: 'other.ferreteria_bricolaje',
  farm: 'other.farmacia_salud',
  jug: 'other.juguetes',
  masc: 'other.mascotas',
  pap: 'other.papeleria_oficina',
  beb: 'other.cuidado_bebe',
  mue: 'other.muebles_organizacion',
  man: 'other.manualidades_creatividad',
  otro: 'other.otros',
}

const BY_KEY = new Map(CATALOG_CLASSES.map((c) => [c.key, c]))
export function catalogClass(key: string): CatalogClass | undefined {
  return BY_KEY.get(key)
}
