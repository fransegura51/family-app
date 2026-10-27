// CATÁLOGO MAESTRO PEPA — agregado de todas las familias de producto. Los datos viven en ./data/*.ts (texto compacto, ver parse.ts).
// Ampliarlo = añadir líneas; la estructura no cambia. Las claves son ESTABLES: nunca se reutilizan ni se renombran.
import { parseCatalog, type CatalogEntry } from './parse'
import { BEBIDAS_PREPARADOS } from './data/bebidasPreparados'
import { DESPENSA } from './data/despensa'
import { FRESCOS } from './data/frescos'
import { HOGAR_PERSONAL } from './data/hogarPersonal'
import { INFANTIL } from './data/infantil'
import { LACTEOS_PAN } from './data/lacteosPan'
import { MASCOTAS_OTROS } from './data/mascotasOtros'

/** Versión del catálogo: sube cuando se añaden o corrigen entradas (queda anotada en el informe de evaluación). */
export const CATALOG_VERSION = 1

export const CATALOG_ENTRIES: CatalogEntry[] = [
  ...parseCatalog(FRESCOS, 'frescos'),
  ...parseCatalog(LACTEOS_PAN, 'lacteosPan'),
  ...parseCatalog(DESPENSA, 'despensa'),
  ...parseCatalog(BEBIDAS_PREPARADOS, 'bebidasPreparados'),
  ...parseCatalog(INFANTIL, 'infantil'),
  ...parseCatalog(HOGAR_PERSONAL, 'hogarPersonal'),
  ...parseCatalog(MASCOTAS_OTROS, 'mascotasOtros'),
]
