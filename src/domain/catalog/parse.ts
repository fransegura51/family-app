// LECTOR del catálogo maestro. El catálogo se escribe en texto compacto, una línea por producto (catalogData*.ts):
//
//   clave | Nombre | clase | alias; alias | base | atributos | no
//
//   · clave      identificador ESTABLE (nunca se reutiliza ni se renombra: lo referencian las familias y las pruebas).
//   · Nombre     nombre normalizado que ve la persona («Aceite de oliva virgen extra»). También cuenta como alias.
//   · clase      código corto de la clase CAT-1 (classes.ts → CLASS_CODES).
//   · alias      otras formas de escribirlo en un ticket, separadas por «;». Basta con que aparezcan TODAS las palabras de un alias.
//   · base       k = €/kg · l = €/l · u = €/unidad: la unidad adecuada para comparar precios.
//   · atributos  separados por «,»; con «!» son OBLIGATORIOS (sin ellos la identidad queda incompleta y no se agrupa sola).
//   · no         palabras que EXCLUYEN este producto («patata» no es «patata frita»).
//   Una clave que empieza por «~» es una entrada DE CLASE (varios productos distintos con un mismo nombre genérico): sirve para clasificar y NUNCA para
//   agrupar ni para decir que dos artículos son el mismo producto.
//   Las líneas «# Subcategoría» fijan la subcategoría de las siguientes. Las vacías y las que empiezan por «//» se ignoran.
import { CLASS_CODES, catalogClass, type ClassKind } from './classes'
import { ATTRS } from './attrs'
import { tokensOf } from './tokens'

export type PriceBasis = 'kg' | 'l' | 'ud'

export interface CatalogEntry {
  key: string
  /** Entrada de clase: clasifica, pero no identifica un producto concreto (no agrupa). */
  broad: boolean
  name: string
  classKey: string
  kind: ClassKind
  sub: string
  basis: PriceBasis
  /** Frases (palabras normalizadas) que lo identifican. */
  aliases: string[][]
  /** Palabras que lo excluyen. */
  not: string[]
  /** Atributos que le afectan, en el orden en que se escriben en el nombre. */
  attrs: { id: string; required: boolean }[]
}

const BASIS: Record<string, PriceBasis> = { k: 'kg', l: 'l', u: 'ud' }

export class CatalogParseError extends Error {}

export function parseCatalog(text: string, source = 'catálogo'): CatalogEntry[] {
  const out: CatalogEntry[] = []
  let sub = ''
  text.split('\n').forEach((line, i) => {
    const row = line.trim()
    if (!row || row.startsWith('//')) return
    if (row.startsWith('#')) {
      sub = row.replace(/^#+\s*/, '').trim()
      return
    }
    const where = `${source}:${i + 1}`
    const f = row.split('|').map((x) => x.trim())
    if (f.length < 5) throw new CatalogParseError(`${where}: faltan campos («${row}»)`)
    const [rawKey, name, code, aliasField, basisCode, attrField = '', notField = ''] = f
    const broad = rawKey.startsWith('~')
    const key = broad ? rawKey.slice(1) : rawKey
    const classKey = CLASS_CODES[code]
    if (!classKey) throw new CatalogParseError(`${where}: clase desconocida «${code}»`)
    const cls = catalogClass(classKey)
    if (!cls) throw new CatalogParseError(`${where}: la clase ${classKey} no está en classes.ts`)
    const basis = BASIS[basisCode]
    if (!basis) throw new CatalogParseError(`${where}: base desconocida «${basisCode}»`)
    const attrs = attrField
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .map((a) => ({ id: a.replace(/!$/, ''), required: a.endsWith('!') }))
    for (const a of attrs) if (!ATTRS[a.id]) throw new CatalogParseError(`${where}: atributo desconocido «${a.id}»`)
    const aliases = [name, ...aliasField.split(';')]
      .map((a) => tokensOf(a))
      .filter((a) => a.length > 0)
    if (aliases.length === 0) throw new CatalogParseError(`${where}: sin alias`)
    const not = notField.split(',').flatMap((w) => tokensOf(w))
    out.push({ key, broad, name, classKey, kind: cls.kind, sub, basis, aliases, not, attrs })
  })
  return out
}
