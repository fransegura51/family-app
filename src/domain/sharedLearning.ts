// Aprendizaje compartido PEPA: (cadena, text_key) → clase. Espejo puro de la RPC resolve_shared_product_class (mismos pasos, mismos
// estados, misma normalización y validación de privacidad) para que el clasificador del cliente pueda usar los mismos datos sin una
// consulta por línea. NO está conectado a ningún flujo todavía (products, tickets, clasificación automática, interfaz): eso es la Fase 5.
//
// Reglas: solo aprende una cadena reconocida y aprendible; una clave ambigua, retirada o pendiente NUNCA devuelve clase; la cadena
// nunca determina la clase por sí sola; no hay herencia entre cadenas (Charter no reutiliza lo de Consum ni al revés); nunca inventa.
import { checkCommercialText, productTextKey } from './productText'
import { resolveStoreChain, type StoreChainAliasRow, type StoreChainRow } from './storeChains'

export type SharedLearningStatus = 'pending' | 'approved' | 'ambiguous' | 'retired'

export interface SharedLearningRow {
  chain_key: string
  text_key: string
  food_type_key: string | null
  status: SharedLearningStatus
}

export type SharedResolutionStatus = 'matched' | 'not_found' | 'ambiguous' | 'invalid' | 'chain_unresolved' | 'chain_not_learnable'

export interface SharedClassResolution {
  status: SharedResolutionStatus
  chainKey: string | null
  /** Solo cuando el texto es seguro (pasa la validación de privacidad). */
  textKey: string | null
  /** SOLO con status "matched" (fila aprobada). */
  foodTypeKey: string | null
  source: 'shared' | null
  reason: string | null
}

export interface SharedLearningData {
  chains: readonly StoreChainRow[]
  aliases: readonly StoreChainAliasRow[]
  learning: readonly SharedLearningRow[]
  /** Si se indica, una clase que ya no esté aprobada en el catálogo no se devuelve (not_found / class_retired). */
  approvedFoodTypeKeys?: ReadonlySet<string>
}

// Solo texto latino (más signos generales), igual que la RPC.
const UNSUPPORTED = /[^-ɏ -⁯]/

const result = (r: Partial<SharedClassResolution> & { status: SharedResolutionStatus }): SharedClassResolution => ({
  chainKey: null,
  textKey: null,
  foodTypeKey: null,
  source: null,
  reason: null,
  ...r,
})

export function resolveSharedProductClass(store: string | null | undefined, text: string | null | undefined, data: SharedLearningData): SharedClassResolution {
  // 1. cadena
  const chain = resolveStoreChain(store, data.chains, data.aliases)
  if (chain.status !== 'resolved') return result({ status: 'chain_unresolved', reason: chain.reason })
  // 2. la cadena debe ser aprendible
  if (!chain.learnable) return result({ status: 'chain_not_learnable', chainKey: chain.chainKey })
  // 3-4. texto: solo latino y con la validación de privacidad
  if (text != null && UNSUPPORTED.test(text)) return result({ status: 'invalid', chainKey: chain.chainKey, reason: 'unsupported_characters' })
  const check = checkCommercialText(text ?? '')
  if (!check.ok) return result({ status: 'invalid', chainKey: chain.chainKey, reason: check.issues.join(',') })
  const textKey = productTextKey(text as string)
  // 5. búsqueda exacta (cadena, text_key)
  const row = data.learning.find((l) => l.chain_key === chain.chainKey && l.text_key === textKey)
  const base = { chainKey: chain.chainKey, textKey }
  if (!row || (row.status !== 'approved' && row.status !== 'ambiguous')) return result({ status: 'not_found', ...base })
  if (row.status === 'ambiguous') return result({ status: 'ambiguous', ...base })
  if (!row.food_type_key || (data.approvedFoodTypeKeys && !data.approvedFoodTypeKeys.has(row.food_type_key))) {
    return result({ status: 'not_found', ...base, reason: 'class_retired' })
  }
  return result({ status: 'matched', ...base, foodTypeKey: row.food_type_key, source: 'shared' })
}
