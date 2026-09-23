import { FormEvent, PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import {
  addExpense,
  addWalletTransaction,
  createBudget,
  createBudgetCategoriesBulk,
  createBudgetCategory,
  createGoal,
  createTag,
  copyExpenseToShared,
  deleteBudget,
  deleteBudgetCategory,
  deleteExpense,
  deleteGoal,
  deleteTag,
  deleteWalletTransaction,
  getExpenseById,
  listBudgetCategories,
  listBudgets,
  listExpenses,
  listGoals,
  listResolvedInternalTransferDestinations,
  listTags,
  listWalletTransactions,
  updateBudgetCategory,
  updateExpense,
  updateTag,
  type ResolvedInternalTransferDestination,
} from '@/data/finance'
import { listBankAccounts, listBankConnections, listBankTransactions, syncBankTransactions } from '@/data/bank'
import {
  createForecastPayment,
  createLoanDetails,
  deleteForecastPayment,
  deleteLoanDetails,
  dismissForecastRecurrence,
  getLoanDetails,
  listAllMatchedForecastExpenseIds,
  listForecastOccurrenceOverrides,
  listForecastPayments,
  listForecastRecurrenceDismissals,
  listLoanDetails,
  matchForecastOccurrence,
  replaceForecastPaymentInstallments,
  replaceForecastPlanOverrides,
  replaceForecastReminders,
  setForecastPaymentActive,
  unmatchForecastOccurrence,
  updateForecastPayment,
  updateLoanDetails,
  type ForecastLoanDetailsInput,
  type ForecastPaymentInput,
  type ForecastPaymentWithReminders,
} from '@/data/forecast'
import {
  buildForecastRecurrenceRule,
  expandForecastOccurrences,
  forecastByMonth,
  forecastTotals,
  formatForecastAmount,
  formatInterestBpsToPercent,
  isForecastPaymentFinished,
  nextForecastOccurrence,
  occurrenceForCycle,
  parseInterestPercentToBps,
  remainingInstallments,
  stepDays,
  stepMonthsClamped,
  totalInstallments,
  type ForecastAmountStatus,
  type ForecastCustomRecurrence,
  type ForecastLoanDetails,
  type ForecastLoanInterestType,
  type ForecastLoanType,
  type ForecastOccurrence,
  type ForecastOccurrenceOverride,
  type ForecastRecurrenceOption,
  type ForecastReminderUnit,
} from '@/domain/forecast'
import {
  findReconciliationCandidates,
  hasSharedWord,
  resolveManagedExpenseCategory,
  type BankMovementForMatching,
  type OccurrenceForMatching,
  type ReconciliationCandidate,
} from '@/domain/forecastReconciliation'
import {
  detectRecurrenceCandidates,
  findNewRecurrenceCandidates,
  normalizeMerchantKey,
  stripTrailingDateSuffix,
  type BankMovementForDetection,
  type ForecastPaymentForDedup,
  type RecurrenceCandidate,
  type RecurrencePeriodicity,
} from '@/domain/forecastRecurrenceDetection'
import {
  buildFinitePlanSubmission,
  buildRecurrenceRuleFromFormState,
  formatSpanishDate,
  INSTALLMENT_COUNT_MAX,
  parseFinitePlanLinesFromSaved,
  parseRecurrenceRuleToFormState,
  proposeFinitePlanLines,
  resolvedFreqInterval,
  validateInstallmentCount,
  type ForecastPlanLineFormRow,
} from '@/domain/forecastInstallmentPlanForm'
import {
  buildInstallmentTemplatesFromForm,
  parseInstallmentTemplatesToForm,
  proposeSplitCharges,
  SPLIT_CHARGE_COUNT_MAX,
  SPLIT_CHARGE_COUNT_MIN,
  validateSplitChargeCount,
  type ForecastSplitChargeFormRow,
} from '@/domain/forecastInstallmentSplitForm'
import { centsToEurosString, checkCentsDistribution, eurosStringToCents, type CentsDistributionCheck } from '@/domain/forecastMoneyCents'
import { BankAccountsModal } from '@/ui/BankAccountsModal'
import { getAccountsMode, getFinanceMonthStartDay, listFamilyMembers, type AccountsMode } from '@/data/family'
import {
  economiaMenuEntryMeta,
  isCustomEconomiaMenuKey,
  loadEconomiaMenuLayout,
  saveEconomiaMenuLayout,
  type EconomiaMenuEntry,
  type EconomiaMenuGroup,
  type EconomiaMenuItemKey,
} from '@/state/economiaMenu'
import { createShoppingStore, listShoppingStores } from '@/data/shoppingStores'
import { colorForClass, pastelFromHsl, pastelPalette, storeColorResolver, toPastel, tone } from '@/domain/colors'
import { subscribeBudgetsChanged } from '@/state/budgetsChanged'
import { getChartColorTheme } from '@/state/colorTheme'
import { useMovementColorMode, type MovementColorMode } from '@/state/movementColorMode'
import { takePendingMovementsFilter } from '@/state/pendingMovementsFilter'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { deleteReceipt, getReceiptUrl, listReceipts, updateReceipt, uploadReceipt } from '@/data/receipts'
import { listAllProductPrices, listProducts, setProductNonFood } from '@/data/products'
import { isPendingCategory, isPendingSpendingRow, PENDING_LABEL, pendingSignal, pendingSpending, type PendingSpending } from '@/domain/pending'
// FASE 6D.3 — misma identidad de "ingreso real"/"devolución" que Economía por voz (PEPA): nunca se reimplementa aquí.
import { computePeriodFinancials, isRealIncome } from '@/domain/financeCompute'
// Fase 1F.C — "Comparado con el periodo anterior": reutiliza groupSpending (reparto por categoría con
// el mismo criterio padre/hija que ya usa Pepa) y comparablePrevious (misma aritmética de mes contable
// y misma regla de corte por tramo que ya usa la voz de Pepa) — nunca se reimplementan.
import { groupSpending, type FinanceData } from '@/domain/financeCompute'
import { comparablePrevious, daysBetween, type PeriodSpec, type ResolvedPeriod } from '@/domain/financePeriod'
import { isRefund } from '@/domain/refunds'
import { buildFoodReceiptIds, buildProductKindSets, purchaseNature } from '@/domain/products'
import { classifyFoodType } from '@/domain/foodTypes'
import { resolveProductClassSafe, type SharedClassHint } from '@/domain/productClass'
import { partitionTicketLines } from '@/domain/ticketLines'
import { sharedHintFor, useSharedClasses } from '@/ui/useSharedClasses'
import { onManagersChanged, openManager } from '@/state/managers'
import { listFamilyFoodTypes, setProductFoodType, type FamilyFoodType, type FoodTypeKind } from '@/data/foodTypes'
import { balanceTrend, earliestTransactionDate } from '@/domain/balanceTrend'
import {
  deleteProductPricesByReceipt,
  listProductPricesByReceipt,
  recordProductPurchase,
  type ReceiptLineDetail,
} from '@/data/products'
import {
  budgetPeriodRange,
  budgetSpent,
  computeSavingsDestinedByMember,
  stableCategoryColors,
  isComprasFamiliaCategory,
  isFoodCategory,
  isInternalTransferCategory,
  resolveCategoryClassification,
  resolveExpenseFixed,
  walletBalance,
  walletCategoryTotal,
} from '@/domain/finance'
import { MONTH_LABELS } from '@/domain/calendar'
import {
  accountingMonthRange,
  accountingMonthsBack,
  accountingPeriodLabel,
  PRESET_LABELS,
  rangeForPreset,
  toDateStr,
  type SpendRangePreset,
} from '@/domain/dateRanges'
import { findKnownStore } from '@/domain/voiceQuery'
import { analyzeReceiptPhoto } from '@/services/receiptPhoto'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'
import { StoreIcon } from '@/ui/StoreIcon'
import { ProductTypesModal } from '@/ui/ProductTypesModal'
import type {
  BankAccount,
  BankConnection,
  BankTransaction,
  Budget,
  BudgetCategory,
  BudgetPeriod,
  Expense,
  ExpenseSource,
  FamilyMember,
  KidGoal,
  KidWalletTransaction,
  Product,
  ProductPrice,
  Profile,
  Receipt,
  ShoppingStoreEntry,
  Tag,
  WalletTransactionType,
} from '@/domain/types'
import economiaHeaderImg from '@/assets/economia/economia-header.jpg'
import pepaConclusionsImg from '@/assets/economia/pepa-conclusiones.jpg'
import { errorMessage } from '@/domain/errorMessage'
import { classifyPurchase } from '@/data/classifyPurchase'
import { reportClientError } from '@/data/errorReports'
import { CLASSIFY_FAILED_MESSAGE, classifyMessage, classifyOk, pendingSignalText } from '@/domain/classifyPurchase'
import { fetchAsShareableFile, shareFiles } from '@/services/share'

// Tickets y Registro Alimentación se mudan a Compras (petición real:
// "estoy pensando si pasar registro alimentación y tickets a compra")
// — Economía se queda solo con el dinero en sí (Gastos, Presupuesto,
// Educación financiera). Sus componentes (ReceiptsTab, BudgetsTab)
// siguen definidos en este archivo y se exportan para que
// ShoppingScreen los use, en vez de duplicar todo el código de
// tickets/categorías en dos sitios.
//
// Skill de Pepa, punto 3: "Resumen · Conclusiones de Pepa ·
// Estadísticas · Movimientos · Presupuesto General · Educación
// Financiera". Resumen y Conclusiones se combinan en una sola pestaña
// (van siempre juntas, mismo periodo, misma pantalla) en vez de dos
// pestañas casi vacías por separado.
const SUB_TABS = ['Resumen', 'Estadísticas', 'Movimientos', 'Presupuesto Generales', 'Banco', 'Educación financiera', 'Previsión de pagos'] as const
type SubTab = (typeof SUB_TABS)[number]

// El desplegable de Economía mezcla pestañas (SubTab) con accesos
// sueltos ("accion:categorias"...) en la misma lista — este guard
// distingue cuáles de sus claves son de verdad una pestaña (para el
// "📌 Sacar/📍 Quitar" y resaltar la activa, ver EconomiaMenuDropdown).
function isEconomiaSubTab(key: EconomiaMenuItemKey): key is SubTab {
  return (SUB_TABS as readonly string[]).includes(key)
}

// Petición real: "quiero que los quites de ahí [debajo de las
// tarjetas del banco]... lo metes dentro del desplegable, y le pones
// un botón para sacar alguno de ellos... que pica el botón y se sale
// directamente [a] la pantalla de Economía, donde están situados
// ahora" — mismo concepto que los 4 iconos fijos del ☰ Menú global
// (PINNED_COUNT), pero aquí sin límite fijo: nada visible fuera del
// desplegable por defecto, la familia decide qué sacar. Luego: "las
// tres pestañas [Categorías/Etiquetas/Nuevo movimiento] ponle también
// el botón de sacar y meter" — no solo las 6 pestañas, cualquier
// acceso del desplegable se puede sacar. Guardado en el dispositivo
// (como el orden del menú), no por familia.
const ECONOMIA_PINNED_KEY = 'familyapp:economia-pinned-tabs'
const ECONOMIA_FIXED_KEYS: readonly string[] = [...SUB_TABS]

// Los accesos personalizados ("custom:<id>") no están en ninguna lista
// fija — se validan por forma en vez de por pertenencia, para que
// también se puedan sacar/meter (petición real: "ponle también el
// botón de sacar y meter" ya se aplicó a los 3 accesos fijos; los
// personalizados nuevos siguen la misma regla).
function isValidEconomiaMenuKey(k: unknown): k is EconomiaMenuItemKey {
  return typeof k === 'string' && (ECONOMIA_FIXED_KEYS.includes(k) || k.startsWith('custom:'))
}

function loadEconomiaPinnedItems(): EconomiaMenuItemKey[] {
  try {
    const raw = localStorage.getItem(ECONOMIA_PINNED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidEconomiaMenuKey) : []
  } catch {
    return []
  }
}

function saveEconomiaPinnedItems(items: EconomiaMenuItemKey[]) {
  try {
    localStorage.setItem(ECONOMIA_PINNED_KEY, JSON.stringify(items))
  } catch {
    // Sin localStorage (privado/bloqueado) — se queda todo dentro del
    // desplegable, no rompe nada.
  }
}

// Skill de Pepa, punto 24: "Ver X registros →" tiene que abrir
// Movimientos filtrado EXACTAMENTE con el conjunto que produjo el
// dato — se comparte este estado entre Estadísticas y Movimientos en
// vez de duplicar la lógica de filtrado en cada estadística.
export interface MovementsFilter {
  label: string
  // Petición real: "cuando desde Estadísticas de Compras voy a
  // Movimientos, Volver me manda a Resumen de Economía en vez de a
  // Compras — que devuelva siempre al sitio de donde venías". Quien
  // salta desde OTRA ruta (Compras) anota aquí a dónde volver; el salto
  // entre pestañas de la propia Economía sigue usando previousTab.
  returnTo?: { path: string; tab?: string; label: string }
  from?: string
  to?: string
  category?: string
  // Una categoría con subcategorías (p. ej. "Compras y familia") no
  // tiene gastos con ese nombre EXACTO casi nunca — los gastos están
  // en sus hijas ("Ropa y accesorios", "Niños"...). "Ver movimientos"
  // de una categoría así tiene que incluir toda la familia, no solo
  // los apuntados directamente a la categoría padre sin subcategoría.
  categoryGroup?: string[]
  store?: string
  tagId?: string
  necessity?: 'debo' | 'necesito' | 'quiero'
  // La porción "Sin clasificar" del dónut no es un valor de `necessity`
  // más — es la ausencia de clasificación (categoría sin asignar, ni
  // ella ni su padre). Bug real: "según el dónut hay 2 movimientos sin
  // clasificar... pero cuando intento verlos me devuelve 49 movimientos
  // filtrados" — `viewFor({}, ...)` no filtraba nada, devolvía el mes
  // entero. Necesita su propio flag en vez de un valor de `necessity`.
  necessityUnclassified?: boolean
  isFixed?: boolean
  isFixedUnclassified?: boolean
  isIncome?: boolean
  // "No alimentos" (Estadística compras) no se puede describir con
  // category/categoryGroup solos — es la unión de tickets no-comida
  // más cualquier gasto bajo "Compras y familia", así que a veces la
  // única forma de reproducir EXACTAMENTE el mismo conjunto que
  // produjo la cifra es la lista de ids que ya se calculó para ella.
  expenseIds?: string[]
  // Solo gastos reales SIN categoría (category NULL, «Pendiente de clasificar»). Filtro lógico: no es una categoría ni se busca en
  // budget_categories. Sin fechas: un pendiente sigue pendiente aunque pase el mes.
  pendingOnly?: boolean
  // FASE 6D.3 — solo devoluciones reales (isRefund, domain/refunds.ts). Como pendingOnly: filtro lógico, no una categoría más.
  refundsOnly?: boolean
}

// Petición real: "no solo queríamos dar datos, sino también ayudar a
// los usuarios a comprender lo que significan esos datos... no cabe en
// el bocadillo, ¿ves alguna forma de añadir algo así, aunque fuese en
// otra ventana debajo de la imagen?" — cada tipo de conclusión (no cada
// frase concreta, que cambia con los números) tiene una explicación
// fija de qué significa y por qué importa, apoyada en referencias
// reales de educación financiera (p. ej. la regla 50/30/20), enlazada
// con el propio sistema de clasificación de la app (Debo/Necesito/Quiero,
// Fijo/Variable — Skill de Pepa, puntos 15/16).
// Petición real (matiz sobre lo anterior): "no todas las secciones lo
// necesitan, por ejemplo que el gasto más alto hayan sido 450€ no
// necesita más explicación, pero cuando se puede aclarar algo más se
// debería hacer" — solo llevan explicación las conclusiones que se
// apoyan en un concepto/criterio propio de la app (Debo/Necesito/Quiero,
// Fijo/Variable, tasa de ahorro, comparación entre periodos). Las que
// son un dato puntual sin más lectura detrás (categoría con más gasto,
// comercio más frecuente, gasto más alto, etiqueta más repetida...) se
// quedan sin `kind` y por tanto sin panel.
type ConclusionKind = 'periodo-sube' | 'periodo-baja' | 'periodo-estable' | 'ahorro-bueno' | 'ahorro-negativo' | 'quiero' | 'fijo-variable'

interface Conclusion {
  text: string
  filter?: MovementsFilter
  kind?: ConclusionKind
}

const CONCLUSION_EXPLANATIONS: Record<ConclusionKind, string> = {
  'periodo-sube':
    'Comparar el gasto con el periodo anterior ayuda a distinguir un cambio de hábito real de un gasto puntual. Si la subida viene de una compra excepcional (una reparación, un regalo grande), no hay nada que ajustar; si se repite varios periodos seguidos, sí merece revisar qué categoría lo está empujando.',
  'periodo-baja':
    'Una bajada de gasto respecto al periodo anterior es buena señal, pero vale la pena confirmar que no sea solo porque falta algún gasto habitual por registrar (un ticket sin subir, un pago que todavía no ha llegado del banco), y no una bajada real del ritmo de gasto.',
  'periodo-estable':
    'Mantener un ritmo de gasto parecido mes a mes es en general positivo: indica un presupuesto predecible, fácil de planificar, sin sobresaltos grandes de un periodo a otro.',
  'ahorro-bueno':
    'La tasa de ahorro es el porcentaje de lo ingresado que queda sin gastar. Una referencia habitual en finanzas personales sitúa una tasa saludable a partir del 20%. Por encima de ese umbral hay colchón real para imprevistos o metas a medio plazo, sin depender de ingresos futuros.',
  'ahorro-negativo':
    'Gastar más de lo que se ingresa en un periodo significa que ese saldo negativo ha salido de ahorros, tarjeta de crédito o algún otro colchón. Un mes puntual (una factura fuera de lo normal) no es motivo de alarma; si se repite varios periodos seguidos, conviene revisar qué categoría está empujando el gasto por encima del ingreso.',
  quiero:
    '"Quiero" es el gasto discrecional: el que se podría recortar sin afectar a lo esencial (ocio, caprichos, restaurantes por gusto). Una referencia habitual en finanzas personales (la regla 50/30/20) sugiere no pasar de un 30% de los ingresos en esta partida. Un porcentaje bajo suele indicar que se prioriza el ahorro o se cubre bien lo básico; si sube mucho, es la primera partida a la que mirar si algún periodo hay que ajustar el presupuesto.',
  'fijo-variable':
    'Fijo es el gasto comprometido que se repite cada periodo con un importe parecido (hipoteca/alquiler, seguros, cuotas de préstamos, suscripciones) — no depende de cuánto se consuma. Variable sí depende del consumo real (comida, gasolina, ocio). La misma regla 50/30/20 sugiere no destinar más de un 50% de los ingresos a gastos fijos y de primera necesidad: cuanto más alto sea ese porcentaje, menos margen hay para reaccionar ante un imprevisto o una bajada de ingresos, porque esos pagos no se pueden recortar de un periodo para otro.',
}

// Petición real: "lo primero que quiero restringirles es Economía, [pero]
// al estar dentro Educación Financiera no se la puedo restringir por
// completo" — un hijo con su propia cuenta y 'dinero' fuera de sus
// allowedSections (ver NavShell y FamilyScreen) llega aquí igual, pero
// ve solo su monedero: nada de saldo/tendencia real ni del resto de
// pestañas. La RLS (migración 0097) es quien de verdad bloquea el dato;
// esto es solo para no enseñarle una pantalla confusa o vacía.
function isDineroRestricted(profile: Profile): boolean {
  return profile.role === 'child' && profile.allowedSections != null && !profile.allowedSections.includes('dinero')
}

export function FinanceScreen({ profile }: { profile: Profile }) {
  const dineroRestricted = isDineroRestricted(profile)
  const [tab, setTab] = useState<SubTab>(dineroRestricted ? 'Educación financiera' : 'Resumen')
  const [movementsFilter, setMovementsFilter] = useState<MovementsFilter | null>(null)
  // Petición real: "al tocar un área del dónut no debe llevarme
  // directamente a los movimientos filtrados... desde los movimientos
  // filtrados quiero poder volver a la vista anterior" — se recuerda
  // desde qué pestaña se saltó para poder deshacer el salto, no solo
  // quitar el filtro (que te deja en Movimientos igualmente).
  const [previousTab, setPreviousTab] = useState<SubTab | null>(null)
  const [returnTo, setReturnTo] = useState<MovementsFilter['returnTo'] | null>(null)
  const navigate = useNavigate()
  // Categorías y etiquetas se cargan aquí, una vez, para que los 3
  // botones flotantes (Categorías / Etiquetas / Nuevo movimiento) estén
  // disponibles en cualquier pestaña de Economía — petición real: "cada
  // vez que quiero hacer una de esas 3 cosas no me acuerdo en qué
  // página está el botón". Cada pestaña sigue cargando sus propios
  // gastos/categorías para sus cálculos; `refreshKey` solo fuerza a la
  // pestaña activa a remontarse (y recargar sus datos) cuando algo
  // cambia desde uno de estos 3 modales.
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [showNewMovement, setShowNewMovement] = useState(false)
  // Petición real: "no me has puesto para poder agregar cuentas a esa
  // pantalla" — "+ Añadir cuenta" en las tarjetas de saldo manda a
  // Banco y abre directamente su formulario de conectar, aunque esa
  // pestaña ya estuviera montada de antes (por eso un contador, no un
  // booleano: cada toque es una señal nueva).
  const [openConnectSignal, setOpenConnectSignal] = useState(0)
  // Petición real: "cuando pulse al recuadro [de una cuenta] me tiene
  // que llevar a la pestaña de esa cuenta, si hay otra cuenta que me
  // lleve a la de la otra cuenta" — cada tarjeta manda a Banco ya
  // filtrado a esa cuenta en concreto.
  const [focusAccountId, setFocusAccountId] = useState<string | null>(null)
  // Petición real: "donde ahora pone Economía, pones el círculo con
  // las tres rayas... es un desplegable de todos los demás categorías,
  // y ese lo deja con las categorías que tenía antes" — desplegable
  // propio de Economía (☰ junto al título, igual que "☰ Inicio" en la
  // referencia de Wallet) con las mismas pestañas que ya tenía esta
  // pantalla (Resumen/Estadísticas/Movimientos/...), como forma
  // alternativa de cambiar de pestaña sin tocar la fila de chips.
  const [economiaMenuOpen, setEconomiaMenuOpen] = useState(false)
  const [pinnedItems, setPinnedItems] = useState<EconomiaMenuItemKey[]>(() => loadEconomiaPinnedItems())
  // Petición real: "¿cómo puedo crear un acceso nuevo, con su propio
  // nombre e icono, no solo una carpeta para agrupar los que ya hay?"
  // — el layout (grupos + accesos, fijos o personalizados) vive aquí
  // arriba para que tanto el desplegable como la fila de "sacados"
  // (que necesita el icono/nombre real de un acceso personalizado)
  // lean del mismo sitio.
  const [menuLayout, setMenuLayout] = useState<EconomiaMenuGroup[]>(() => loadEconomiaMenuLayout())
  const [pinnedPlaceholderNotice, setPinnedPlaceholderNotice] = useState(false)
  // Piso compartido — se cargan aquí arriba, una vez, para que cualquier
  // pestaña (Movimientos, Presupuesto(s), Banco...) sepa si tiene que
  // separar lo tuyo de lo de los demás y cuál es "lo tuyo".
  const [accountsMode, setAccountsMode] = useState<AccountsMode>('compartido')
  const [myMemberId, setMyMemberId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getAccountsMode(), listFamilyMembers()])
      .then(([mode, members]) => {
        setAccountsMode(mode)
        setMyMemberId(members.find((m) => m.linkedProfileId === profile.id)?.id ?? null)
      })
      .catch(() => {})
  }, [profile.id])

  // Enlace desde otra pestaña de la app (Estadística compras, en
  // Compras) — llega como un filtro pendiente en vez de por props, ver
  // pendingMovementsFilter.ts.
  useEffect(() => {
    const pending = takePendingMovementsFilter()
    if (pending) viewMovements(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function persistMenuLayout(next: EconomiaMenuGroup[]) {
    setMenuLayout(next)
    saveEconomiaMenuLayout(next)
  }

  function togglePinnedItem(key: EconomiaMenuItemKey) {
    setPinnedItems((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
      saveEconomiaPinnedItems(next)
      return next
    })
  }

  function handleEconomiaAction(key: EconomiaMenuItemKey) {
    if (isEconomiaSubTab(key)) setTab(key)
    // Un acceso personalizado no lleva a ningún sitio todavía — el
    // propio EconomiaMenuDropdown enseña el aviso "aún no hay nada
    // aquí" al tocarlo. "Nuevo movimiento" (Fase 1E.2) ya no es un
    // acceso del menú — ver "+ Nuevo movimiento" dentro de Movimientos.
  }

  const flatMenuEntries = menuLayout.flatMap((g) => g.items)

  function reloadShared() {
    listBudgetCategories().then(setCategories)
  }

  useEffect(reloadShared, [])

  function handleChanged() {
    reloadShared()
    setRefreshKey((k) => k + 1)
  }

  // Categorías/etiquetas se gestionan en una ventana global (ver
  // state/managers.ts): al cambiar algo, esta pantalla recarga sus listas.
  useEffect(() => onManagersChanged(handleChanged))

  function viewMovements(filter: MovementsFilter) {
    if (filter.returnTo) {
      setReturnTo(filter.returnTo)
      setPreviousTab(null)
    } else {
      setReturnTo(null)
      setPreviousTab((prev) => (tab === 'Movimientos' ? prev : tab))
    }
    setMovementsFilter(filter)
    setTab('Movimientos')
  }

  // Sin menú, sin tarjetas de saldo/tendencia, sin las demás pestañas —
  // nada que pueda insinuar que hay más Economía detrás. El propio
  // KidsFinanceTab ya lee family_members/wallet con RLS por debajo, así
  // que solo ve su propio monedero aunque la lista de chips muestre a
  // sus hermanos (les sale a 0€, sin poder abrir el detalle real).
  if (dineroRestricted) {
    return (
      <div className="screen">
        <div className="kitchen-header">
          <img src={economiaHeaderImg} alt="Economía" className="kitchen-header-img" />
        </div>
        <KidsFinanceTab />
      </div>
    )
  }

  return (
    <div className="screen">
      {/* Petición real, con imagen de referencia: "y la de Economía"
          (mismo tratamiento de foto que las demás cabeceras) — "aquí
          tendrás que bajar los botones de las cuentas por debajo de la
          cabecera y desplazar también el resto de la página para
          ajustar bien todo": las tarjetas de cuenta ya no van DENTRO
          de la cabecera de color de antes (esa desaparece con la
          foto), pasan a su propio bloque justo debajo, sobre el fondo
          normal de la página. */}
      <div className="kitchen-header">
        <img src={economiaHeaderImg} alt="Economía" className="kitchen-header-img" />
        <button
          type="button"
          className="kitchen-header-menu-fab kitchen-header-menu-fab-floating"
          onClick={() => {
            // El desplegable se abre pegado a la cabecera (arriba del
            // todo) — si el botón flotante se toca con la página ya
            // desplazada, hay que subir para que el menú no se abra
            // fuera de la vista.
            if (!economiaMenuOpen) window.scrollTo({ top: 0, behavior: 'smooth' })
            setEconomiaMenuOpen((v) => !v)
          }}
          aria-label={economiaMenuOpen ? 'Cerrar menú de Economía' : 'Abrir menú de Economía'}
        >
          {economiaMenuOpen ? '✕' : '☰'} Menú
        </button>
      </div>
      {economiaMenuOpen && (
        <EconomiaMenuDropdown
          activeTab={tab}
          layout={menuLayout}
          onLayoutChange={persistMenuLayout}
          pinnedItems={pinnedItems}
          onTogglePin={togglePinnedItem}
          onActivate={handleEconomiaAction}
          onClose={() => setEconomiaMenuOpen(false)}
        />
      )}
      <AccountBalanceCards
        key={`${tab}-${refreshKey}`}
        onAddAccount={() => {
          setOpenConnectSignal((n) => n + 1)
          setTab('Banco')
        }}
        onSelectAccount={(accountId) => {
          setFocusAccountId(accountId)
          setTab('Banco')
        }}
        onViewAll={() => setTab('Banco')}
      />
      {/* Petición real: "que venga solo en Estadísticas" — antes se veía
          fija encima de CUALQUIER pestaña de Economía (Movimientos,
          Presupuesto Generales...), repitiendo la misma tendencia sin
          venir a cuento en pantallas que no son de estadísticas. */}
      {tab === 'Estadísticas' && <BalanceTrendCard key={`trend-${refreshKey}`} />}

      {/* Petición real: "quiero que los quites de ahí [debajo de las
          tarjetas del banco]" — ya no hay una fila fija; solo aparece
          aquí lo que la familia haya sacado del desplegable con "📌
          Sacar" (pestañas o los 3 accesos, "ponle también el botón de
          sacar y meter"). */}
      {pinnedItems.length > 0 && (
        <div className="filter-row">
          {flatMenuEntries
            .filter((entry) => pinnedItems.includes(entry.key))
            .map((entry) => {
              const meta = economiaMenuEntryMeta(entry)
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={'chip' + (isEconomiaSubTab(entry.key) && tab === entry.key ? ' chip-active' : '')}
                  onClick={() => {
                    if (isCustomEconomiaMenuKey(entry.key)) {
                      setPinnedPlaceholderNotice(true)
                      setTimeout(() => setPinnedPlaceholderNotice(false), 2500)
                    } else {
                      handleEconomiaAction(entry.key)
                    }
                  }}
                >
                  {meta.icon} {meta.label}
                </button>
              )
            })}
        </div>
      )}
      {pinnedPlaceholderNotice && (
        <p className="muted" style={{ fontSize: 12 }}>
          Todavía no hay nada aquí — pídemelo cuando lo necesites y lo construyo.
        </p>
      )}

      {tab === 'Resumen' && <ResumenTab key={refreshKey} onViewMovements={viewMovements} />}
      {tab === 'Estadísticas' && <EstadisticasTab key={refreshKey} onViewMovements={viewMovements} />}
      {tab === 'Movimientos' && (
        <ExpensesTab
          key={refreshKey}
          filter={movementsFilter}
          onClearFilter={() => setMovementsFilter(null)}
          previousTabLabel={returnTo ? returnTo.label : previousTab}
          onBack={
            returnTo
              ? () => {
                  const back = returnTo
                  setReturnTo(null)
                  setMovementsFilter(null)
                  navigate(back.path, { state: back.tab ? { tab: back.tab } : undefined })
                }
              : previousTab
              ? () => {
                  setTab(previousTab)
                  setPreviousTab(null)
                  setMovementsFilter(null)
                }
              : undefined
          }
          accountsMode={accountsMode}
          myMemberId={myMemberId}
          onOpenNewMovement={() => setShowNewMovement(true)}
        />
      )}
      {tab === 'Presupuesto Generales' && (
        <BudgetsTab
          key={refreshKey}
          group="generales"
          seedCategories={MASTER_CATEGORY_SEED}
          accountsMode={accountsMode}
          myMemberId={myMemberId}
        />
      )}
      {tab === 'Banco' && <BankTab key={refreshKey} openConnectSignal={openConnectSignal} focusAccountId={focusAccountId} />}
      {tab === 'Previsión de pagos' && <PrevisionPagosTab key={refreshKey} categories={categories} />}
      {tab === 'Educación financiera' && <KidsFinanceTab />}

      {showNewMovement && (
        <NewMovementModal
          categories={categories}
          onClose={() => setShowNewMovement(false)}
          onAdded={() => {
            setShowNewMovement(false)
            handleChanged()
          }}
        />
      )}
    </div>
  )
}

// Petición real: "esa pestaña dentro de Inicio del desplegable quiero
// que se puedan editar y que se puedan cambiar de posición... más
// arriba, más abajo, agruparla como quiera... por categoría" — y
// después: "me tienes que poner en el desplegable un botón para añadir
// categorías, que yo pueda añadir categorías y editarlas". Modo normal
// (toca = cambia de pestaña o abre la acción) vs modo edición (✏️
// arriba): ↑/↓ para reordenar dentro de su categoría, un desplegable
// para moverlo a otra, y "+ Nueva categoría" para crear encabezados con
// nombre propio (ver src/state/economiaMenu.ts, guardado en el
// dispositivo). Los 3 accesos que antes eran botones flotantes
// (Categorías/Etiquetas/Nuevo movimiento) viven aquí también.
function EconomiaMenuDropdown({
  activeTab,
  layout,
  onLayoutChange,
  pinnedItems,
  onTogglePin,
  onActivate,
  onClose,
}: {
  activeTab: SubTab
  layout: EconomiaMenuGroup[]
  onLayoutChange: (next: EconomiaMenuGroup[]) => void
  pinnedItems: EconomiaMenuItemKey[]
  onTogglePin: (key: EconomiaMenuItemKey) => void
  onActivate: (key: EconomiaMenuItemKey) => void
  onClose: () => void
}) {
  const [editMode, setEditMode] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [addingGroupName, setAddingGroupName] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Petición real: "¿cómo puedo crear un acceso nuevo, con su propio
  // nombre e icono, no solo una carpeta para agrupar los que ya hay?"
  const [addingCustomItem, setAddingCustomItem] = useState(false)
  const [newItemIcon, setNewItemIcon] = useState('📌')
  const [newItemLabel, setNewItemLabel] = useState('')
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null)
  const [editItemIcon, setEditItemIcon] = useState('')
  const [editItemLabel, setEditItemLabel] = useState('')
  const [placeholderNotice, setPlaceholderNotice] = useState(false)

  function moveItem(groupId: string, index: number, direction: -1 | 1) {
    const group = layout.find((g) => g.id === groupId)
    if (!group) return
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= group.items.length) return
    const items = [...group.items]
    ;[items[index], items[newIndex]] = [items[newIndex], items[index]]
    onLayoutChange(layout.map((g) => (g.id === groupId ? { ...g, items } : g)))
  }

  function moveItemToGroup(itemKey: EconomiaMenuItemKey, fromGroupId: string, toGroupId: string) {
    if (fromGroupId === toGroupId) return
    const moved = layout.find((g) => g.id === fromGroupId)?.items.find((it) => it.key === itemKey)
    if (!moved) return
    onLayoutChange(
      layout.map((g) => {
        if (g.id === fromGroupId) return { ...g, items: g.items.filter((it) => it.key !== itemKey) }
        if (g.id === toGroupId) return { ...g, items: [...g.items, moved] }
        return g
      }),
    )
  }

  function handleAddGroup(e: FormEvent) {
    e.preventDefault()
    if (!addingGroupName.trim()) return
    onLayoutChange([...layout, { id: crypto.randomUUID(), name: addingGroupName.trim(), items: [] }])
    setAddingGroupName('')
    setAddingGroup(false)
  }

  function handleRenameGroup(id: string) {
    onLayoutChange(layout.map((g) => (g.id === id ? { ...g, name: renameValue.trim() || null } : g)))
    setRenamingGroupId(null)
  }

  // El primer grupo nunca desaparece (es el que recoge los accesos de
  // cualquier categoría que se borre), así que siempre queda un sitio
  // donde vivir para todos los accesos.
  function deleteGroup(id: string) {
    const group = layout.find((g) => g.id === id)
    const rest = layout.filter((g) => g.id !== id)
    if (!group || rest.length === 0) return
    const [first, ...others] = rest
    onLayoutChange([{ ...first, items: [...first.items, ...group.items] }, ...others])
  }

  function handleAddCustomItem(e: FormEvent) {
    e.preventDefault()
    if (!newItemLabel.trim()) return
    const entry: EconomiaMenuEntry = { key: `custom:${crypto.randomUUID()}`, icon: newItemIcon, label: newItemLabel.trim() }
    onLayoutChange(layout.map((g, i) => (i === 0 ? { ...g, items: [...g.items, entry] } : g)))
    setNewItemIcon('📌')
    setNewItemLabel('')
    setAddingCustomItem(false)
  }

  function handleSaveItem(groupId: string, key: EconomiaMenuItemKey) {
    onLayoutChange(
      layout.map((g) =>
        g.id === groupId
          ? { ...g, items: g.items.map((it) => (it.key === key ? { ...it, icon: editItemIcon, label: editItemLabel.trim() || it.label } : it)) }
          : g,
      ),
    )
    setEditingItemKey(null)
  }

  function deleteItem(groupId: string, key: EconomiaMenuItemKey) {
    onLayoutChange(layout.map((g) => (g.id === groupId ? { ...g, items: g.items.filter((it) => it.key !== key) } : g)))
  }

  function handleItemActivate(entry: EconomiaMenuEntry) {
    if (isCustomEconomiaMenuKey(entry.key)) {
      // Petición real (antes, para el ☰ global, ahora aquí): un acceso
      // personalizado no lleva a ningún sitio todavía — se avisa sin
      // cerrar el desplegable, en vez de un toque que no hace nada.
      setPlaceholderNotice(true)
      setTimeout(() => setPlaceholderNotice(false), 2500)
      return
    }
    onActivate(entry.key)
    onClose()
  }

  return (
    <div className="economia-menu-dropdown">
      <button type="button" className="link-button economia-menu-edit-toggle" onClick={() => setEditMode((v) => !v)}>
        {editMode ? '✓ Listo' : '✏️ Editar'}
      </button>

      {layout.map((group) => (
        <div key={group.id} className="economia-menu-group">
          {(group.name || editMode) &&
            (renamingGroupId === group.id ? (
              <form
                className="inline-fields"
                style={{ margin: '4px 4px 6px' }}
                onSubmit={(e) => {
                  e.preventDefault()
                  handleRenameGroup(group.id)
                }}
              >
                <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus style={{ flex: 1 }} />
                <button type="submit">Guardar</button>
              </form>
            ) : (
              <div className="economia-menu-group-title">
                <span>{group.name ?? 'Sin categoría'}</span>
                {editMode && (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="link-button"
                      style={{ padding: '2px 6px' }}
                      onClick={() => {
                        setRenamingGroupId(group.id)
                        setRenameValue(group.name ?? '')
                      }}
                      aria-label={`Renombrar categoría ${group.name ?? ''}`}
                    >
                      ✎
                    </button>
                    {layout.length > 1 && (
                      <ConfirmIconButton
                        icon="✕"
                        className="link-button"
                        ariaLabel={`Eliminar categoría ${group.name ?? ''}`}
                        onConfirm={() => deleteGroup(group.id)}
                      />
                    )}
                  </span>
                )}
              </div>
            ))}

          {group.items.map((entry, i) => {
            const meta = economiaMenuEntryMeta(entry)
            const isTab = isEconomiaSubTab(entry.key)
            const isCustom = isCustomEconomiaMenuKey(entry.key)

            if (editMode && editingItemKey === entry.key) {
              return (
                <form
                  key={entry.key}
                  className="inline-fields"
                  style={{ margin: '2px 4px' }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSaveItem(group.id, entry.key)
                  }}
                >
                  <input type="text" value={editItemIcon} onChange={(e) => setEditItemIcon(e.target.value)} style={{ width: 48, textAlign: 'center', flex: 'none' }} maxLength={4} autoFocus />
                  <input type="text" value={editItemLabel} onChange={(e) => setEditItemLabel(e.target.value)} style={{ flex: 1 }} />
                  <button type="submit">Guardar</button>
                </form>
              )
            }

            return (
              <div key={entry.key} className={'economia-menu-row' + (isTab && activeTab === entry.key ? ' active' : '')}>
                {editMode ? (
                  <span className="economia-menu-item">
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                  </span>
                ) : (
                  <button type="button" className="economia-menu-item" onClick={() => handleItemActivate(entry)}>
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                  </button>
                )}

                {editMode ? (
                  <span className="economia-menu-edit-controls">
                    <button type="button" className="link-button" style={{ padding: '2px 6px' }} disabled={i === 0} onClick={() => moveItem(group.id, i, -1)} aria-label={`Subir ${meta.label}`}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      style={{ padding: '2px 6px' }}
                      disabled={i === group.items.length - 1}
                      onClick={() => moveItem(group.id, i, 1)}
                      aria-label={`Bajar ${meta.label}`}
                    >
                      ↓
                    </button>
                    <select
                      value={group.id}
                      onChange={(e) => moveItemToGroup(entry.key, group.id, e.target.value)}
                      aria-label={`Mover ${meta.label} a otra categoría`}
                    >
                      {layout.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name ?? 'Sin categoría'}
                        </option>
                      ))}
                    </select>
                    {/* Petición real: "¿cómo la puedo... editar, quitar?"
                        — solo los accesos personalizados se pueden
                        renombrar/borrar, los 9 fijos son secciones
                        reales de la app. */}
                    {isCustom && (
                      <>
                        <button
                          type="button"
                          className="link-button"
                          style={{ padding: '2px 6px' }}
                          onClick={() => {
                            setEditingItemKey(entry.key)
                            setEditItemIcon(meta.icon)
                            setEditItemLabel(meta.label)
                          }}
                          aria-label={`Renombrar ${meta.label}`}
                        >
                          ✎
                        </button>
                        <ConfirmIconButton
                          icon="✕"
                          className="link-button"
                          ariaLabel={`Eliminar ${meta.label}`}
                          onConfirm={() => deleteItem(group.id, entry.key)}
                        />
                      </>
                    )}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="economia-menu-pin"
                    onClick={() => onTogglePin(entry.key)}
                    aria-label={pinnedItems.includes(entry.key) ? `Quitar ${meta.label} de la pantalla de Economía` : `Sacar ${meta.label} a la pantalla de Economía`}
                  >
                    {pinnedItems.includes(entry.key) ? '📍 Quitar' : '📌 Sacar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {placeholderNotice && (
        <p className="muted" style={{ fontSize: 12, padding: '4px 12px' }}>
          Todavía no hay nada aquí — pídemelo cuando lo necesites y lo construyo.
        </p>
      )}

      {editMode && (
        <>
          {addingCustomItem ? (
            <form onSubmit={handleAddCustomItem} className="inline-fields" style={{ margin: '6px 4px' }}>
              <input
                type="text"
                value={newItemIcon}
                onChange={(e) => setNewItemIcon(e.target.value)}
                style={{ width: 48, textAlign: 'center', flex: 'none' }}
                maxLength={4}
                aria-label="Icono"
              />
              <input
                type="text"
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
                placeholder="Nombre del acceso"
                autoFocus
                style={{ flex: 1 }}
              />
              <button type="submit">Crear</button>
            </form>
          ) : (
            <button type="button" className="economia-menu-item" onClick={() => setAddingCustomItem(true)}>
              <span aria-hidden="true">📌</span>
              Nuevo acceso
            </button>
          )}

          {addingGroup ? (
            <form onSubmit={handleAddGroup} className="inline-fields" style={{ margin: '6px 4px' }}>
              <input
                type="text"
                value={addingGroupName}
                onChange={(e) => setAddingGroupName(e.target.value)}
                placeholder="Nombre de la categoría"
                autoFocus
                style={{ flex: 1 }}
              />
              <button type="submit">Crear</button>
            </form>
          ) : (
            <button type="button" className="economia-menu-item" onClick={() => setAddingGroup(true)}>
              <span aria-hidden="true">➕</span>
              Nueva categoría
            </button>
          )}
        </>
      )}
    </div>
  )
}

// Petición real: "debajo de Economía Pepa me vas a poner tarjetas de
// saldo con las cuentas de los bancos que te vayamos añadiendo, que se
// puedan poner más o menos, que se puedan añadir o quitar, como está
// en la foto [captura de la app Wallet]" — una tarjeta por cada cuenta
// bancaria enlazada; crecen o decrecen solas al conectar/desconectar
// un banco en la pestaña Banco, sin nada más que tocar aquí. El saldo
// lo trae la propia sincronización (enable-banking-sync-transactions →
// syncBalance) — si una cuenta todavía no se ha sincronizado nunca, se
// avisa en vez de inventar un 0.
// Petición real: "las tarjetas de cuenta con el mismo pastel que el
// resto de la app" — en vez de un array fijo de colores sólidos
// indexado por posición (cambiaba si se reordenaban las cuentas), el
// pastel del dueño de la cuenta (mismo criterio que Calendario:
// toPastel sobre el color que ya tiene ese miembro). Una cuenta Común
// (sin dueño) usa un gris claro fijo, el mismo del icono 🏠 (ver
// COMMON_OWNER_COLOR). Bug real: toPastel('#868e96') lo dejaba azul
// (fuerza 65 % de saturación a cualquier tono), no gris.
const COMMON_ACCOUNT_COLOR = '#e9ecef'
// Colores pastel fijos de los dónuts de Debo/Necesito/Quiero y Fijo/variable (siempre los mismos).
const NECESSITY_PASTEL: Record<'debo' | 'necesito' | 'quiero' | 'sin_clasificar', string> = {
  debo: tone(0, 70, 90, 'chart'),
  necesito: tone(45, 85, 88, 'chart'),
  quiero: tone(280, 60, 90, 'chart'),
  sin_clasificar: '#e9ecef',
}
const FIXED_PASTEL: Record<'fijo' | 'variable' | 'sin_clasificar', string> = {
  fijo: tone(200, 70, 88, 'chart'),
  variable: tone(150, 55, 86, 'chart'),
  sin_clasificar: '#e9ecef',
}
// Solo para porciones de dónut (gráfico): sigue el estilo de estadísticas.
const pastelOf = (hsl: string | undefined) => (hsl ? pastelFromHsl(hsl, 'chart') : undefined)
const GENERAL_BUDGET_COLOR = tone(175, 55, 88)
// Arcoíris por mes del año (enero rojo → diciembre rosa): agosto es siempre el mismo color, sea el año que sea.
const MONTH_FOLDER_COLORS = Array.from({ length: 12 }, (_, i) => tone(i * 30))

// Petición real: "quiero una etiqueta que sea toda la familia o común,
// mejor común, porque es más corto, que es para las cosas que son de
// todos" — una cuenta sin miembro asignado (owner_member_id null) no se
// queda sin símbolo: lleva su propio icono neutro, igual de visible que
// el avatar de un miembro. Mismo gris que ya usa Documentos para "sin
// categoría", por coherencia.
const COMMON_OWNER_COLOR = '#868e96'

function OwnerBadge({ owner, size = 16, ring = false }: { owner: FamilyMember | null; size?: number; ring?: boolean }) {
  if (owner) {
    return (
      <span className={ring ? 'owner-badge-ring' : undefined} style={{ display: 'inline-flex', borderRadius: '50%' }}>
        <MemberAvatar member={owner} size={size} />
      </span>
    )
  }
  return (
    <span
      className={'owner-badge-common' + (ring ? ' owner-badge-ring' : '')}
      style={{ width: size, height: size, fontSize: size * 0.62 }}
      title="Común (de toda la familia)"
      aria-label="Común"
    >
      🏠
    </span>
  )
}

function AccountBalanceCards({
  onAddAccount,
  onSelectAccount,
  onViewAll,
}: {
  onAddAccount: () => void
  onSelectAccount: (accountId: string) => void
  onViewAll: () => void
}) {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])

  function reload() {
    Promise.all([listBankAccounts(), listFamilyMembers()])
      .then(([a, m]) => {
        setAccounts(a)
        setMembers(m)
      })
      .catch(() => {})
  }

  useEffect(reload, [])

  // Bug real reportado: "sincronizo el banco y las tarjetas de arriba se
  // quedan en 'Sincronizando...', tengo que cambiar de pestaña para que
  // se vea el saldo real" — esta tarjeta vive en Resumen y solo se
  // cargaba una vez al montarse; Banco (otra pestaña) avisa aquí cuando
  // sincroniza, conecta o desconecta una cuenta, mismo patrón que
  // "family-app:calendar-changed" en Calendario.
  useEffect(() => {
    window.addEventListener('family-app:bank-changed', reload)
    return () => window.removeEventListener('family-app:bank-changed', reload)
  }, [])

  return (
    <div className="account-cards-block">
      <div className="account-cards-heading">
        <strong>Mis cuentas</strong>
        <button type="button" className="account-cards-view-all" onClick={onViewAll} aria-label="Ver todas las cuentas">
          ›
        </button>
      </div>
      <div className="account-cards-grid">
        {accounts.map((a) => {
          const owner = a.ownerMemberId ? (members.find((m) => m.id === a.ownerMemberId) ?? null) : null
          return (
            <button
              key={a.id}
              type="button"
              className="account-card"
              style={{ background: owner ? toPastel(owner.color) : COMMON_ACCOUNT_COLOR, color: 'var(--text)' }}
              onClick={() => onSelectAccount(a.id)}
            >
              {/* Petición real: "quita el nombre del banco y el
                  número/IBAN, deja solo de quién es" — el saldo de una
                  cuenta ya no necesita el banco/IBAN para identificarse,
                  con el dueño basta. */}
              <div className="account-card-name">{owner ? `Cuenta de «${owner.name}»` : 'Cuenta común'}</div>
              {/* Icono grande, en la misma línea que el importe (petición
                  real) — antes era un badge pequeño arriba a solas. */}
              <div className="account-card-bottom">
                <OwnerBadge owner={owner} size={36} />
                {/* Piso compartido, modo Separado: el saldo de una cuenta
                    que no es tuya ni Común llega null a propósito desde
                    bank_accounts_with_visibility — candado en vez de
                    "Sincronizando…" para no dar a entender que falta un
                    dato que en realidad está oculto aposta. */}
                <div className="account-card-balance">
                  {!a.balanceVisible ? '🔒' : a.balance != null ? `${a.balance.toFixed(2)} €` : 'Sincronizando…'}
                </div>
              </div>
            </button>
          )
        })}
        {/* Petición real: "no me has puesto para poder agregar cuentas
            a esa pantalla" — entrada directa al formulario de conectar
            banco (ya en Banco), sin tener que saber que vive ahí. */}
        <button type="button" className="account-card account-card-add" onClick={onAddAccount}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
          <span>Añadir cuenta</span>
        </button>
      </div>
      {/* Petición real: "debajo de las 4 ventanas de cuentas pon un
          enlace Configuración cuentas que lleve directamente al menú de
          configuración" — conectar/desconectar/asignar dueño vive ahora
          en Configuración (ver BankAccountsModal), así que desde aquí
          mismo se puede ir directo sin buscarlo en ☰ Menú. */}
      <Link to="/menu-organizar" state={{ group: 'economia' }} className="link-button" style={{ display: 'block', marginTop: 8 }}>
        ⚙️ Configuración cuentas
      </Link>
    </div>
  )
}

function toDateStrLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Petición real, con captura de referencia (app Wallet): una línea con
// la evolución del saldo. A diferencia de la referencia, el plazo se
// puede ampliar (mismo selector 📅 que Tickets/Presupuesto) en vez de
// quedarse fijo a unos meses, y varias cuentas se manejan con los
// mismos chips ya usados para filtrar por miembro en Calendario:
// "Todas" combinada por defecto, o una sola cuenta a la vez — no
// pestañas independientes por cuenta (ver conversación real sobre
// cómo estructurar varias cuentas).
function BalanceTrendCard() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [monthStartDay, setMonthStartDay] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStrLocal(new Date()))
  const [customTo, setCustomTo] = useState(toDateStrLocal(new Date()))

  function reload() {
    Promise.all([listBankAccounts(), listFamilyMembers(), listBankTransactions(), getFinanceMonthStartDay()])
      .then(([a, m, t, monthStart]) => {
        setAccounts(a)
        setMembers(m)
        setTransactions(t)
        setMonthStartDay(monthStart)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])
  useEffect(() => {
    window.addEventListener('family-app:bank-changed', reload)
    return () => window.removeEventListener('family-app:bank-changed', reload)
  }, [])

  // Sin banco enlazado todavía, no hay nada que enseñar — igual que el
  // resto de tarjetas condicionales de la app.
  if (loading || accounts.length === 0) return null

  const [from, rawTo] = rangeForPreset(preset, customFrom, customTo, monthStartDay)
  // "Este mes" (u otro preset) puede terminar en el futuro — el saldo
  // de un día que todavía no ha llegado no se puede conocer, así que la
  // línea nunca dibuja más allá de hoy (antes seguía plana hasta fin de
  // mes, como si el futuro ya se supiera).
  const todayStr = toDateStrLocal(new Date())
  const to = rawTo > todayStr ? todayStr : rawTo
  const selectedAccounts = selectedAccountId ? accounts.filter((a) => a.id === selectedAccountId) : accounts
  const accountIds = new Set(selectedAccounts.map((a) => a.id))
  const txForBalance = transactions.map((t) => ({
    accountId: t.accountId,
    transactionDate: t.transactionDate,
    amount: t.amount,
    creditDebit: t.creditDebit,
  }))
  const earliest = earliestTransactionDate(accountIds, txForBalance)
  // Limitación real: solo se pueden reconstruir los días con
  // movimientos guardados — más atrás de ahí no hay forma de saberlo,
  // aunque se amplíe el plazo pedido (ver Banco → "Sincronizar
  // movimientos" para traer más histórico).
  const effectiveFrom = earliest && earliest > from ? earliest : from

  // Petición real: "que ponga Común, no el banco y la cuenta, así
  // ocupan menos sitio" — el chip identifica DE QUIÉN es la cuenta
  // (para eso están, igual que "Eric"/"Fernando"), no hace falta
  // repetir banco + últimos dígitos ahí; esos datos ya están en la
  // tarjeta de arriba y en Banco.
  function accountChipLabel(a: BankAccount): { label: string; owner: FamilyMember | null } {
    const owner = a.ownerMemberId ? (members.find((m) => m.id === a.ownerMemberId) ?? null) : null
    return { label: owner ? owner.name : 'Común', owner }
  }

  // Petición real: "componlos de los colores asignados a las cuentas...
  // en proporción, en cada momento, que la franja... de qué cuenta es"
  // — una serie por cuenta (con 1 sola cuenta, se queda en una franja
  // sola, igual que antes) en vez de una única línea combinada, para
  // que se vea de un vistazo cuánto aporta cada cuenta al total en
  // cada día. El color es el del miembro asignado, o el gris de
  // "Común" si no tiene.
  const series = selectedAccounts.map((a) => {
    const { label, owner } = accountChipLabel(a)
    return {
      accountId: a.id,
      label,
      color: owner?.color ?? COMMON_OWNER_COLOR,
      points:
        effectiveFrom <= to ? balanceTrend([{ id: a.id, balance: a.balance }], txForBalance, effectiveFrom, to) : [],
    }
  })
  const currentBalance = selectedAccounts.reduce((sum, a) => {
    const s = series.find((s) => s.accountId === a.id)
    const last = s?.points[s.points.length - 1]
    return sum + (last ? last.balance : (a.balance ?? 0))
  }, 0)
  const hasPoints = series.some((s) => s.points.length > 1)

  return (
    <div className="card event-card">
      <strong>Tendencia del saldo</strong>
      {accounts.length > 1 && (
        <div className="filter-row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className={'chip' + (selectedAccountId === null ? ' chip-active' : '')}
            onClick={() => setSelectedAccountId(null)}
          >
            Todas
          </button>
          {accounts.map((a) => {
            const { label, owner } = accountChipLabel(a)
            return (
              <button
                key={a.id}
                type="button"
                className={'chip' + (selectedAccountId === a.id ? ' chip-active' : '')}
                onClick={() => setSelectedAccountId(a.id)}
              >
                <OwnerBadge owner={owner} size={16} /> {label}
              </button>
            )
          })}
        </div>
      )}
      <DateFilterTab
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />
      {earliest && effectiveFrom !== from && (
        <p className="muted" style={{ fontSize: 12 }}>
          Solo hay movimientos guardados desde el {earliest} — no se puede ir más atrás aunque amplíes el plazo (trae
          más histórico desde Banco → Sincronizar movimientos).
        </p>
      )}
      <p style={{ fontSize: 24, fontWeight: 700, margin: '10px 0 6px' }}>{currentBalance.toFixed(2)} €</p>
      {hasPoints ? (
        <BalanceTrendChart series={series} />
      ) : (
        <p className="muted">No hay movimientos guardados en este periodo para dibujar la tendencia.</p>
      )}
    </div>
  )
}

interface BalanceSeries {
  accountId: string
  label: string
  color: string
  points: { date: string; balance: number }[]
}

// Petición real: "en los ejes datos, cantidad de euros en una y en la
// otra, algo de indicador de tiempo, y componlos de los colores
// asignados a las cuentas... en proporción, en cada momento, que la
// franja [diga] de qué cuenta es" — área APILADA (cada cuenta encima de
// la anterior, no una línea sola sumada) con eje de € a la izquierda y
// fechas abajo. Con una sola cuenta se queda en una única franja, igual
// que el gráfico simple de antes.
function BalanceTrendChart({ series }: { series: BalanceSeries[] }) {
  const width = 320
  const height = 140
  const padLeft = 42
  const padRight = 6
  const padTop = 8
  const padBottom = 20
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  const n = series[0]?.points.length ?? 0
  let runningBottom = new Array(n).fill(0)
  const bands = series.map((s) => {
    const bottom = runningBottom
    const top = bottom.map((b, i) => b + (s.points[i]?.balance ?? 0))
    runningBottom = top
    return { ...s, bottom, top }
  })
  const grandTotal = runningBottom // = suma de todas las cuentas, día a día
  const maxY = Math.max(0, ...grandTotal)
  const minY = Math.min(0, ...grandTotal)
  const span = maxY - minY || 1

  function xAt(i: number): number {
    return padLeft + (n > 1 ? (i / (n - 1)) * plotW : 0)
  }
  function yAt(v: number): number {
    return padTop + plotH * (1 - (v - minY) / span)
  }

  const yTicks = [minY, minY + span / 2, maxY]
  const dateTickIndices = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1]

  // Petición real (captura de Wallet): al tocar el gráfico sale una raya
  // punteada con casillas de importe exacto — una por cuenta (marco del
  // color de la cuenta) y otra del total (marco negro) — que se apagan
  // solas a los pocos segundos. Las casillas se reparten en vertical para
  // que nunca se solapen.
  const [cursor, setCursor] = useState<{ idx: number; visible: boolean } | null>(null)
  const hideTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  function showAt(e: ReactPointerEvent<SVGSVGElement>) {
    if (n === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const scale = Math.min(rect.width / width, rect.height / height)
    const offX = (rect.width - width * scale) / 2
    const vx = (e.clientX - rect.left - offX) / scale
    const raw = n > 1 ? Math.round(((vx - padLeft) / plotW) * (n - 1)) : 0
    setCursor({ idx: Math.max(0, Math.min(n - 1, raw)), visible: true })
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setCursor((c) => (c ? { ...c, visible: false } : c)), 3000)
  }

  // de-DE y no es-ES: es-ES no pone el punto de millar en 4 cifras (3213,00).
  const fmtEur = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  const fmtDate = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    return `${day}/${m}/${y}`
  }

  interface TipBox {
    key: string
    text: string
    sub?: string
    color: string
    h: number
    desiredY: number
    y: number
  }
  let tipBoxes: TipBox[] = []
  let tipX = 0
  let tipLeft = false
  let tipW = 0
  if (cursor) {
    const i = cursor.idx
    tipX = xAt(i)
    const total = grandTotal[i] ?? 0
    const date = series[0]?.points[i]?.date ?? ''
    const boxes: TipBox[] = [
      { key: 'total', text: fmtEur(total), sub: fmtDate(date), color: '#111827', h: 22, desiredY: yAt(total) - 11, y: 0 },
    ]
    if (bands.length > 1) {
      for (const b of [...bands].reverse()) {
        const mid = ((b.bottom[i] ?? 0) + (b.top[i] ?? 0)) / 2
        boxes.push({ key: b.accountId, text: fmtEur(b.points[i]?.balance ?? 0), color: b.color, h: 14, desiredY: yAt(mid) - 7, y: 0 })
      }
    }
    boxes.sort((a, b) => a.desiredY - b.desiredY)
    const gap = 2
    const minTop = padTop
    const maxBottom = padTop + plotH
    let cursorY = minTop
    for (const b of boxes) {
      b.y = Math.max(b.desiredY, cursorY)
      cursorY = b.y + b.h + gap
    }
    let limit = maxBottom
    for (let k = boxes.length - 1; k >= 0; k--) {
      boxes[k].y = Math.min(boxes[k].y, limit - boxes[k].h)
      limit = boxes[k].y - gap
    }
    tipBoxes = boxes
    tipW = 6 + Math.max(...boxes.map((b) => Math.max(b.text.length, b.sub?.length ?? 0))) * 4.8
    tipLeft = tipX > padLeft + plotW / 2
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        style={{ touchAction: 'pan-y' }}
        onPointerDown={showAt}
        onPointerMove={showAt}
      >
        {/* Eje de € — 3 líneas guía (mínimo, mitad, máximo del total). */}
        {yTicks.map((v, i) => {
          const y = yAt(v)
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={padLeft - 4} y={y + 3} textAnchor="end" fontSize="8" fill="#868e96">
                {Math.round(v)} €
              </text>
            </g>
          )
        })}
        {/* Una franja por cuenta, apiladas — la altura de cada una en
            cada punto del tiempo es lo que aporta esa cuenta al total
            ese día (petición real: "que la franja diga de qué cuenta
            es, en proporción, en cada momento"). */}
        {bands.map((b) => {
          if (b.points.length === 0) return null
          const upperPts = b.top.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
          const lowerPts = b.bottom
            .map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
            .reverse()
          return (
            <polygon
              key={b.accountId}
              points={[...upperPts, ...lowerPts].join(' ')}
              fill={b.color}
              fillOpacity={0.78}
              stroke={b.color}
              strokeWidth={0.5}
            />
          )
        })}
        {/* Eje de tiempo. */}
        {dateTickIndices.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={height - 4}
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            fontSize="8"
            fill="#868e96"
          >
            {series[0]?.points[i]?.date}
          </text>
        ))}
        {cursor && (
          <g style={{ opacity: cursor.visible ? 1 : 0, transition: 'opacity 0.4s', pointerEvents: 'none' }}>
            <line x1={tipX} y1={padTop} x2={tipX} y2={padTop + plotH} stroke="#495057" strokeWidth={0.8} strokeDasharray="2 2" />
            <circle cx={tipX} cy={yAt(grandTotal[cursor.idx] ?? 0)} r={2.5} fill="#111827" stroke="#fff" strokeWidth={1} />
            {tipBoxes.map((b) => {
              const bx = tipLeft ? tipX - 5 - tipW : tipX + 5
              return (
                <g key={b.key}>
                  <rect x={bx} y={b.y} width={tipW} height={b.h} rx={3} fill="#fff" stroke={b.color} strokeWidth={1.4} />
                  <text x={bx + tipW / 2} y={b.y + (b.sub ? 9 : 10)} textAnchor="middle" fontSize="9" fontWeight="700" fill="#111827">
                    {b.text}
                  </text>
                  {b.sub && (
                    <text x={bx + tipW / 2} y={b.y + 18} textAnchor="middle" fontSize="7.5" fill="#6b7280">
                      {b.sub}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )}
      </svg>
      {series.length > 1 && (
        <div className="filter-row" style={{ marginTop: 4 }}>
          {series.map((s) => (
            <span key={s.accountId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Skill de Pepa, punto 22: enlazar cuentas bancarias reales (varias
// por familia) — mismo patrón que Google Calendar (startGoogleConnect
// redirige, la vuelta ocurre en enable-banking-auth-callback con
// ?bank=connected|error). Los movimientos importados alimentan
// Movimientos (source='banco', módulo de conciliación con tickets
// pendiente aparte).
function BankTab({
  openConnectSignal,
  focusAccountId,
}: {
  openConnectSignal?: number
  focusAccountId?: string | null
} = {}) {
  const [connections, setConnections] = useState<BankConnection[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  // Petición real: la lista tiene que verse y editarse igual que
  // Movimientos (fecha, detalle, importe, categoría y etiqueta
  // editables) — no el texto suelto del banco. Cada movimiento del
  // banco ya está enlazado a un gasto real (bank_transactions.matched_expense_id,
  // ver enable-banking-sync-transactions), así que se muestra y se
  // edita ESE gasto, reutilizando el mismo EditExpenseInline de Movimientos.
  const [linkedExpenses, setLinkedExpenses] = useState<Expense[]>([])
  // Petición real: "cuando pulse al recuadro [de una cuenta] me tiene
  // que llevar a la pestaña de esa cuenta... si hay otra cuenta que me
  // lleve a la de la otra cuenta" — con varias cuentas enlazadas, cada
  // tarjeta de saldo filtra aquí a SU cuenta en vez de mezclar los
  // movimientos de todas. expenseAccountId hace de puente porque
  // linkedExpenses (Movimientos reales) no lleva de por sí a qué
  // cuenta de banco pertenece, solo bank_transactions lo sabe.
  const [expenseAccountId, setExpenseAccountId] = useState<Map<string, string>>(new Map())
  const [activeAccountId, setActiveAccountId] = useState<string | null>(focusAccountId ?? null)
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [showAccountsModal, setShowAccountsModal] = useState(false)
  // Solo importa para la primera sincronización de cada cuenta — a
  // partir de ahí cada sincronización (manual o del cron 4 veces al
  // día, ver 0077_schedule_bank_sync.sql) es incremental de verdad,
  // solo trae lo nuevo desde el último movimiento ya guardado.
  const [syncDays, setSyncDays] = useState(90)
  // Petición real: "en banco dijimos de poder filtrar por fechas pero
  // no veo ningún filtro" — misma pestaña "📅 Fecha" desplegable que
  // Resumen/Estadísticas/Presupuesto, aquí sobre los movimientos ya
  // enlazados a gastos.
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  // Petición real: "que me pongas una pestaña que sea gastos fijos,
  // gastos variables... y que me pongas para poder filtrar por
  // ingresos... para saber cuánto tenemos de cada" — Fijo/Variable se
  // resuelve por movimiento (resolveExpenseFixed: categoría, o el
  // propio movimiento si lo has marcado a mano en su edición).
  const [typeFilter, setTypeFilter] = useState<'todos' | 'fijos' | 'variables' | 'ingresos' | 'devoluciones' | 'categoria' | 'busqueda' | 'pendientes'>('todos')
  const [categoryFilterValue, setCategoryFilterValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [monthStartDay, setMonthStartDay] = useState(1)
  const [visibleCount, setVisibleCount] = useState(50)
  const movementColorMode = useMovementColorMode()
  const catColors = stableCategoryColors(categories)

  // Petición real: "no me has puesto para poder agregar cuentas a esa
  // pantalla" — el botón "+ Añadir cuenta" de las tarjetas de saldo
  // (arriba de Economía) manda aquí y abre este formulario solo,
  // aunque la pestaña Banco ya estuviera montada de antes.
  const lastConnectSignalRef = useRef(openConnectSignal)
  useEffect(() => {
    if (openConnectSignal != null && openConnectSignal !== lastConnectSignalRef.current) {
      lastConnectSignalRef.current = openConnectSignal
      setShowAccountsModal(true)
    }
  }, [openConnectSignal])

  // Idem para el filtro por cuenta: si Banco ya estaba montado y se
  // toca otra tarjeta de saldo, hay que volver a aplicar el filtro
  // aunque el valor técnicamente ya se recibiera una vez antes.
  const lastFocusAccountRef = useRef(focusAccountId)
  useEffect(() => {
    if (focusAccountId !== undefined && focusAccountId !== lastFocusAccountRef.current) {
      lastFocusAccountRef.current = focusAccountId
      setActiveAccountId(focusAccountId)
    }
  }, [focusAccountId])

  useEffect(() => {
    setVisibleCount(50)
  }, [preset, customFrom, customTo, typeFilter, activeAccountId])

  // Petición real: "cada vez que edito un movimiento me devuelve al
  // inicio de la página" — recargar tras editar sustituía toda la
  // pantalla por "Cargando…" (la lista se venía abajo a casi nada y el
  // navegador perdía la posición de scroll); a partir de la segunda vez
  // se recarga en silencio, dejando la lista anterior a la vista hasta
  // que llegan los datos nuevos.
  const hasLoadedOnceRef = useRef(false)

  function reload() {
    if (!hasLoadedOnceRef.current) setLoading(true)
    Promise.all([
      listBankConnections(),
      listBankAccounts(),
      listBankTransactions(),
      listExpenses(),
      listBudgetCategories(),
      listTags(),
      getFinanceMonthStartDay(),
      listFamilyMembers(),
    ])
      .then(([c, a, t, allExpenses, cats, tgs, monthStart, m]) => {
        setConnections(c)
        setAccounts(a)
        setCategories(cats)
        setTags(tgs)
        setMonthStartDay(monthStart)
        setMembers(m)
        const matchedIds = new Set(t.map((bt) => bt.matchedExpenseId).filter((id): id is string => !!id))
        setLinkedExpenses(allExpenses.filter((e) => matchedIds.has(e.id)).sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)))
        setExpenseAccountId(new Map(t.filter((bt) => bt.matchedExpenseId).map((bt) => [bt.matchedExpenseId as string, bt.accountId])))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        hasLoadedOnceRef.current = true
        setLoading(false)
      })
  }

  useEffect(() => {
    // Enable Banking trae de vuelta aquí con ?bank=connected|error tras
    // el consentimiento — se lee una vez y se limpia de la URL para que
    // un refresco de página no lo vuelva a mostrar.
    const params = new URLSearchParams(window.location.search)
    const result = params.get('bank')
    if (result === 'connected') {
      setNotice('✓ Banco conectado.')
      window.dispatchEvent(new Event('family-app:bank-changed'))
    } else if (result === 'error') setNotice(`No se pudo conectar (${params.get('detail') ?? 'error'}).`)
    if (result) {
      params.delete('bank')
      params.delete('detail')
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
    reload()
  }, [])

  async function handleSync() {
    setSyncing(true)
    setError(null)
    try {
      const result = await syncBankTransactions(syncDays)
      const base = `✓ ${result.totalSynced} movimiento${result.totalSynced === 1 ? '' : 's'} sincronizado${result.totalSynced === 1 ? '' : 's'}.`
      // Petición real: "la de Caja Rural... no se actualiza ni dando a
      // sincronizar" — antes un fallo en una cuenta concreta (banco
      // caducado, límite de peticiones...) se perdía del todo detrás de
      // un aviso de éxito que solo hablaba de las demás cuentas.
      setNotice(result.errors.length > 0 ? `${base} Alguna cuenta no se ha podido sincronizar: ${result.errors.join(' · ')}` : base)
      reload()
      // Bug real reportado: "las tarjetas de saldo de arriba de Economía
      // (Resumen) se quedaban en 'Sincronizando...' aunque el saldo ya
      // estuviera guardado — había que cambiar de pestaña para que se
      // refrescaran". AccountBalanceCards vive fuera de esta pestaña y
      // solo se cargaba una vez al montarse; este aviso le dice que
      // vuelva a pedir los datos.
      window.dispatchEvent(new Event('family-app:bank-changed'))
    } catch (err) {
      setError(errorMessage(err, String(err)))
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <p className="muted">Cargando cuentas bancarias…</p>

  const activeConnections = connections.filter((c) => c.status === 'active')
  const [from, to] = rangeForPreset(preset, customFrom, customTo, monthStartDay)
  const byAccount = activeAccountId
    ? linkedExpenses.filter((e) => expenseAccountId.get(e.id) === activeAccountId)
    : linkedExpenses
  const dateFilteredExpenses = byAccount.filter((e) => e.expenseDate >= from && e.expenseDate <= to)
  const filteredExpenses = dateFilteredExpenses.filter((e) => {
    if (typeFilter === 'todos') return true
    if (typeFilter === 'categoria') return !categoryFilterValue || e.category === categoryFilterValue
    if (typeFilter === 'busqueda') return matchesFreeSearch(e, searchQuery)
    if (typeFilter === 'pendientes') return isPendingSpendingRow(e)
    // Bug real: "en Banco si filtro por Ingresos me salen 4549,63€,
    // pero en Presupuesto/Resumen 4241,63€" — este filtro sumaba
    // también el LADO DE SALIDA de un traspaso entre cuentas propias
    // (is_income=false, categoría "Movimientos internos"), porque el
    // `||` de abajo no miraba is_income para esa categoría. Un traspaso
    // no cuenta como Ingreso en ningún otro sitio de la app — tampoco
    // aquí, ni saliendo ni entrando.
    // FASE 6D.3 — una devolución (isRefund) no es Ingresos: es dinero recuperado de un gasto anterior, no ingreso nuevo. Sigue
    // siendo un movimiento real, consultable aparte con su propio filtro (nunca se oculta de "Todos"/"Búsqueda libre").
    if (typeFilter === 'ingresos') return isRealIncome(e, categories)
    if (typeFilter === 'devoluciones') return isRefund(e, categories)
    if (e.isIncome) return false
    const isFixed = resolveExpenseFixed(e, categories)
    return typeFilter === 'fijos' ? isFixed === true : isFixed !== true
  })
  // Un traspaso entre cuentas propias o un cobro anulado y re-cobrado
  // (categoría "Movimientos internos") se sigue viendo en la lista de
  // "Todos"/"Búsqueda libre" para poder consultarlo, pero no debe
  // sumar en el total de arriba — igual que en Resumen/Presupuesto.
  const typeFilterTotal = filteredExpenses.reduce(
    (sum, e) => (isInternalTransferCategory(e.category, categories) ? sum : sum + e.amount),
    0,
  )
  // Símbolo por fila cuando se ven todas las cuentas mezcladas
  // (petición real: "no ves ningún símbolo que diga de qué cuenta
  // viene" — antes solo se sabía filtrando una a una).
  const memberById = new Map(members.map((m) => [m.id, m]))
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  function ownerMemberForExpense(expenseId: string): FamilyMember | null {
    const accId = expenseAccountId.get(expenseId)
    const ownerId = accId ? accountById.get(accId)?.ownerMemberId : null
    return ownerId ? (memberById.get(ownerId) ?? null) : null
  }
  const activeAccountLabel = activeAccountId
    ? (() => {
        const acc = accounts.find((a) => a.id === activeAccountId)
        const bankName = connections.find((c) => c.id === acc?.connectionId)?.aspspName
        return acc ? `${bankName ?? 'Banco'} · ${acc.iban ? `•• ${acc.iban.slice(-4)}` : (acc.name ?? 'Cuenta')}` : null
      })()
    : null

  return (
    <div>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {/* Petición real: "Esta parte de las cuentas quiero que la pongas
          en una página emergente accesible desde el menú arriba con
          Configuración cuentas" — conectar/desconectar/asignar dueño
          vive ahora en BankAccountsModal (también abierto desde
          Configuración → Cuentas bancarias, y desde "⚙️ Configuración
          cuentas" en AccountBalanceCards, siempre visible encima de
          esta pestaña); aquí solo queda el resumen y lo que sí es del
          día a día (sincronizar y ver movimientos) — un botón propio
          aquí abajo quedaba duplicado con el de arriba, mismo sitio,
          mismo destino ("Está duplicado lo de configuración"). El
          modal se queda montado igualmente para cuando "+ Añadir
          cuenta" (en Mis cuentas) manda aquí con openConnectSignal. */}
      {activeConnections.length === 0 ? (
        <p className="muted">
          Todavía no hay ningún banco enlazado. Al enlazar una cuenta, sus movimientos se pueden traer aquí y
          usarlos en Economía junto con los tickets.
        </p>
      ) : (
        <p className="muted">
          {activeConnections.length} {activeConnections.length === 1 ? 'banco enlazado' : 'bancos enlazados'} (
          {accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'}).
        </p>
      )}
      {showAccountsModal && (
        <BankAccountsModal
          onClose={() => {
            setShowAccountsModal(false)
            reload()
          }}
        />
      )}

      {activeConnections.length > 0 && (
        <>
          {/* Petición real: "quiero que muevas el desplegable de Traer
              al menos x meses debajo de sincronizar movimientos" — antes
              iban en la misma fila. Se quitan además "último año" y
              "todo el histórico": comprobado con los datos reales de la
              familia que el banco nunca entrega más de ~3 meses aunque se
              pida más (el movimiento más antiguo guardado nunca pasa de
              ahí), así que esas dos opciones no tenían ningún efecto. */}
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={handleSync} disabled={syncing}>
              {syncing ? 'Sincronizando…' : '🔄 Sincronizar movimientos'}
            </button>
            <div style={{ marginTop: 6 }}>
              <select value={syncDays} onChange={(e) => setSyncDays(Number(e.target.value))}>
                <option value={30}>Traer al menos: último mes</option>
                <option value={90}>Traer al menos: últimos 3 meses</option>
              </select>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Se sincroniza sola 4 veces al día trayendo solo lo nuevo. El banco no entrega más de unos 3 meses de
            histórico aunque se pida más, así que no hace falta elegir un periodo más largo que ese.
          </p>
        </>
      )}

      {linkedExpenses.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 16, fontWeight: 600 }}>
            Movimientos del banco ({filteredExpenses.length} de {linkedExpenses.length})
          </p>
          <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Cada uno se categoriza solo. Toca uno para editar su categoría o etiqueta — es el mismo movimiento que
            aparece en Movimientos.
          </p>
          {activeAccountLabel && (
            <div className="card event-card" style={{ marginBottom: 8 }}>
              <strong>Cuenta: {activeAccountLabel}</strong>
              <button type="button" className="link-button" onClick={() => setActiveAccountId(null)}>
                ✕ Ver todas las cuentas
              </button>
            </div>
          )}
          <DateFilterTab
            preset={preset}
            onPresetChange={setPreset}
            customFrom={customFrom}
            onCustomFromChange={setCustomFrom}
            customTo={customTo}
            onCustomToChange={setCustomTo}
          />
          {/* Petición real: "que me pongas una pestaña que sea gastos
              fijos, gastos variables... y también poder filtrar por
              ingresos... para saber cuánto tenemos de cada". */}
          <div style={{ marginTop: 8 }}>
            <DropdownFilter label="Filtrar por" value={typeFilter} onChange={(k) => setTypeFilter(k as typeof typeFilter)} options={TYPE_FILTER_OPTIONS} />
          </div>
          {typeFilter === 'categoria' && (
            <div style={{ marginTop: 8 }}>
              <CategorySelect value={categoryFilterValue} onChange={setCategoryFilterValue} categories={categories} allowGeneral />
            </div>
          )}
          {typeFilter === 'busqueda' && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en tienda, categoría o notas..."
              style={{ marginTop: 8 }}
              autoFocus
            />
          )}
          {typeFilter !== 'todos' && (
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Total{' '}
              {typeFilter === 'fijos' ? 'fijo' : typeFilter === 'variables' ? 'variable' : typeFilter === 'ingresos' ? 'de ingresos' : typeFilter === 'devoluciones' ? 'de devoluciones' : 'filtrado'}
              :{' '}
              <strong>{typeFilterTotal.toFixed(2)} €</strong>
            </p>
          )}
          <div className="price-row-list">
            {filteredExpenses.length === 0 && <p className="muted">Ningún movimiento en este periodo.</p>}
            {filteredExpenses.slice(0, visibleCount).map((e) =>
              editingId === e.id ? (
                <EditExpenseInline
                  key={e.id}
                  expense={e}
                  categories={categories}
                  tags={tags}
                  onDone={() => {
                    setEditingId(null)
                    reload()
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <MovementRow
                  key={e.id}
                  expense={e}
                  category={categories.find((c) => c.name === e.category)}
                  tag={tags.find((t) => t.id === e.tagId)}
                  onClick={() => setEditingId(e.id)}
                  ownerMember={activeAccountId ? undefined : ownerMemberForExpense(e.id)}
                  rowColor={movementRowColor(movementColorMode, categories.find((c) => c.name === e.category), tags.find((t) => t.id === e.tagId), catColors)}
                />
              ),
            )}
          </div>
          {/* Petición real: "no puedo ver los movimientos antes del
              24/08 pero sí que hay movimientos anteriores... ¿hay algún
              límite de página?" — el corte fijo de 50 se llevaba los más
              antiguos del periodo por delante en vez de avisar. */}
          {filteredExpenses.length > visibleCount && (
            <button type="button" className="link-button" onClick={() => setVisibleCount((n) => n + 50)}>
              Ver {Math.min(50, filteredExpenses.length - visibleCount)} más ({filteredExpenses.length - visibleCount} restantes)
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Resumen + Conclusiones de Pepa (Skill de Pepa, puntos 4/5)
// ---------------------------------------------------------------------

const NECESSITY_LABELS: Record<'debo' | 'necesito' | 'quiero', string> = {
  debo: 'Debo',
  necesito: 'Necesito',
  quiero: 'Quiero',
}

// Selector de periodo (Hoy/Esta semana/Este mes/Este año/Rango de
// fecha) — petición real: "eso lo metas en una pestaña, la pestaña se
// tiene que llamar Fecha y que tenga un desplegable... el rango de
// fecha que te ponga desde hasta... lo colocas donde está ahora mismo
// la pestaña que pone hoy". Antes era una fila entera de chips
// siempre visible; ahora es una única pestaña "📅 Fecha: …" que
// despliega las opciones al tocarla, con los campos desde/hasta
// dentro del propio desplegable al elegir "Rango de fecha". Mismo
// componente en todos los sitios de Economía y Compras que usaban la
// fila de chips — petición real: "en todos los desplegables de Fecha
// de la app incluyas mes real y mes contable", así que ya no hace
// falta el interruptor que antes dejaba fuera "Mes real" en algunos.
function DateFilterTab({
  preset,
  onPresetChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
}: {
  preset: SpendRangePreset
  onPresetChange: (p: SpendRangePreset) => void
  customFrom: string
  onCustomFromChange: (d: string) => void
  customTo: string
  onCustomToChange: (d: string) => void
}) {
  const [open, setOpen] = useState(false)
  const presets: SpendRangePreset[] = ['dia', 'semana', 'mes', 'mes_real', 'año', 'rango']
  const label = (p: SpendRangePreset) => (p === 'mes' ? 'Mes contable' : PRESET_LABELS[p])

  return (
    <div style={{ margin: '8px 0' }}>
      <button type="button" className={'chip' + (open ? ' chip-active' : '')} onClick={() => setOpen((v) => !v)}>
        📅 Fecha: {label(preset)} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="category-picker-panel" style={{ maxHeight: 'none', marginTop: 6 }}>
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className={'category-picker-row' + (preset === p ? ' chip-active' : '')}
              onClick={() => {
                onPresetChange(p)
                if (p !== 'rango') setOpen(false)
              }}
            >
              {label(p)}
            </button>
          ))}
          {preset === 'rango' && (
            <div className="inline-fields" style={{ padding: '10px 12px' }}>
              <label>
                Desde
                <input type="date" value={customFrom} onChange={(e) => onCustomFromChange(e.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" value={customTo} onChange={(e) => onCustomToChange(e.target.value)} />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Señal DISCRETA de gastos pendientes de clasificar (category NULL): "3 pendientes de clasificar · 245,30 €". Tocable → Movimientos con el
// filtro Pendientes. Sin pendientes no se pinta nada; nunca es un modal, un banner ni bloquea Economía. (Fase 6C.2C)
function PendingSignal({ signal, onOpen }: { signal: PendingSpending; onOpen: () => void }) {
  const text = pendingSignalText(signal)
  if (!text) return null
  return (
    <button type="button" className="pending-signal" onClick={onOpen}>
      <span aria-hidden>⏳</span> {text} <span aria-hidden>→</span>
    </button>
  )
}

function ResumenTab({ onViewMovements }: { onViewMovements: (f: MovementsFilter) => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [resolvedTransferOut, setResolvedTransferOut] = useState<ResolvedInternalTransferDestination[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  const [monthStartDay, setMonthStartDay] = useState(1)

  useEffect(() => {
    Promise.all([listExpenses(), listBudgetCategories(), listTags(), listFamilyMembers()])
      .then(([e, c, t, m]) => {
        setExpenses(e)
        setCategories(c)
        setTags(t)
        setMembers(m)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    getFinanceMonthStartDay()
      .then(setMonthStartDay)
      .catch(() => {})
    // Fase 1F.B — si falla (p. ej. familia sin cuentas bancarias enlazadas), el bloque de ahorro
    // destinado simplemente cae al fallback de siempre (pata de entrada); nunca bloquea el resto de Resumen.
    listResolvedInternalTransferDestinations()
      .then(setResolvedTransferOut)
      .catch(() => {})
  }, [])

  if (loading) return <p className="muted">Cargando resumen…</p>

  const [from, to] = rangeForPreset(preset, customFrom, customTo, monthStartDay)
  const inRange = expenses.filter((e) => e.expenseDate >= from && e.expenseDate <= to)
  // Petición real: "el dinero traspasado entre nuestras cuentas y las
  // de los niños no debería contar como ingreso ni como gasto" — un
  // traspaso interno genera un movimiento en CADA cuenta (uno de
  // salida, otro de entrada); si se cuentan los dos, Ingresos y Gastos
  // se inflan por igual (el Ahorro no cambia, pero la Tasa de ahorro
  // sale más baja de lo real al hincharse el denominador).
  const real = inRange.filter((e) => e.kind === 'real' && !isInternalTransferCategory(e.category, categories))
  // Corrección — única fuente de verdad para ingresos/gasto/ahorro de un periodo (computePeriodFinancials,
  // financeCompute.ts): antes esta pantalla y "Evolución temporal" calculaban el gasto con reglas
  // distintas (Evolución no excluía los traspasos internos) y daban totales distintos para el MISMO
  // periodo — ahora las dos llaman a la misma función, así que nunca pueden volver a desincronizarse.
  const { income: totalIncome, spent: totalSpent, refunds: refundsTotal, netSpent, ahorro } = computePeriodFinancials(inRange, categories)
  // Skill de Pepa, punto 1: no se inventa una tasa de ahorro sin
  // ingresos con los que calcularla.
  const tasaAhorro = totalIncome > 0 ? (ahorro / totalIncome) * 100 : null

  // Periodo anterior EQUIVALENTE (misma duración, justo antes), para las
  // conclusiones — Skill de Pepa, punto 5: "en comparaciones mostrar
  // siempre porcentaje + euros, nunca depender solo del porcentaje".
  const fromMs = new Date(from + 'T00:00').getTime()
  const toMs = new Date(to + 'T00:00').getTime()
  const spanMs = Math.max(toMs - fromMs, 86_400_000)
  const prevTo = toDateStr(new Date(fromMs - 86_400_000))
  const prevFrom = toDateStr(new Date(fromMs - spanMs))
  const prevReal = expenses.filter(
    (e) => e.kind === 'real' && !isInternalTransferCategory(e.category, categories) && e.expenseDate >= prevFrom && e.expenseDate <= prevTo,
  )
  const prevSpent = prevReal.filter((e) => !e.isIncome).reduce((s, e) => s + e.amount, 0)

  const conclusions: Conclusion[] = []
  if (real.length === 0) {
    conclusions.push({ text: 'Todavía no hay movimientos en este periodo para sacar conclusiones.' })
  } else {
    if (prevReal.length === 0) {
      conclusions.push({
        text: 'No hay datos del periodo anterior para comparar todavía — con el tiempo Pepa podrá comparar la evolución.',
        filter: { label: `Movimientos — ${PRESET_LABELS[preset]}`, from, to },
      })
    } else {
      const deltaPct = prevSpent > 0 ? ((totalSpent - prevSpent) / prevSpent) * 100 : null
      const deltaEur = totalSpent - prevSpent
      if (deltaPct === null) {
        conclusions.push({
          text: `Habéis gastado ${totalSpent.toFixed(2)} € — no había gasto en el periodo anterior con el que comparar.`,
          filter: { label: `Gastos — ${PRESET_LABELS[preset]}`, from, to, isIncome: false },
        })
      } else if (Math.abs(deltaPct) < 3) {
        conclusions.push({
          text: `Habéis mantenido prácticamente el mismo ritmo de gasto que el periodo anterior y vuestra economía se mantiene estable.`,
          filter: { label: `Gastos — ${PRESET_LABELS[preset]}`, from, to, isIncome: false },
          kind: 'periodo-estable',
        })
      } else {
        const sign = deltaPct > 0 ? '+' : ''
        conclusions.push({
          text: `Habéis gastado un ${sign}${deltaPct.toFixed(0)}% (${sign}${deltaEur.toFixed(2)} €) ${deltaPct > 0 ? 'más' : 'menos'} que en el periodo anterior.`,
          filter: { label: `Gastos — ${PRESET_LABELS[preset]}`, from, to, isIncome: false },
          kind: deltaPct > 0 ? 'periodo-sube' : 'periodo-baja',
        })
      }
    }
    if (tasaAhorro !== null) {
      // Petición real: "en el bocadillo de Pepa falta el enlace de
      // +info" — a estas dos les faltaba `filter`, así que el botón no
      // salía nunca (mismo bocadillo, unas veces con enlace y otras
      // sin él). Llevan a todos los movimientos del periodo, sin
      // distinguir ingreso/gasto, que es lo que sustenta la tasa de
      // ahorro.
      if (tasaAhorro >= 20) {
        conclusions.push({
          text: `Vuestra tasa de ahorro es del ${tasaAhorro.toFixed(0)}% — una economía saneada.`,
          filter: { label: `Movimientos — ${PRESET_LABELS[preset]}`, from, to },
          kind: 'ahorro-bueno',
        })
      } else if (tasaAhorro < 0) {
        conclusions.push({
          text: `Este periodo habéis gastado más de lo que habéis ingresado (${ahorro.toFixed(2)} €).`,
          filter: { label: `Movimientos — ${PRESET_LABELS[preset]}`, from, to },
          kind: 'ahorro-negativo',
        })
      }
    }

    // Más señales reales, además del ritmo de gasto y el ahorro, para
    // que la sección tenga contenido variado incluso cuando esos dos
    // primeros apartados salen iguales varios días seguidos.
    const nonIncome = real.filter((e) => !e.isIncome)
    const categoryTotals = new Map<string, number>()
    // Un gasto pendiente (category NULL) cuenta en los totales, pero no se atribuye a ninguna categoría (Fase 6C.2B lo mostrará aparte).
    for (const e of nonIncome) if (e.category != null) categoryTotals.set(e.category, (categoryTotals.get(e.category) ?? 0) + e.amount)
    const prevCategoryTotals = new Map<string, number>()
    for (const e of prevReal.filter((e) => !e.isIncome)) if (e.category != null) prevCategoryTotals.set(e.category, (prevCategoryTotals.get(e.category) ?? 0) + e.amount)

    let topCategoryCandidate: Conclusion | null = null
    if (categoryTotals.size > 0) {
      const [topCatName, topCatTotal] = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0]
      const icon = categories.find((c) => c.name === topCatName)?.icon ?? ''
      const pct = totalSpent > 0 ? (topCatTotal / totalSpent) * 100 : 0
      topCategoryCandidate = {
        text: `La categoría en la que más habéis gastado es ${icon} ${topCatName}, con ${topCatTotal.toFixed(2)} € (${pct.toFixed(0)}% del total).`,
        filter: { label: `${topCatName} — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, category: topCatName },
      }
    }

    let biggestMoverCandidate: Conclusion | null = null
    if (prevReal.length > 0) {
      let best: { name: string; deltaEur: number; deltaPct: number | null } | null = null
      for (const [name, total] of categoryTotals) {
        const prevTotal = prevCategoryTotals.get(name) ?? 0
        const deltaEur = total - prevTotal
        if (Math.abs(deltaEur) < 5) continue
        if (!best || Math.abs(deltaEur) > Math.abs(best.deltaEur)) best = { name, deltaEur, deltaPct: prevTotal > 0 ? (deltaEur / prevTotal) * 100 : null }
      }
      if (best) {
        const sign = best.deltaEur > 0 ? '+' : ''
        const pctText = best.deltaPct !== null ? ` (${sign}${best.deltaPct.toFixed(0)}%)` : ''
        biggestMoverCandidate = {
          text: `La categoría que más ha cambiado respecto al periodo anterior es ${best.name}: ${sign}${best.deltaEur.toFixed(2)} €${pctText}.`,
          filter: { label: `${best.name} — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, category: best.name },
        }
      }
    }

    let topStoreCandidate: Conclusion | null = null
    const storeInfo = new Map<string, { count: number; total: number }>()
    for (const e of nonIncome) {
      if (!e.store) continue
      const cur = storeInfo.get(e.store) ?? { count: 0, total: 0 }
      cur.count++
      cur.total += e.amount
      storeInfo.set(e.store, cur)
    }
    if (storeInfo.size > 0) {
      const [storeName, info] = [...storeInfo.entries()].sort((a, b) => b[1].count - a[1].count)[0]
      if (info.count >= 2) {
        topStoreCandidate = {
          text: `Vuestro comercio más frecuente ha sido ${storeName}, con ${info.count} compras (${info.total.toFixed(2)} €).`,
          filter: { label: `${storeName} — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, store: storeName },
        }
      }
    }

    let biggestExpenseCandidate: Conclusion | null = null
    if (nonIncome.length > 0) {
      const biggest = [...nonIncome].sort((a, b) => b.amount - a.amount)[0]
      biggestExpenseCandidate = {
        text: `El gasto más alto del periodo ha sido${biggest.category ? ` ${biggest.category}` : ''}${biggest.store ? ` en ${biggest.store}` : ''}: ${biggest.amount.toFixed(2)} € el ${biggest.expenseDate}.`,
        // Con categoría, se filtra por ella (como siempre); sin categoría (pendiente), por ese gasto concreto.
        filter: biggest.category
          ? { label: `${biggest.category} — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, category: biggest.category }
          : { label: `Gasto más alto — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, expenseIds: [biggest.id] },
      }
    }

    let necessityCandidate: Conclusion | null = null
    const quieroTotal = nonIncome
      .filter((e) => resolveCategoryClassification(e.category, categories).necessity === 'quiero')
      .reduce((s, e) => s + e.amount, 0)
    if (quieroTotal > 0) {
      const pct = totalSpent > 0 ? (quieroTotal / totalSpent) * 100 : 0
      necessityCandidate = {
        text: `Un ${pct.toFixed(0)}% de lo gastado (${quieroTotal.toFixed(2)} €) ha sido "Quiero" — gasto no esencial.`,
        filter: { label: `Quiero — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, necessity: 'quiero' },
        kind: 'quiero',
      }
    }

    let fixedVariableCandidate: Conclusion | null = null
    const fixedTotal = nonIncome.filter((e) => resolveExpenseFixed(e, categories) === true).reduce((s, e) => s + e.amount, 0)
    if (fixedTotal > 0) {
      const pct = totalSpent > 0 ? (fixedTotal / totalSpent) * 100 : 0
      fixedVariableCandidate = {
        text: `El ${pct.toFixed(0)}% de vuestro gasto (${fixedTotal.toFixed(2)} €) es fijo; el resto, variable.`,
        filter: { label: `Fijo — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, isFixed: true },
        kind: 'fijo-variable',
      }
    }

    let tagCandidate: Conclusion | null = null
    const tagCounts = new Map<string, number>()
    for (const e of nonIncome) if (e.tagId) tagCounts.set(e.tagId, (tagCounts.get(e.tagId) ?? 0) + 1)
    if (tagCounts.size > 0) {
      const [tagId, count] = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0]
      const tag = tags.find((t) => t.id === tagId)
      if (tag && count >= 2) {
        tagCandidate = {
          text: `La etiqueta que más se repite es ${tag.name}, en ${count} movimientos.`,
          filter: { label: `${tag.name} — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, tagId: tag.id },
        }
      }
    }

    const extraPool = [
      topCategoryCandidate,
      biggestMoverCandidate,
      topStoreCandidate,
      biggestExpenseCandidate,
      necessityCandidate,
      fixedVariableCandidate,
      tagCandidate,
    ].filter((c): c is Conclusion => c !== null)
    conclusions.push(...extraPool)
  }

  // Fase 1F.F/B — "Dinero destinado a cuentas de ahorro": prioriza la pata de SALIDA resuelta
  // estructuralmente (IBAN del banco, resolve_internal_transfer_destinations) y usa la de ENTRADA como
  // fallback — computeSavingsDestinedByMember (domain/finance.ts) hace el emparejamiento/deduplicación,
  // nunca se reimplementa aquí. Nunca entra en totalIncome/totalSpent/ahorro de arriba (esos ya excluyen
  // todo movimiento interno, sin cambios) y nunca se convierte en ingreso ni en gasto de nadie.
  // Terminología deliberadamente conservadora: el dinero movido este periodo puede ser ahorro acumulado
  // de periodos anteriores, no necesariamente "generado" ahora — por eso nunca se dice "de tu ahorro de
  // este mes". `inRange` (no `real`): la pata de entrada de un traspaso interno es justo lo que `real`
  // excluye, así que hace falta la lista sin filtrar.
  const resolvedTransferOutInRange = resolvedTransferOut.filter((o) => o.expenseDate >= from && o.expenseDate <= to)
  const savingsDestinedByMember = computeSavingsDestinedByMember(
    inRange,
    categories,
    resolvedTransferOutInRange.map((o) => ({ expenseId: o.expenseId, destinationMemberId: o.destinationMemberId, amount: o.amount, date: o.expenseDate })),
  )
  const savingsDestinedRows = [...savingsDestinedByMember.entries()]
    .map(([memberId, amount]) => ({ member: members.find((m) => m.id === memberId), amount }))
    .filter((r) => r.amount > 0.005)
    .sort((a, b) => b.amount - a.amount)

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <DateFilterTab
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      <PendingSignal signal={pendingSignal(expenses)} onOpen={() => onViewMovements({ label: PENDING_LABEL, pendingOnly: true })} />

      <div className="card event-card">
        <strong>Resumen — {PRESET_LABELS[preset]}</strong>
        <p style={{ color: '#1e8449', margin: '6px 0 0' }}>
          Ingresos: +{totalIncome.toFixed(2)} €{' '}
          <button type="button" className="link-button" onClick={() => onViewMovements({ label: `Ingresos — ${PRESET_LABELS[preset]}`, from, to, isIncome: true })}>
            Ver registros →
          </button>
        </p>
        <p style={{ color: '#c0392b', margin: '4px 0' }}>
          Gastos: -{totalSpent.toFixed(2)} €{' '}
          <button type="button" className="link-button" onClick={() => onViewMovements({ label: `Gastos — ${PRESET_LABELS[preset]}`, from, to, isIncome: false })}>
            Ver registros →
          </button>
        </p>
        {/* FASE 6D.3 — solo si hubo devoluciones este periodo: si no, la tarjeta se queda exactamente como estaba (regla del
            proyecto: "si refunds = 0, mantener la interfaz actual"). El gasto neto es la cifra que de verdad ha salido de la
            cuenta; el bruto de arriba se conserva tal cual, sin tocar el histórico. */}
        {refundsTotal > 0 && (
          <>
            <p style={{ color: '#1e8449', margin: '4px 0' }}>
              Devoluciones: +{refundsTotal.toFixed(2)} €{' '}
              <button type="button" className="link-button" onClick={() => onViewMovements({ label: `Devoluciones — ${PRESET_LABELS[preset]}`, from, to, refundsOnly: true })}>
                Ver registros →
              </button>
            </p>
            <p className="muted" style={{ margin: '4px 0', fontSize: 13 }}>
              Gasto neto: <strong>{netSpent.toFixed(2)} €</strong>
            </p>
          </>
        )}
        <p style={{ margin: '4px 0' }}>
          <strong>{ahorro >= 0 ? 'Ahorro' : 'Balance'}: {ahorro.toFixed(2)} €</strong>
          {tasaAhorro !== null && <span className="muted"> · Tasa de ahorro {tasaAhorro.toFixed(0)}%</span>}
        </p>
      </div>

      {/* Fase 1F.F — bloque aparte, nunca dentro de la tarjeta de Ahorro de arriba: es informativo (a
          dónde ha ido dinero traspasado), no una segunda forma de calcular el ahorro. */}
      {savingsDestinedRows.length > 0 && (
        <div className="card event-card" style={{ marginTop: 8 }}>
          <strong>🏦 Dinero destinado a cuentas de ahorro</strong>
          <div style={{ marginTop: 6 }}>
            {savingsDestinedRows.map((r) => (
              <p key={r.member?.id ?? 'desconocido'} style={{ margin: '2px 0' }}>
                {r.member?.name ?? 'Miembro desconocido'}: {r.amount.toFixed(2)} €
              </p>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Puede incluir ahorro acumulado en periodos anteriores, movido ahora — no es necesariamente
            dinero generado en este periodo.
          </p>
        </div>
      )}

      <h2 className="section-title">Conclusiones de Pepa</h2>
      <PepaConclusionsWidget conclusions={conclusions} onViewMovements={onViewMovements} />
    </div>
  )
}

// ---------------------------------------------------------------------
// Estadísticas (Skill de Pepa, puntos 7-17)
// ---------------------------------------------------------------------

// Petición real: "para las Conclusiones de Pepa quiero que uses esta
// imagen y en el bocadillo cada vez que se abra la página ponga una
// frase diferente... puede ser un widget como de inicio, pero con sus
// frases y que solo cambien solas al volver a abrir la página o cuando
// los pases con la mano. Solo quiero una frase a la vez" — mismo gesto
// de deslizar con el dedo/ratón que el carrusel de fotos de Inicio
// (HomeScreen), pero sin el pase automático por tiempo: aquí solo
// cambia al reabrir la pantalla (índice de partida al azar cada vez que
// se monta el componente) o al deslizar a mano.
function PepaConclusionsWidget({
  conclusions,
  onViewMovements,
}: {
  conclusions: Conclusion[]
  onViewMovements: (f: MovementsFilter) => void
}) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * Math.max(conclusions.length, 1)))
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const infoRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (index >= conclusions.length) setIndex(0)
  }, [conclusions.length, index])

  // Petición real: "cuando la frase se sale del bocadillo que ajuste el
  // tamaño de letra para que se quede dentro" — frases largas (con un
  // concepto bancario largo, por ejemplo) desbordaban por debajo del
  // globo. En vez de un tamaño fijo, se arranca del tamaño base (el
  // 6cqw de siempre, ya calculado por el navegador) y se va reduciendo
  // de medio en medio punto mientras el texto no quepa en el hueco
  // disponible, hasta un mínimo legible. El hueco se mide a mano (alto
  // del contenedor del bocadillo menos el botón "+info", si lo hay) en
  // vez de leer el propio clientHeight del texto — con flex:1 ese
  // alto dependía del contenido y no daba un objetivo fijo de verdad.
  const currentText = conclusions[index]?.text ?? conclusions[0]?.text
  useEffect(() => {
    const el = textRef.current
    const bubble = bubbleRef.current
    if (!el || !bubble) return
    el.style.fontSize = ''
    const infoHeight = infoRef.current ? infoRef.current.offsetHeight + 2 : 0
    const available = bubble.clientHeight - infoHeight
    let size = parseFloat(window.getComputedStyle(el).fontSize)
    const minSize = 9
    while (el.scrollHeight > available && size > minSize) {
      size -= 0.5
      el.style.fontSize = `${size}px`
    }
  }, [currentText])

  if (conclusions.length === 0) return null
  const current = conclusions[index] ?? conclusions[0]

  function go(delta: number) {
    setIndex((i) => (i + delta + conclusions.length) % conclusions.length)
  }

  function handleTouchStart(e: ReactTouchEvent) {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e: ReactTouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || conclusions.length < 2) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
  }

  return (
    <div className="pepa-conclusion-banner">
      <div
        className="pepa-conclusion-note"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="group"
        aria-label="Conclusión de Pepa"
      >
        <img src={pepaConclusionsImg} alt="" className="pepa-conclusion-note-img" />
        <div ref={bubbleRef} className="pepa-conclusion-bubble-content">
          <p ref={textRef} className="pepa-conclusion-note-text">
            {current.text}
          </p>
          {current.filter && (
            <button
              ref={infoRef}
              type="button"
              className="link-button pepa-conclusion-info"
              onClick={(e) => {
                e.stopPropagation()
                onViewMovements(current.filter!)
              }}
            >
              +info →
            </button>
          )}
        </div>
        {conclusions.length > 1 && (
          <div className="home-photo-banner-dots pepa-conclusion-dots">
            {conclusions.map((_, i) => (
              <span key={i} className={'home-photo-banner-dot' + (i === index ? ' home-photo-banner-dot-active' : '')} />
            ))}
          </div>
        )}
      </div>
      {/* Petición real: "no solo queríamos dar datos, sino también
          ayudar a los usuarios a comprender lo que significan esos
          datos... no cabe en el bocadillo, ¿ves alguna forma de
          añadirlo aunque fuese en otra ventana debajo de la imagen?" —
          y matiz siguiente: "no todas las secciones lo necesitan... pero
          cuando se puede aclarar algo más se debería hacer". Solo se
          muestra cuando la conclusión actual tiene `kind` (las que se
          apoyan en un criterio propio de la app, no un dato suelto). */}
      {current.kind && (
        <div className="card pepa-conclusion-explain">
          <p style={{ margin: 0 }}>
            💡 {CONCLUSION_EXPLANATIONS[current.kind]}
          </p>
        </div>
      )}
    </div>
  )
}

interface BreakdownSlice {
  key: string
  label: string
  icon?: string
  color?: string
  total: number
  count: number
  hasChildren?: boolean
}

const PASTEL_DONUT_FALLBACK = pastelPalette(10, getChartColorTheme())
const DONUT_COLORS = ['#4C6EF5', '#e8590c', '#2f9e44', '#ae3ec9', '#f08c00', '#1098ad', '#e64980', '#748ffc', '#20c997', '#fa5252']

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// Recorte de anillo (donut) entre dos ángulos — el rodaja real que se
// toca, no una fila de texto aparte.
function donutSlicePath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number): string {
  const clampedEnd = Math.min(endAngle, startAngle + 359.99) // círculo completo (1 sola porción) es un caso degenerado en SVG
  const startOuter = polarToCartesian(cx, cy, rOuter, clampedEnd)
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle)
  const startInner = polarToCartesian(cx, cy, rInner, clampedEnd)
  const endInner = polarToCartesian(cx, cy, rInner, startAngle)
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ')
}

// Dónut de verdad interactivo: cada porción es su propio <path> de SVG
// con su propio onClick — antes era un único div con conic-gradient
// (no se puede tocar una porción concreta, solo listar el texto
// debajo). Petición real, muy insistida: "cuando lo toque [el dónut]
// que se ponga otro subdónut al lado con la categoría que ha
// tocado... en el dónut, no en la lista" — se aplica igual a todos los
// dónuts de la app (categorías, etiquetas, Debo/Necesito/Quiero,
// Fijo/variable, reparto por tienda), sin ninguna lista aparte debajo.
function SvgDonut({
  slices,
  centerLabel,
  highlightedKey,
  onSliceClick,
  size = 190,
  colors = PASTEL_DONUT_FALLBACK,
}: {
  slices: { key: string; total: number; color?: string; label?: string }[]
  centerLabel: { name: string; total: number }
  highlightedKey: string | null
  onSliceClick: (key: string) => void
  size?: number
  colors?: string[]
}) {
  if (slices.length === 0) {
    return <p className="muted">No hay movimientos en este periodo para esta vista.</p>
  }
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2
  const rInner = rOuter * 0.52
  const grandTotal = slices.reduce((s, x) => s + x.total, 0)
  let cumulative = 0
  // Petición real: "dentro del dónut, como hasta ahora, la categoría
  // que hemos elegido... pero la leyenda me la pone debajo a lo que
  // pertenece cada color, aplícalo a todos los dónuts" — un intento
  // anterior (icono dentro de la porción) "se quedaba mal"; en vez de
  // eso, el centro del dónut se queda igual (nombre + importe de la
  // porción tocada) y debajo se añade una leyenda de color → nombre,
  // solo informativa (no se toca, seguimos sin listas que controlen el
  // dónut — solo se explica qué es cada color).
  const legendEntries = slices
    .map((s, i) => ({ key: s.key, label: s.label ?? s.key, color: s.color ?? colors[i % colors.length], total: s.total }))
    .filter((s) => s.total > 0)

  return (
    <div className="donut-ring-wrap">
      {/* Petición real: "quiero que todos los puntos estén en el lado
          izquierdo" — la leyenda va ANTES del anillo en el propio DOM
          (no solo con CSS) para que quede a la izquierda sin más
          trucos de orden visual. */}
      <div className="donut-legend">
        {legendEntries.map((s) => (
          <span key={s.key} className="donut-legend-item">
            <span className="donut-legend-dot" style={{ background: s.color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="donut-ring" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
          {slices.map((s, i) => {
            const pct = grandTotal > 0 ? (s.total / grandTotal) * 360 : 0
            if (pct <= 0) return null
            const start = cumulative
            cumulative += pct
            // Petición real: "no quiero que las otras partes
            // desaparezcan, quiero que se quede el color como más
            // apagado, que se vea que no está activo" — antes la
            // porción no tocada se sustituía por un gris plano (perdía
            // del todo su color); ahora conserva su propio color
            // siempre, solo baja la opacidad si hay otra activa.
            const dimmed = highlightedKey != null && highlightedKey !== s.key
            // Petición real: "los colores de los demás gastos no deben
            // ponerse gris, sino aclararse para que se siga viendo las
            // proporciones" — 0.3 se veía casi gris con muchos colores
            // ya de por sí pálidos; 0.45 aclara pero conserva el matiz.
            return (
              <path
                key={s.key}
                d={donutSlicePath(cx, cy, rOuter, rInner, start, start + pct)}
                fill={s.color ?? colors[i % colors.length]}
                stroke="#fff"
                strokeWidth={1}
                fillOpacity={dimmed ? 0.45 : 1}
                onClick={() => onSliceClick(s.key)}
                style={{ cursor: 'pointer' }}
              />
            )
          })}
        </svg>
        <div className="donut-ring-center">
          <span>{centerLabel.name}</span>
          <strong>
            {centerLabel.total.toFixed(2)} €
            {/* Petición real: "en todas las estadísticas de dónut quiero
                que pongas en paréntesis el porcentaje al que corresponde
                el importe" — solo tiene sentido para una porción tocada,
                no para "Todo" (siempre sería 100%). */}
            {highlightedKey != null && grandTotal > 0 && ` (${((centerLabel.total / grandTotal) * 100).toFixed(0)}%)`}
          </strong>
        </div>
      </div>
    </div>
  )
}

// Petición real: "una vez elegida una sección ya no consigo que vuelva
// a su vista general... ¿no puedes hacer que si tocamos fuera del
// dónut vuelva a su estado original?" — además del botón explícito
// "✕ Ver todo" (más descubrible, y necesario en móvil donde no hay
// "fuera" mientras el dedo sigue en pantalla), tocar en cualquier otro
// sitio de la página también deselecciona, como un desplegable/popover
// cualquiera. Un solo listener en `document` (no uno por dónut) activo
// solo mientras haya algo seleccionado, para no gastar nada el resto
// del tiempo.
function useOutsideClickReset(active: boolean, onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const onOutsideRef = useRef(onOutside)
  onOutsideRef.current = onOutside
  useEffect(() => {
    if (!active) return
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutsideRef.current()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [active])
  return ref
}

// Un solo nivel (etiquetas, Debo/Necesito/Quiero, Fijo/variable) — antes
// tocar una porción llevaba DIRECTO a "Ver registros" saltando de
// pestaña sin avisar. Petición real: "al tocar un área del dónut no
// debe llevarme directamente a los movimientos filtrados, debe haber
// un botón que me diga el número de movimientos... y si pulso ese
// botón entonces se abren los movimientos filtrados" — tocar solo
// resalta/selecciona la porción; navegar es un paso aparte y explícito.
function BreakdownDonut({
  slices,
  centerLabel,
  onViewRecords,
}: {
  slices: BreakdownSlice[]
  centerLabel: { name: string; total: number }
  // Ausente cuando la porción no viene de gastos reales (p. ej. el
  // reparto por tipo de alimento, calculado a partir de precios por
  // producto — no hay un "movimiento" 1:1 que enseñar) — el conteo se
  // sigue viendo, solo sin el enlace.
  onViewRecords?: (key: string) => void
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = slices.find((s) => s.key === selectedKey)
  const containerRef = useOutsideClickReset(!!selected, () => setSelectedKey(null))

  return (
    <div ref={containerRef}>
      <SvgDonut
        slices={slices}
        centerLabel={selected ? { name: selected.label, total: selected.total } : centerLabel}
        highlightedKey={selectedKey}
        onSliceClick={(key) => setSelectedKey((prev) => (prev === key ? null : key))}
      />
      {selected && (
        <p className="muted" style={{ textAlign: 'center', marginTop: 4 }}>
          {selected.count} {selected.count === 1 ? 'movimiento' : 'movimientos'} en {selected.label}
          {onViewRecords && (
            <>
              {' — '}
              <button type="button" className="link-button" onClick={() => onViewRecords(selected.key)}>
                Ver movimientos →
              </button>
            </>
          )}
          {' — '}
          {/* Bug real reportado: "una vez elegida una sección ya no
              consigo que vuelva a su vista general" — tocar la MISMA
              porción otra vez también deselecciona (ver onSliceClick),
              pero no es nada descubrible; un botón explícito, como el
              "✕ Cerrar" que ya tiene el segundo dónut de
              CategoryDonutExplorer. */}
          <button type="button" className="link-button" onClick={() => setSelectedKey(null)}>
            ✕ Ver todo
          </button>
        </p>
      )}
    </div>
  )
}

// Skill de Pepa, punto 10: "Donut principal por categorías. Al
// seleccionar una categoría, segundo donut con subcategorías" —
// petición real: "si tocas una de las categorías [EN EL DÓNUT] se
// resalta y ves el importe de esa categoría y a la vez se abre un
// segundo dónut con el reparto de las subcategorías, al lado". Pero
// TAMBIÉN: "no quiero que el segundo dónut esté en una segunda
// página, quiero poder seguir viendo el primer dónut" (antes era un
// carrusel horizontal que se llevaba el primero fuera de la vista) y
// "al tocar un área no debe llevarme directamente a los movimientos,
// debe haber un botón". Ahora los dos anillos van apilados en
// vertical (el de arriba nunca desaparece) y tocar una porción solo
// selecciona — ver movimientos es un botón aparte, explícito.
// Color neutro del bucket «Pendiente de clasificar» en repartos: es un aviso, no una categoría (no sale de la paleta de categorías).
const PENDING_SLICE_COLOR = '#cfd4dc'
const PENDING_SLICE_KEY = 'pendiente-de-clasificar'

function CategoryDonutExplorer({
  categories,
  expenses,
  onViewRecords,
  onViewPending,
}: {
  categories: BudgetCategory[]
  expenses: Expense[]
  onViewRecords: (category: string | string[], label: string) => void
  // El bucket «Pendiente de clasificar» no es una categoría (no se busca en budget_categories): lleva al filtro Pendientes.
  onViewPending?: () => void
}) {
  const [selectedTopId, setSelectedTopId] = useState<string | null>(null)
  const [highlightTop, setHighlightTop] = useState<string | null>(null)
  const [highlightSub, setHighlightSub] = useState<string | null>(null)

  // Un color estable por categoría (no por posición en la lista de este
  // mes) — ver domain/finance.ts (categoryColors) para el porqué.
  const catColors = stableCategoryColors(categories)

  const topLevel = categories.filter((c) => !c.parentId)
  const categorySlices: BreakdownSlice[] = topLevel
    .map((c) => {
      const childNames = categories.filter((x) => x.parentId === c.id).map((x) => x.name)
      const matched = expenses.filter((e) => e.category === c.name || (e.category != null && childNames.includes(e.category)))
      return {
        key: c.id,
        label: c.name,
        icon: c.icon,
        color: pastelOf(catColors.get(c.id)),
        total: matched.reduce((s, e) => s + e.amount, 0),
        count: matched.length,
        hasChildren: childNames.length > 0,
      }
    })
    .filter((s) => s.total > 0)
  // Categorías reales + pendiente = gasto total aplicable. El pendiente va aparte, sin subcategorías ni drill-down por categoría.
  const pendingNow = pendingSpending(expenses)
  const pendingSlices: BreakdownSlice[] =
    pendingNow.count > 0 && pendingNow.amount > 0
      ? [{ key: PENDING_SLICE_KEY, label: PENDING_LABEL, icon: '⏳', color: PENDING_SLICE_COLOR, total: pendingNow.amount, count: pendingNow.count, hasChildren: false }]
      : []
  const topSlices: BreakdownSlice[] = [...categorySlices, ...pendingSlices]
  const topGrandTotal = topSlices.reduce((s, x) => s + x.total, 0)
  const highlightedTop = topSlices.find((s) => s.key === highlightTop)
  const topCenter = highlightedTop ? { name: highlightedTop.label, total: highlightedTop.total } : { name: 'Todo', total: topGrandTotal }

  const selectedTop = selectedTopId ? topLevel.find((c) => c.id === selectedTopId) : undefined
  const subSlices: BreakdownSlice[] = selectedTop
    ? categories
        .filter((c) => c.parentId === selectedTop.id)
        .map((c): BreakdownSlice => {
          const matched = expenses.filter((e) => e.category === c.name)
          return { key: c.id, label: c.name, icon: c.icon, color: pastelOf(catColors.get(c.id)), total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
        })
        .concat(
          (() => {
            const direct = expenses.filter((e) => e.category === selectedTop.name)
            return direct.length > 0
              ? [
                  {
                    key: `directo:${selectedTop.id}`,
                    label: '(sin subcategoría)',
                    color: pastelOf(catColors.get(selectedTop.id)),
                    total: direct.reduce((s, e) => s + e.amount, 0),
                    count: direct.length,
                  } as BreakdownSlice,
                ]
              : []
          })(),
        )
        .filter((s) => s.total > 0)
    : []
  const subGrandTotal = subSlices.reduce((s, x) => s + x.total, 0)
  const highlightedSub = subSlices.find((s) => s.key === highlightSub)
  const subCenter = highlightedSub ? { name: highlightedSub.label, total: highlightedSub.total } : { name: 'Todo', total: subGrandTotal }

  function resetTop() {
    setHighlightTop(null)
    setSelectedTopId(null)
    setHighlightSub(null)
  }

  function selectTop(key: string) {
    if (key === highlightTop) {
      // Segundo toque en la misma porción: la deselecciona y cierra el subdónut.
      resetTop()
      return
    }
    setHighlightTop(key)
    setHighlightSub(null)
    const slice = topSlices.find((s) => s.key === key)
    setSelectedTopId(slice?.hasChildren ? key : null)
  }

  const containerRef = useOutsideClickReset(!!highlightTop, resetTop)

  function selectSub(key: string) {
    setHighlightSub((prev) => (prev === key ? null : key))
  }

  function closeSub() {
    setSelectedTopId(null)
    setHighlightSub(null)
  }

  if (topSlices.length === 0) {
    return <p className="muted">No hay movimientos en este periodo para esta vista.</p>
  }

  return (
    <div className="donut-explorer" ref={containerRef}>
      <SvgDonut slices={topSlices} centerLabel={topCenter} highlightedKey={highlightTop} onSliceClick={selectTop} />
      {highlightedTop && (
        <p className="muted" style={{ textAlign: 'center', marginTop: 4 }}>
          {highlightedTop.count} {highlightedTop.count === 1 ? 'movimiento' : 'movimientos'} en {highlightedTop.label}
          {' — '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              // Una categoría con hijas casi nunca tiene gastos con su
              // propio nombre exacto — hay que incluir toda la familia
              // (padre + subcategorías), si no "Ver movimientos" enseña
              // 0 registros aunque el dónut sí sume su importe.
              if (highlightedTop.key === PENDING_SLICE_KEY) {
                onViewPending?.()
              } else if (highlightedTop.hasChildren) {
                const childNames = categories.filter((c) => c.parentId === highlightedTop.key).map((c) => c.name)
                onViewRecords([highlightedTop.label, ...childNames], highlightedTop.label)
              } else {
                onViewRecords(highlightedTop.label, highlightedTop.label)
              }
            }}
          >
            Ver movimientos →
          </button>
          {' — '}
          {/* Mismo bug real que en BreakdownDonut: "una vez elegida una
              sección ya no consigo que vuelva a su vista general" —
              botón explícito además del toque fuera (useOutsideClickReset,
              ver resetTop) y de tocar otra vez la misma porción. */}
          <button type="button" className="link-button" onClick={resetTop}>
            ✕ Ver todo
          </button>
        </p>
      )}
      {selectedTop && (
        <div className="donut-subsection">
          <div className="inline-fields" style={{ justifyContent: 'center' }}>
            <strong>Subcategorías de {selectedTop.name}</strong>
            <button type="button" className="link-button" onClick={closeSub}>
              ✕ Cerrar
            </button>
          </div>
          <SvgDonut slices={subSlices} centerLabel={subCenter} highlightedKey={highlightSub} onSliceClick={selectSub} />
          {highlightedSub && (
            <p className="muted" style={{ textAlign: 'center', marginTop: 4 }}>
              {highlightedSub.count} {highlightedSub.count === 1 ? 'movimiento' : 'movimientos'} en {highlightedSub.label}
              {' — '}
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  onViewRecords(
                    highlightedSub.key.startsWith('directo:') ? selectedTop.name : highlightedSub.label,
                    highlightedSub.label,
                  )
                }
              >
                Ver movimientos →
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function EstadisticasTab({ onViewMovements }: { onViewMovements: (f: MovementsFilter) => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  // Petición real: "no me gusta que no cuadren Alimentación en Economía
  // y en Compras... es por los productos no alimenticios que se compran
  // en supermercados" — sin tocar la taxonomía de categorías (ver
  // opinión: el desajuste es correcto, mide dos niveles distintos),
  // solo se explica: cuánto del total "Alimentación" de este dónut es
  // en realidad producto no-alimenticio según sus tickets, calculado
  // igual que en Estadística compras (ver BudgetsTab).
  const [allPrices, setAllPrices] = useState<ProductPrice[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [allReceipts, setAllReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  const [view, setView] = useState<'categorias' | 'etiquetas' | 'dnq' | 'fijo'>('categorias')
  const [monthStartDay, setMonthStartDay] = useState(1)

  useEffect(() => {
    Promise.all([
      listExpenses(),
      listBudgetCategories(),
      listTags(),
      listAllProductPrices(),
      listProducts(),
      listReceipts(),
      getFinanceMonthStartDay(),
    ])
      .then(([e, c, t, prices, products, receipts, monthStart]) => {
        setExpenses(e)
        setCategories(c)
        setTags(t)
        setMonthStartDay(monthStart)
        setAllPrices(prices)
        setAllProducts(products)
        setAllReceipts(receipts)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="muted">Cargando estadísticas…</p>

  const [from, to] = rangeForPreset(preset, customFrom, customTo, monthStartDay)
  // Fase 1F.G — fecha visible en español (DD/MM/YYYY), nunca ISO crudo; from/to en sí siguen en ISO
  // para el filtrado y para MovementsFilter, solo cambia cómo se enseña aquí.
  const periodLabel = `${PRESET_LABELS[preset]} (${formatSpanishDate(from)} a ${formatSpanishDate(to)})`
  // Un traspaso entre cuentas propias de la familia no es gasto real
  // (ver mismo cambio en Resumen y Presupuesto Generales) — se excluye
  // aquí también para que categorías, etiquetas, D/N/Q y Fijo/Variable
  // no lo cuenten.
  const real = expenses.filter(
    (e) => e.kind === 'real' && !e.isIncome && !isInternalTransferCategory(e.category, categories) && e.expenseDate >= from && e.expenseDate <= to,
  )
  const totalReal = real.reduce((s, e) => s + e.amount, 0)

  // Cuánto del total "Alimentación" de este periodo es, según sus
  // propios tickets, producto NO alimenticio (mismo criterio que
  // Estadística compras: nonFood del producto, o Amazon fuera de
  // Alimentación) — solo para explicar por qué esta cifra no cuadra con
  // el "🛒 Alimentación" de Compras, sin tener que fusionar categorías.
  const alimentacionNonFoodReceiptIds = buildFoodReceiptIds(allReceipts, categories)
  const { nonFoodProductIds: alimentacionNonFoodProductIds, foodProductIds: alimentacionFoodProductIds } = buildProductKindSets(allProducts)
  const receiptByExpenseId = new Map(allReceipts.filter((r) => r.expenseId).map((r) => [r.expenseId as string, r]))
  const alimentacionHiddenNonFood = real
    .filter((e) => isFoodCategory(e.category, categories))
    .reduce((sum, e) => {
      const receipt = receiptByExpenseId.get(e.id)
      if (!receipt) return sum
      const nonFoodTotal = allPrices
        // Solo lo que se SABE que no es comida: un producto sin clasificar (desconocido) no se da por «no alimenticio».
        .filter((p) => p.receiptId === receipt.id && purchaseNature(p, alimentacionNonFoodReceiptIds, alimentacionNonFoodProductIds, alimentacionFoodProductIds) === 'no_alimentos')
        .reduce((s, p) => {
          const qty = Number(p.quantity)
          return s + p.price * (Number.isFinite(qty) && qty > 0 ? qty : 1)
        }, 0)
      return sum + nonFoodTotal
    }, 0)

  function viewFor(extra: Partial<MovementsFilter>, label: string) {
    onViewMovements({ label, from, to, isIncome: false, ...extra })
  }

  let body: JSX.Element
  if (view === 'categorias') {
    body = (
      <CategoryDonutExplorer
        categories={categories}
        expenses={real}
        onViewRecords={(cat, label) =>
          viewFor(Array.isArray(cat) ? { categoryGroup: cat } : { category: cat }, `${label} — ${periodLabel}`)
        }
        onViewPending={() => viewFor({ pendingOnly: true }, `${PENDING_LABEL} — ${periodLabel}`)}
      />
    )
  } else if (view === 'etiquetas') {
    const slices: BreakdownSlice[] = tags
      .map((t) => {
        const matched = real.filter((e) => e.tagId === t.id)
        return { key: t.id, label: t.name, icon: '🏷️', color: toPastel(t.color, 'chart'), total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
      })
      .filter((s) => s.total > 0)
    body =
      tags.length === 0 ? (
        <p className="muted">Todavía no hay etiquetas — puedes crear la primera desde el botón flotante de Movimientos.</p>
      ) : (
        <BreakdownDonut
          slices={slices}
          centerLabel={{ name: 'Todo', total: slices.reduce((s, x) => s + x.total, 0) }}
          onViewRecords={(key) => viewFor({ tagId: key }, `Etiqueta — ${periodLabel}`)}
        />
      )
  } else if (view === 'dnq') {
    const groups: { key: 'debo' | 'necesito' | 'quiero' | 'sin_clasificar'; label: string }[] = [
      { key: 'debo', label: 'Debo' },
      { key: 'necesito', label: 'Necesito' },
      { key: 'quiero', label: 'Quiero' },
      { key: 'sin_clasificar', label: 'Sin clasificar' },
    ]
    const necessityByExpense = new Map(real.map((e) => [e.id, resolveCategoryClassification(e.category, categories).necessity]))
    const slices: BreakdownSlice[] = groups
      .map((g) => {
        const matched = real.filter((e) => (g.key === 'sin_clasificar' ? !necessityByExpense.get(e.id) : necessityByExpense.get(e.id) === g.key))
        return { key: g.key, label: g.label, color: NECESSITY_PASTEL[g.key], total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
      })
      .filter((s) => s.total > 0)
    body = (
      <BreakdownDonut
        slices={slices}
        centerLabel={{ name: 'Todo', total: totalReal }}
        onViewRecords={(key) =>
          key === 'sin_clasificar'
            ? viewFor({ necessityUnclassified: true }, `Sin clasificar — ${periodLabel}`)
            : viewFor({ necessity: key as 'debo' | 'necesito' | 'quiero' }, `${NECESSITY_LABELS[key as 'debo' | 'necesito' | 'quiero']} — ${periodLabel}`)
        }
      />
    )
  } else {
    const groups: { key: 'fijo' | 'variable' | 'sin_clasificar'; label: string }[] = [
      { key: 'fijo', label: 'Fijo' },
      { key: 'variable', label: 'Variable' },
      { key: 'sin_clasificar', label: 'Sin clasificar' },
    ]
    const isFixedByExpense = new Map(real.map((e) => [e.id, resolveCategoryClassification(e.category, categories).isFixed]))
    const slices: BreakdownSlice[] = groups
      .map((g) => {
        const matched = real.filter((e) =>
          g.key === 'sin_clasificar' ? isFixedByExpense.get(e.id) == null : isFixedByExpense.get(e.id) === (g.key === 'fijo'),
        )
        return { key: g.key, label: g.label, color: FIXED_PASTEL[g.key], total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
      })
      .filter((s) => s.total > 0)
    body = (
      <BreakdownDonut
        slices={slices}
        centerLabel={{ name: 'Todo', total: totalReal }}
        onViewRecords={(key) =>
          key === 'sin_clasificar'
            ? viewFor({ isFixedUnclassified: true }, `Sin clasificar — ${periodLabel}`)
            : viewFor({ isFixed: key === 'fijo' }, `${key === 'fijo' ? 'Fijo' : 'Variable'} — ${periodLabel}`)
        }
      />
    )
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <DateFilterTab
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {/* Skill de Pepa, punto 8: mismo selector, mismo periodo, mismo
          total general — solo cambia la dimensión de agrupación. */}
      <div className="filter-row" style={{ marginBottom: 8 }}>
        <button type="button" className={'chip' + (view === 'categorias' ? ' chip-active' : '')} onClick={() => setView('categorias')}>
          Categorías
        </button>
        <button type="button" className={'chip' + (view === 'etiquetas' ? ' chip-active' : '')} onClick={() => setView('etiquetas')}>
          Etiquetas
        </button>
        <button type="button" className={'chip' + (view === 'dnq' ? ' chip-active' : '')} onClick={() => setView('dnq')}>
          Debo/Necesito/Quiero
        </button>
        <button type="button" className={'chip' + (view === 'fijo' ? ' chip-active' : '')} onClick={() => setView('fijo')}>
          Fijo/variable
        </button>
      </div>

      <div className="card event-card">
        <strong>Gastos — {periodLabel}</strong>
        <p style={{ margin: '4px 0' }}>{totalReal.toFixed(2)} €</p>
        {body}
        {view === 'categorias' && alimentacionHiddenNonFood > 0.005 && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            ℹ️ {alimentacionHiddenNonFood.toFixed(2)} € de "Alimentación" son, según tus tickets, producto no
            alimenticio (p. ej. un champú comprado en el súper) — por eso no cuadra con el total de Compras →
            Estadística compras, que sí lo cuenta como "Otros".
          </p>
        )}
      </div>

      <PeriodComparison expenses={expenses} categories={categories} preset={preset} from={from} to={to} monthStartDay={monthStartDay} />

      <EvolucionTemporal expenses={expenses} categories={categories} monthStartDay={monthStartDay} preset={preset} onViewMovements={onViewMovements} />
    </div>
  )
}

// Fase 1F.C — "Comparado con el periodo anterior": compara el periodo elegido arriba con el mismo tipo
// de periodo inmediatamente anterior (mes contable vs mes contable anterior, mes natural vs mes natural
// anterior, nunca duraciones distintas), reutilizando comparablePrevious (financePeriod.ts) TAL CUAL —
// la misma aritmética de mes contable y la misma regla de corte por tramo cuando el periodo actual no ha
// terminado que ya usa la voz de Pepa — y groupSpending (financeCompute.ts) para el reparto por
// categoría con el mismo criterio padre/hija que ya usa el análisis "por qué ha cambiado" de Pepa.
function periodSpecForComparison(preset: SpendRangePreset, from: string, to: string): PeriodSpec {
  switch (preset) {
    case 'dia':
      return { t: 'day', offset: 0 }
    case 'semana':
      return { t: 'week', offset: 0 }
    case 'mes':
    case 'mes_real':
      return { t: 'month', offset: 0 }
    case 'año':
      return { t: 'year', offset: 0 }
    case 'rango':
    default:
      return { t: 'last_days', n: daysBetween(from, to) + 1 }
  }
}

interface CategoryDelta {
  name: string
  icon: string | null
  before: number
  after: number
  delta: number
  deltaPercent: number | null
  isNew: boolean
}

function PeriodComparison({
  expenses,
  categories,
  preset,
  from,
  to,
  monthStartDay,
}: {
  expenses: Expense[]
  categories: BudgetCategory[]
  preset: SpendRangePreset
  from: string
  to: string
  monthStartDay: number
}) {
  const today = new Date()
  const todayStr = toDateStr(today)
  const effectiveMonthStartDay = preset === 'mes_real' ? 1 : monthStartDay
  const currentPeriod: ResolvedPeriod = {
    spec: periodSpecForComparison(preset, from, to),
    from,
    to,
    label: '',
    ongoing: to > todayStr && from <= todayStr,
  }
  const cp = comparablePrevious(currentPeriod, today, effectiveMonthStartDay)

  // Mismo criterio que el donut de categorías de arriba: solo gasto real, nunca ingresos ni
  // movimientos internos entre cuentas propias de la familia — las devoluciones (is_income=true) ya
  // quedan fuera igual que en el resto de Estadísticas, sin neteo por categoría (mismo tratamiento que
  // ya tiene la vista de categorías).
  const isComparableSpend = (e: Expense) => e.kind === 'real' && !e.isIncome && !isInternalTransferCategory(e.category, categories)
  const currentRows = expenses.filter((e) => isComparableSpend(e) && e.expenseDate >= cp.current.from && e.expenseDate <= cp.current.to)
  const previousRows = expenses.filter((e) => isComparableSpend(e) && e.expenseDate >= cp.previous.from && e.expenseDate <= cp.previous.to)

  const financeData = { expenses, categories, receipts: [], prices: [], products: [], storeNames: [], monthStartDay } as unknown as FinanceData
  const beforeByName = new Map(groupSpending(previousRows, financeData).map((g) => [g.name, g.amount]))
  const afterByName = new Map(groupSpending(currentRows, financeData).map((g) => [g.name, g.amount]))
  const names = new Set([...beforeByName.keys(), ...afterByName.keys()])

  const deltas: CategoryDelta[] = [...names]
    .map((name) => {
      const before = beforeByName.get(name) ?? 0
      const after = afterByName.get(name) ?? 0
      const cat = categories.find((c) => c.name === name)
      return {
        name,
        icon: cat?.icon ?? null,
        before,
        after,
        delta: Math.round((after - before) * 100) / 100,
        deltaPercent: before > 0 ? Math.round(((after - before) / before) * 1000) / 10 : null,
        isNew: before === 0 && after > 0,
      }
    })
    // both=0 no debería poder pasar (solo se listan nombres con gasto en alguno de los dos lados), pero
    // se filtra por seguridad — nunca enseñar una categoría sin ningún gasto en ninguno de los periodos.
    .filter((d) => d.before > 0 || d.after > 0)

  const increases = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 4)
  const decreases = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 4)

  if (increases.length === 0 && decreases.length === 0) return null

  // Corrección post-certificación iPhone — el problema era de composición, no de cálculo: name+importes
  // compartían una sola fila con justify-content: space-between, así que en pantallas estrechas el bloque
  // de importes se quedaba con poco ancho y el navegador partía la línea donde encontraba hueco (a veces
  // justo entre el número y el "€"). Ahora el nombre va en su propia línea (puede ocupar 2 líneas sin
  // problema) y el bloque de importes usa todo el ancho de la tarjeta, con "antes → después" y el
  // delta/porcentaje como dos unidades que nunca se rompen por dentro (whiteSpace: nowrap) — si no caben
  // juntas, la que sobra baja entera a una segunda línea, nunca se parte un número de su "€".
  function row(d: CategoryDelta) {
    const deltaText = d.isNew
      ? 'Nuevo gasto en este periodo'
      : `${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(2)} € (${d.deltaPercent! >= 0 ? '+' : ''}${d.deltaPercent!.toFixed(0)}%)`
    return (
      <div key={d.name} style={{ margin: '8px 0' }}>
        <span>
          {d.icon ? `${d.icon} ` : ''}
          {d.name}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 2, marginTop: 2, fontSize: 13 }} className="muted">
          <span style={{ whiteSpace: 'nowrap' }}>
            {d.before.toFixed(2)} € → {d.after.toFixed(2)} €
          </span>
          <strong style={{ color: d.delta >= 0 ? '#b9770e' : '#1e8449', whiteSpace: d.isNew ? 'normal' : 'nowrap' }}>{deltaText}</strong>
        </div>
      </div>
    )
  }

  return (
    <div className="card event-card" style={{ marginTop: 12 }}>
      <strong>Comparado con el periodo anterior</strong>
      <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12 }}>
        {cp.previousLabel}
        {cp.cutoff ? ' (mismo tramo de días transcurridos, el periodo actual todavía no ha terminado)' : ''}
      </p>
      {increases.length > 0 && (
        <>
          <p style={{ margin: '8px 0 2px', fontWeight: 600 }}>📈 Has gastado más</p>
          {increases.map(row)}
        </>
      )}
      {decreases.length > 0 && (
        <>
          <p style={{ margin: '10px 0 2px', fontWeight: 600 }}>📉 Has gastado menos</p>
          {decreases.map(row)}
        </>
      )}
    </div>
  )
}

// Skill de Pepa, punto 13: ingresos/gastos/ahorro mes a mes, con acceso
// directo a los movimientos de cada mes. Petición real: "la evolución
// temporal debería ajustarse a la configuración del mes contable" — antes
// siempre usaba el mes de calendario (día 1 al último), sin importar el
// día de inicio elegido en Configuración.
// Corrección post-certificación iPhone — el criterio heredado del selector "📅 Fecha" de arriba no
// bastaba: con "Mes contable" seleccionado arriba, esta sección seguía enseñando SIEMPRE meses de
// calendario, sin ningún control propio para saber (o cambiar) qué periodización se está viendo. Ahora
// tiene su PROPIO selector explícito [Mes real] [Mes contable], independiente del selector general en
// cuanto se monta (arranca alineado con el de arriba, como valor inicial razonable, pero cambiarlo aquí
// no toca el selector general ni al revés) — reutiliza exactamente accountingMonthsBack/rangeForPreset
// (mismo día de corte configurado, mismas funciones de dateRanges.ts), nunca una segunda implementación.
function EvolucionTemporal({
  expenses,
  categories,
  monthStartDay,
  preset,
  onViewMovements,
}: {
  expenses: Expense[]
  categories: BudgetCategory[]
  monthStartDay: number
  preset: SpendRangePreset
  onViewMovements: (f: MovementsFilter) => void
}) {
  const [mode, setMode] = useState<'real' | 'contable'>(preset === 'mes_real' ? 'real' : 'contable')
  const effectiveMonthStartDay = mode === 'real' ? 1 : monthStartDay
  const months = useMemo(() => {
    return accountingMonthsBack(6, effectiveMonthStartDay).map((p) => ({
      key: `${p.monthLabelYear}-${String(p.monthLabelMonth0 + 1).padStart(2, '0')}`,
      label: `${MONTH_LABELS[p.monthLabelMonth0]} ${p.monthLabelYear}`,
      from: p.from,
      to: p.to,
    }))
  }, [effectiveMonthStartDay])

  // Corrección — mismo criterio que Resumen, vía la MISMA función (computePeriodFinancials,
  // financeCompute.ts) en vez de una fórmula paralela: antes "spent" aquí no excluía los traspasos
  // internos (Transferencias entre cuentas propias, Cobro anulado), así que sumaba de más frente a
  // Resumen para el mismo periodo — ahora es imposible que vuelvan a desincronizarse.
  const rows = months.map((m) => {
    const inMonth = expenses.filter((e) => e.expenseDate >= m.from && e.expenseDate <= m.to)
    const { income, spent, ahorro } = computePeriodFinancials(inMonth, categories)
    return { ...m, income, spent, ahorro, count: inMonth.filter((e) => e.kind === 'real').length }
  })
  const maxAmount = Math.max(1, ...rows.map((r) => Math.max(r.income, r.spent)))

  return (
    <div className="card event-card">
      <strong>Evolución temporal — últimos 6 meses</strong>
      <div className="filter-row" style={{ marginTop: 6, marginBottom: 2 }}>
        <button type="button" className={'chip' + (mode === 'real' ? ' chip-active' : '')} onClick={() => setMode('real')}>
          Mes real
        </button>
        <button type="button" className={'chip' + (mode === 'contable' ? ' chip-active' : '')} onClick={() => setMode('contable')}>
          Mes contable
        </button>
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <div key={r.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>
                {r.label}
                {mode === 'contable' && (
                  <span className="muted" style={{ fontSize: 11 }}>
                    {' '}
                    ({formatSpanishDate(r.from)} – {formatSpanishDate(r.to)})
                  </span>
                )}
              </span>
              <span className={r.ahorro >= 0 ? 'muted' : 'error'}>{r.ahorro >= 0 ? 'Ahorro' : 'Balance'}: {r.ahorro.toFixed(2)} €</span>
            </div>
            <div style={{ display: 'flex', height: 8, gap: 2, marginTop: 3 }}>
              <div style={{ width: `${(r.income / maxAmount) * 100}%`, background: tone(140, 50, 72, 'chart'), borderRadius: 3 }} />
            </div>
            <div style={{ display: 'flex', height: 8, gap: 2, marginTop: 2 }}>
              <div style={{ width: `${(r.spent / maxAmount) * 100}%`, background: tone(340, 75, 82, 'chart'), borderRadius: 3 }} />
            </div>
            <button
              type="button"
              className="link-button"
              style={{ fontSize: 12 }}
              onClick={() => onViewMovements({ label: `Movimientos — ${r.label}`, from: r.from, to: r.to })}
            >
              +{r.income.toFixed(2)} € / -{r.spent.toFixed(2)} € · {r.count} {r.count === 1 ? 'registro' : 'registros'} · Ver →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Gastos (Skill 17/18)
// ---------------------------------------------------------------------

// Gastos es ahora el ÚNICO sitio de la app para ver y categorizar
// cualquier movimiento, y el único con el botón flotante para crear
// categorías y apuntar gastos (petición real: "en Gastos solo debería
// haber una lista de los gastos, al estilo de los productos, cada uno
// en una línea estrecha, ordenados por fecha y donde se puedan
// categorizar... traslado el botón flotante de Presupuesto General a
// Gastos"). Presupuesto Generales y Registro Alimentación pasan a leer
// de esta misma lista, sin su propio sitio para crearlos.
function ExpensesTab({
  filter,
  onClearFilter,
  previousTabLabel,
  onBack,
  accountsMode = 'compartido',
  myMemberId = null,
  onOpenNewMovement,
}: {
  filter?: MovementsFilter | null
  onClearFilter?: () => void
  previousTabLabel?: string | null
  onBack?: () => void
  accountsMode?: AccountsMode
  myMemberId?: string | null
  // Fase 1E.2 — "Nuevo movimiento" deja de ser una entrada del menú ☰ de Economía y pasa a vivir aquí,
  // en la pantalla a la que de verdad pertenece. Reutiliza EXACTAMENTE el mismo NewMovementModal/
  // AddExpenseToAnyCategoryInline de siempre (estado en el FinanceScreen padre) — nunca un formulario
  // ni un flujo nuevo.
  onOpenNewMovement?: () => void
}) {
  // Piso compartido — solo tiene sentido elegir Individual/Común en modo
  // Separado; en Compartido no hay nada que separar (todo es una sola
  // lista, como siempre).
  const [scope, setScope] = useState<'personal' | 'comun'>('personal')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Petición real: "aquí no veo los símbolos de las cuentas" — mismo
  // símbolo por fila que ya tenía Banco al mezclar todas las cuentas
  // (ownerMemberForExpense ahí), para saber a qué cuenta fue cada
  // movimiento sin tener que ir a mirarlo aparte.
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [expenseAccountId, setExpenseAccountId] = useState<Map<string, string>>(new Map())
  // Fase 1D-g.2 — "🔮 Añadir a Previsión": reutiliza el MISMO listado de movimientos bancarios que ya
  // se pedía aquí para expenseAccountId (antes se descartaba el resto), para buscar hermanos históricos
  // del movimiento seleccionado sin una petición de red aparte.
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([])
  const [forecastPrefill, setForecastPrefill] = useState<ForecastPaymentPrefill | null>(null)
  const [showForecastForm, setShowForecastForm] = useState(false)
  const [forecastDuplicateWarning, setForecastDuplicateWarning] = useState<{ message: string; prefill: ForecastPaymentPrefill } | null>(null)
  const [forecastBusyExpenseId, setForecastBusyExpenseId] = useState<string | null>(null)
  const [forecastError, setForecastError] = useState<string | null>(null)
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const movementColorMode = useMovementColorMode()
  const catColors = stableCategoryColors(categories)
  // Petición real: "quiero que quites el filtro mensual... y pongas
  // los mismos filtros temporales desplegables que en el resto de
  // Economía en el mismo sitio" — mismo componente (DateFilterTab,
  // Hoy/Esta semana/Mes contable/Mes real/Este año/Rango) que ya usan
  // Resumen, Estadísticas, Banco y Presupuesto Generales, en vez de la
  // navegación ‹ Mes › propia de esta pantalla. Se ignora mientras haya
  // un `filter` activo (viene de "Ver X registros →" en Estadísticas).
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  const [monthStartDay, setMonthStartDay] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Petición real: "para Piso compartido/cuentas separadas primero hay
  // que dejar Movimientos preparado... ponle los mismos filtros que a
  // Bancos (todos, gastos fijos, gastos variables, ingresos)" — mismo
  // chip row y mismo criterio que ya usa BankTab.
  const [typeFilter, setTypeFilter] = useState<'todos' | 'fijos' | 'variables' | 'ingresos' | 'devoluciones' | 'categoria' | 'busqueda' | 'pendientes'>('todos')
  const [categoryFilterValue, setCategoryFilterValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  // Base para "Piso compartido/cuentas separadas": poder ver solo la
  // cuenta de uno (o la común), no todas mezcladas — mismo dato
  // (expenseAccountId) que ya usa el avatar de cada fila, ahora también
  // como filtro. null = todas las cuentas.
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  // Igual que las categorías sugeridas de Presupuesto Generales: se dan
  // de alta solas la primera vez, sin pedirlo — petición real: "los
  // ingresos también se deberían poder categorizar, como sueldo,
  // regalo, ingreso".
  const seededIncomeRef = useRef(false)

  // Petición real: "cada vez que edito un movimiento me devuelve al
  // inicio de la página" — ver mismo arreglo en la pestaña Banco.
  const hasLoadedOnceRef = useRef(false)

  function reload() {
    if (!hasLoadedOnceRef.current) setLoading(true)
    Promise.all([
      listExpenses(),
      listBudgetCategories(),
      listTags(),
      getFinanceMonthStartDay(),
      listBankAccounts(),
      listBankTransactions(),
      listFamilyMembers(),
    ])
      .then(async ([e, c, t, monthStart, acc, bankTx, m]) => {
        if (!seededIncomeRef.current && !c.some((cat) => cat.budgetGroup === 'ingresos')) {
          seededIncomeRef.current = true
          await createBudgetCategoriesBulk(INCOME_CATEGORY_SEED.map((s) => ({ ...s, budgetGroup: 'ingresos' })))
          c = await listBudgetCategories()
        }
        setExpenses(e)
        setCategories(c)
        setTags(t)
        setMonthStartDay(monthStart)
        setAccounts(acc)
        setMembers(m)
        setExpenseAccountId(new Map(bankTx.filter((bt) => bt.matchedExpenseId).map((bt) => [bt.matchedExpenseId as string, bt.accountId])))
        setBankTransactions(bankTx)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        hasLoadedOnceRef.current = true
        setLoading(false)
      })
  }

  useEffect(reload, [])

  // Fase 1D-g.2 — "🔮 Añadir a Previsión": identidad IDÉNTICA a la que usa el detector automático
  // (account_id + normalizeMerchantKey(description) + currency, nunca solo palabras compartidas), y
  // EXACTAMENTE el mismo motor (detectRecurrenceCandidates) — nunca un segundo detector. matchedExpenseIds
  // y los pagos previstos existentes se cargan aquí, bajo demanda, para no pedirlos en cada carga de
  // Movimientos cuando nadie va a usar este botón.
  async function handleAddToForecast(expense: Expense) {
    setForecastError(null)
    const bankAccountId = expenseAccountId.get(expense.id)
    const bt = bankTransactions.find((t) => t.matchedExpenseId === expense.id)
    if (!bankAccountId || !bt || !bt.description) return
    setForecastBusyExpenseId(expense.id)
    try {
      const merchantKey = normalizeMerchantKey(bt.description)
      const categoryByExpenseId = new Map(expenses.map((e) => [e.id, e.category]))
      const movements: BankMovementForDetection[] = bankTransactions
        .filter(
          (t): t is BankTransaction & { transactionDate: string } =>
            t.accountId === bankAccountId &&
            t.creditDebit === 'DBIT' &&
            t.currency === bt.currency &&
            t.transactionDate != null &&
            !!t.description &&
            normalizeMerchantKey(t.description) === merchantKey,
        )
        .map((t) => ({
          bankTransactionId: t.id,
          expenseId: t.matchedExpenseId,
          accountId: t.accountId,
          date: t.transactionDate,
          amount: Math.abs(t.amount),
          currency: t.currency,
          description: t.description,
          isIncome: false,
          category: t.matchedExpenseId ? (categoryByExpenseId.get(t.matchedExpenseId) ?? null) : null,
        }))
      const [candidate] = detectRecurrenceCandidates(movements, today)
      const prefill = candidate
        ? buildForecastPrefillFromCandidate(candidate)
        : { ...buildMinimalForecastPrefillFromMovement(bt, expense.category), bankAccountId }
      const candidateLike = candidate ?? { accountId: bankAccountId, displayName: bt.description, occurrences: [{ expenseId: expense.id }] }
      const [matchedExpenseIds, forecastPayments] = await Promise.all([listAllMatchedForecastExpenseIds(), listForecastPayments()])
      const existingPayments: ForecastPaymentForDedup[] = forecastPayments.map((p) => ({ title: p.title, provider: p.provider, bankAccountId: p.bankAccountId, active: p.active }))
      const warning = findDuplicateForecastWarning(candidateLike, matchedExpenseIds, existingPayments)
      if (warning) setForecastDuplicateWarning({ message: warning, prefill })
      else {
        setForecastPrefill(prefill)
        setShowForecastForm(true)
      }
    } catch (err) {
      setForecastError(errorMessage(err, 'No se pudo analizar el histórico de este movimiento'))
    } finally {
      setForecastBusyExpenseId(null)
    }
  }

  const [periodFrom, periodTo] = rangeForPreset(preset, customFrom, customTo, monthStartDay)

  // Skill de Pepa, punto 24: el filtro que llega de "Ver X registros →"
  // manda sobre la navegación por mes normal — mismos criterios que
  // produjeron la cifra, ni uno más ni uno menos.
  const filteredExpenses = useMemo(() => {
    if (!filter) return expenses.filter((e) => e.expenseDate >= periodFrom && e.expenseDate <= periodTo)
    return expenses.filter((e) => {
      if (filter.from && e.expenseDate < filter.from) return false
      if (filter.to && e.expenseDate > filter.to) return false
      if (filter.category !== undefined && e.category !== filter.category) return false
      if (filter.categoryGroup !== undefined && (e.category == null || !filter.categoryGroup.includes(e.category))) return false
      if (filter.expenseIds !== undefined && !filter.expenseIds.includes(e.id)) return false
      if (filter.pendingOnly && !isPendingSpendingRow(e)) return false
      if (filter.refundsOnly && !isRefund(e, categories)) return false
      if (filter.store !== undefined && e.store !== filter.store) return false
      if (filter.tagId !== undefined && e.tagId !== filter.tagId) return false
      if (filter.necessity !== undefined || filter.necessityUnclassified || filter.isFixed !== undefined || filter.isFixedUnclassified) {
        const classification = resolveCategoryClassification(e.category, categories)
        if (filter.necessity !== undefined && classification.necessity !== filter.necessity) return false
        if (filter.necessityUnclassified && classification.necessity != null) return false
        if (filter.isFixed !== undefined && classification.isFixed !== filter.isFixed) return false
        if (filter.isFixedUnclassified && classification.isFixed != null) return false
      }
      // Un traspaso entre cuentas propias no cuenta ni como Ingreso ni
      // como Gasto (ver Resumen/Estadísticas/Presupuesto Generales) —
      // se excluye aquí también para que "Ver registros →" sume
      // exactamente la misma cifra que se tocó para llegar aquí.
      if (filter.isIncome !== undefined && isInternalTransferCategory(e.category, categories)) return false
      // FASE 6D.3 — una devolución tampoco cuenta como Ingreso (isRealIncome ya la excluye); sí sigue contando en "Todos".
      if (filter.isIncome === true && isRefund(e, categories)) return false
      if (filter.isIncome !== undefined && e.isIncome !== filter.isIncome) return false
      return true
    })
    // `categories` faltaba en las dependencias (lo cantó el linter al
    // activarlo): reclasificar una categoría no refrescaba un filtro por
    // Debo/Necesito/Quiero o Fijo/Variable hasta que cambiaban los gastos.
  }, [expenses, filter, periodFrom, periodTo, categories])

  const monthExpenses = filteredExpenses

  // Piso compartido: en modo Separado, RLS ya solo entrega lo tuyo + lo
  // compartido — aquí solo falta partir eso en dos vistas (Individual /
  // Común). En modo Compartido no hay nada que partir, todo es Individual.
  const scopeFilteredExpenses = useMemo(
    () => (accountsMode === 'separado' ? monthExpenses.filter((e) => (scope === 'comun' ? e.shared : !e.shared)) : monthExpenses),
    [monthExpenses, accountsMode, scope],
  )

  // Base para "cuentas separadas": si hay una cuenta elegida, todo lo
  // demás (cabecera, filtro de tipo, lista) se calcula solo sobre ESA
  // cuenta — mismo patrón que activeAccountId en BankTab.
  const accountFilteredExpenses = useMemo(
    () => (activeAccountId ? scopeFilteredExpenses.filter((e) => expenseAccountId.get(e.id) === activeAccountId) : scopeFilteredExpenses),
    [scopeFilteredExpenses, activeAccountId, expenseAccountId],
  )

  // Bug real: "en Movimientos salen 4349,63€ de ingresos, pero en
  // Presupuesto/Resumen 4241,63€" — esta cabecera sumaba TODO
  // (traspasos entre cuentas propias incluidos) sin filtro activo,
  // mientras que en el resto de la app un traspaso no cuenta ni como
  // Ingreso ni como Gasto. Las filas individuales del traspaso se
  // siguen viendo en la lista (no se ocultan), solo el total de
  // cabecera deja de sumarlas, para que coincida con el resto.
  const monthTotal = useMemo(
    () =>
      accountFilteredExpenses
        .filter((e) => e.kind === 'real' && !e.isIncome && !isInternalTransferCategory(e.category, categories))
        .reduce((sum, e) => sum + e.amount, 0),
    [accountFilteredExpenses, categories],
  )

  // Petición real: "gráficos de estadísticas, total ingresos" — un
  // ingreso (nómina, paga extra...) es el mismo movimiento, solo
  // marcado al revés. Se crean desde el "Resumen" de cada presupuesto
  // (Skill: ingresos separados por pestaña), pero se ven aquí también
  // para tener el listado completo por fecha.
  // FASE 6D.3 — igual que en Resumen/PEPA: una devolución no es un ingreso nuevo, es dinero recuperado de un gasto anterior.
  const monthIncome = useMemo(() => accountFilteredExpenses.filter((e) => isRealIncome(e, categories)).reduce((sum, e) => sum + e.amount, 0), [accountFilteredExpenses, categories])

  // Mismo criterio que BankTab: "Ingresos" no cuenta un traspaso entre
  // cuentas propias ni entrando ni saliendo, ni una devolución (Fase
  // 6D.3); Fijos/Variables ignora los ingresos (no tienen esa clasificación).
  const typeFilteredExpenses = useMemo(
    () =>
      accountFilteredExpenses.filter((e) => {
        if (typeFilter === 'todos') return true
        if (typeFilter === 'categoria') return !categoryFilterValue || e.category === categoryFilterValue
        if (typeFilter === 'busqueda') return matchesFreeSearch(e, searchQuery)
        if (typeFilter === 'pendientes') return isPendingSpendingRow(e)
        if (typeFilter === 'ingresos') return isRealIncome(e, categories)
        if (typeFilter === 'devoluciones') return isRefund(e, categories)
        if (e.isIncome) return false
        const isFixed = resolveExpenseFixed(e, categories)
        return typeFilter === 'fijos' ? isFixed === true : isFixed !== true
      }),
    [accountFilteredExpenses, typeFilter, categories, categoryFilterValue, searchQuery],
  )
  // Un traspaso entre cuentas propias o un cobro anulado y re-cobrado
  // (categoría "Movimientos internos") se sigue viendo en la lista de
  // "Todos"/"Búsqueda libre" para poder consultarlo, pero no debe
  // sumar en el total de arriba — igual que en Resumen/Presupuesto.
  const typeFilterTotal = useMemo(
    () => typeFilteredExpenses.reduce((sum, e) => (isInternalTransferCategory(e.category, categories) ? sum : sum + e.amount), 0),
    [typeFilteredExpenses, categories],
  )

  const memberById = new Map(members.map((m) => [m.id, m]))
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  function ownerMemberForExpense(expenseId: string): FamilyMember | null {
    const accId = expenseAccountId.get(expenseId)
    const ownerId = accId ? accountById.get(accId)?.ownerMemberId : null
    return ownerId ? (memberById.get(ownerId) ?? null) : null
  }
  function accountLabel(a: BankAccount): string {
    const owner = a.ownerMemberId ? memberById.get(a.ownerMemberId) : null
    const last4 = a.iban ? `•• ${a.iban.slice(-4)}` : (a.name ?? 'Cuenta')
    return `${owner ? owner.name : 'Común'} (${last4})`
  }

  if (loading) return <p className="muted">Cargando gastos…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}

      {onOpenNewMovement && !filter && (
        <button type="button" style={{ marginBottom: 8 }} onClick={onOpenNewMovement}>
          + Nuevo movimiento
        </button>
      )}

      {filter ? (
        <div className="card event-card">
          <strong>Filtro: {filter.label}</strong>
          <p className="muted" style={{ margin: '4px 0' }}>
            {monthExpenses.length} {monthExpenses.length === 1 ? 'registro' : 'registros'}
          </p>
          <div className="inline-fields">
            {onBack && (
              <button type="button" className="link-button" onClick={onBack}>
                ‹ Volver{previousTabLabel ? ` a ${previousTabLabel}` : ''}
              </button>
            )}
            <button type="button" className="link-button" onClick={onClearFilter}>
              ✕ Quitar filtro
            </button>
          </div>
        </div>
      ) : (
        <DateFilterTab
          preset={preset}
          onPresetChange={setPreset}
          customFrom={customFrom}
          onCustomFromChange={setCustomFrom}
          customTo={customTo}
          onCustomToChange={setCustomTo}
        />
      )}

      {/* Piso compartido, modo Separado: Individual (lo tuyo) / Común
          (el bote compartido) — mismas listas y totales de siempre,
          solo cambia qué gastos entran. En Compartido no se muestra:
          no hay nada que separar. */}
      {accountsMode === 'separado' && (
        <div className="filter-row" style={{ marginTop: 8 }}>
          <button type="button" className={'chip' + (scope === 'personal' ? ' chip-active' : '')} onClick={() => setScope('personal')}>
            Individual
          </button>
          <button type="button" className={'chip' + (scope === 'comun' ? ' chip-active' : '')} onClick={() => setScope('comun')}>
            Común
          </button>
        </div>
      )}
      {/* Petición real: "pon en letra pequeña la leyenda de los símbolos
          nuevos en Movimientos Individuales" — los iconos 🤝/✅ solo
          salen en Individual (ver extraAction de MovementRow), así que
          la leyenda también. */}
      {accountsMode === 'separado' && scope === 'personal' && (
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          🤝 Compartir a Común · ✅ Ya está en Común
        </p>
      )}

      {/* Base para "Piso compartido/cuentas separadas": poder ver solo
          la cuenta de uno (o la común), no todas mezcladas — mismo
          filtro que ya existía en Banco (activeAccountId), pero
          elegible aquí mismo en vez de solo al tocar una tarjeta de
          saldo. Solo tiene sentido con más de una cuenta enlazada.
          Petición real: "cámbialo como has propuesto" — mismo botón con
          desplegable que "📅 Fecha", en vez de una fila de chips. */}
      {accounts.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <DropdownFilter
            label="🏦 Cuenta"
            value={activeAccountId ?? 'todas'}
            onChange={(k) => setActiveAccountId(k === 'todas' ? null : k)}
            options={[{ key: 'todas', label: 'Todas las cuentas' }, ...accounts.map((a) => ({ key: a.id, label: accountLabel(a) }))]}
          />
        </div>
      )}

      <p className="points-badge">
        {monthTotal.toFixed(2)} € gastados
        {monthIncome > 0 && ` · +${monthIncome.toFixed(2)} € ingresados`}
      </p>

      {/* Petición real: "pondría en algún lugar bien visible que la
          clasificación de productos y movimientos bancarios son
          sugerencias" — un movimiento importado del banco lleva
          categoría puesta automáticamente por el nombre del comercio
          (ver MERCHANT_CATEGORY_RULES en enable-banking-sync-
          transactions); es un acierto frecuente, no una certeza. */}
      {accounts.length > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          ℹ️ La categoría de los movimientos importados del banco se asigna por sugerencia, según el comercio —
          revísala y corrígela si no encaja (toca el movimiento para editarlo).
        </p>
      )}

      <div style={{ marginTop: 8 }}>
        <DropdownFilter label="Filtrar por" value={typeFilter} onChange={(k) => setTypeFilter(k as typeof typeFilter)} options={TYPE_FILTER_OPTIONS} />
      </div>
      {typeFilter === 'categoria' && (
        <div style={{ marginTop: 8 }}>
          <CategorySelect value={categoryFilterValue} onChange={setCategoryFilterValue} categories={categories} allowGeneral />
        </div>
      )}
      {typeFilter === 'busqueda' && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar en tienda, categoría o notas..."
          style={{ marginTop: 8 }}
          autoFocus
        />
      )}
      {typeFilter !== 'todos' && (
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Total{' '}
          {typeFilter === 'fijos' ? 'fijo' : typeFilter === 'variables' ? 'variable' : typeFilter === 'ingresos' ? 'de ingresos' : typeFilter === 'devoluciones' ? 'de devoluciones' : 'filtrado'}
          :{' '}
          <strong>{typeFilterTotal.toFixed(2)} €</strong>
        </p>
      )}

      <div className="price-row-list">
        {typeFilteredExpenses.map((e) =>
          editingId === e.id ? (
            <EditExpenseInline
              key={e.id}
              expense={e}
              categories={categories}
              tags={tags}
              onDone={() => {
                setEditingId(null)
                reload()
              }}
              onCancel={() => setEditingId(null)}
              onAddToForecast={expenseAccountId.has(e.id) ? () => handleAddToForecast(e) : undefined}
              addToForecastBusy={forecastBusyExpenseId === e.id}
            />
          ) : (
            <MovementRow
              key={e.id}
              expense={e}
              category={categories.find((c) => c.name === e.category)}
              tag={tags.find((t) => t.id === e.tagId)}
              ownerMember={ownerMemberForExpense(e.id)}
              onClick={() => setEditingId(e.id)}
              rowColor={movementRowColor(movementColorMode, categories.find((c) => c.name === e.category), tags.find((t) => t.id === e.tagId), catColors)}
              extraAction={
                <>
                  {/* Piso compartido — petición real: "que el que haya
                      pagado algo en común... pueda pasar una copia del
                      movimiento con un botón al listado común". Copia
                      independiente (editar/borrar una no toca la otra),
                      solo tiene sentido sobre lo tuyo, sin compartir ya.
                      Icono en vez de texto (petición real: "ocupa
                      demasiado espacio... alguna sugerencia... ver más
                      detalle del movimiento") — mismo ancho que el icono
                      de borrar de al lado, así el resto de la fila (fecha,
                      establecimiento, concepto) deja de comerse el texto.
                      Confirmación de doble toque (petición real, tras
                      encontrar 3 copias del mismo gasto en Común: "hay
                      que poner... que pida confirmación si estás seguro
                      que quieres pasarlo a Común") — mismo componente que
                      el icono de borrar de al lado, así un toque de más
                      no comparte nada por accidente. */}
                  {accountsMode === 'separado' && scope === 'personal' && !e.shared && e.ownerMemberId === myMemberId && (
                    <ConfirmIconButton
                      icon="🤝"
                      className="icon-button"
                      ariaLabel="Compartir a Común"
                      onConfirm={() =>
                        copyExpenseToShared(e.id)
                          .then(reload)
                          .catch((err) => {
                            // Petición real: "que salte una ventana
                            // emergente que diga que ya está pasado que
                            // no se puede duplicar" — puede pasar si la
                            // lista todavía no se había refrescado desde
                            // otra pestaña/dispositivo.
                            window.alert(errorMessage(err, 'No se pudo compartir a Común'))
                            reload()
                          })
                      }
                    />
                  )}
                  {accountsMode === 'separado' && scope === 'personal' && expenses.some((x) => x.sharedFromExpenseId === e.id) && (
                    <span className="icon-button" title="Ya está en Común" aria-label="Ya está en Común" style={{ opacity: 0.6 }}>
                      ✅
                    </span>
                  )}
                  <ConfirmIconButton
                    icon="✕"
                    className="icon-button"
                    ariaLabel="Borrar movimiento"
                    onConfirm={() => deleteExpense(e.id).then(reload)}
                  />
                </>
              }
            />
          ),
        )}
        {typeFilteredExpenses.length === 0 && <p className="muted">No hay gastos este mes.</p>}
      </div>

      {forecastError && <p className="error">{forecastError}</p>}

      {/* Fase 1D-g.2 — coincidencia real (fuerte: ya conciliado; débil: palabra compartida con una
          previsión activa de la misma cuenta) — nunca se crea nada en silencio, pero tampoco se bloquea:
          es una acción manual, decide la familia. */}
      {forecastDuplicateWarning && (
        <div className="modal-overlay" onClick={() => setForecastDuplicateWarning(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: '0 0 8px' }}>{forecastDuplicateWarning.message}</p>
            <div className="form-actions">
              <button
                type="button"
                onClick={() => {
                  setForecastPrefill(forecastDuplicateWarning.prefill)
                  setShowForecastForm(true)
                  setForecastDuplicateWarning(null)
                }}
              >
                Crear de todas formas
              </button>
              <button type="button" className="link-button" onClick={() => setForecastDuplicateWarning(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showForecastForm && forecastPrefill && (
        <div className="modal-overlay" onClick={() => setShowForecastForm(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Nuevo pago previsto
              </h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setShowForecastForm(false)}>
                ✕
              </button>
            </div>
            <ForecastPaymentForm
              categories={categories}
              members={members}
              accounts={accounts}
              payment={null}
              prefill={forecastPrefill}
              overrides={[]}
              onSaved={() => {
                setShowForecastForm(false)
                setForecastPrefill(null)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const SOURCE_META: Record<ExpenseSource, { icon: string; label: string }> = {
  manual: { icon: '✏️', label: 'Apuntado a mano' },
  ticket: { icon: '🧾', label: 'Importado de un ticket' },
  banco: { icon: '🏦', label: 'Importado del banco' },
  ticket_banco: { icon: '🏦', label: 'Importado del banco' },
}

// Fila compartida de un movimiento (Movimientos y Banco son la misma
// tabla `expenses`, ver EditExpenseInline) — antes era una sola línea
// con el nombre de la etiqueta escondido detrás de un puntito de 8px a
// mitad de línea, prácticamente invisible con muchas etiquetas ya
// puestas (petición real: "en 96 etiquetas que he puesto solo veo
// una... soy partidaria del punto al inicio de movimiento"). Ahora el
// punto de color va el primero de todo, y se reparte la información en
// 3 líneas para verlo todo de un vistazo sin abrir el movimiento:
// categoría+importe, fecha/establecimiento/etiqueta/origen, y el
// concepto (editable tocando la fila, como todo lo demás).
// Resuelve el fondo de una fila de Movimientos según el ajuste
// "Colorear movimientos por" (Configuración) — categoría reutiliza
// categoryColors() pasado a pastel (mismo criterio que Presupuestos y
// el selector de categorías); etiqueta reutiliza el color ya elegido a
// mano para esa etiqueta (toPastel, igual que Calendario).
function movementRowColor(
  mode: MovementColorMode,
  category: BudgetCategory | undefined,
  tag: Tag | undefined,
  catColors: Map<string, string>,
): string | undefined {
  if (mode === 'categoria' && category) {
    const c = catColors.get(category.id)
    return c ? pastelFromHsl(c) : undefined
  }
  if (mode === 'etiqueta' && tag) return toPastel(tag.color)
  return undefined
}

function MovementRow({
  expense: e,
  category,
  tag,
  onClick,
  extraAction,
  ownerMember,
  rowColor,
}: {
  expense: Expense
  category: BudgetCategory | undefined
  tag: Tag | undefined
  onClick: () => void
  extraAction?: React.ReactNode
  // Solo en Banco, viendo todas las cuentas mezcladas (petición real: no
  // había forma de saber de qué cuenta venía cada movimiento sin
  // filtrar una a una) — el avatar/color ya asignado a esa cuenta en
  // "De quién es la cuenta".
  ownerMember?: FamilyMember | null
  // Ajuste "Colorear movimientos por" (Configuración) — fondo de toda
  // la fila, no solo el puntito; ya resuelto por quien llama (por
  // categoría o por etiqueta, según el ajuste) para no repetir el
  // cálculo de categoryColors() en cada fila.
  rowColor?: string
}) {
  const source = SOURCE_META[e.source]
  return (
    <div className="movement-row" onClick={onClick} style={{ background: rowColor }}>
      <span
        className="movement-row-dot"
        style={{ background: tag ? tag.color : 'transparent' }}
        title={tag ? `Etiqueta: ${tag.name}` : undefined}
        aria-hidden="true"
      />
      <div className="movement-row-body">
        <div className="movement-row-line">
          {/* Petición real: "he puesto la categoría Sueldo pero fuera
              sigue poniendo Ingreso" — la fila forzaba el texto
              "Ingreso" en cualquier movimiento marcado como ingreso, sin
              mirar la categoría real (que sí se guardaba bien). Ahora se
              muestra igual que un gasto: icono + nombre de la categoría
              elegida (Sueldo, Regalo, Ingreso genérico...). */}
          <span className="movement-row-category">
            {ownerMember !== undefined && <OwnerBadge owner={ownerMember} size={16} />} {category?.icon}{' '}
            {isPendingCategory(e.category) ? <span className="pending-tag">⏳ {PENDING_LABEL}</span> : e.category}
          </span>
          <span className="price-row-price" style={{ color: e.isIncome ? '#1e8449' : undefined }}>
            {e.isIncome ? '+' : ''}
            {e.amount.toFixed(2)} €
          </span>
        </div>
        <div className="movement-row-line movement-row-meta muted">
          <span>
            {e.expenseDate}
            {e.store && ` · ${e.store}`}
            {e.kind !== 'real' && ` · ${e.kind}`}
            {tag && ` · ${tag.name}`}
          </span>
          <span title={source.label}>{source.icon}</span>
        </div>
        {e.notes && <div className="movement-row-line movement-row-notes muted">{e.notes}</div>}
      </div>
      {extraAction && (
        <span onClick={(ev) => ev.stopPropagation()} style={{ flex: 'none' }}>
          {extraAction}
        </span>
      )}
    </div>
  )
}

// Desplegable de etiqueta reutilizable — "Sin etiqueta" siempre
// disponible (Skill de Pepa: una etiqueta por movimiento, opcional).
function TagSelect({ value, onChange, tags }: { value: string; onChange: (v: string) => void; tags: Tag[] }) {
  return (
    <div>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sin etiqueta</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button type="button" className="link-button" style={{ fontSize: 12, padding: '4px 0' }} onClick={() => openManager('etiquetas')}>
        ⚙️ Gestionar etiquetas
      </button>
    </div>
  )
}

// Editar cualquier movimiento de la lista de Gastos — categoría
// (desplegable real, ya no texto libre): la del árbol de gasto para uno
// normal, o la de INCOME_CATEGORY_SEED (Sueldo, Regalo, Ingreso...) si
// es un ingreso. Sin establecimiento en un ingreso (no aplica). Etiqueta,
// Debo/Necesito/Quiero y Fijo/variable se pueden asignar en los dos
// casos (Skill de Pepa, puntos 11/15/16).
function EditExpenseInline({
  expense,
  categories,
  tags,
  onDone,
  onCancel,
  onAddToForecast,
  addToForecastBusy,
}: {
  expense: Expense
  categories: BudgetCategory[]
  tags: Tag[]
  onDone: () => void
  onCancel: () => void
  // Fase 1D-g.2 — "🔮 Añadir a Previsión": opcional, undefined en Banco (mismo componente, sin tocarlo
  // ahí) y solo presente en Movimientos cuando el gasto viene de verdad de un movimiento bancario (hace
  // falta su account_id real, ver ExpensesTab).
  onAddToForecast?: () => void
  addToForecastBusy?: boolean
}) {
  const [date, setDate] = useState(expense.expenseDate)
  const [amount, setAmount] = useState(String(expense.amount))
  // NULL (pendiente de clasificar) se conserva tal cual mientras no se elija una categoría: abrir y guardar no inventa ninguna.
  const [category, setCategory] = useState<string | null>(expense.category)
  const incomeCategories = categories.filter((c) => c.budgetGroup === 'ingresos')
  const [store, setStore] = useState(expense.store ?? '')
  const [tagId, setTagId] = useState(expense.tagId ?? '')
  const [notes, setNotes] = useState(expense.notes ?? '')
  // Petición real: "quiero que yo pueda seleccionar cada gasto, si es
  // fijo o es variable" — por defecto sigue a la categoría (null),
  // pero este movimiento en concreto puede llevar su propia marca.
  const [isFixedOverride, setIsFixedOverride] = useState<boolean | null>(expense.isFixedOverride)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Skill de Pepa, puntos 15/16 — por defecto se hereda de la
  // categoría (automática, editable en "🗂️ Categorías" si la familia
  // no está de acuerdo con la de fábrica); Debo/Necesito/Quiero sigue
  // siendo solo por categoría, Fijo/Variable ya se puede pisar aquí.
  const classification = resolveCategoryClassification(category, categories)

  // Petición real: "¿qué tal si a los movimientos que se categorizan
  // como compra se les abre otro campo para clasificar el producto?"
  // — un cobro de banco sin ticket detrás (C&A, H&M...) no tiene
  // ninguna fila en product_prices, así que "Reparto por
  // clasificación" (Estadística compras) no podía desglosarlo aunque
  // sí contara en "Reparto por tienda". Solo tiene sentido para gastos
  // de Alimentación o de "Compras y familia" — el resto de categorías
  // no entra en esas estadísticas.
  const classificationKind: FoodTypeKind | null = isFoodCategory(category, categories)
    ? 'alimentacion'
    : isComprasFamiliaCategory(category, categories)
      ? 'no_alimentos'
      : null
  const [productClassification, setProductClassification] = useState(expense.productClassification ?? '')
  const [classificationOptions, setClassificationOptions] = useState<FamilyFoodType[]>([])
  useEffect(() => {
    if (!classificationKind) {
      setClassificationOptions([])
      return
    }
    let cancelled = false
    listFamilyFoodTypes(classificationKind)
      .then((list) => {
        if (!cancelled) setClassificationOptions(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [classificationKind])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // La categoría de un GASTO (y la de su ticket vinculado) se cambia SOLO con classify_purchase: una sola transacción, sin dejar un
      // lado clasificado y el otro no, y sin pisar en silencio si gasto y ticket ya tienen categorías distintas (Fase 6C.2C).
      // Un ingreso no tiene ticket ni «pendiente»: sigue por updateExpense.
      const categoryChanged = !expense.isIncome && category != null && category !== expense.category
      if (categoryChanged && category != null) {
        let result
        try {
          result = await classifyPurchase({ expenseId: expense.id, category })
        } catch (err) {
          void reportClientError(err) // el detalle técnico se registra; la persona ve un mensaje comprensible
          setError(CLASSIFY_FAILED_MESSAGE)
          return
        }
        if (!classifyOk(result)) {
          setError(classifyMessage(result)) // conflicto / rechazo: nada se ha cambiado
          return
        }
      }
      await updateExpense(expense.id, {
        date,
        amount: Number(amount),
        ...(expense.isIncome && category != null ? { category } : {}),
        tagId: tagId || null,
        isFixedOverride,
        notes,
        productClassification: classificationKind ? productClassification || null : expense.productClassification,
        ...(expense.isIncome ? {} : { store }),
      })
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form" onClick={(e) => e.stopPropagation()}>
      {expense.isIncome ? (
        <label>
          Categoría
          <select value={category ?? ''} onChange={(e) => setCategory(e.target.value)}>
            {incomeCategories.length === 0 && <option value="Ingreso">Ingreso</option>}
            {incomeCategories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Categoría
          <CategorySelect value={category ?? ''} onChange={setCategory} categories={categories} emptyLabel={expense.category == null ? `⏳ ${PENDING_LABEL}` : undefined} />
        </label>
      )}
      <div className="inline-fields">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {!expense.isIncome && (
        <label>
          Establecimiento (opcional)
          <input type="text" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
        </label>
      )}
      {classificationKind && (
        <label>
          Clasificación (opcional)
          <select value={productClassification} onChange={(e) => setProductClassification(e.target.value)}>
            <option value="">Sin clasificar</option>
            {classificationOptions.map((t) => (
              <option key={t.id} value={t.name}>
                {t.icon} {t.name}
              </option>
            ))}
          </select>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            Solo hace falta si este movimiento no tiene ticket con productos detrás — para que cuente en "Reparto por
            clasificación" de Estadística compras.
          </p>
        </label>
      )}
      <label>
        Etiqueta (opcional)
        <TagSelect value={tagId} onChange={setTagId} tags={tags} />
      </label>
      <label>
        Concepto (opcional)
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anotación tuya sobre este movimiento"
        />
      </label>
      {!expense.isIncome && (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {classification.necessity ? NECESSITY_LABELS[classification.necessity] : 'Sin clasificar'}
            {' — según la categoría, editable en el botón flotante "🗂️ Categorías".'}
          </p>
          {/* Petición real: "quiero que yo pueda seleccionar cada
              gasto, si es fijo o es variable" — a diferencia de
              Debo/Necesito/Quiero (solo por categoría), esto se puede
              pisar para este movimiento en concreto. */}
          <div className="filter-row" style={{ margin: '4px 0 0' }}>
            <button type="button" className={'chip' + (isFixedOverride === null ? ' chip-active' : '')} onClick={() => setIsFixedOverride(null)}>
              Según categoría{classification.isFixed != null ? ` (${classification.isFixed ? 'Fijo' : 'Variable'})` : ''}
            </button>
            <button type="button" className={'chip' + (isFixedOverride === true ? ' chip-active' : '')} onClick={() => setIsFixedOverride(true)}>
              Fijo
            </button>
            <button type="button" className={'chip' + (isFixedOverride === false ? ' chip-active' : '')} onClick={() => setIsFixedOverride(false)}>
              Variable
            </button>
          </div>
        </>
      )}
      {onAddToForecast && (
        <button type="button" className="link-button" style={{ margin: '4px 0 0' }} onClick={onAddToForecast} disabled={!!addToForecastBusy}>
          {addToForecastBusy ? 'Analizando…' : '🔮 Añadir a Previsión'}
        </button>
      )}
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// El único botón flotante de Gastos (petición real: "traslado el botón
// flotante de Presupuesto General a Gastos"): crear categorías de
// cualquiera de los dos grupos, reordenarlas con flechas, y apuntar un
// gasto eligiendo la categoría de una lista.
// Gestión de categorías — petición real: "Categorías contiene las
// Categorías (por orden alfabético) y Subcategorías y arriba lo
// primero debe tener un botón Crear nueva Categoría... quiero que aquí
// adaptes el mismo sistema que las subcategorías se desplieguen
// dándole a su categoría principal" (mismo patrón de disclosure que
// CategorySelect). El orden manual (↑/↓) se sustituye por alfabético
// aquí — más fácil de encontrar una categoría concreta que recordar en
// qué orden se fueron creando.
export function CategoriesModal({
  categories,
  onClose,
  onChanged,
}: {
  categories: BudgetCategory[]
  onClose: () => void
  onChanged: () => void
}) {
  // Petición real: "Alimentación y General que antes eran las
  // categorías principales se eliminan" — ya no se crean categorías
  // nuevas bajo 'alimentacion' (grupo retirado, la Alimentación real
  // vive dentro del árbol de 'generales', ver migración 0076).
  const [newCategoryGroup, setNewCategoryGroup] = useState<'generales' | 'ingresos'>('generales')
  const [addingCategory, setAddingCategory] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const generales = categories.filter((c) => c.budgetGroup === 'generales')
  const ingresos = categories.filter((c) => c.budgetGroup === 'ingresos')
  // Mismo color por categoría que ya usan los dónuts (categoryColors),
  // pasado a pastel — así se reconoce la misma categoría entre el
  // gráfico y esta lista sin inventar una asignación nueva.
  const catColors = stableCategoryColors(categories)
  function catBg(id: string): string | undefined {
    const c = catColors.get(id)
    return c ? pastelFromHsl(c) : undefined
  }

  function renderClassification(c: BudgetCategory) {
    return (
      <div className="inline-fields" style={{ gap: 6, marginTop: 6 }}>
        <select
          value={c.necessity ?? ''}
          onChange={(e) => updateBudgetCategory(c.id, { necessity: (e.target.value || null) as 'debo' | 'necesito' | 'quiero' | null }).then(onChanged)}
          style={{ fontSize: 12, padding: '4px 6px' }}
        >
          <option value="">Sin clasificar</option>
          <option value="debo">Debo</option>
          <option value="necesito">Necesito</option>
          <option value="quiero">Quiero</option>
        </select>
        <select
          value={c.isFixed == null ? '' : c.isFixed ? 'fijo' : 'variable'}
          onChange={(e) => updateBudgetCategory(c.id, { isFixed: e.target.value === '' ? null : e.target.value === 'fijo' }).then(onChanged)}
          style={{ fontSize: 12, padding: '4px 6px' }}
        >
          <option value="">Sin clasificar</option>
          <option value="fijo">Fijo</option>
          <option value="variable">Variable</option>
        </select>
      </div>
    )
  }

  function renderGroup(label: string, list: BudgetCategory[], showClassification: boolean) {
    const topLevel = [...list.filter((c) => !c.parentId)].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    return (
      <div style={{ marginBottom: 16 }}>
        <p className="muted" style={{ marginBottom: 4, fontWeight: 600 }}>
          {label}
        </p>
        <div className="category-picker-panel" style={{ maxHeight: 'none' }}>
          {topLevel.map((c) => {
            const children = [...list.filter((x) => x.parentId === c.id)].sort((a, b) => a.name.localeCompare(b.name, 'es'))
            const expanded = expandedId === c.id
            return (
              <div key={c.id}>
                <button
                  type="button"
                  className="category-picker-row"
                  style={{ background: catBg(c.id) }}
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                >
                  <span style={{ flex: 1 }}>
                    {c.icon} {c.name}
                  </span>
                  <span className="muted">{expanded ? '▲' : '›'}</span>
                </button>
                {expanded && (
                  <div style={{ padding: '4px 12px 12px 28px', borderBottom: '1px solid #f1f1f1' }}>
                    {showClassification && renderClassification(c)}
                    <ConfirmIconButton
                      icon="✕ Eliminar esta categoría"
                      className="link-button"
                      ariaLabel={`Eliminar categoría ${c.name}`}
                      onConfirm={() => deleteBudgetCategory(c.id).then(onChanged)}
                    />
                    {children.map((child) => (
                      <div
                        key={child.id}
                        style={{ background: catBg(child.id), borderRadius: 8, borderTop: '1px solid #f1f1f1', paddingTop: 8, marginTop: 4, paddingLeft: 6, paddingRight: 6 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <strong style={{ flex: 1, fontSize: 14 }}>
                            {child.icon} {child.name}
                          </strong>
                          <ConfirmIconButton
                            icon="✕"
                            className="link-button"
                            ariaLabel={`Eliminar categoría ${child.name}`}
                            onConfirm={() => deleteBudgetCategory(child.id).then(onChanged)}
                          />
                        </div>
                        {showClassification && renderClassification(child)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {topLevel.length === 0 && (
            <p className="muted" style={{ padding: 12 }}>
              Sin categorías todavía.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Categorías
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <button type="button" className="link-button" onClick={() => setAddingCategory((v) => !v)}>
          {addingCategory ? 'Cerrar' : '+ Crear nueva categoría'}
        </button>
        {addingCategory && (
          <>
            <div className="filter-row" style={{ margin: '8px 0' }}>
              <button
                type="button"
                className={'chip' + (newCategoryGroup === 'generales' ? ' chip-active' : '')}
                onClick={() => setNewCategoryGroup('generales')}
              >
                Generales
              </button>
              <button
                type="button"
                className={'chip' + (newCategoryGroup === 'ingresos' ? ' chip-active' : '')}
                onClick={() => setNewCategoryGroup('ingresos')}
              >
                Ingresos
              </button>
            </div>
            <AddBudgetCategoryInline
              budgetGroup={newCategoryGroup}
              parentOptions={categories.filter((c) => c.budgetGroup === newCategoryGroup && !c.parentId)}
              onAdded={() => {
                setAddingCategory(false)
                onChanged()
              }}
            />
          </>
        )}

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

        {renderGroup('Generales', generales, true)}
        {renderGroup('Ingresos', ingresos, false)}
      </div>
    </div>
  )
}

// Gestión de etiquetas — mismo patrón que CategoriesModal (crear
// arriba, lista alfabética debajo).
export function TagsModal({ tags, onClose, onChanged }: { tags: Tag[]; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const [addingTag, setAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(DONUT_COLORS[0])
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  async function handleAddTag(e: FormEvent) {
    e.preventDefault()
    if (!newTagName.trim()) return
    await createTag({ name: newTagName.trim(), color: newTagColor })
    setNewTagName('')
    setNewTagColor(DONUT_COLORS[0])
    setAddingTag(false)
    onChanged()
  }

  async function handleSaveTag(id: string) {
    if (editName.trim()) await updateTag(id, { name: editName.trim(), color: editColor })
    setEditingTagId(null)
    onChanged()
  }

  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name, 'es'))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Etiquetas
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <button type="button" className="link-button" onClick={() => setAddingTag((v) => !v)}>
          {addingTag ? 'Cerrar' : '+ Crear nueva etiqueta'}
        </button>
        {addingTag && (
          <form onSubmit={handleAddTag} className="member-form" style={{ margin: '8px 0' }}>
            <div className="inline-fields">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Eric, Vacaciones…"
                autoFocus
                style={{ flex: 1 }}
              />
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                style={{ flex: 'none', width: 44, padding: 4 }}
                aria-label="Color de la etiqueta"
              />
            </div>
            <button type="submit">Crear</button>
          </form>
        )}

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

        <div className="event-list">
          {sorted.map((t) =>
            editingTagId === t.id ? (
              <form
                key={t.id}
                className="inline-fields"
                style={{ marginBottom: 6 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSaveTag(t.id)
                }}
              >
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus style={{ flex: 1 }} />
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  style={{ flex: 'none', width: 44, padding: 4 }}
                  aria-label="Color de la etiqueta"
                />
                <button type="submit">Guardar</button>
              </form>
            ) : (
              <div key={t.id} className="card task-card" style={{ padding: '6px 10px', gap: 6, fontSize: 13 }}>
                <button
                  type="button"
                  className="task-card-main"
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--text)', fontWeight: 400 }}
                  onClick={() => {
                    setEditingTagId(t.id)
                    setEditName(t.name)
                    setEditColor(t.color)
                  }}
                >
                  <strong style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
                    {t.name}
                  </strong>
                </button>
                <ConfirmIconButton icon="✕" className="link-button" ariaLabel={`Eliminar etiqueta ${t.name}`} onConfirm={() => deleteTag(t.id).then(onChanged)} />
              </div>
            ),
          )}
          {sorted.length === 0 && <p className="muted">Todavía no hay etiquetas.</p>}
        </div>
      </div>
    </div>
  )
}

// Formulario de nuevo movimiento en su propio modal, accesible desde
// cualquier pestaña de Economía con el botón flotante "➕ Movimiento".
function NewMovementModal({
  categories,
  onClose,
  onAdded,
}: {
  categories: BudgetCategory[]
  onClose: () => void
  onAdded: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo movimiento
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <AddExpenseToAnyCategoryInline categories={categories} onAdded={onAdded} />
      </div>
    </div>
  )
}

// Apuntar un gasto eligiendo la categoría de una lista (cualquiera de
// los dos grupos), sin tener que abrir antes su tarjeta.
function AddExpenseToAnyCategoryInline({
  categories,
  onAdded,
}: {
  categories: BudgetCategory[]
  onAdded: () => void
}) {
  // Petición real: "¿los ingresos dónde se apuntan? Debería ser en
  // gastos también... en el mismo formulario que se creen también
  // ingresos con un desplegable más" — mismo formulario, un chip
  // Gasto/Ingreso; un ingreso no lleva categoría de presupuesto ni
  // establecimiento, solo fecha e importe.
  const [isIncome, setIsIncome] = useState(false)
  const incomeCategories = categories.filter((c) => c.budgetGroup === 'ingresos')
  const [category, setCategory] = useState(categories[0]?.name ?? 'Alimentación')
  const [incomeCategory, setIncomeCategory] = useState(incomeCategories[0]?.name ?? 'Ingreso')
  const [store, setStore] = useState('')
  const [date, setDate] = useState(toDateStr(new Date()))
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isIncome) {
        await addExpense({
          date,
          amount: Number(amount),
          category: incomeCategory,
          store: '',
          kind: 'real',
          isIncome: true,
          budgetGroup: 'generales',
        })
      } else {
        const matched = categories.find((c) => c.name === category)
        await addExpense({
          date,
          amount: Number(amount),
          category,
          store,
          kind: 'real',
          isIncome: false,
          budgetGroup: matched?.budgetGroup,
        })
      }
      setAmount('')
      setStore('')
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="member-form">
      <div className="filter-row">
        <button type="button" className={'chip' + (!isIncome ? ' chip-active' : '')} onClick={() => setIsIncome(false)}>
          Gasto
        </button>
        <button type="button" className={'chip' + (isIncome ? ' chip-active' : '')} onClick={() => setIsIncome(true)}>
          Ingreso
        </button>
      </div>
      {isIncome ? (
        <label>
          Categoría
          <select value={incomeCategory} onChange={(e) => setIncomeCategory(e.target.value)}>
            {incomeCategories.length === 0 && <option value="Ingreso">Ingreso</option>}
            {incomeCategories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Categoría
          <CategorySelect value={category} onChange={setCategory} categories={categories} />
        </label>
      )}
      <label>
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      {!isIncome && (
        <label>
          Establecimiento (opcional)
          <input type="text" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : isIncome ? 'Apuntar ingreso' : 'Apuntar gasto'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Tickets (Skill 10) — lectura automática con Gemini (nivel gratuito,
// la misma IA que reconoce alimentos en la foto de la nevera) en vez de
// OCR carácter-a-carácter: entiende el ticket como una foto completa,
// así que se le escapan muchos menos productos que a un OCR local en
// tickets arrugados o con letra pequeña. Alimenta el mismo historial de
// precios que ya usa la Memoria de la lista de la compra.
// ---------------------------------------------------------------------

// Nombre del ticket ya llevado al nombre de tienda DADO DE ALTA en
// Compras, si coincide con uno — así "MERCADONA, S.A." y "MERCADONA"
// se agrupan bajo el mismo "Mercadona" en vez de salir como grupos
// distintos por una simple diferencia de mayúsculas o de sufijo legal.
// Mismo truco ya probado que usa el reconocimiento de voz para tiendas
// (findKnownStore). Ojo: esto NO adivina que "H.Rafal II" es el mismo
// sitio que "Hiperber" — son palabras distintas de verdad, ninguna
// coincidencia de texto puede saber eso; para esos casos hay que
// corregir el ticket a mano una vez (el desplegable de abajo ya
// ofrece las tiendas dadas de alta para no tener que escribirlo).
function canonicalStoreName(raw: string | null, knownStores: string[]): string {
  if (!raw || !raw.trim()) return 'Sin establecimiento'
  return findKnownStore(raw, knownStores)?.store ?? raw.trim()
}

// Petición real: "me creas también, aunque estén vacías, otras
// carpetas que sean de Aldi, Líder, Superdumbo... y con los
// supermercados que vayamos añadiendo, ya le vamos añadiendo más" —
// una carpeta por cada tienda YA DADA DE ALTA en Compras, aunque
// todavía no tenga ningún ticket guardado, no solo las que ya
// tuvieran alguno.
// Petición real: "que la estadística de compras por establecimientos
// se complete también con las compras hechas en supermercados
// importadas del banco, ya que no siempre se acordarán los usuarios de
// subir los tickets... que marque con un símbolo 'falta ticket' los
// que no se haya subido el ticket". hasTicket=false identifica un
// gasto de alimentación que llegó SOLO del banco (source='banco'),
// nunca conciliado con ningún ticket — ver ese cruce en ReceiptsTab.
// El genérico <T extends Receipt> conserva ese campo de principio a
// fin del reparto por tienda sin tocar la firma en cada sitio que ya
// llamaba a esta función solo con Receipt[] normales.
type DisplayReceipt = Receipt & { hasTicket: boolean }

function groupReceiptsByStore<T extends Receipt>(
  receipts: T[],
  knownStores: string[],
): { store: string; receipts: T[]; total: number }[] {
  const groups = new Map<string, T[]>()
  for (const s of knownStores) groups.set(s, [])
  for (const r of receipts) {
    const key = canonicalStoreName(r.store, knownStores)
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }
  return [...groups.entries()]
    .map(([store, list]) => ({
      store,
      receipts: list,
      total: list.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total)
}

// Mismo agrupado por tienda que ya usaba "Reparto del gasto por
// tienda" para Alimentación, reutilizable también para Otros —
// petición real: "falta otro de Otros. Se podría usar el mismo dónut
// con botón Alimentación/Otros". Sale de los propios `expenses` (no
// de los tickets) para que el total del dónut cuadre SIEMPRE con el
// del total de arriba — cada gasto ya lleva su propia tienda, tenga
// ticket subido o no (mismo motivo que el arreglo del dónut de
// Alimentación). Recibe el importe YA resuelto por el que llama (no
// `Expense[]` directo): petición real: "los productos Otros que se
// han comprado en Mercadona en el reparto de tiendas no se ha
// incluido porque la compra en sí está categorizada como
// alimentación" — un mismo ticket puede repartirse entre Alimentación
// y Otros según sus productos (ver el reparto por producto en
// BudgetsTab), así que ya no vale coger `expense.amount` entero.
// Petición real: "que la tienda dé siempre el mismo color" — antes
// venía de distinctPaletteEntries por posición en el ranking de gasto,
// así que un cambio de mes a mes en qué tienda gasta más recolocaba
// los colores. Ahora lo decide storeColorResolver (tiendas dadas de alta:
// distintas entre sí; el resto: color por su nombre) y es el mismo en
// Tickets, Estadísticas y Compras.
function buildStorePieSlices(
  entries: { expenseId: string; store: string; amount: number }[],
  storeColor: (name: string) => string,
): (BreakdownSlice & { expenseIds: string[] })[] {
  const groups = new Map<string, { total: number; expenseIds: string[] }>()
  for (const e of entries) {
    const g = groups.get(e.store) ?? { total: 0, expenseIds: [] }
    g.total += e.amount
    g.expenseIds.push(e.expenseId)
    groups.set(e.store, g)
  }
  const sorted = [...groups.entries()]
    .map(([store, g]) => ({ store, total: g.total, expenseIds: g.expenseIds }))
    .sort((a, b) => b.total - a.total)
  return sorted.map((g) => ({
    key: g.store,
    label: g.store,
    color: storeColor(g.store),
    total: g.total,
    count: g.expenseIds.length,
    expenseIds: g.expenseIds,
  }))
}

// Agrupado por CLASIFICACIÓN de producto (ver Historial de precios,
// ⚙️ Clasificaciones de productos) — comparte la lógica de sumar por
// producto y colorear sin repetirse entre el dónut "por tipo de
// alimento" y el nuevo "en Otros por clasificación". Cada entrada
// llega YA resuelta (nombre/icono de su clase decididos por quien
// llama, con o sin producto real detrás) — petición real: "un cobro
// de banco sin ticket detrás no cuenta en Reparto por clasificación
// aunque sí en Reparto por tienda": junto a los `product_prices` de
// siempre, BudgetsTab añade una entrada sintética por cada gasto sin
// ningún producto detallado (clasificado a mano o "Sin clasificar"),
// para que el total de este dónut cuadre con el de "por tienda".
interface ClassifiableEntry {
  itemId: string
  displayName: string
  amount: number
  type: { name: string; icon: string }
  // Gasto de origen de la línea (aunque venga de un ticket desglosado
  // por producto) — petición real: "quiero aquí los mismos enlaces a
  // los movimientos que en las otras estadísticas", igual que ya tenía
  // el dónut por tienda (buildStorePieSlices).
  expenseId: string
}

function buildProductTypeBreakdown(entries: ClassifiableEntry[]): FoodTypeBreakdownEntry[] {
  const totals = new Map<string, { icon: string; products: Map<string, { name: string; total: number }>; expenseIds: Set<string> }>()
  for (const entry of entries) {
    const group = totals.get(entry.type.name) ?? { icon: entry.type.icon, products: new Map<string, { name: string; total: number }>(), expenseIds: new Set<string>() }
    const p = group.products.get(entry.itemId) ?? { name: entry.displayName, total: 0 }
    p.total += entry.amount
    group.products.set(entry.itemId, p)
    group.expenseIds.add(entry.expenseId)
    totals.set(entry.type.name, group)
  }
  // Mismo color por clase que en Lista e Historial de compras (pastel,
  // sale del propio nombre — ver colorForClass), no por posición.
  const colorFor = (name: string) => colorForClass(name, 'chart')
  return [...totals.entries()]
    .map(([name, group]) => {
      const productList = [...group.products.entries()]
        .map(([productId, p]) => ({ productId, name: p.name, total: p.total }))
        .sort((a, b) => b.total - a.total)
      const total = productList.reduce((sum, p) => sum + p.total, 0)
      return {
        key: name,
        label: name,
        icon: group.icon,
        color: colorFor(name),
        total,
        count: productList.length,
        products: productList,
        expenseIds: [...group.expenseIds],
      }
    })
    .sort((a, b) => b.total - a.total)
}

// Petición real: "tienes que poner una pestaña para añadir
// supermercado, para añadir tienda" — directamente aquí, sin tener que
// ir a Compras para dar de alta una tienda nueva antes de poder
// guardarle un ticket.
function AddStoreInline({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createShoppingStore(name.trim())
      setName('')
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la tienda'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="inline-fields" style={{ marginBottom: 12 }}>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva tienda (p. ej. Aldi)" />
      <button type="submit" disabled={saving || !name.trim()}>
        + Añadir tienda
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export function ReceiptsTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [bankOnlyExpenses, setBankOnlyExpenses] = useState<Expense[]>([])
  const [knownStores, setKnownStores] = useState<string[]>([])
  const [storeEntries, setStoreEntries] = useState<ShoppingStoreEntry[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Petición real: "créame una carpeta dentro de ticket por cada
  // supermercado... que cuando yo le toque la carpeta de Mercadona, se
  // me abran todos los tickets que hay guardados" — plegado por
  // defecto, solo el nombre/total a la vista; tocar la carpeta la
  // abre. Empieza vacío (todas plegadas) hasta que se toque alguna.
  const [expandedStore, setExpandedStore] = useState<string | null>(null)
  const [rangePreset, setRangePreset] = useState<SpendRangePreset>('mes')
  const [rangeCustomFrom, setRangeCustomFrom] = useState(toDateStr(new Date()))
  const [rangeCustomTo, setRangeCustomTo] = useState(toDateStr(new Date()))

  // Petición real: "cada vez que edito un movimiento me devuelve al
  // inicio de la página" — ver mismo arreglo en la pestaña Banco.
  const hasLoadedOnceRef = useRef(false)

  function reload() {
    if (!hasLoadedOnceRef.current) setLoading(true)
    Promise.all([listReceipts(), listExpenses(), listBudgetCategories()])
      .then(([r, allExpenses, cats]) => {
        setReceipts(r)
        setCategories(cats)
        // Un gasto de alimentación con source='banco' nunca ha pasado
        // por la conciliación con ningún ticket (la propia sincronización
        // del banco lo marcaría 'ticket_banco' en cuanto encontrara uno
        // — ver linkTransactionsToExpenses en enable-banking-sync-transactions).
        setBankOnlyExpenses(allExpenses.filter((e) => e.source === 'banco' && !e.isIncome && isFoodCategory(e.category, cats)))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        hasLoadedOnceRef.current = true
        setLoading(false)
      })
  }

  useEffect(() => {
    reload()
    listShoppingStores()
      .then((rows) => {
        setKnownStores(rows.map((s) => s.name))
        setStoreEntries(rows)
      })
      .catch(() => {})
    listFamilyMembers().then(setMembers).catch(() => {})
  }, [])

  async function handleDelete(receipt: Receipt) {
    try {
      await deleteReceipt(receipt)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar'))
    }
  }

  if (loading) return <p className="muted">Cargando tickets…</p>

  // Los tickets subidos a mano (o llegados por email de Amazon/Mercadona)
  // se completan con las compras de alimentación que solo se conocen por
  // el banco, para que el reparto por tienda no se quede corto solo
  // porque nadie subió el ticket ese día.
  const displayReceipts: DisplayReceipt[] = [
    ...receipts.map((r) => ({ ...r, hasTicket: true })),
    ...bankOnlyExpenses.map(
      (e): DisplayReceipt => ({
        id: `bank:${e.id}`,
        familyId: e.familyId,
        storagePath: null,
        store: e.store,
        receiptDate: e.expenseDate,
        totalAmount: e.amount,
        expenseId: e.id,
        notes: e.notes,
        category: e.category,
        purchasedByMemberId: null,
        hasTicket: false,
      }),
    ),
  ]

  const grouped = groupReceiptsByStore(displayReceipts, knownStores)
  const storeNames = grouped.map((g) => g.store)
  const [rangeFrom, rangeTo] = rangeForPreset(rangePreset, rangeCustomFrom, rangeCustomTo)
  const rangeFilteredReceipts = displayReceipts.filter((r) => r.receiptDate >= rangeFrom && r.receiptDate <= rangeTo)
  const rangeGrouped = groupReceiptsByStore(rangeFilteredReceipts, knownStores)
  const storeColorOf = storeColorResolver(
    storeEntries,
    grouped.map((g) => g.store),
  )

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <datalist id="receipt-known-stores">
        {knownStores.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* Petición real: "el aparato para subir tickets... arriba del
          todo" — antes iba al final de la lista. */}
      <ReceiptForm mode="add" onDone={reload} knownStores={knownStores} existingFolders={storeNames} categories={categories} members={members} />

      {/* Petición real: "las estadísticas en Tickets... trasládalas a
          Estadísticas para que todo esté en el mismo sitio" — el reparto
          por tienda y el gasto mensual se mudan a Compras → Estadística
          compras (sección "Solo con ticket subido"); aquí se queda solo
          el total rápido mientras repasas las carpetas de abajo. */}
      <ReceiptSpendSummary
        receipts={displayReceipts}
        knownStores={knownStores}
        storeNames={storeNames}
        preset={rangePreset}
        onPresetChange={setRangePreset}
        customFrom={rangeCustomFrom}
        onCustomFromChange={setRangeCustomFrom}
        customTo={rangeCustomTo}
        onCustomToChange={setRangeCustomTo}
      />
      {displayReceipts.length > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          Para el reparto por tienda y la evolución mensual, ver Compras → Estadística compras.
        </p>
      )}

      {/* Petición real: "créame una carpeta dentro de ticket por cada
          supermercado... que cuando yo le toque la carpeta de
          Mercadona, se me abran todos los tickets que hay guardados...
          que desaparezcan los tickets de ahí abajo y que ahí pongan
          las carpetas". Una carpeta por tienda, plegada por defecto
          (logo real, nombre, nº de tickets y total) — los tickets
          sueltos ya no se ven directamente, solo dentro de su carpeta.
          Una carpeta por cada tienda ya dada de alta, aunque no tenga
          tickets todavía (petición real: "aunque estén vacías, me
          creas las carpetas... y con los supermercados que vayamos
          añadiendo, ya le vamos añadiendo más" — de ahí el formulario
          de abajo para dar de alta una tienda nueva sin salir de aquí).
          Se filtran con el mismo selector de arriba (Hoy/Esta
          semana/Este mes/Este año/Rango) — petición real: "tickets
          guardados tengo de Mercadona 583, pero son los del mes pasado
          y los de este... quiero filtrarme solo por los de este mes o
          por esta semana". */}
      <h2 className="section-title">Tickets guardados</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Se filtran con el selector de arriba ({PRESET_LABELS[rangePreset]}).
      </p>
      <AddStoreInline onAdded={() =>
          listShoppingStores().then((rows) => {
            setKnownStores(rows.map((s) => s.name))
            setStoreEntries(rows)
          })
        } />
      <div className="store-folder-grid">
        {rangeGrouped.map(({ store, receipts: storeReceipts, total }) => {
          const isOpen = expandedStore === store
          return (
            <div key={store} className="store-folder" style={{ background: storeColorOf(store) }}>
              <button
                type="button"
                className="store-folder-header"
                onClick={() => setExpandedStore(isOpen ? null : store)}
              >
                <span className="store-folder-icon">
                  <StoreIcon name={store} size={22} />
                </span>
                <span className="store-folder-info">
                  <strong>{store}</strong>
                  <span className="muted">
                    {storeReceipts.length} {storeReceipts.length === 1 ? 'compra' : 'compras'} · {total.toFixed(2)} €
                  </span>
                </span>
                <span className="store-folder-chevron">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="event-list store-folder-contents">
                  {storeReceipts.map((r) =>
                    editingId === r.id ? (
                      <ReceiptForm
                        key={r.id}
                        mode="edit"
                        receipt={r}
                        existingFolders={storeNames}
                        knownStores={knownStores}
                        categories={categories}
                        members={members}
                        onDone={() => {
                          setEditingId(null)
                          reload()
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <ReceiptRow
                        key={r.id}
                        receipt={r}
                        hasTicket={r.hasTicket}
                        members={members}
                        onEdit={() => setEditingId(r.id)}
                        onDelete={() => handleDelete(r)}
                      />
                    ),
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {receipts.length === 0 && <p className="muted">No hay tickets guardados.</p>}
    </div>
  )
}

// Petición real: "que se pueda ver por cada mes lo que he gastado...
// por meses, por años, por día, por semana o por rango de fecha que
// yo le ponga" — filtro de fecha con presets rápidos más un rango a
// medida, cruzado con la tienda (o todas), sobre el mismo dato ya
// cargado (sin ida y vuelta al servidor por cada cambio de filtro).
function ReceiptSpendSummary({
  receipts,
  knownStores,
  storeNames,
  preset,
  onPresetChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
}: {
  receipts: Receipt[]
  knownStores: string[]
  storeNames: string[]
  preset: SpendRangePreset
  onPresetChange: (p: SpendRangePreset) => void
  customFrom: string
  onCustomFromChange: (d: string) => void
  customTo: string
  onCustomToChange: (d: string) => void
}) {
  const [selectedStore, setSelectedStore] = useState('Todas')

  const [from, to] = rangeForPreset(preset, customFrom, customTo)

  const filtered = receipts.filter((r) => {
    if (r.receiptDate < from || r.receiptDate > to) return false
    if (selectedStore === 'Todas') return true
    return canonicalStoreName(r.store, knownStores) === selectedStore
  })
  const total = filtered.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0)

  return (
    <div className="card event-card">
      <strong>Cuánto he gastado</strong>
      <DateFilterTab
        preset={preset}
        onPresetChange={onPresetChange}
        customFrom={customFrom}
        onCustomFromChange={onCustomFromChange}
        customTo={customTo}
        onCustomToChange={onCustomToChange}
      />
      <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} style={{ marginBottom: 8 }}>
        <option value="Todas">Todas las tiendas</option>
        {storeNames.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <p>
        {total.toFixed(2)} € · {filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}
      </p>
    </div>
  )
}

// Petición real: "un gráfico general con lo que se gasta cada mes en
// todos los supermercados... Mercadona el setenta por ciento de las
// compras... Hiperber el treinta por ciento" — barras horizontales,
// una por tienda, con el importe y el % sobre el total de todas.
function StoreBreakdownChart({
  groups,
  storeColor,
  title = 'Reparto del gasto por tienda',
}: {
  groups: { store: string; receipts: Receipt[]; total: number }[]
  storeColor: (name: string) => string
  // Petición real: "las estadísticas en Tickets... trasládalas a
  // Estadísticas... dejar claro que son los totales de los tickets, que
  // son similares pero no iguales" — al vivir ahora junto al dónut "por
  // tienda" (que sí cuenta TODO lo registrado), el título por defecto
  // se presta a confusión repetido dos veces en la misma pantalla.
  title?: string
}) {
  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0)
  const maxTotal = Math.max(...groups.map((g) => g.total), 1)
  return (
    <div className="card event-card">
      <strong>{title}</strong>
      <div className="price-row-list" style={{ marginTop: 8 }}>
        {groups.map((g) => {
          const pct = grandTotal > 0 ? (g.total / grandTotal) * 100 : 0
          return (
            <div key={g.store} className="store-bar-row">
              <span className="price-row-name">{g.store}</span>
              <div className="store-bar-track">
                <div
                  className="store-bar-fill"
                  style={{ width: `${(g.total / maxTotal) * 100}%`, background: storeColor(g.store) }}
                />
              </div>
              <span className="store-bar-value">
                {pct.toFixed(0)}% · {g.total.toFixed(2)} €
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Petición real: "un gráfico con lo que se va gastando cada mes en ese
// supermercado" — barras verticales, para la tienda elegida (o todas
// juntas), acotado al mismo selector de fecha de arriba (antes eran
// siempre los últimos 6 meses fijos, sin importar el filtro elegido).
function StoreMonthlyChart({
  receipts,
  knownStores,
  storeNames,
  from,
  to,
}: {
  receipts: Receipt[]
  knownStores: string[]
  storeNames: string[]
  from: string
  to: string
}) {
  const [selectedStore, setSelectedStore] = useState('Todas')

  const months = useMemo(() => {
    const start = new Date(from + 'T00:00')
    const end = new Date(to + 'T00:00')
    const list: string[] = []
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    const last = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cursor <= last) {
      list.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return list
  }, [from, to])

  const totalsByMonth = useMemo(() => {
    const sums = new Map<string, number>()
    for (const r of receipts) {
      if (selectedStore !== 'Todas' && canonicalStoreName(r.store, knownStores) !== selectedStore) continue
      const month = r.receiptDate.slice(0, 7)
      sums.set(month, (sums.get(month) ?? 0) + (r.totalAmount ?? 0))
    }
    return sums
  }, [receipts, knownStores, selectedStore])

  const maxValue = Math.max(...months.map((m) => totalsByMonth.get(m) ?? 0), 1)

  return (
    <div className="card event-card">
      <strong>Gasto mensual</strong>
      <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} style={{ margin: '8px 0' }}>
        <option value="Todas">Todas las tiendas</option>
        {storeNames.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div className="month-bar-chart">
        {months.map((m) => {
          const value = totalsByMonth.get(m) ?? 0
          const mo = Number(m.split('-')[1])
          return (
            <div key={m} className="month-bar-col">
              <div className="month-bar-track">
                <div className="month-bar-fill" style={{ height: `${(value / maxValue) * 100}%` }} title={`${value.toFixed(2)} €`} />
              </div>
              <span className="month-bar-label">
                {MONTH_LABELS[mo - 1].slice(0, 3)}
                <br />
                {value > 0 ? `${value.toFixed(0)}€` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Compartido entre Banco y Movimientos — mismo filtro, mismas opciones.
const TYPE_FILTER_OPTIONS = [
  { key: 'todos', label: 'Todos' },
  { key: 'fijos', label: 'Gastos fijos' },
  { key: 'variables', label: 'Gastos variables' },
  { key: 'ingresos', label: 'Ingresos' },
  // FASE 6D.3 — una devolución (dinero recuperado de una compra anterior) no es "Ingresos" (isRealIncome ya la excluye), pero
  // sigue siendo un movimiento real: se puede consultar aparte, igual que Pendientes.
  { key: 'devoluciones', label: 'Devoluciones' },
  { key: 'categoria', label: 'Categoría' },
  { key: 'busqueda', label: 'Búsqueda libre' },
  // Gasto real SIN categoría (category NULL). No es una categoría: es un filtro lógico y no existe en budget_categories.
  { key: 'pendientes', label: 'Pendientes' },
]

// Petición real: "Búsqueda libre, que se pueda poner una palabra y
// filtrar por todos los movimientos que la contengan" — busca en
// tienda, categoría y notas (los únicos campos de texto libre de un
// movimiento), sin distinguir mayúsculas/acentos exactos.
function matchesFreeSearch(e: Expense, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [e.store, e.category, e.notes].some((field) => field?.toLowerCase().includes(q))
}

// Petición real: "ninguno de los dos [nombres] me parecen intuitivos
// para que un usuario nuevo tenga claro que allí puede filtrar" — un
// botón que enseña la elección actual y despliega la lista al tocarlo,
// mismo patrón visual que "📅 Fecha: Mes contable ▼" (DateFilterTab) y
// el selector de categoría de abajo, en vez de una fila de chips que
// siempre está a la vista. Genérico: sirve para cualquier filtro de
// opciones planas (tipo de movimiento, cuenta...).
function DropdownFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { key: string; label: string }[]
  onChange: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.key === value)

  return (
    <div>
      <button type="button" className="category-picker-toggle" onClick={() => setOpen(true)}>
        <span>
          {label}: {selected?.label ?? value}
        </span>
        <span className="muted">▼</span>
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {label}
              </h2>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <div className="category-picker-panel" style={{ maxHeight: 'none', border: 'none' }}>
              {options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className="category-picker-row"
                  onClick={() => {
                    onChange(o.key)
                    setOpen(false)
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Selector de categoría compartido entre el formulario de tickets y
// Movimientos — petición real: "ahora mismo es una lista eterna,
// quiero que se abra una lista de las categorías principales y
// tocándolas se desplieguen las subcategorías, así no se satura tanto
// el usuario". Dos pasos en vez de una lista plana con todo: primero
// las 11 categorías principales de la taxonomía del documento maestro,
// tocar una con subcategorías las despliega; las que no tienen
// subcategorías (u "Otros") se eligen directamente.
function CategorySelect({
  value,
  onChange,
  categories,
  allowGeneral,
  compact,
  emptyLabel,
}: {
  value: string
  onChange: (v: string) => void
  categories: BudgetCategory[]
  // Texto cuando no hay categoría elegida (p. ej. «Pendiente de clasificar» para un gasto o ticket con category NULL).
  emptyLabel?: string
  // Petición real: "el desplegable de presupuesto, el mismo que el de
  // categorías del banco pero con la diferencia de que también se
  // pueda elegir General" — solo lo pide Nuevo presupuesto (donde
  // value === '' significa "sin categoría concreta, cuenta todo").
  allowGeneral?: boolean
  // Petición real: "disminuye la letra de la categoría para que se
  // ajuste todo a una línea" — al ir ahora a media anchura (Tickets, en
  // fila con "¿Quién?"), el nombre más largo (p. ej. "Alimentación")
  // partía en dos líneas y empujaba la flecha ▼ a una tercera. Solo
  // afecta a quien pase esta prop, el resto de usos (a ancho completo)
  // se quedan con el tamaño de siempre.
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Petición real: "elijo una subcategoría y me devuelve a la lista de
  // categorías y no puedo cerrar la ventana" (iPhone) — sospecha de un
  // "click fantasma" de Safari/iOS que llega justo después de cerrarse
  // el modal y cae sobre el botón que queda al descubierto en esa misma
  // posición, reabriéndolo. Se ignora cualquier toque que reabra el
  // desplegable en los 400ms siguientes a haberlo cerrado.
  const closedAtRef = useRef(0)

  const generales = categories.filter((c) => c.budgetGroup === 'generales')
  const topLevel = generales.filter((c) => !c.parentId)
  const selected = generales.find((c) => c.name === value)
  const expandedParent = expandedId ? topLevel.find((c) => c.id === expandedId) : null
  const subcats = expandedParent ? generales.filter((c) => c.parentId === expandedParent.id) : []

  function pick(name: string) {
    onChange(name)
    closedAtRef.current = Date.now()
    setOpen(false)
    setExpandedId(null)
  }

  function close() {
    closedAtRef.current = Date.now()
    setOpen(false)
    setExpandedId(null)
  }

  function openPicker() {
    if (Date.now() - closedAtRef.current < 400) return
    setOpen(true)
  }

  return (
    <div>
      <button type="button" className="category-picker-toggle" style={compact ? { fontSize: 14, padding: '10px 12px' } : undefined} onClick={openPicker}>
        <span>
          {selected ? `${selected.icon} ${selected.name}` : allowGeneral && !value ? '🗂️ General' : value || emptyLabel || 'Elige una categoría'}
        </span>
        <span className="muted">▼</span>
      </button>
      {open && (
        // Petición real: "en el iPhone, al darle a una categoría padre se
        // cierra el desplegable y al reabrirlo se ven las subcategorías" —
        // el panel inline reflowaba la página bajo el dedo al expandir, y
        // Safari en iOS disparaba un click fantasma sobre el botón que
        // había quedado en esa posición, cerrando el desplegable justo
        // después de abrirlo. Al ser ahora una ventana emergente fija, el
        // resto de la página ya no se mueve al expandir una categoría.
        <div className="modal-overlay" onClick={close}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {expandedParent ? `${expandedParent.icon} ${expandedParent.name}` : 'Elige una categoría'}
              </h2>
              <button type="button" className="modal-close" onClick={close}>
                ✕
              </button>
            </div>
            <div className="category-picker-panel" style={{ maxHeight: 'none', border: 'none' }}>
              {expandedParent ? (
                <>
                  <button type="button" className="link-button" style={{ padding: '6px 4px' }} onClick={() => setExpandedId(null)}>
                    ‹ Volver a categorías
                  </button>
                  <button type="button" className="category-picker-row" onClick={() => pick(expandedParent.name)}>
                    {expandedParent.icon} {expandedParent.name} <span className="muted">(sin subcategoría)</span>
                  </button>
                  {subcats.map((c) => (
                    <button key={c.id} type="button" className="category-picker-row" onClick={() => pick(c.name)}>
                      {c.icon} {c.name}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {allowGeneral && (
                    <button type="button" className="category-picker-row" onClick={() => pick('')}>
                      🗂️ General <span className="muted">(todos los gastos)</span>
                    </button>
                  )}
                  {topLevel.map((c) => {
                    const hasChildren = generales.some((x) => x.parentId === c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="category-picker-row"
                        onClick={() => (hasChildren ? setExpandedId(c.id) : pick(c.name))}
                      >
                        {c.icon} {c.name} {hasChildren && <span className="muted">›</span>}
                      </button>
                    )
                  })}
                </>
              )}
              <button
                type="button"
                className="link-button"
                style={{ padding: '10px 4px', fontSize: 13 }}
                onClick={() => {
                  close()
                  openManager('categorias')
                }}
              >
                ⚙️ Gestionar categorías
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReceiptRow({
  receipt,
  hasTicket,
  members,
  onEdit,
  onDelete,
}: {
  receipt: Receipt
  hasTicket: boolean
  members: FamilyMember[]
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [lines, setLines] = useState<ReceiptLineDetail[] | null>(null)
  const [loadingLines, setLoadingLines] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const purchaser = receipt.purchasedByMemberId ? members.find((m) => m.id === receipt.purchasedByMemberId) : null

  async function handleToggleExpand() {
    // Un gasto solo del banco (sin ticket subido) nunca tiene líneas de
    // producto que leer — no hay nada que desplegar.
    if (!hasTicket) return
    setExpanded((prev) => !prev)
    if (lines === null) {
      setLoadingLines(true)
      try {
        setLines(await listProductPricesByReceipt(receipt.id))
      } catch {
        setLines([])
      } finally {
        setLoadingLines(false)
      }
    }
  }

  async function handleViewTicket() {
    if (!receipt.storagePath || viewing) return
    setViewing(true)
    try {
      const url = await getReceiptUrl(receipt.storagePath)
      window.open(url, '_blank')
    } finally {
      setViewing(false)
    }
  }

  // Petición real: "Un ticket también [se debería poder compartir]" —
  // misma foto/PDF que "Ver ticket", pero al menú nativo del teléfono en
  // vez de a una pestaña nueva.
  async function handleShareTicket() {
    if (!receipt.storagePath || sharing) return
    setSharing(true)
    setShareError(null)
    try {
      const url = await getReceiptUrl(receipt.storagePath)
      const ext = receipt.storagePath.split('.').pop() || 'jpg'
      const file = await fetchAsShareableFile(url, `ticket-${receipt.receiptDate}.${ext}`, ext === 'pdf' ? 'application/pdf' : 'image/jpeg')
      const shared = await shareFiles([file], { title: `Ticket ${receipt.store ?? ''} ${receipt.receiptDate}`.trim() })
      if (!shared) window.open(url, '_blank')
    } catch (err) {
      setShareError(errorMessage(err, 'No se pudo compartir'))
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="card receipt-row">
      <div className="receipt-row-main">
        <button type="button" className="receipt-row-summary" onClick={handleToggleExpand}>
          <span>{receipt.receiptDate}</span>
          {receipt.totalAmount != null && <span> · {receipt.totalAmount.toFixed(2)} €</span>}
          <span> · {isPendingCategory(receipt.category) ? <span className="pending-tag">⏳ {PENDING_LABEL}</span> : receipt.category}</span>
          {purchaser && <span className="muted"> · {purchaser.name}</span>}
          {/* Petición real: "que marque con un símbolo 'falta ticket'
              los que no se haya subido el ticket" — este gasto se sabe
              solo por el banco, nadie ha subido la foto del ticket
              todavía; se edita/categoriza desde Movimientos o Banco, no
              aquí (no hay ningún ticket real que editar). */}
          {!hasTicket && (
            <span className="muted receipt-row-missing-ticket" title="Este gasto llegó del banco — nadie ha subido su ticket todavía">
              📎 falta ticket
            </span>
          )}
        </button>
        <div className="receipt-row-actions">
          {hasTicket ? (
            <>
              {receipt.storagePath && (
                <>
                  <button type="button" className="icon-button" onClick={handleViewTicket} aria-label="Ver ticket" title="Ver ticket">
                    👁
                  </button>
                  <button type="button" className="icon-button-share" onClick={handleShareTicket} aria-label="Compartir ticket" title="Compartir">
                    📤
                  </button>
                </>
              )}
              <button type="button" className="icon-button" onClick={onEdit} aria-label="Editar ticket" title="Editar">
                ✏️
              </button>
              <ConfirmIconButton icon="✕" onConfirm={onDelete} ariaLabel="Borrar ticket" className="icon-button" />
            </>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              Ver en Banco →
            </span>
          )}
        </div>
      </div>
      {shareError && <p className="error" style={{ margin: '4px 0 0' }}>{shareError}</p>}
      {expanded && (
        <div className="receipt-row-detail">
          {loadingLines && <p className="muted">Cargando detalle…</p>}
          {!loadingLines && lines && lines.length === 0 && (
            <p className="muted">No se guardó el detalle de productos de este ticket.</p>
          )}
          {!loadingLines &&
            lines &&
            lines.map((l) => (
              <p key={l.id} className="muted receipt-row-detail-line">
                {l.name}
                {l.quantity && ` · ${l.quantity} ud`} · {l.price.toFixed(2)} €/ud
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

interface DraftLine {
  name: string
  quantity: string
  price: string // importe TOTAL de la línea (cantidad × precio unitario), no el precio por unidad
  // Si el usuario toca el símbolo de clasificación y elige una, gana
  // sobre lo que hubiera adivinado resolveDraftLineClass — undefined
  // deja que se seguisa recalculando sola mientras cambia el nombre.
  classOverride?: { kind: FoodTypeKind; classification: string }
}

type OcrStatus = 'idle' | 'reading' | 'done' | 'error'

// Petición real: "quiero que integres el símbolo de la clasificación de
// cada producto... cuando es un producto nuevo quiero que le pongas una
// marca de Nuevo... muchas clasificaciones las he tenido que retocar" —
// antes de este cambio, las líneas leídas de un ticket (OCR o a mano) no
// mostraban ninguna clasificación; se corregía después, producto a
// producto, desde Historial de precios. Ahora se resuelve aquí mismo,
// en el momento de revisar el ticket: si el nombre ya coincide con un
// producto conocido de la familia, se usa su clasificación real (y
// nunca lleva "Nuevo"); si no, se adivina con el mismo criterio de
// siempre — classifyFoodType por el nombre (misma suposición de comida
// para TODAS las tiendas: la tienda no decide qué es un producto; no se
// guarda como decisión) — y se marca "Nuevo" para que se revise.
function normalizeProductName(name: string): string {
  return name.trim().toLowerCase()
}

interface ResolvedDraftLine {
  isNew: boolean
  kind: FoodTypeKind
  classification: string
  icon: string
  // De dónde sale `kind`: 'override' = elección explícita de la familia; 'shared' = aprendizaje compartido aprobado; 'default' = solo la
  // suposición de un producto NUEVO (comida) o lo ya guardado del producto. Solo las dos primeras son evidencia que se puede guardar.
  kindSource: 'override' | 'shared' | 'default'
}

function resolveDraftLineClass(
  line: DraftLine,
  productByNormalizedName: Map<string, Product>,
  foodTypesByKind: Record<FoodTypeKind, FamilyFoodType[]>,
  // Resultado del aprendizaje compartido para (tienda de ESTE ticket, texto de esta línea); null si no hay o no está cargado.
  shared: SharedClassHint | null = null,
): ResolvedDraftLine {
  const existing = productByNormalizedName.get(normalizeProductName(line.name))
  const isNew = !existing
  let kind: FoodTypeKind
  let classification: string
  let kindSource: ResolvedDraftLine['kindSource'] = 'default'
  if (line.classOverride) {
    // Elección explícita de la familia al revisar el ticket: manda sobre todo lo demás.
    kind = line.classOverride.kind
    classification = line.classOverride.classification
    kindSource = 'override'
  } else {
    // Resolutor central (domain/productClass.ts): clase elegida por la familia → aprendizaje compartido de la tienda del
    // ticket → clase histórica → reglas por nombre. Un producto ya conocido pero sin clasificar a mano se enseña igual que en
    // Historial de precios ("Automático") en vez de dejarlo en blanco.
    // Producto conocido: manda el conjunto de SU clase (la tienda no decide qué es un producto); sin clase conocida, la marca heredada
    // non_food. Un producto NUEVO parte de la suposición de comida en el borrador (igual en TODAS las tiendas, Amazon incluida; ni la tienda
    // ni la categoría del ticket lo deciden) y NO se guarda como decisión: solo una elección de la familia o el aprendizaje compartido.
    kind = existing ? (existing.classKind ?? (existing.nonFood ? 'no_alimentos' : 'alimentacion')) : 'alimentacion'
    const resolved = resolveProductClassSafe({
      name: existing?.displayName ?? line.name,
      product: existing ?? null,
      kind,
      kindIsDefault: !existing, // producto nuevo: el conjunto es solo una suposición por tienda; lo compartido aprobado puede fijarlo
      familyClasses: [...foodTypesByKind.alimentacion, ...foodTypesByKind.no_alimentos],
      shared: line.name.trim() ? shared : null,
    })
    // Sin nombre todavía no hay nada que adivinar (igual que antes).
    classification = existing || line.name.trim() ? resolved.className : ''
    if (resolved.source === 'shared') {
      kind = resolved.kind
      kindSource = 'shared'
    }
  }
  const known = classification ? foodTypesByKind[kind].find((t) => t.name === classification) : undefined
  const icon = known?.icon ?? (classification ? (kind === 'alimentacion' ? '🍽️' : '❓') : kind === 'alimentacion' ? '🍽️' : '❓')
  return { isNew, kind, classification, icon, kindSource }
}

// Petición real: "que al tocar el símbolo se abra el menú de clases
// para poder modificarlo" — mismo desplegable Alimentos/Otros que
// "Clasificaciones de productos" (ShoppingScreen), condensado para caber
// bajo una línea de ticket.
function ReceiptLineClassPicker({
  resolved,
  foodTypesByKind,
  onChange,
}: {
  resolved: ResolvedDraftLine
  foodTypesByKind: Record<FoodTypeKind, FamilyFoodType[]>
  onChange: (next: { kind: FoodTypeKind; classification: string }) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ flex: '0 0 auto' }}>
      <button
        type="button"
        className="receipt-line-class-icon"
        onClick={() => setOpen((v) => !v)}
        title={resolved.classification || 'Sin clasificar — toca para elegir'}
      >
        {resolved.icon}
      </button>
      {open && (
        <div className="category-picker-panel" style={{ marginTop: 4 }}>
          <div className="filter-row" style={{ padding: '6px 8px 0' }}>
            <button
              type="button"
              className={'chip' + (resolved.kind === 'alimentacion' ? ' chip-active' : '')}
              onClick={() => onChange({ kind: 'alimentacion', classification: '' })}
            >
              Alimentos
            </button>
            <button
              type="button"
              className={'chip' + (resolved.kind === 'no_alimentos' ? ' chip-active' : '')}
              onClick={() => onChange({ kind: 'no_alimentos', classification: '' })}
            >
              Otros
            </button>
          </div>
          {foodTypesByKind[resolved.kind].map((t) => (
            <button
              key={t.id}
              type="button"
              className={'category-picker-row' + (resolved.classification === t.name ? ' chip-active' : '')}
              onClick={() => {
                onChange({ kind: resolved.kind, classification: t.name })
                setOpen(false)
              }}
            >
              {t.icon} {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Mismo formulario para subir un ticket nuevo y para editar uno ya
// guardado (petición real: "cuando se quiera editar el ticket debe
// abrirse el mismo formulario que para subirlo") — en modo edición se
// precarga con los datos del ticket y sus líneas ya leídas (reconstruidas
// desde el Historial, Skill 09), y no hay selector de foto/OCR porque el
// archivo ya está subido.
function ReceiptForm({
  mode,
  receipt,
  onDone,
  onCancel,
  knownStores,
  existingFolders,
  categories,
  members,
}: {
  mode: 'add' | 'edit'
  receipt?: Receipt
  onDone: () => void
  onCancel?: () => void
  knownStores: string[]
  existingFolders: string[]
  categories: BudgetCategory[]
  members: FamilyMember[]
}) {
  const [file, setFile] = useState<File | null>(null)
  const [store, setStore] = useState(receipt?.store ?? '')
  const [receiptDate, setReceiptDate] = useState(receipt?.receiptDate ?? toDateStr(new Date()))
  const [totalAmount, setTotalAmount] = useState(receipt?.totalAmount != null ? String(receipt.totalAmount) : '')
  // Un ticket nuevo parte de «Alimentación» (preselección visible, como siempre). Uno existente sin categoría (NULL, pendiente) se abre
  // SIN categoría: abrirlo o guardarlo no lo convierte en Alimentación.
  const [category, setCategory] = useState(receipt ? (receipt.category ?? '') : 'Alimentación')
  const [purchasedByMemberId, setPurchasedByMemberId] = useState(receipt?.purchasedByMemberId ?? '')
  const [lines, setLines] = useState<DraftLine[]>([])
  // Líneas leídas del ticket que se han omitido por no ser productos (solo para avisar; no se guardan).
  const [skippedLines, setSkippedLines] = useState<string[]>([])
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('idle')
  const [loadingLines, setLoadingLines] = useState(mode === 'edit')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Catálogo de la familia (productos ya conocidos + sus clases), para
  // resolver el icono/"Nuevo" de cada línea leída — ver
  // resolveDraftLineClass.
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [foodTypesByKind, setFoodTypesByKind] = useState<Record<FoodTypeKind, FamilyFoodType[]>>({
    alimentacion: [],
    no_alimentos: [],
  })
  // Petición real: "en la parte que emerge al leer un ticket debería
  // estar accesible el botón engranaje de crear nuevas clases de
  // productos" — antes solo se podía crear una clase nueva yendo a
  // Historial de precios y volviendo; ahora el mismo ⚙️ está aquí
  // mismo, junto a "Productos leídos".
  const [showFoodTypesModal, setShowFoodTypesModal] = useState(false)
  const productByNormalizedName = useMemo(
    () => new Map(allProducts.map((p) => [p.normalizedName, p])),
    [allProducts],
  )
  // Aprendizaje compartido de la tienda de ESTE ticket para cada línea leída (un solo lote, con espera al teclear).
  const lineSharedPairs = useMemo(
    () => (store.trim() ? lines.filter((l) => l.name.trim()).map((l) => ({ store, text: l.name })) : []),
    [lines, store],
  )
  const lineShared = useSharedClasses(lineSharedPairs, 350)

  useEffect(() => onManagersChanged(() => void reloadFoodTypes()), [])

  function reloadFoodTypes() {
    return Promise.all([listFamilyFoodTypes('alimentacion'), listFamilyFoodTypes('no_alimentos')]).then(
      ([foodKinds, noFoodKinds]) => setFoodTypesByKind({ alimentacion: foodKinds, no_alimentos: noFoodKinds }),
    )
  }

  useEffect(() => {
    Promise.all([listProducts(), listFamilyFoodTypes('alimentacion'), listFamilyFoodTypes('no_alimentos')])
      .then(([products, foodKinds, noFoodKinds]) => {
        setAllProducts(products)
        setFoodTypesByKind({ alimentacion: foodKinds, no_alimentos: noFoodKinds })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (mode !== 'edit' || !receipt) return
    listProductPricesByReceipt(receipt.id)
      .then((detail) =>
        setLines(
          detail.map((l) => {
            const qty = Number(l.quantity)
            const totalLinePrice = Number.isFinite(qty) && qty > 0 ? l.price * qty : l.price
            return { name: l.name, quantity: l.quantity ?? '1', price: totalLinePrice.toFixed(2) }
          }),
        ),
      )
      .catch(() => {})
      .finally(() => setLoadingLines(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, receipt?.id])

  async function handleReadTicket() {
    if (!file) return
    setOcrStatus('reading')
    setError(null)
    try {
      const parsed = await analyzeReceiptPhoto(file)
      // Lleva "MERCADONA, S.A." al nombre ya dado de alta en Compras
      // ("Mercadona") cuando coincide, para no crear un grupo de
      // tickets distinto por cada variante del mismo nombre.
      const readStore = parsed.store ? (findKnownStore(parsed.store, knownStores)?.store ?? parsed.store) : store
      if (parsed.store) setStore(readStore)
      if (parsed.date) setReceiptDate(parsed.date)
      if (parsed.total != null) setTotalAmount(String(parsed.total))
      // Las líneas que no son productos (PARKING de Mercadona...) no llegan ni a la revisión: el ticket conserva su total y su foto.
      const { products: productLines, skipped } = partitionTicketLines(readStore, parsed.items)
      setSkippedLines(skipped.map((s) => s.line.name.trim()))
      setLines(productLines.map((l) => ({ name: l.name, quantity: String(l.quantity), price: l.price.toFixed(2) })))
      setOcrStatus('done')
    } catch (err) {
      setOcrStatus('error')
      setError(errorMessage(err, 'No se pudo leer el ticket'))
    }
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  function addBlankLine() {
    setLines((prev) => [...prev, { name: '', quantity: '1', price: '' }])
  }

  async function saveLines(receiptId: string) {
    // En paralelo, no uno a uno: con muchos productos leídos, guardarlos
    // en serie tardaba tanto (una llamada de red por línea) que parecía
    // que se había quedado colgado en "Subiendo…" — bug real detectado
    // al probar con un ticket de varias líneas.
    await Promise.all(
      lines
        .filter((line) => line.name.trim() && !Number.isNaN(Number(line.price)))
        .map(async (line) => {
          // "Precio" es el importe TOTAL de la línea ("3 cervezas,
          // 3,30€"), no el precio de una — bug real reportado: se
          // guardaba tal cual y la Memoria de precios enseñaba 3,30€
          // como si fuera el precio de una unidad. Se divide entre
          // las unidades para guardar siempre precio por unidad.
          const units = Number(line.quantity)
          const unitPrice = Number.isFinite(units) && units > 0 ? Number(line.price) / units : Number(line.price)
          const { productId } = await recordProductPurchase({
            name: line.name.trim(),
            price: unitPrice,
            quantity: line.quantity || '1',
            unit: '',
            store,
            date: receiptDate,
            receiptId,
          })
          // Una línea que no es un producto (PARKING en Mercadona...) se descarta antes de persistir: sin producto, sin precio, sin clase.
          if (productId == null) return
          // LA FAMILIA MANDA: solo la clase ELEGIDA A MANO al revisar este ticket se guarda en el producto (y queda confirmada).
          // La clase que resuelven solos el aprendizaje compartido, la clase histórica o las reglas NO se guarda: se resuelve al
          // leer (domain/productClass.ts), para no convertir una clasificación automática en una decisión falsamente humana.
          // Un producto ya confirmado y sin cambios en esta línea se deja tal cual.
          const resolved = resolveDraftLineClass(
            line,
            productByNormalizedName,
            foodTypesByKind,
            sharedHintFor(lineShared, store, line.name.trim()),
          )
          // La marca heredada non_food solo se guarda cuando hay EVIDENCIA: una elección de la familia (con clase → atómico en
          // setProductFoodType) o el aprendizaje compartido aprobado. Nunca una suposición por defecto, por la tienda o por la categoría
          // del ticket: un producto sin clase ni evidencia queda DESCONOCIDO (Fase 6C.2B).
          const explicitClass = line.classOverride?.classification || null
          await Promise.all([
            ...(line.classOverride ? [setProductFoodType(productId, explicitClass, line.classOverride.kind)] : []),
            ...(resolved.kindSource === 'shared' || (resolved.kindSource === 'override' && !explicitClass)
              ? [setProductNonFood(productId, resolved.kind === 'no_alimentos')]
              : []),
          ])
        }),
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'add' && !file) {
      setError('Elige una foto o archivo del ticket')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'add') {
        const receiptId = await uploadReceipt({
          file: file!,
          store,
          receiptDate,
          totalAmount: totalAmount ? Number(totalAmount) : null,
          category: category || null,
          purchasedByMemberId: purchasedByMemberId || null,
        })
        await saveLines(receiptId)
        setFile(null)
        setStore('')
        setTotalAmount('')
        setCategory('Alimentación')
        setPurchasedByMemberId('')
        setLines([])
        setOcrStatus('idle')
      } else if (receipt) {
        // La categoría de un ticket (y la de su gasto vinculado) se cambia SOLO con classify_purchase: atómica gasto ↔ ticket y sin pisar
        // en silencio (Fase 6C.2C). Un ticket sin gasto se clasifica solo a sí mismo; nunca se crea un gasto para clasificarlo. Un ticket
        // pendiente (NULL) que se guarda sin elegir categoría SIGUE pendiente: no se convierte en Alimentación.
        if (category !== '' && category !== (receipt.category ?? '')) {
          let result
          try {
            result = await classifyPurchase({ receiptId: receipt.id, category })
          } catch (err) {
            void reportClientError(err) // el detalle técnico se registra; la persona ve un mensaje comprensible
            setError(CLASSIFY_FAILED_MESSAGE)
            return
          }
          if (!classifyOk(result)) {
            setError(classifyMessage(result)) // conflicto / rechazo: nada se ha cambiado
            return
          }
        }
        await updateReceipt(receipt.id, {
          store,
          receiptDate,
          totalAmount: totalAmount ? Number(totalAmount) : null,
          purchasedByMemberId: purchasedByMemberId || null,
        })
        // Se sustituyen todas las líneas por las editadas, en vez de
        // intentar emparejar una a una con las que ya había.
        await deleteProductPricesByReceipt(receipt.id)
        await saveLines(receipt.id)
      }
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      {mode === 'add' && (
        <>
          <h2>Subir ticket</h2>
          <label>Foto o archivo</label>
          <FileOrPdfPicker
            file={file}
            onChange={(f) => {
              setFile(f)
              setLines([])
              setOcrStatus('idle')
            }}
          />
          {/* Petición real: "lo de subir ticket, ¿se puede poner algo más
              compacto?" — el aviso de que la foto se borra a los 3 meses
              sigue aquí, pero como nota pequeña bajo el propio picker de
              foto, no como párrafo aparte arriba de todo el formulario. */}
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            La foto se borra a los 3 meses (tienda, fecha e importe se quedan).
          </p>

          {file && (
            <button type="button" className="voice-mic-button" onClick={handleReadTicket} disabled={ocrStatus === 'reading'}>
              {ocrStatus === 'reading' ? 'Leyendo ticket… puede tardar unos segundos' : '📷 Leer ticket'}
            </button>
          )}
        </>
      )}

      {/* Petición real: "el ticket, ¿dónde quiero guardarlo? en
          Mercadona, en Hiperber, en Aldi, donde yo quiera" / "¿puedo yo
          decir dónde se meten? porque H Rafal II e Hiperber es lo
          mismo" — tocar la carpeta de destino en vez de escribirla.
          Antes era una fila de chips (uno por tienda) que ocupaba toda
          la pantalla con muchas tiendas — petición real: "ahí me haces
          un desplegable y me pones todas las tiendas que hay arriba me
          las metes dentro del desplegable, así damos con la aplicación
          más ordenada". Solo en editar: al SUBIR uno nuevo, ese mismo
          desplegable duplicaba "Establecimiento" (que ya autocompleta
          con las mismas tiendas vía datalist) — petición real: "lo de
          subir ticket, ¿se puede poner algo más compacto?". */}
      {mode === 'edit' && existingFolders.length > 0 && (
        <label>
          Mover a esta carpeta
          <select value={existingFolders.includes(store) ? store : ''} onChange={(e) => e.target.value && setStore(e.target.value)}>
            <option value="">— Elegir tienda —</option>
            {existingFolders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Establecimiento
        <input
          type="text"
          list="receipt-known-stores"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          placeholder="Mercadona"
        />
      </label>
      <div className="inline-fields">
        <label>
          Fecha
          <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
        </label>
        <label>
          Importe total (€)
          <input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
        </label>
      </div>
      <div className="inline-fields">
        <label>
          Categoría
          <CategorySelect value={category} onChange={setCategory} categories={categories} compact emptyLabel={receipt && receipt.category == null ? `⏳ ${PENDING_LABEL}` : undefined} />
        </label>
        <label>
          ¿Quién? (opcional)
          <select value={purchasedByMemberId} onChange={(e) => setPurchasedByMemberId(e.target.value)}>
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loadingLines && <p className="muted">Cargando productos leídos…</p>}
      {skippedLines.length > 0 && (
        <p className="muted">
          Se {skippedLines.length === 1 ? 'ha omitido 1 línea que no es' : 'han omitido ' + skippedLines.length + ' líneas que no son'} un producto
          ({[...new Set(skippedLines)].join(', ')}): no se guarda en Historial de precios ni cuenta en las estadísticas.
        </p>
      )}
      {!loadingLines && (ocrStatus === 'done' || mode === 'edit' || lines.length > 0) && (
        <div className="day-modal-group">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <p className="muted" style={{ flex: 1, margin: 0 }}>
              Productos leídos — revisa y corrige antes de guardar. El símbolo de la izquierda es la
              clasificación del producto (toca para cambiarla); "Nuevo" marca los que no reconoce de antes, para
              que repases si la ha adivinado bien. "Cant." es cuántas unidades se compraron y "Precio" el
              importe total de esa línea, no el precio de una sola unidad.
            </p>
            <button
              type="button"
              className="link-button"
              style={{ fontSize: 20, flex: 'none' }}
              onClick={() => setShowFoodTypesModal(true)}
              title="Clasificaciones de productos"
              aria-label="Clasificaciones de productos"
            >
              ⚙️
            </button>
          </div>
          {lines.map((line, i) => {
            const resolved = resolveDraftLineClass(
              line,
              productByNormalizedName,
              foodTypesByKind,
              sharedHintFor(lineShared, store, line.name.trim()),
            )
            return (
              <div key={i} className="receipt-line-card">
                <div className="receipt-line-row">
                  <ReceiptLineClassPicker
                    resolved={resolved}
                    foodTypesByKind={foodTypesByKind}
                    onChange={(next) => updateLine(i, { classOverride: next })}
                  />
                  <input
                    type="text"
                    value={line.name}
                    onChange={(e) => updateLine(i, { name: e.target.value, classOverride: undefined })}
                    placeholder="Producto"
                  />
                  {resolved.isNew && <span className="receipt-line-new-badge">Nuevo</span>}
                  <button type="button" className="link-button" onClick={() => removeLine(i)}>
                    ✕
                  </button>
                </div>
                <div className="receipt-line-row receipt-line-row-secondary">
                  <input
                    type="number"
                    className="receipt-line-qty"
                    min={1}
                    step={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    placeholder="Cant."
                    title="Cantidad comprada"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={line.price}
                    onChange={(e) => updateLine(i, { price: e.target.value })}
                    placeholder="Precio total"
                  />
                  {/* Mismo cálculo que se guarda de verdad — para pillar un
                      fallo de lectura antes de guardar, no después. */}
                  {Number(line.quantity) > 1 && !Number.isNaN(Number(line.price)) && (
                    <span className="muted">= {(Number(line.price) / Number(line.quantity)).toFixed(2)} €/ud</span>
                  )}
                </div>
              </div>
            )
          })}
          {lines.length === 0 && <p className="muted">No se ha reconocido ningún producto.</p>}
          <button type="button" className="link-button" onClick={addBlankLine}>
            + Añadir línea
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : mode === 'add' ? 'Guardar ticket' : 'Guardar'}
        </button>
        {mode === 'edit' && (
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
      {/* Portal, no inline: ProductTypesModal lleva su propio <form> (el
          alta de una clase nueva), y este componente entero ya vive
          dentro de un <form> (Guardar ticket) — dos <form> anidados es
          HTML inválido (el de dentro podría acabar enviando el de
          fuera al pulsar Intro). Montado aparte, en document.body, se
          evita el anidado sin tocar ProductTypesModal. */}
      {showFoodTypesModal &&
        createPortal(
          <ProductTypesModal
            types={[...foodTypesByKind.alimentacion, ...foodTypesByKind.no_alimentos]}
            initialKind={isFoodCategory(category, categories) ? 'alimentacion' : 'no_alimentos'}
            onClose={() => setShowFoodTypesModal(false)}
            onChanged={reloadFoodTypes}
          />,
          document.body,
        )}
    </form>
  )
}

// ---------------------------------------------------------------------
// Presupuestos (Skill 19)
// ---------------------------------------------------------------------

// Petición real: "un esquema de estadística, pero que sea redondo,
// como un quesito... la porción que se gasta de Mercadona, la porción
// de Hiperber... el tanto por ciento con el precio que corresponde" —
// mismo dato que el reparto por tienda de Tickets, pero como tarta en
// vez de barras. Mismo dónut tocable que el resto de la app (sin
// lista aparte): tocar una porción la resalta y muestra su importe en
// el centro.
function StorePieChart({
  groups,
  monthLabel,
  title = 'Reparto del gasto por tienda',
}: {
  groups: { store: string; total: number; color?: string }[]
  monthLabel: string
  title?: string
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0)
  const slices = groups.map((g) => ({ key: g.store, total: g.total, color: g.color }))
  const highlightedSlice = groups.find((g) => g.store === highlighted)
  const centerLabel = highlightedSlice ? { name: highlightedSlice.store, total: highlightedSlice.total } : { name: 'Todo', total: grandTotal }

  return (
    <div className="card event-card">
      <strong>{title} — {monthLabel}</strong>
      {grandTotal === 0 ? (
        <p className="muted">No hay tickets guardados ese mes.</p>
      ) : (
        <SvgDonut
          slices={slices}
          centerLabel={centerLabel}
          highlightedKey={highlighted}
          onSliceClick={(key) => setHighlighted((prev) => (prev === key ? null : key))}
        />
      )}
    </div>
  )
}

// Mismo dónut de tarjeta que StorePieChart, pero con "Ver movimientos
// →" al tocar una porción (BreakdownDonut) — petición real: "ponle a
// las estadísticas de compras los enlaces para filtrar los
// movimientos igual que en economía". `expenseIds` de cada porción
// viene ya calculado (mismos gastos que produjeron esa cifra, ver
// buildStorePieSlices en BudgetsTab).
function LinkedDonutCard({
  title,
  monthLabel,
  slices,
  onViewRecords,
}: {
  title: string
  monthLabel: string
  // `expenseIds` falta en los dónuts calculados a partir de precios
  // por producto (p. ej. tipo de alimento) — ahí no hay "Ver
  // movimientos" porque no hay un gasto real 1:1 con la porción.
  slices: (BreakdownSlice & { expenseIds?: string[] })[]
  onViewRecords?: (expenseIds: string[], label: string) => void
}) {
  const grandTotal = slices.reduce((sum, s) => sum + s.total, 0)
  const linkable = onViewRecords && slices.every((s) => s.expenseIds !== undefined)
  return (
    <div className="card event-card">
      <strong>
        {title} — {monthLabel}
      </strong>
      {grandTotal === 0 ? (
        <p className="muted">No hay tickets guardados ese mes.</p>
      ) : (
        <BreakdownDonut
          slices={slices}
          centerLabel={{ name: 'Todo', total: grandTotal }}
          onViewRecords={
            linkable
              ? (key) => {
                  const slice = slices.find((s) => s.key === key)
                  if (slice?.expenseIds) onViewRecords(slice.expenseIds, `${title} — ${slice.label}`)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

interface FoodTypeBreakdownEntry {
  key: string
  label: string
  icon: string
  color: string
  total: number
  count: number
  products: { productId: string; name: string; total: number }[]
  expenseIds: string[]
}

// Petición real: "debajo del dónut haz una lista como esta y que dando
// al producto se despliegue el detalle de los productos que
// constituyen esa clase con precio y porcentaje" — mismo patrón que
// byParentCategory en BudgetsOverview (fila padre con total, toca para
// desplegar), pero aquí el "padre" es el tipo de alimento y los
// "hijos" son los productos concretos que lo componen, con el % que
// representa cada uno DENTRO de su tipo (no del total general).
function FoodTypeBreakdownList({
  types,
  expandedKey,
  onToggle,
}: {
  types: FoodTypeBreakdownEntry[]
  expandedKey: string | null
  onToggle: (key: string) => void
}) {
  if (types.length === 0) return null
  const grandTotal = types.reduce((sum, t) => sum + t.total, 0)
  return (
    <div className="price-row-list" style={{ marginTop: 8 }}>
      {types.map((t) => {
        const isOpen = expandedKey === t.key
        return (
          <div key={t.key}>
            <button
              type="button"
              className="price-row"
              style={{
                width: '100%',
                background: t.color,
                border: 'none',
                borderRadius: 10,
                textAlign: 'left',
                color: 'var(--text)',
                fontWeight: 400,
                fontSize: 14,
                padding: '6px 4px',
                cursor: 'pointer',
              }}
              onClick={() => onToggle(t.key)}
            >
              <span className="price-row-name">
                {t.icon} {t.label} {isOpen ? '▾' : '▸'}
              </span>
              <span className="price-row-price">
                {t.total.toFixed(2)} €{' '}
                <span className="muted">({grandTotal > 0 ? ((t.total / grandTotal) * 100).toFixed(0) : 0}%)</span>
              </span>
            </button>
            {isOpen && (
              <div style={{ paddingLeft: 20 }}>
                {/* Zebra blanco/color de la propia clase — mismo criterio
                    que Historial de precios, para diferenciar filas sin
                    depender solo del texto. */}
                {t.products.map((p, i) => (
                  <div key={p.productId} className="price-row" style={{ background: i % 2 === 1 ? t.color : undefined }}>
                    <span className="price-row-name">{p.name}</span>
                    <span className="price-row-price">
                      {p.total.toFixed(2)} €{' '}
                      <span className="muted">({t.total > 0 ? ((p.total / t.total) * 100).toFixed(0) : 0}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Petición real: "cuando termina el mes, guardamos el presupuesto en
// el mes que corresponda... con lo que hemos gastado, como en un
// historial para poder consultarlo" — no hace falta "archivar" nada a
// mano: cada presupuesto ya lleva su propio mes (periodStart) y los
// gastos/tickets ya guardan su fecha para siempre, así que el
// historial YA EXISTE, solo hacía falta poder pasar de mes en mes
// para verlo, en vez de una lista larga con todos los meses
// mezclados. Mismo patrón de navegación que Gastos.
// Categorías con las que se siembra Presupuesto Generales la primera
// vez que se abre esa pestaña (petición real: "luz, agua, impuestos,
// taller, imprevistos, hipoteca, préstamos, gastos escolares... con
// emojis y nombres").
// Categorías de INGRESO sugeridas (petición real: "sueldo, regalo,
// ingreso") — mismo mecanismo que las de gasto, solo que agrupadas
// bajo 'ingresos' en vez de 'alimentacion'/'generales', así nunca
// entran por error en ningún cálculo de presupuesto (esos solo miran
// gastos, nunca ingresos, y solo esos dos grupos).
const INCOME_CATEGORY_SEED: { name: string; icon: string }[] = [
  { name: 'Sueldo', icon: '💼' },
  { name: 'Regalo', icon: '🎁' },
  { name: 'Ingreso', icon: '💰' },
]

interface CategorySeed {
  name: string
  icon: string
  necessity: 'debo' | 'necesito' | 'quiero' | null
  isFixed: boolean | null
  children?: CategorySeed[]
}

// Skill de Pepa, punto 9: taxonomía maestra del documento — 11
// categorías de gasto con sus subcategorías, clasificadas de fábrica
// en fijo/variable y debo/necesito/quiero según estándares contables
// habituales (debo: obligación contractual o legal; necesito: consumo
// básico; quiero: discrecional. fijo: importe recurrente pactado;
// variable: fluctúa con el consumo) — petición real: "la adjudicación
// no debería ser manual sino automática... clasificar cada categoría
// desde un principio, editable si se quiere después". Reemplaza la
// lista suelta anterior (Luz, Agua, Impuestos...); las familias que ya
// tenían esas categorías las conservan (0076_category_necessity_taxonomy.sql
// las integró en este mismo árbol).
const MASTER_CATEGORY_SEED: CategorySeed[] = [
  {
    name: 'Alimentación',
    icon: '🛒',
    necessity: 'necesito',
    isFixed: false,
    children: [
      { name: 'Supermercado, carnicería y tiendas de alimentación', icon: '🛒', necessity: 'necesito', isFixed: false },
      { name: 'Restaurantes, bares y cafeterías', icon: '🍽️', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Vivienda y hogar',
    icon: '🏠',
    necessity: 'necesito',
    isFixed: true,
    children: [
      { name: 'Alquiler / hipoteca', icon: '🏦', necessity: 'debo', isFixed: true },
      { name: 'Suministros', icon: '💡', necessity: 'necesito', isFixed: true },
      { name: 'Mantenimiento y hogar', icon: '🔨', necessity: 'necesito', isFixed: false },
      { name: 'Seguro de hogar', icon: '🛡️', necessity: 'debo', isFixed: true },
    ],
  },
  {
    name: 'Transporte y vehículo',
    icon: '🚗',
    necessity: 'necesito',
    isFixed: false,
    children: [
      { name: 'Combustible', icon: '⛽', necessity: 'necesito', isFixed: false },
      { name: 'Aparcamiento y peajes', icon: '🅿️', necessity: 'necesito', isFixed: false },
      { name: 'Transporte público / taxi', icon: '🚕', necessity: 'necesito', isFixed: false },
      { name: 'Mantenimiento y reparaciones', icon: '🔧', necessity: 'necesito', isFixed: false },
      { name: 'Seguro / financiación del vehículo', icon: '🚙', necessity: 'debo', isFixed: true },
    ],
  },
  {
    name: 'Compras y familia',
    icon: '🛍️',
    necessity: 'quiero',
    isFixed: false,
    children: [
      { name: 'Ropa y accesorios', icon: '👕', necessity: 'necesito', isFixed: false },
      { name: 'Niños', icon: '🧸', necessity: 'necesito', isFixed: false },
      { name: 'Casa y jardín', icon: '🏡', necessity: 'quiero', isFixed: false },
      { name: 'Tecnología y electrónica', icon: '📺', necessity: 'quiero', isFixed: false },
      { name: 'Mascotas', icon: '🐾', necessity: 'necesito', isFixed: false },
      { name: 'Regalos y compras varias', icon: '🎁', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Salud y bienestar',
    icon: '⚕️',
    necessity: 'necesito',
    isFixed: false,
    children: [
      { name: 'Salud y farmacia', icon: '💊', necessity: 'necesito', isFixed: false },
      { name: 'Belleza y cuidado personal', icon: '💅', necessity: 'quiero', isFixed: false },
      { name: 'Deporte y fitness', icon: '🏋️', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Ocio y viajes',
    icon: '🌴',
    necessity: 'quiero',
    isFixed: false,
    children: [
      { name: 'Ocio y cultura', icon: '🎭', necessity: 'quiero', isFixed: false },
      { name: 'Aficiones', icon: '🎨', necessity: 'quiero', isFixed: false },
      { name: 'Suscripciones y entretenimiento', icon: '🎬', necessity: 'quiero', isFixed: true },
      { name: 'Viajes y vacaciones', icon: '✈️', necessity: 'quiero', isFixed: false },
      { name: 'Eventos y celebraciones', icon: '🎉', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Comunicaciones y servicios',
    icon: '📱',
    necessity: 'necesito',
    isFixed: true,
    children: [
      { name: 'Teléfono e Internet', icon: '📶', necessity: 'necesito', isFixed: true },
      { name: 'Software y aplicaciones', icon: '💻', necessity: 'quiero', isFixed: true },
      { name: 'Otros servicios', icon: '🔌', necessity: 'necesito', isFixed: false },
    ],
  },
  {
    name: 'Finanzas y obligaciones',
    icon: '📑',
    necessity: 'debo',
    isFixed: true,
    children: [
      { name: 'Impuestos', icon: '🧾', necessity: 'debo', isFixed: true },
      { name: 'Préstamos e intereses', icon: '💳', necessity: 'debo', isFixed: true },
      { name: 'Seguros', icon: '🔒', necessity: 'debo', isFixed: true },
      { name: 'Comisiones y cargos', icon: '💸', necessity: 'debo', isFixed: false },
      { name: 'Multas / obligaciones', icon: '🚨', necessity: 'debo', isFixed: false },
      { name: 'Asesoría', icon: '🧑‍💼', necessity: 'debo', isFixed: false },
    ],
  },
  {
    name: 'Ahorro e inversión',
    icon: '💰',
    necessity: null,
    isFixed: null,
    children: [
      { name: 'Ahorro', icon: '🐷', necessity: null, isFixed: true },
      { name: 'Inversiones', icon: '📈', necessity: null, isFixed: false },
    ],
  },
  {
    name: 'Movimientos internos',
    icon: '🔄',
    necessity: null,
    isFixed: null,
    children: [
      { name: 'Transferencias entre cuentas propias', icon: '🔁', necessity: null, isFixed: null },
      { name: 'Cobro anulado', icon: '↩️', necessity: null, isFixed: null },
    ],
  },
  { name: 'Otros', icon: '📦', necessity: null, isFixed: null },
]

// Crea un árbol de dos niveles de golpe: primero las principales, y
// con sus ids ya reales las subcategorías apuntando a ellas (mismo
// mecanismo que ya usaba el sembrado plano, ahora con clasificación
// incluida).
async function seedCategoryTree(seed: CategorySeed[], budgetGroup: string): Promise<void> {
  const topInserted = await createBudgetCategoriesBulk(
    seed.map((s) => ({ name: s.name, icon: s.icon, budgetGroup, necessity: s.necessity, isFixed: s.isFixed })),
  )
  const idByName = new Map(topInserted.map((r) => [r.name, r.id]))
  const childInputs = seed.flatMap((s) =>
    (s.children ?? []).map((child) => ({
      name: child.name,
      icon: child.icon,
      budgetGroup,
      parentId: idByName.get(s.name) ?? null,
      necessity: child.necessity,
      isFixed: child.isFixed,
    })),
  )
  if (childInputs.length > 0) await createBudgetCategoriesBulk(childInputs)
}

// Presupuesto Alimentación y Presupuesto Generales son la MISMA
// pantalla, solo cambia el "grupo" de categorías/presupuestos que
// muestra cada una — petición real: "que todos los presupuestos estén
// conectados". Por eso BudgetsOverview (abajo) lee de TODOS los
// grupos a la vez: las estadísticas y el informe salen iguales se
// entre desde una pestaña o desde la otra.
export function BudgetsTab({
  group,
  seedCategories,
  accountsMode = 'compartido',
  myMemberId = null,
  onViewMovements,
}: {
  group: string
  seedCategories: CategorySeed[]
  accountsMode?: AccountsMode
  myMemberId?: string | null
  // Petición real: "ponle a las estadísticas de compras los enlaces
  // para filtrar los movimientos igual que en economía" — solo lo usa
  // Estadística compras (group === 'alimentacion'); Presupuesto
  // Generales no lo pasa, así que sigue sin estos enlaces por ahora.
  onViewMovements?: (filter: MovementsFilter) => void
}) {
  // Piso compartido — solo aplica a Presupuesto Generales ('generales');
  // Alimentación se sigue viendo entera por todos siempre (RLS ya lo
  // deja fuera del modo Separado, ver 0098_shared_accounts_mode.sql).
  const scopingActive = group === 'generales' && accountsMode === 'separado'
  const [scope, setScope] = useState<'personal' | 'comun'>('personal')
  // Qué tipo/clase está desplegado en la lista bajo el dónut "por
  // clasificación" — ver FoodTypeBreakdownList más abajo. Uno solo,
  // porque ahora Alimentos y Otros comparten el mismo dónut (ver
  // storeDonutScope) en vez de mostrarse los dos a la vez.
  const [expandedClassType, setExpandedClassType] = useState<string | null>(null)
  // Petición real: "falta otro [dónut por tienda] de Otros. Se podría
  // usar el mismo dónut con botón Alimentación/Otros" — luego extendido
  // también al dónut "por clasificación": un solo chip gobierna los dos.
  const [storeDonutScope, setStoreDonutScope] = useState<FoodTypeKind>('alimentacion')
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [knownStores, setKnownStores] = useState<string[]>([])
  const [storeEntries, setStoreEntries] = useState<ShoppingStoreEntry[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  // Solo para Estadística compras (group === 'alimentacion') — precio
  // por producto, para el dónut "por tipo de alimento" (ver más abajo).
  // Presupuesto Generales no los necesita, así que se quedan vacíos ahí.
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  // Excepción manual por producto (ver Historial de precios, ⚙️
  // Clasificaciones de alimentos) — el icono de cada clase, para
  // pintar el dónut/lista aunque sea una clase propia de la familia,
  // no una de las 11 de fábrica.
  const [foodTypes, setFoodTypes] = useState<FamilyFoodType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Petición real: "que una cosa filtre por mes físico y la otra por
  // mes contable confunde... pon un filtro que se aplique a toda la
  // página" — antes había DOS controles de fecha independientes (la
  // navegación ‹ Mes › de aquí y el propio "Fecha" de BudgetsOverview),
  // que podían quedar desincronizados. Ahora uno solo, para toda la
  // pestaña — mismo componente que ya se usaba en Resumen.
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  const [monthStartDay, setMonthStartDay] = useState(1)
  // Petición real: "cuando se anota manualmente el ingreso se refleja
  // en Movimientos y descuadra las cuentas reales... si hay cuentas
  // bancarias enlazadas no se anotan ingresos manualmente y se refleja
  // el ingreso sumado de movimientos" — hace falta saber si la familia
  // tiene algún banco enlazado para decidir de dónde sale "Ingresos".
  const [hasBankAccounts, setHasBankAccounts] = useState(false)
  // Piso compartido: para poner nombre/avatar a cada dueño en el saldo
  // entre personas de la pestaña Común.
  const [members, setMembers] = useState<FamilyMember[]>([])
  // Evita sembrar las categorías sugeridas más de una vez por sesión
  // mientras se espera la respuesta del primer alta.
  const seededRef = useRef(false)

  // Petición real: "cada vez que edito un movimiento me devuelve al
  // inicio de la página" — ver mismo arreglo en la pestaña Banco.
  const hasLoadedOnceRef = useRef(false)

  function reload(): Promise<void> {
    if (!hasLoadedOnceRef.current) setLoading(true)
    return Promise.all([
      listBudgets(),
      listExpenses(),
      listReceipts(),
      listShoppingStores(),
      listBudgetCategories(),
      getFinanceMonthStartDay(),
      listBankAccounts(),
      listFamilyMembers(),
      group === 'alimentacion' ? listAllProductPrices() : Promise.resolve([]),
      group === 'alimentacion' ? listProducts() : Promise.resolve([]),
      group === 'alimentacion' ? listFamilyFoodTypes('alimentacion') : Promise.resolve([]),
      group === 'alimentacion' ? listFamilyFoodTypes('no_alimentos') : Promise.resolve([]),
    ])
      .then(async ([b, e, r, stores, cats, monthStart, accounts, m, p, prod, foodKindTypes, noFoodKindTypes]) => {
        // Primera vez que se abre esta pestaña y no tiene categorías
        // propias todavía — se dan de alta las sugeridas solas, sin
        // pedirlo (petición real: "me pones todas esas categorías").
        if (!seededRef.current && seedCategories.length > 0 && !cats.some((c) => c.budgetGroup === group)) {
          seededRef.current = true
          await seedCategoryTree(seedCategories, group)
          cats = await listBudgetCategories()
        }
        setBudgets(b)
        setExpenses(e)
        setReceipts(r)
        setKnownStores(stores.map((s) => s.name))
        setStoreEntries(stores)
        setCategories(cats)
        setMonthStartDay(monthStart)
        setHasBankAccounts(accounts.length > 0)
        setMembers(m)
        setPrices(p)
        setProducts(prod)
        setFoodTypes([...foodKindTypes, ...noFoodKindTypes])
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        hasLoadedOnceRef.current = true
        setLoading(false)
      })
  }

  useEffect(() => {
    void reload()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Un presupuesto creado o cambiado desde fuera de esta pantalla (Hablar con PEPA) llega por aviso y se vuelve a
  // cargar aquí, sin cambiar de página. Siempre la última versión de reload (no la del primer render).
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  useEffect(() => subscribeBudgetsChanged(() => reloadRef.current()), [])

  // Aprendizaje compartido para las líneas de compra de Estadística compras: el (tienda de CADA precio, texto del producto),
  // en un solo lote. Un producto comprado en varias tiendas se resuelve por fila con la tienda de esa fila.
  const priceSharedPairs = useMemo(() => {
    const nameById = new Map(products.map((p) => [p.id, p.displayName]))
    const seen = new Set<string>()
    const pairs: { store: string; text: string }[] = []
    for (const pr of prices) {
      const name = nameById.get(pr.productId)
      if (!name || !pr.store) continue
      const key = `${pr.store}${name}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push({ store: pr.store, text: name })
    }
    return pairs
  }, [prices, products])
  const priceShared = useSharedClasses(priceSharedPairs)

  if (loading) return <p className="muted">Cargando presupuestos…</p>

  const [periodFrom, periodTo] = rangeForPreset(preset, customFrom, customTo, monthStartDay)
  const periodTitle = periodLabelForTitle(preset, periodFrom, periodTo)
  const groupCategories = categories.filter((c) => c.budgetGroup === group)
  // Piso compartido: Individual = lo tuyo (owner_member_id no nulo, RLS
  // ya solo entrega el tuyo); Común = owner_member_id null. Sin modo
  // Separado activo (o en Alimentación), todo se ve junto como siempre.
  const scopedExpenses = scopingActive ? expenses.filter((e) => (scope === 'comun' ? e.shared : !e.shared)) : expenses
  const scopedBudgets = scopingActive ? budgets.filter((b) => (scope === 'comun' ? b.ownerMemberId === null : b.ownerMemberId !== null)) : budgets
  const groupBudgets = scopedBudgets.filter((b) => b.budgetGroup === group)
  // El total de Alimentación (y el de cada categoría) sale SIEMPRE de
  // `expenses`, nunca sumando receipts.total_amount aparte — cada
  // ticket con importe ya crea su propio gasto real con la misma
  // categoría (uploadReceipt), así que sumar las dos cosas contaría el
  // mismo euro dos veces. Ver domain/finance.ts (isFoodCategory /
  // budgetSpent) para la misma regla aplicada a los presupuestos
  // guardados.
  // Un traspaso entre cuentas propias no es gasto real (ver mismo
  // criterio en Resumen/Estadísticas/BudgetsOverview) — se excluye
  // aquí también, que es lo que alimenta el dónut "Reparto del gasto
  // por categoría" de más abajo.
  const monthRealExpenses = scopedExpenses.filter(
    (e) =>
      e.expenseDate >= periodFrom &&
      e.expenseDate <= periodTo &&
      !e.isIncome &&
      e.kind === 'real' &&
      !isInternalTransferCategory(e.category, categories),
  )
  // Piso compartido: ingresos compartidos a Común (ver
  // SharedBalanceCard para cómo se combinan con los gastos en "Saldo
  // entre personas" — dos rondas de feedback real hasta dar con la
  // cuenta correcta).
  // FASE 6D.3 — auditoría: esto NO es "ingreso real familiar" (isRealIncome), es "cuánto ha depositado cada miembro en la cuenta
  // común" para el reparto justo del piso compartido. Si una devolución cae en la cuenta común, sigue siendo dinero que reduce lo
  // que ese miembro debe — se queda intencionalmente fuera de isRealIncome/isRefund, no se toca.
  const monthSharedDeposits = scopedExpenses.filter(
    (e) => e.expenseDate >= periodFrom && e.expenseDate <= periodTo && e.isIncome && e.kind === 'real' && !isInternalTransferCategory(e.category, categories),
  )
  // Petición real: "porque partimos de que todos los alimentos se
  // compran en supermercados y aunque en parte es correcto también hay
  // otros productos que se compran allí" — antes un ticket entero
  // contaba como 100% Alimentación o 100% Otros según su categoría, así
  // que un producto "Otros" suelto en un ticket de Mercadona no
  // cuadraba entre "por tienda" y "por clasificación" (y al revés: un
  // cobro de C&A/H&M sin ticket detrás, todo Otros por tienda, no
  // aparecía en absoluto en "por clasificación" por no tener ningún
  // product_price). Ahora cada gasto se reparte por lo que de verdad
  // sabe de sus productos, no por una única etiqueta de todo el ticket:
  // - Sin ticket detrás: 100% al lado que diga su categoría de
  //   Economía, salvo que se haya clasificado a mano desde Movimientos
  //   (ver product_classification / EditExpenseInline) — entonces manda
  //   esa clase.
  // - Con ticket: se suma el precio de cada línea según SU propia
  //   clasificación (automática en Alimentos, manual en Otros); lo que
  //   no esté desglosado en el ticket (o el ticket no tiene ninguna
  //   línea) cae también al lado de su categoría, como "Sin
  //   clasificar" — así el total de "por clasificación" cuadra siempre
  //   con el de "por tienda", aunque no todo esté desglosado.
  const productById = new Map(products.map((p) => [p.id, p]))
  const { nonFoodProductIds, foodProductIds } = buildProductKindSets(products)
  const foodReceiptIdsForPrices = buildFoodReceiptIds(receipts, categories)
  const periodPrices = prices.filter((pr) => pr.recordedDate >= periodFrom && pr.recordedDate <= periodTo)
  const receiptByExpenseId = new Map(receipts.filter((r) => r.expenseId).map((r) => [r.expenseId as string, r]))
  const pricesByReceiptId = new Map<string, ProductPrice[]>()
  for (const pr of periodPrices) {
    if (!pr.receiptId) continue
    pricesByReceiptId.set(pr.receiptId, [...(pricesByReceiptId.get(pr.receiptId) ?? []), pr])
  }
  // Excepción manual por producto (ver Historial de precios, ⚙️
  // Clasificaciones de productos): si `category` ya tiene una clase
  // elegida a mano, gana sobre la que habría adivinado classifyFoodType
  // por el nombre (solo existe ese adivinador para Alimentos); en Otros
  // no hay ninguno, así que sin elegir cae en "Sin clasificar".
  const foodTypeIconByName = new Map(foodTypes.filter((t) => t.kind === 'alimentacion').map((t) => [t.name, t.icon]))
  const noAlimentosTypeIconByName = new Map(foodTypes.filter((t) => t.kind === 'no_alimentos').map((t) => [t.name, t.icon]))
  const foodTypeKindByName = new Map(foodTypes.map((t) => [t.name, t.kind]))

  const SIN_CLASIFICAR = { name: 'Sin clasificar', icon: '❓' }
  interface ExpenseSplit {
    expense: Expense
    store: string
    foodAmount: number
    nonFoodAmount: number
    // Producto SIN CLASIFICAR (naturaleza desconocida): no es Alimentos ni Otros. No confundir con «pendiente de clasificar» (categoría NULL).
    unknownAmount: number
  }
  const foodClassEntries: ClassifiableEntry[] = []
  const noAlimentosClassEntries: ClassifiableEntry[] = []
  const splits: ExpenseSplit[] = []
  for (const e of monthRealExpenses) {
    const receipt = receiptByExpenseId.get(e.id)
    // Un ticket SIN categoría (NULL, pendiente) no es «no alimentación»: simplemente no se sabe (Fase 6C.2B decidirá cómo mostrarlo).
    const isTicketNonFood = receipt != null && receipt.category != null && !isFoodCategory(receipt.category, categories)
    const baseIsFood = isFoodCategory(e.category, categories)
    // Un gasto PENDIENTE de clasificar (category NULL) con ticket también entra: sus productos se reparten por su propia naturaleza.
    const isPending = isPendingCategory(e.category)
    if (!baseIsFood && !isComprasFamiliaCategory(e.category, categories) && !isTicketNonFood && !(isPending && receipt != null)) continue
    const store = canonicalStoreName(e.store, knownStores)
    const lines = receipt ? (pricesByReceiptId.get(receipt.id) ?? []) : []
    let foodAmount = 0
    let nonFoodAmount = 0
    let unknownAmount = 0
    if (lines.length > 0) {
      let itemizedFood = 0
      let itemizedNonFood = 0
      let itemizedUnknown = 0
      for (const pr of lines) {
        const product = productById.get(pr.productId)
        const displayName = product?.displayName ?? '?'
        const qty = Number(pr.quantity)
        const amount = pr.price * (Number.isFinite(qty) && qty > 0 ? qty : 1)
        const nature = purchaseNature(pr, foodReceiptIdsForPrices, nonFoodProductIds, foodProductIds)
        if (nature === 'desconocido') {
          // Ni Alimentos ni Otros: se contabiliza aparte como «Productos sin clasificar».
          itemizedUnknown += amount
        } else if (nature === 'alimentacion') {
          itemizedFood += amount
          // Resolutor central; la tienda es la de ESTA compra (product_price), nunca una atribuida al producto en general.
          const auto = classifyFoodType(displayName)
          const typeName = resolveProductClassSafe({
            name: displayName,
            product: product ?? null,
            kind: 'alimentacion',
            familyClasses: foodTypes,
            shared: sharedHintFor(priceShared, pr.store, displayName),
          }).className
          const icon = foodTypeIconByName.get(typeName) ?? (typeName === auto.label ? auto.icon : '🍽️')
          foodClassEntries.push({ itemId: pr.productId, displayName, amount, type: { name: typeName, icon }, expenseId: e.id })
        } else {
          itemizedNonFood += amount
          const typeName =
            resolveProductClassSafe({
              name: displayName,
              product: product ?? null,
              kind: 'no_alimentos',
              familyClasses: foodTypes,
              shared: sharedHintFor(priceShared, pr.store, displayName),
            }).className || SIN_CLASIFICAR.name
          const icon = noAlimentosTypeIconByName.get(typeName) ?? SIN_CLASIFICAR.icon
          noAlimentosClassEntries.push({ itemId: pr.productId, displayName, amount, type: { name: typeName, icon }, expenseId: e.id })
        }
      }
      foodAmount = itemizedFood
      nonFoodAmount = itemizedNonFood
      unknownAmount = itemizedUnknown
      const remainder = e.amount - itemizedFood - itemizedNonFood - itemizedUnknown
      if (remainder > 0.005) {
        if (isPending) {
          // Lo que el ticket no desglosa, en un gasto pendiente, no se atribuye a Otros: no se sabe qué es.
          unknownAmount += remainder
        } else {
          const target = baseIsFood ? foodClassEntries : noAlimentosClassEntries
          target.push({ itemId: `sin-detalle:${e.id}`, displayName: e.store ?? 'Compra', amount: remainder, type: SIN_CLASIFICAR, expenseId: e.id })
          if (baseIsFood) foodAmount += remainder
          else nonFoodAmount += remainder
        }
      }
    } else {
      const manualKind = e.productClassification ? foodTypeKindByName.get(e.productClassification) : undefined
      if (manualKind === 'alimentacion' && e.productClassification) {
        foodAmount = e.amount
        const icon = foodTypeIconByName.get(e.productClassification) ?? '🍽️'
        foodClassEntries.push({ itemId: e.id, displayName: e.store ?? 'Compra', amount: e.amount, type: { name: e.productClassification, icon }, expenseId: e.id })
      } else if (manualKind === 'no_alimentos' && e.productClassification) {
        nonFoodAmount = e.amount
        const icon = noAlimentosTypeIconByName.get(e.productClassification) ?? '❓'
        noAlimentosClassEntries.push({ itemId: e.id, displayName: e.store ?? 'Compra', amount: e.amount, type: { name: e.productClassification, icon }, expenseId: e.id })
      } else if (baseIsFood) {
        foodAmount = e.amount
        foodClassEntries.push({ itemId: e.id, displayName: e.store ?? 'Compra', amount: e.amount, type: SIN_CLASIFICAR, expenseId: e.id })
      } else if (isPending) {
        unknownAmount = e.amount // pendiente y sin desglose: no se atribuye ni a Alimentos ni a Otros
      } else {
        nonFoodAmount = e.amount
        noAlimentosClassEntries.push({ itemId: e.id, displayName: e.store ?? 'Compra', amount: e.amount, type: SIN_CLASIFICAR, expenseId: e.id })
      }
    }
    splits.push({ expense: e, store, foodAmount, nonFoodAmount, unknownAmount })
  }

  const alimentacionExpenses = splits.filter((s) => s.foodAmount > 0).map((s) => s.expense)
  const noAlimentosExpenses = splits.filter((s) => s.nonFoodAmount > 0).map((s) => s.expense)
  const alimentacionTotal = splits.reduce((sum, s) => sum + s.foodAmount, 0)
  const noAlimentosTotal = splits.reduce((sum, s) => sum + s.nonFoodAmount, 0)
  // Productos SIN CLASIFICAR (naturaleza desconocida): forman parte de lo registrado en compras, pero no son Alimentos ni Otros.
  const sinClasificarTotal = splits.reduce((sum, s) => sum + s.unknownAmount, 0)
  const comprasTotal = alimentacionTotal + noAlimentosTotal + sinClasificarTotal
  const totalGastadoPeriodo = monthRealExpenses.reduce((sum, e) => sum + e.amount, 0)
  const pctOf = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0)

  // Petición real: "debajo del dónut haz una lista... que dando al
  // producto se despliegue el detalle de los productos que
  // constituyen esa clase con precio y porcentaje" — se agrupa a la
  // vez por tipo y, dentro de cada tipo, por producto exacto (ver
  // buildProductTypeBreakdown, coloreado sin repetirse igual que
  // categoryColors).
  const foodTypeBreakdown = buildProductTypeBreakdown(foodClassEntries)
  const foodTypePieGroups: (BreakdownSlice & { expenseIds: string[] })[] = foodTypeBreakdown.map((t) => ({
    key: t.key,
    label: t.label,
    icon: t.icon,
    color: t.color,
    total: t.total,
    count: t.count,
    expenseIds: t.expenseIds,
  }))

  const noAlimentosTypeBreakdown = buildProductTypeBreakdown(noAlimentosClassEntries)
  const noAlimentosTypePieGroups: (BreakdownSlice & { expenseIds: string[] })[] = noAlimentosTypeBreakdown.map((t) => ({
    key: t.key,
    label: t.label,
    icon: t.icon,
    color: t.color,
    total: t.total,
    count: t.count,
    expenseIds: t.expenseIds,
  }))

  // Petición real: "falta otro [dónut por tienda] de Otros. Se podría
  // usar el mismo dónut con botón Alimentación/Otros" — un solo dónut
  // (ver storeDonutScope), el botón decide qué gastos lo alimentan.
  // Mismo reparto de colores en el dónut y en las barras por tienda:
  // las tiendas dadas de alta más todas las que aparecen en gastos y tickets.
  const storeColorOf = storeColorResolver(
    storeEntries,
    [...splits.map((s) => s.store), ...receipts.map((r) => canonicalStoreName(r.store, knownStores))],
    'chart',
  )
  const storePieSlicesAlimentacion = buildStorePieSlices(
    splits.filter((s) => s.foodAmount > 0).map((s) => ({ expenseId: s.expense.id, store: s.store, amount: s.foodAmount })),
    storeColorOf,
  )
  const storePieSlicesOtros = buildStorePieSlices(
    splits.filter((s) => s.nonFoodAmount > 0).map((s) => ({ expenseId: s.expense.id, store: s.store, amount: s.nonFoodAmount })),
    storeColorOf,
  )

  // Petición real: "las estadísticas en Tickets... trasládalas a
  // Estadísticas para que todo esté en el mismo sitio... dejar claro
  // que son los totales de los tickets, que son similares pero no
  // iguales" — mismo cálculo que tenía ReceiptsTab (receipts + el hueco
  // que rellena un cargo de banco de Alimentación sin ticket todavía),
  // solo movido aquí. A propósito NO usa storeDonutScope (Alimentación/
  // Otros): antes en Tickets se veían todas las tiendas juntas, de
  // cualquier tipo, y cambiar eso ahora sería alterar el dato, no solo
  // el sitio donde vive.
  const ticketBankOnlyExpenses = expenses.filter((e) => e.source === 'banco' && !e.isIncome && isFoodCategory(e.category, categories))
  const ticketDisplayReceipts: DisplayReceipt[] = [
    ...receipts.map((r) => ({ ...r, hasTicket: true })),
    ...ticketBankOnlyExpenses.map(
      (e): DisplayReceipt => ({
        id: `bank:${e.id}`,
        familyId: e.familyId,
        storagePath: null,
        store: e.store,
        receiptDate: e.expenseDate,
        totalAmount: e.amount,
        expenseId: e.id,
        notes: e.notes,
        category: e.category,
        purchasedByMemberId: null,
        hasTicket: false,
      }),
    ),
  ]
  const ticketRangeFiltered = ticketDisplayReceipts.filter((r) => r.receiptDate >= periodFrom && r.receiptDate <= periodTo)
  const ticketRangeGrouped = groupReceiptsByStore(ticketRangeFiltered, knownStores)
  const ticketStoreNames = groupReceiptsByStore(ticketDisplayReceipts, knownStores).map((g) => g.store)

  const catColors = stableCategoryColors(groupCategories)
  // Petición real: "quiero que estén ordenados por categorías
  // principales, todas las subcategorías de una categoría juntas" —
  // sin este orden explícito, las porciones/leyenda salían en el orden
  // en que llegan de la base de datos (sort_order), que con el bug de
  // sembrado duplicado (ver project_duplicate_category_seeding) ni
  // siquiera es un orden fiable. Se agrupa por el NOMBRE de la
  // categoría principal (no su id — mismo motivo que categoryColors),
  // padre primero dentro de su grupo, luego hijas por nombre.
  const sortedGroupCategories = [...groupCategories].sort((a, b) => {
    const groupA = a.parentId ? (groupCategories.find((p) => p.id === a.parentId)?.name ?? a.name) : a.name
    const groupB = b.parentId ? (groupCategories.find((p) => p.id === b.parentId)?.name ?? b.name) : b.name
    if (groupA !== groupB) return groupA.localeCompare(groupB, 'es')
    if (!a.parentId !== !b.parentId) return a.parentId ? 1 : -1
    return a.name.localeCompare(b.name, 'es')
  })
  // Petición real: "que sean solo las subcategorías" — ya no se añade
  // el bloque especial "Alimentación (total)" (duplicaba cada euro que
  // sus propias subcategorías ya representan); una categoría con hijas
  // solo aparece si tiene gasto puesto DIRECTAMENTE en ella (sin elegir
  // subcategoría), y se etiqueta como tal para que no parezca una
  // subcategoría más.
  // Categorías reales + «Pendiente de clasificar» (category NULL, bucket aparte y gris) = gasto total aplicable.
  const pendingInMonth = pendingSpending(monthRealExpenses)
  const categoryPieSlices =
    group === 'generales'
      ? sortedGroupCategories
          .map((c) => {
            const hasChildren = groupCategories.some((x) => x.parentId === c.id)
            return {
              store: `${c.icon} ${c.name}${hasChildren ? ' (sin subcategoría)' : ''}`,
              total: monthRealExpenses.filter((e) => e.category === c.name).reduce((sum, e) => sum + e.amount, 0),
              color: pastelOf(catColors.get(c.id)),
            }
          })
          .filter((s) => s.total > 0)
          .concat(pendingInMonth.amount > 0 ? [{ store: `⏳ ${PENDING_LABEL}`, total: pendingInMonth.amount, color: PENDING_SLICE_COLOR }] : [])
      : []

  // Petición real: "pon un filtro que se aplique a toda la página en
  // formato de botón con desplegable... 'mes contable' y 'mes real'"
  // — un único filtro para Resumen y el dónut, en vez de los dos
  // controles independientes de antes. En Estadística compras va ARRIBA
  // DEL TODO (petición real: "para que sea más claro que se aplica a
  // toda la página", antes quedaba debajo del Total Registrado, que
  // también depende de él); en Presupuesto Generales sigue donde estaba.
  const dateFilter = (
    <DateFilterTab
      preset={preset}
      onPresetChange={setPreset}
      customFrom={customFrom}
      onCustomFromChange={setCustomFrom}
      customTo={customTo}
      onCustomToChange={setCustomTo}
    />
  )

  return (
    <div>
      {error && <p className="error">{error}</p>}

      {group === 'alimentacion' && dateFilter}

      {/* Petición real: "Arriba donde pone total registrado en
          Alimentación cambiamos a Total Registrado en Compras" — el
          total ya no es solo Alimentación, es Alimentación + No
          alimentos, con el peso de cada uno debajo. */}
      {group === 'alimentacion' && (
        <div className="card event-card">
          <strong>Total Registrado en Compras</strong>
          <p style={{ margin: '4px 0' }}>
            {comprasTotal.toFixed(2)} €{' '}
            {/* Petición real: "detrás del total quiero en paréntesis el
                porcentaje del total gastado" — mismo pctOf que ya usan
                Alimentación/Otros justo debajo, aplicado ahora también
                al total conjunto. */}
            <span className="muted">({pctOf(comprasTotal, totalGastadoPeriodo).toFixed(0)}% del gasto total)</span>
          </p>
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>🛒 Alimentación</span>
              <strong>{alimentacionTotal.toFixed(2)} €</strong>
            </div>
            <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
              {pctOf(alimentacionTotal, comprasTotal).toFixed(0)}% de las compras · {pctOf(alimentacionTotal, totalGastadoPeriodo).toFixed(0)}% del gasto total
              {onViewMovements && alimentacionExpenses.length > 0 && (
                <>
                  {' — '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      onViewMovements({
                        label: `Alimentación — ${periodTitle}`,
                        from: periodFrom,
                        to: periodTo,
                        isIncome: false,
                        expenseIds: alimentacionExpenses.map((e) => e.id),
                      })
                    }
                  >
                    Ver movimientos →
                  </button>
                </>
              )}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>🛍️ Otros</span>
              <strong>{noAlimentosTotal.toFixed(2)} €</strong>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              {pctOf(noAlimentosTotal, comprasTotal).toFixed(0)}% de las compras · {pctOf(noAlimentosTotal, totalGastadoPeriodo).toFixed(0)}% del gasto total
              {onViewMovements && noAlimentosExpenses.length > 0 && (
                <>
                  {' — '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      onViewMovements({
                        label: `Otros — ${periodTitle}`,
                        from: periodFrom,
                        to: periodTo,
                        isIncome: false,
                        expenseIds: noAlimentosExpenses.map((e) => e.id),
                      })
                    }
                  >
                    Ver movimientos →
                  </button>
                </>
              )}
            </p>
            {/* Productos cuya naturaleza no se sabe (ni comida ni no comida): no se cuentan ni en Alimentos ni en Otros. Solo aparece si hay. */}
            {sinClasificarTotal > 0.005 && (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                ❔ Productos sin clasificar: {sinClasificarTotal.toFixed(2)} € ({pctOf(sinClasificarTotal, comprasTotal).toFixed(0)}% de las compras) — no cuentan
                ni en Alimentación ni en Otros hasta que les pongas una clase.
              </p>
            )}
          </div>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            Solo registro — no resta de ningún presupuesto. Cuenta para el Presupuesto General.
          </p>
          {/* Petición real: "pondría en algún lugar bien visible que la
              clasificación de productos... son sugerencias y que
              aconsejamos revisarlos" — las familias nuevas arrancan con
              clasificaciones ya heredadas (ver is_seed_template) o
              adivinadas por nombre (classifyFoodType); ambas pueden
              venir mal para un producto o una tienda concretos. */}
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            ℹ️ La clasificación de cada producto es una sugerencia (heredada o adivinada por su nombre) — revísala y
            corrígela si no encaja, tocando el icono en Tickets o el nombre en Historial de precios.
          </p>
        </div>
      )}

      {group !== 'alimentacion' && dateFilter}

      {/* Piso compartido, modo Separado: Individual (tu presupuesto) /
          Común (el de todos) — mismas pestañas de siempre, cambia solo
          qué presupuestos/gastos entran. */}
      {scopingActive && (
        <div className="filter-row" style={{ marginTop: 8 }}>
          <button type="button" className={'chip' + (scope === 'personal' ? ' chip-active' : '')} onClick={() => setScope('personal')}>
            Individual
          </button>
          <button type="button" className={'chip' + (scope === 'comun' ? ' chip-active' : '')} onClick={() => setScope('comun')}>
            Común
          </button>
        </div>
      )}
      {scopingActive && scope === 'comun' && (
        <SharedBalanceCard expenses={monthRealExpenses} incomes={monthSharedDeposits} members={members} myMemberId={myMemberId} />
      )}

      {/* Petición real: "desde Presupuesto en Negrita hasta Historial
          lo muevas todo arriba debajo del botón de Fecha" — en
          Presupuesto Generales, los presupuestos del mes en curso (y
          su enlace a Historial) van antes que Resumen y el dónut, no
          después. */}
      {group === 'generales' && (
        <BudgetsSection
          budgets={groupBudgets}
          expenses={scopedExpenses}
          categories={categories}
          group={group}
          monthStartDay={monthStartDay}
          onChanged={reload}
          forceOwnerNull={scopingActive && scope === 'comun'}
        />
      )}

      {/* Petición real: "de esta página quitamos Resumen Gastado
          -3207.47 por completo" — para Alimentación era solo esa cifra
          repetida (sin presupuesto ni ingresos propios), ya cubierta
          por el desglose de arriba; para Presupuesto Generales sigue
          igual que siempre. */}
      {group !== 'alimentacion' && (
        <BudgetsOverview
          allExpenses={scopedExpenses}
          allCategories={categories}
          budgets={scopedBudgets}
          group={group}
          from={periodFrom}
          to={periodTo}
          preset={preset}
          hasBankAccounts={hasBankAccounts}
          onChanged={reload}
        />
      )}

      {group === 'alimentacion' && (
        <>
          {/* Petición real: "falta otro [dónut por tienda] de Otros. Se
              podría usar el mismo Dónut con botón Alimentación/Otros" —
              y después: "vamos a fusionar las dos estadísticas [por
              tipo de alimento / por clasificación en Otros] como la de
              arriba, y las vamos a amarrar a los mismos dos botones de
              Alimentación y Otros" — un único chip gobierna ahora los
              DOS dónuts (por tienda y por clasificación) a la vez, en
              vez de mostrar siempre los dos lados de golpe. */}
          <div className="filter-row">
            <button
              type="button"
              className={'chip' + (storeDonutScope === 'alimentacion' ? ' chip-active' : '')}
              onClick={() => setStoreDonutScope('alimentacion')}
            >
              Alimentación
            </button>
            <button
              type="button"
              className={'chip' + (storeDonutScope === 'no_alimentos' ? ' chip-active' : '')}
              onClick={() => setStoreDonutScope('no_alimentos')}
            >
              Otros
            </button>
          </div>
          <LinkedDonutCard
            title="Reparto del gasto por tienda"
            monthLabel={periodTitle}
            slices={storeDonutScope === 'alimentacion' ? storePieSlicesAlimentacion : storePieSlicesOtros}
            onViewRecords={(expenseIds, label) => onViewMovements?.({ label, from: periodFrom, to: periodTo, isIncome: false, expenseIds })}
          />
          <LinkedDonutCard
            title={storeDonutScope === 'alimentacion' ? 'Reparto del gasto por tipo de alimento' : 'Reparto del gasto en Otros por clasificación'}
            monthLabel={periodTitle}
            slices={storeDonutScope === 'alimentacion' ? foodTypePieGroups : noAlimentosTypePieGroups}
            onViewRecords={(expenseIds, label) => onViewMovements?.({ label, from: periodFrom, to: periodTo, isIncome: false, expenseIds })}
          />
          <FoodTypeBreakdownList
            types={storeDonutScope === 'alimentacion' ? foodTypeBreakdown : noAlimentosTypeBreakdown}
            expandedKey={expandedClassType}
            onToggle={(key) => setExpandedClassType((prev) => (prev === key ? null : key))}
          />
          {ticketDisplayReceipts.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 16 }}>
                Solo con ticket subido
              </h2>
              <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                ℹ️ Estos dos de aquí abajo cuentan solo lo que tiene foto de ticket subida (o, si no hay ticket, un
                cargo de banco de Alimentación sin ticket todavía) — parecido pero NO igual a "Total Registrado en
                Compras" y "Reparto del gasto por tienda" de arriba, que cuentan todo lo registrado tenga ticket o no.
              </p>
              <StoreBreakdownChart groups={ticketRangeGrouped} storeColor={storeColorOf} title="Reparto por tienda — solo con ticket" />
              <StoreMonthlyChart receipts={ticketRangeFiltered} knownStores={knownStores} storeNames={ticketStoreNames} from={periodFrom} to={periodTo} />
            </>
          )}
        </>
      )}
      {group === 'generales' && categoryPieSlices.length > 0 && (
        <StorePieChart groups={categoryPieSlices} monthLabel={periodTitle} title="Reparto del gasto por categoría" />
      )}
    </div>
  )
}

// Título del periodo que se está viendo, para el dónut y el desglose
// por tienda de Alimentación — "Septiembre 2026" para mes
// contable/real (usa accountingPeriodLabel para que un mes contable que
// empieza el último día del anterior salga con el nombre correcto, ver
// dateRanges.ts), el propio nombre del filtro para el resto (Hoy/Esta
// semana/Este año), o el rango de fechas exacto para "Rango".
function periodLabelForTitle(preset: SpendRangePreset, from: string, to: string): string {
  if (preset === 'mes' || preset === 'mes_real') {
    const { year, month0 } = accountingPeriodLabel(from)
    return `${MONTH_LABELS[month0]} ${year}`
  }
  if (preset === 'rango') return `${from} a ${to}`
  return PRESET_LABELS[preset]
}

// Piso compartido — petición real: "en el listado quiero que por un
// lado haya un contador de gastos totales y por otro que se vea cuánto
// ha pagado cada uno de los usuarios" (saldo entre personas), revisado
// tras tres rondas más de feedback real:
// 1) "los 100 de Jenny han sido un ingreso y los 74,65 de Fran un
//    pago, la cuenta no está bien" — meter dinero al bote (ingreso) y
//    pagar algo de tu bolsillo (gasto) son cosas distintas, así que NO
//    se suman en el mismo total a repartir.
// 2) "74,65€ a partes iguales entre dos adultos = 37,325€ por
//    persona, por lo tanto del saldo de 100€ quedan 63,675€ a favor de
//    Jenny" — el reparto es del GASTO (lo único que de verdad hay que
//    devolver entre todos) entre quienes han participado (pagando o
//    ingresando), y lo ya ingresado se descuenta de la parte que le
//    tocaría a cada uno, como un pago adelantado a cuenta.
// 3) "para Fran en las cuentas comunes no debería influir lo anterior
//    a la llegada de Jenny porque los gastos de él y su hijo son
//    suyos... lo anterior a la llegada de uno nuevo repartido a
//    partes iguales entre los que ya estuvieron, y lo posterior se
//    reparte con uno más" — cada gasto se reparte solo entre los
//    adultos financieros que YA existían en su fecha (member.joinedAt),
//    no entre todos los que hay ahora mismo: un gasto de antes de que
//    Jenny existiera es 100% de quien ya estaba, no se divide con ella.
function SharedBalanceCard({
  expenses,
  incomes,
  members,
  myMemberId,
}: {
  expenses: Expense[]
  incomes: Expense[]
  members: FamilyMember[]
  myMemberId: string | null
}) {
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalDeposits = incomes.reduce((sum, e) => sum + e.amount, 0)
  const financialAdults = members.filter((m) => m.memberType === 'admin' || m.memberType === 'adult')

  const paidByOwner = new Map<string, number>()
  let unattributed = 0
  for (const e of expenses) {
    if (e.ownerMemberId === null) unattributed += e.amount
    else paidByOwner.set(e.ownerMemberId, (paidByOwner.get(e.ownerMemberId) ?? 0) + e.amount)
  }
  const depositedByOwner = new Map<string, number>()
  for (const e of incomes) {
    if (e.ownerMemberId !== null) depositedByOwner.set(e.ownerMemberId, (depositedByOwner.get(e.ownerMemberId) ?? 0) + e.amount)
  }

  // Cada gasto (con dueño o de la Cuenta Común) se reparte solo entre
  // los adultos que ya existían en SU fecha — mismo criterio de "mismo
  // día cuenta" que el corte de visibilidad del servidor (ver
  // 0104_expenses_shared_join_date_cutoff.sql).
  const fairShareOwed = new Map<string, number>()
  for (const e of expenses) {
    const eligible = financialAdults.filter((m) => m.joinedAt.slice(0, 10) <= e.expenseDate)
    if (eligible.length === 0) continue
    const share = e.amount / eligible.length
    for (const m of eligible) fairShareOwed.set(m.id, (fairShareOwed.get(m.id) ?? 0) + share)
  }

  const rows = financialAdults
    .map((m) => ({
      memberId: m.id,
      name: m.name,
      paid: paidByOwner.get(m.id) ?? 0,
      deposited: depositedByOwner.get(m.id) ?? 0,
      contributed: (paidByOwner.get(m.id) ?? 0) + (depositedByOwner.get(m.id) ?? 0),
      fairShare: fairShareOwed.get(m.id) ?? 0,
    }))
    .filter((r) => r.contributed > 0 || r.fairShare > 0)
    .sort((a, b) => b.contributed - a.contributed)
  const participants = rows.length

  // Petición real: "no sé si sería mejor diferenciar entre Común antes
  // de Jenny y después para no confundir mucho con los importes" — el
  // total solo (1273€) no deja ver que la mayoría es histórico de antes
  // de que existiera el último en unirse y no se reparte con nadie; se
  // desglosa en una línea aparte, solo cuando de verdad hay las dos
  // partes (si todo es de un solo tramo, el desglose no añade nada).
  const newestMember =
    financialAdults.length > 1 ? [...financialAdults].sort((a, b) => (a.joinedAt < b.joinedAt ? 1 : -1))[0] : null
  const cutoffDate = newestMember?.joinedAt.slice(0, 10) ?? null
  const legacyTotal = cutoffDate ? expenses.filter((e) => e.expenseDate < cutoffDate).reduce((sum, e) => sum + e.amount, 0) : 0
  const sharedEraTotal = totalExpenses - legacyTotal

  return (
    <div className="card event-card">
      <strong>Saldo entre personas</strong>
      <p style={{ margin: '4px 0' }}>
        Total gastado: <strong>{totalExpenses.toFixed(2)} €</strong>
        {totalDeposits > 0 && (
          <>
            {' · '}Ingresado al bote: <strong>{totalDeposits.toFixed(2)} €</strong>
          </>
        )}
      </p>
      {newestMember && legacyTotal > 0 && sharedEraTotal > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: -2, marginBottom: 2 }}>
          {legacyTotal.toFixed(2)} € de antes de que {newestMember.name} se uniera · {sharedEraTotal.toFixed(2)} € desde
          entonces
        </p>
      )}
      {participants > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: -2, marginBottom: 8 }}>
          Cada gasto se reparte a partes iguales entre quien ya estuviera en la familia en su fecha — lo de antes de
          unirse alguien no se le carga a él.
        </p>
      )}
      <div className="event-list">
        {rows.map((r) => {
          const diff = r.contributed - r.fairShare
          return (
            <div key={r.memberId} className="card task-card">
              <div className="task-card-main">
                <strong>
                  {r.name}
                  {r.memberId === myMemberId ? ' (tú)' : ''}
                </strong>
                <p className="muted">
                  {r.paid === 0 && r.deposited === 0 && 'No ha aportado nada todavía'}
                  {r.paid > 0 && `Ha pagado ${r.paid.toFixed(2)} €`}
                  {r.paid > 0 && r.deposited > 0 && ' y '}
                  {r.deposited > 0 && `ha metido ${r.deposited.toFixed(2)} € al bote`}
                  {participants > 1 && (
                    <>
                      {' — '}
                      {diff >= 0 ? `le deben ${diff.toFixed(2)} €` : `debe ${Math.abs(diff).toFixed(2)} €`}
                    </>
                  )}
                </p>
              </div>
            </div>
          )
        })}
        {unattributed > 0 && (
          <div className="card task-card">
            <div className="task-card-main">
              <strong>🏠 Cuenta común</strong>
              <p className="muted">{unattributed.toFixed(2)} € — no se atribuye a nadie en concreto</p>
            </div>
          </div>
        )}
        {rows.length === 0 && unattributed === 0 && <p className="muted">Todavía no hay gastos comunes en este periodo.</p>}
      </div>
    </div>
  )
}

// Presupuestos: petición real: "no me gusta que arriba haya un
// presupuesto y abajo otro listado... quitamos el panel Presupuesto
// total del mes por completo, subimos los presupuestos del mes en
// curso arriba, el campo para crear uno nuevo seguido y debajo
// Historial que al desplegar se abren los anteriores". Reemplaza tanto
// a la antigua OverallBudgetCard (una única tarjeta aparte) como a las
// carpetas-por-mes de antes: ahora el mes en curso siempre está a la
// vista, sin desplegar nada.
function BudgetsSection({
  budgets,
  expenses,
  categories,
  group,
  monthStartDay,
  onChanged,
  forceOwnerNull = false,
}: {
  budgets: Budget[]
  expenses: Expense[]
  categories: BudgetCategory[]
  group: string
  monthStartDay: number
  onChanged: () => void
  // Piso compartido: true en la pestaña Común — un presupuesto nuevo
  // creado desde aquí es de todos (owner_member_id null), no solo tuyo.
  forceOwnerNull?: boolean
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  // Petición real: "el formulario de Nuevo Presupuesto conviértelo en
  // un enlace que abre el formulario en una ventana emergente" — ya no
  // vive siempre desplegado entre los presupuestos del mes y el
  // Historial, solo su enlace.
  const [showAddForm, setShowAddForm] = useState(false)

  const current = accountingMonthRange(monthStartDay, 0)
  const sameLabel = (dateStr: string) => {
    const l = accountingPeriodLabel(dateStr)
    return l.year === current.labelYear && l.month0 === current.labelMonth0
  }
  const currentBudgets = budgets.filter((b) => sameLabel(budgetPeriodRange(b).start))
  const pastBudgets = budgets.filter((b) => !sameLabel(budgetPeriodRange(b).start))

  // Mismo color por categoría que ya usan los dónuts (categoryColors),
  // pasado a pastel — reutiliza el mismo criterio que CategoriesModal,
  // en vez de dejar estas tarjetas siempre grises.
  const catColors = stableCategoryColors(categories)
  function renderBudgetRow(b: Budget) {
    const spent = budgetSpent(b, expenses, { categories })
    const pct = Math.min(100, Math.round((spent / b.amount) * 100))
    const category = categories.find((c) => c.name === b.category)
    const icon = category?.icon
    const bg = category ? catColors.get(category.id) : undefined
    // "General" (sin categoría) no tiene color de dónut del que partir:
    // pastel fijo propio para que tampoco se quede en blanco.
    const cardBg = bg ? pastelFromHsl(bg) : GENERAL_BUDGET_COLOR
    return (
      <div key={b.id} className="card task-card" style={{ background: cardBg }}>
        <div className="task-card-main">
          <strong>
            {icon && `${icon} `}
            {b.category || 'General'}
          </strong>
          <p className="muted">
            {b.periodType} desde {b.periodStart} · gastado {spent.toFixed(2)} € de {b.amount.toFixed(2)} € ({pct}%)
          </p>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${pct}%`, background: spent > b.amount ? '#c0392b' : undefined }} />
          </div>
        </div>
        <ConfirmButton label="Eliminar" onConfirm={() => deleteBudget(b.id).then(onChanged)} />
      </div>
    )
  }

  const byMonth = new Map<string, Budget[]>()
  for (const b of pastBudgets) {
    const label = accountingPeriodLabel(budgetPeriodRange(b).start)
    const key = `${label.year}-${String(label.month0 + 1).padStart(2, '0')}`
    const list = byMonth.get(key) ?? []
    list.push(b)
    byMonth.set(key, list)
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <>
      <h2 className="section-title">Presupuestos</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        {MONTH_LABELS[current.labelMonth0]} {current.labelYear} (mes contable en curso)
      </p>

      <div className="event-list" style={{ marginBottom: 8 }}>
        {currentBudgets.map(renderBudgetRow)}
        {currentBudgets.length === 0 && (
          <p className="muted">Todavía no hay presupuesto para {MONTH_LABELS[current.labelMonth0]} {current.labelYear}.</p>
        )}
      </div>

      <button type="button" className="link-button" onClick={() => setShowAddForm(true)}>
        + Nuevo presupuesto
      </button>
      {showAddForm && (
        <div className="modal-overlay" onClick={() => setShowAddForm(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Nuevo presupuesto
              </h2>
              <button type="button" className="modal-close" onClick={() => setShowAddForm(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <AddBudgetForm
              onAdded={() => {
                setShowAddForm(false)
                onChanged()
              }}
              defaultPeriodStart={current.from}
              categories={categories}
              group={group}
              existingBudgets={budgets}
              ownerMemberId={forceOwnerNull ? null : undefined}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        className="link-button section-title"
        style={{ marginTop: 8, display: 'block' }}
        onClick={() => setHistoryOpen((v) => !v)}
      >
        {historyOpen ? '▾' : '▸'} Historial
      </button>
      {historyOpen && (
        <div className="store-folder-grid" style={{ marginTop: 8 }}>
          {months.map(([month, monthBudgets]) => {
            const [y, m] = month.split('-').map(Number)
            const isOpen = openMonth === month
            const totalBudgeted = monthBudgets.reduce((sum, b) => sum + b.amount, 0)
            return (
              <div key={month} className="store-folder" style={{ background: MONTH_FOLDER_COLORS[m - 1] }}>
                <button type="button" className="store-folder-header" onClick={() => setOpenMonth(isOpen ? null : month)}>
                  <span className="store-folder-icon">📅</span>
                  <span className="store-folder-info">
                    <strong>
                      {MONTH_LABELS[m - 1]} {y}
                    </strong>
                    <span className="muted">
                      {monthBudgets.length} {monthBudgets.length === 1 ? 'presupuesto' : 'presupuestos'} · {totalBudgeted.toFixed(2)} €
                    </span>
                  </span>
                  <span className="store-folder-chevron">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && <div className="event-list store-folder-contents">{monthBudgets.map(renderBudgetRow)}</div>}
              </div>
            )
          })}
          {months.length === 0 && <p className="muted">No hay presupuestos de otros meses.</p>}
        </div>
      )}
    </>
  )
}

// Apuntar un ingreso (nómina, paga extra...) según va llegando —
// petición real: "quiero poder ir poniendo los ingresos que tengo ese
// mes y cuando los tengo... que se cree el ingreso el día que lo
// apunte pero que se pueda cambiar con un calendario". La fecha
// arranca en hoy pero es un <input type="date"> normal — se puede
// cambiar a cualquier otro día antes de guardar.
function AddIncomeInline({
  group,
  categories,
  onAdded,
}: {
  group: string
  categories: BudgetCategory[]
  onAdded: () => void
}) {
  const incomeCategories = categories.filter((c) => c.budgetGroup === 'ingresos')
  const [date, setDate] = useState(toDateStr(new Date()))
  const [amount, setAmount] = useState('')
  // Petición real: "los ingresos también se deberían poder
  // categorizar, como sueldo, regalo, ingreso" — antes era un texto
  // libre de "descripción", ahora la misma categoría estructurada
  // (con icono) que ya usa el resto de la app.
  const [category, setCategory] = useState(incomeCategories[0]?.name ?? 'Ingreso')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addExpense({
        date,
        amount: Number(amount),
        category,
        store: '',
        kind: 'real',
        isIncome: true,
        budgetGroup: group,
      })
      setAmount('')
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form" style={{ marginBottom: 8 }}>
      <label>
        Categoría
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {incomeCategories.length === 0 && <option value="Ingreso">Ingreso</option>}
          {incomeCategories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar ingreso'}
      </button>
    </form>
  )
}

// Estadísticas de Dinero — el gasto suma Alimentación + Generales
// juntos (petición real: "que todos los presupuestos estén
// conectados"), pero los INGRESOS no: cada pestaña tiene los suyos,
// sin sumarse con la otra (petición real: "los ingresos tienen que
// ser diferentes... no quiero que me sumen [los de Generales] en
// Alimentación"). Mismo selector Hoy/Esta semana/Este
// mes/Este año/Rango que ya usan los Tickets de esta misma pantalla.
function BudgetsOverview({
  allExpenses,
  allCategories,
  budgets,
  group,
  from,
  to,
  preset,
  hasBankAccounts,
  onChanged,
}: {
  allExpenses: Expense[]
  allCategories: BudgetCategory[]
  budgets: Budget[]
  group: string
  from: string
  to: string
  preset: SpendRangePreset
  hasBankAccounts: boolean
  onChanged: () => void
}) {
  // Petición real: "quiero poder ir poniendo los ingresos que tengo
  // ese mes y cuando los tengo... que se cree el día que lo apunte
  // pero que se pueda cambiar con un calendario y que se pueda
  // eliminar".
  const [addingIncome, setAddingIncome] = useState(false)
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null)
  // Petición real: "tocando el nombre de la categoría padre se
  // desplieguen las subcategorías" — una sola desplegada a la vez, más
  // fácil de leer que varias listas abiertas de golpe.
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null)

  const inRange = allExpenses.filter((e) => e.expenseDate >= from && e.expenseDate <= to)
  // Presupuesto total del mes, mostrado aquí solo con el rango "Mes
  // contable" — con Esta semana/Mes real/Este año/Rango no hay un
  // "presupuesto de ese periodo" con el que compararlo (el presupuesto
  // siempre es del mes contable). El presupuesto general (sin
  // categoría) cuyo periodo empieza justo en el `from` de este mes.
  const overallBudget =
    group !== 'alimentacion' && preset === 'mes'
      ? (budgets.find((b) => b.budgetGroup === group && !b.category && budgetPeriodRange(b).start === from) ?? null)
      : null
  // Los ingresos NO se conectan entre pestañas — petición real: "los
  // ingresos tienen que ser diferentes... presupuesto generales tiene
  // 4000€... presupuesto de alimentación 800€... no quiero que me
  // sumen [los de Generales] en Alimentación". El gasto sí se sigue
  // sumando entre las dos (eso no ha cambiado).
  // Bug real: "cuando se anota manualmente el ingreso se refleja en
  // Movimientos y descuadra las cuentas reales" — un ingreso apuntado
  // a mano (p. ej. "Sueldo") es dinero que NUNCA pasó por el banco, así
  // que si la familia ya tiene cuentas enlazadas, sumarlo junto al
  // ingreso real de esas cuentas infla el total por encima de lo que de
  // verdad hay. Con banco enlazado, "Ingresos" pasa a salir SOLO de los
  // movimientos reales conciliados (source 'banco'/'ticket_banco', de
  // cualquier categoría — es dinero real, no depende del budget_group
  // que le haya puesto la sincronización); sin banco, sigue siendo la
  // suma de lo apuntado a mano, como siempre.
  // FASE 6D.3 — una devolución (dinero recuperado de un gasto anterior) no es Ingresos aquí tampoco, sea apuntada a mano o
  // conciliada del banco: mismo criterio que Resumen/Movimientos/Banco (isRefund, domain/refunds.ts).
  const manualIncomeEntries = inRange
    .filter((e) => e.isIncome && e.budgetGroup === group && e.source === 'manual' && !isRefund(e, allCategories))
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
  const manualIncomeTotal = manualIncomeEntries.reduce((sum, e) => sum + e.amount, 0)
  // Petición real: "el dinero traspasado de nuestras cuentas a las de
  // los niños no debería duplicarse en Ingresos" — el lado de entrada
  // de un traspaso interno llega marcado is_income=true igual que un
  // ingreso real (lo pone el banco, no la categoría), así que hay que
  // excluirlo aquí explícitamente; el lado de salida ya se excluye de
  // totalSpent más abajo por el mismo motivo.
  const bankIncomeTotal = inRange
    .filter((e) => e.isIncome && (e.source === 'banco' || e.source === 'ticket_banco') && !isInternalTransferCategory(e.category, allCategories) && !isRefund(e, allCategories))
    .reduce((sum, e) => sum + e.amount, 0)
  const totalIncome = hasBankAccounts ? bankIncomeTotal : manualIncomeTotal
  const incomeEntries = manualIncomeEntries
  const totalSpent = inRange
    .filter((e) => !e.isIncome && e.kind === 'real' && !isInternalTransferCategory(e.category, allCategories))
    .reduce((sum, e) => sum + e.amount, 0)

  async function handleDeleteIncome(id: string) {
    await deleteExpense(id)
    onChanged()
  }

  // Detallado por categoría exacta (padre O hija, tal cual se apuntó
  // el gasto) — se queda así para el informe imprimible, que quiere el
  // detalle fino. La lista EN PANTALLA (más abajo) es otra: agrupada
  // por categoría padre, ver `byParentCategory`.
  // Gasto pendiente de clasificar del periodo (category NULL): ya está en el total gastado, pero no en ninguna categoría. Aparte y sin color de
  // categoría. Solo en presupuestos con categorías (Generales): el de Alimentación no tiene categorías propias.
  const pendingInRange = useMemo(
    () => (group === 'alimentacion' ? { amount: 0, count: 0 } : pendingSpending(inRange.filter((e) => !e.isIncome && e.kind === 'real'))),
    [inRange, group],
  )
  const byCategoryFlat = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of inRange.filter((e) => !e.isIncome && e.kind === 'real' && !isInternalTransferCategory(e.category, allCategories))) {
      if (e.category == null) continue // pendiente: cuenta en los totales, pero no en el detalle por categoría (Fase 6C.2B)
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [inRange, allCategories])

  // Petición real: "en Resumen ordena la lista por categorías padres
  // (con el importe total de cada categoría padre y ordenándolas por
  // importe, el mayor arriba...) y que tocando el nombre se desplieguen
  // las subcategorías" — sustituye a la lista larga y plana de abajo
  // (categorías Y subcategorías mezcladas al mismo nivel, repitiendo lo
  // que ya se ve en el dónut).
  // Categorías de ESTE grupo — se agrupa por NOMBRE (no por id) porque
  // esta familia tiene categorías duplicadas de verdad en la base de
  // datos (p. ej. tres filas distintas llamadas "Movimientos internos",
  // de un sembrado que se disparó más de una vez): agrupar por id
  // partía el mismo gasto en varias filas idénticas visualmente. Un
  // "root" puede así representar a más de un id real (`rootIds`).
  const groupCategories = useMemo(() => allCategories.filter((c) => c.budgetGroup === group), [allCategories, group])
  // Mismos colores por categoría/subcategoría que los dónuts, en pastel.
  const groupCatColors = useMemo(() => stableCategoryColors(groupCategories), [groupCategories])
  const byParentCategory = useMemo(() => {
    const totals = new Map<string, { name: string; icon?: string; rootIds: string[]; total: number }>()
    for (const e of inRange.filter((e) => !e.isIncome && e.kind === 'real' && !isInternalTransferCategory(e.category, allCategories))) {
      const cat = groupCategories.find((c) => c.name === e.category)
      if (!cat) continue
      const root = cat.parentId ? (groupCategories.find((p) => p.id === cat.parentId) ?? cat) : cat
      const entry = totals.get(root.name) ?? { name: root.name, icon: root.icon, rootIds: [], total: 0 }
      if (!entry.rootIds.includes(root.id)) entry.rootIds.push(root.id)
      entry.total += e.amount
      totals.set(root.name, entry)
    }
    return [...totals.values()].sort((a, b) => b.total - a.total)
  }, [inRange, groupCategories, allCategories])

  const rangeLabel = `${PRESET_LABELS[preset]} (${from} a ${to})`

  return (
    <div className="card event-card">
      <strong>Resumen</strong>
      {group === 'alimentacion' && (
        <p className="muted" style={{ marginTop: 0 }}>Solo registro — no tiene presupuesto ni ingresos propios.</p>
      )}
      {/* Alimentación ya no tiene presupuesto ni ingresos propios
          (petición real: "hay que quitar en Registro alimentación lo
          de ingreso") — solo se queda con el total gastado. */}
      {group !== 'alimentacion' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ color: '#1e8449', fontWeight: 600, margin: '4px 0' }}>Ingresos: +{totalIncome.toFixed(2)} €</p>
            {/* Bug real: "cuando se anota manualmente el ingreso se
                refleja en Movimientos y descuadra las cuentas reales" —
                con banco enlazado, un ingreso a mano ya no se puede
                distinguir de dinero real una vez mezclado en
                Movimientos, así que se apunta un movimiento nuevo (o se
                edita uno ya existente) desde ahí en vez de crear un
                ingreso "fantasma" aquí. */}
            {!hasBankAccounts && (
              <button type="button" className="link-button" onClick={() => setAddingIncome((v) => !v)}>
                {addingIncome ? 'Cerrar' : '+ Añadir ingreso'}
              </button>
            )}
          </div>
          <p className="muted" style={{ marginTop: -4, marginBottom: 4, fontSize: 12 }}>
            {hasBankAccounts
              ? 'Suma real de lo que ha entrado en tus cuentas bancarias enlazadas — ya no se apunta a mano, para que no descuadre con Movimientos.'
              : 'Solo lo que apuntes aquí a mano — no se calcula desde el saldo de tus cuentas bancarias.'}
          </p>

          {!hasBankAccounts && addingIncome && <AddIncomeInline group={group} categories={allCategories} onAdded={onChanged} />}
        </>
      )}

      {group !== 'alimentacion' && incomeEntries.length > 0 && (
        <div className="event-list" style={{ marginBottom: 8 }}>
          {hasBankAccounts && (
            <p className="muted" style={{ fontSize: 12 }}>
              Estos ingresos apuntados a mano ya NO se cuentan en el total de arriba (ver aviso encima) — bórralos si ya no
              hacen falta.
            </p>
          )}
          {incomeEntries.map((inc) =>
            editingIncomeId === inc.id ? (
              <EditCategoryExpenseRow
                key={inc.id}
                expense={inc}
                onDone={() => {
                  setEditingIncomeId(null)
                  onChanged()
                }}
                onCancel={() => setEditingIncomeId(null)}
              />
            ) : (
              <div key={inc.id} className="card task-card">
                <div className="task-card-main">
                  <strong style={{ color: '#1e8449' }}>+{inc.amount.toFixed(2)} €</strong>
                  <p className="muted">
                    {inc.expenseDate}
                    {inc.category && inc.category !== 'Ingreso' && ` · ${inc.category}`}
                  </p>
                </div>
                <button type="button" className="link-button" onClick={() => setEditingIncomeId(inc.id)}>
                  Editar
                </button>
                <ConfirmButton label="Eliminar" onConfirm={() => handleDeleteIncome(inc.id)} />
              </div>
            ),
          )}
        </div>
      )}

      {/* Petición real: "pon el importe del presupuesto entre Ingresos
          y gastado" — el control para cambiarlo sigue viviendo solo en
          la tarjeta "Presupuesto total del mes" (arriba de todo), aquí
          es solo un vistazo rápido junto al resto de cifras del mes. */}
      {group !== 'alimentacion' && preset === 'mes' && (
        <p className="muted" style={{ margin: '4px 0' }}>
          Presupuesto: {overallBudget ? `${overallBudget.amount.toFixed(2)} €` : 'sin establecer'}
        </p>
      )}

      <p style={{ color: '#c0392b', fontWeight: 600, margin: '4px 0' }}>Gastado: -{totalSpent.toFixed(2)} €</p>
      {/* Bug real: "el balance en presupuesto no debería ser presupuesto
          menos gastos? Ahora mismo es ingresos menos gastos" — Balance
          vive justo debajo de Presupuesto/Gastado, así que tiene que ser
          lo que queda de ESE presupuesto, no un ahorro familiar (eso ya
          lo muestra "Ahorro" en Resumen, con Ingresos). Solo tiene
          sentido cuando hay un presupuesto general con el que restar.*/}
      {group !== 'alimentacion' && overallBudget && (
        <p style={{ margin: '4px 0' }}>
          <strong>Balance: {(overallBudget.amount - totalSpent).toFixed(2)} €</strong>
        </p>
      )}

      {(byParentCategory.length > 0 || pendingInRange.count > 0) && (
        <div className="price-row-list" style={{ marginTop: 8 }}>
          {byParentCategory.map(({ name, icon, rootIds, total }) => {
            const children = groupCategories.filter((c) => c.parentId && rootIds.includes(c.parentId))
            const isOpen = expandedParentId === name
            const parentColor = groupCatColors.get(rootIds[0])
            // El gasto puesto directamente en la categoría padre (sin
            // elegir subcategoría) no aparece dentro de ninguna hija —
            // se muestra aparte para que la suma de lo desplegado
            // cuadre con el total de la fila.
            const directTotal = inRange
              .filter((e) => !e.isIncome && e.kind === 'real' && rootIds.some((id) => groupCategories.find((c) => c.id === id)?.name === e.category))
              .reduce((s, e) => s + e.amount, 0)
            return (
              <div key={name}>
                <button
                  type="button"
                  className="price-row"
                  style={{
                    width: '100%',
                    background: parentColor ? pastelFromHsl(parentColor) : 'none',
                    border: 'none',
                    borderRadius: 8,
                    textAlign: 'left',
                    color: 'var(--text)',
                    fontWeight: 400,
                    fontSize: 14,
                    padding: '8px 8px',
                    cursor: children.length > 0 ? 'pointer' : 'default',
                  }}
                  onClick={() => children.length > 0 && setExpandedParentId(isOpen ? null : name)}
                >
                  <span className="price-row-name">
                    {icon && `${icon} `}
                    {name}
                    {children.length > 0 && (isOpen ? ' ▾' : ' ▸')}
                  </span>
                  <span className="price-row-price">{total.toFixed(2)} €</span>
                </button>
                {isOpen && children.length > 0 && (
                  <div style={{ paddingLeft: 20 }}>
                    {children
                      .map((c) => ({
                        name: c.name,
                        icon: c.icon,
                        color: groupCatColors.get(c.id),
                        total: inRange
                          .filter((e) => !e.isIncome && e.kind === 'real' && e.category === c.name)
                          .reduce((s, e) => s + e.amount, 0),
                      }))
                      .filter((c) => c.total > 0)
                      .sort((a, b) => b.total - a.total)
                      .map((c) => (
                        <div
                          key={c.name}
                          className="price-row"
                          style={{ background: c.color ? pastelFromHsl(c.color) : undefined, borderRadius: 8, padding: '6px 8px', marginTop: 4 }}
                        >
                          <span className="price-row-name">
                            {c.icon} {c.name}
                          </span>
                          <span className="price-row-price">{c.total.toFixed(2)} €</span>
                        </div>
                      ))}
                    {directTotal > 0 && (
                      <div className="price-row" style={{ background: parentColor ? pastelFromHsl(parentColor) : undefined, borderRadius: 8, padding: '6px 8px', marginTop: 4 }}>
                        <span className="price-row-name">(sin subcategoría)</span>
                        <span className="price-row-price">{directTotal.toFixed(2)} €</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {pendingInRange.count > 0 && (
            <div className="price-row" style={{ background: PENDING_SLICE_COLOR, borderRadius: 8, padding: '8px 8px', marginTop: 4, color: '#1c1f26' }}>
              <span className="price-row-name">⏳ {PENDING_LABEL}</span>
              <span className="price-row-price">{pendingInRange.amount.toFixed(2)} €</span>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="link-button"
        style={{ marginTop: 8 }}
        onClick={() =>
          openBudgetReport({
            pending: pendingInRange.count > 0 ? pendingInRange : undefined,
            rangeLabel,
            totalIncome,
            totalSpent,
            byCategory: byCategoryFlat.map(([name, amount]) => ({
              name,
              icon: allCategories.find((c) => c.name === name)?.icon,
              amount,
            })),
          })
        }
      >
        📄 Generar informe
      </button>
    </div>
  )
}

// Abre una pestaña aparte con un informe limpio y lanza el diálogo de
// imprimir del propio navegador (gratis, sin librería — "Guardar como
// PDF" ya está en ese diálogo en cualquier móvil u ordenador).
function openBudgetReport(report: {
  rangeLabel: string
  totalIncome: number
  totalSpent: number
  byCategory: { name: string; icon?: string; amount: number }[]
  // Gasto pendiente de clasificar: se muestra SEPARADO de las categorías reales (no es una categoría).
  pending?: { amount: number; count: number }
}) {
  const win = window.open('', '_blank')
  if (!win) return
  const rows =
    report.byCategory
      .map(
        (c) =>
          `<tr><td>${c.icon ?? ''} ${c.name}</td><td style="text-align:right">${c.amount.toFixed(2)} €</td></tr>`,
      )
      .join('') + (report.pending ? `<tr><td>⏳ ${PENDING_LABEL}</td><td style="text-align:right">${report.pending.amount.toFixed(2)} €</td></tr>` : '')
  const reportRows = rows || '<tr><td colspan="2">Sin movimientos en este periodo</td></tr>'
  win.document.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe de Economía</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; padding-top: 64px; color: #1c1f26; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .muted { color: #6b7280; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td { padding: 6px 4px; border-bottom: 1px solid #eee; }
  .totals p { margin: 4px 0; font-size: 15px; }
  .income { color: #1e8449; font-weight: 600; }
  .expense { color: #c0392b; font-weight: 600; }
  /* Petición real: "no tiene botón de cierre, tuve que salir de la
     aplicación" — window.open() en una PWA instalada no siempre abre
     una pestaña de verdad con su propia flecha de volver, así que el
     informe necesita su propio botón. */
  .close-btn {
    position: fixed;
    top: 12px;
    right: 12px;
    background: #4c6ef5;
    color: white;
    border: none;
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  @media print {
    .close-btn { display: none; }
  }
</style>
</head>
<body>
  <button type="button" class="close-btn" onclick="window.close(); setTimeout(function(){ history.back() }, 150)">✕ Cerrar</button>
  <h1>Informe de Economía</h1>
  <p class="muted">${report.rangeLabel}</p>
  <div class="totals">
    <p class="income">Ingresos: +${report.totalIncome.toFixed(2)} €</p>
    <p class="expense">Gastado: -${report.totalSpent.toFixed(2)} €</p>
    <p><strong>Balance: ${(report.totalIncome - report.totalSpent).toFixed(2)} €</strong></p>
  </div>
  <h2>Por categoría</h2>
  <table>${reportRows}</table>
</body>
</html>`)
  win.document.close()
  win.focus()
  win.print()
}

function EditCategoryExpenseRow({
  expense,
  onDone,
  onCancel,
}: {
  expense: Expense
  onDone: () => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(expense.expenseDate)
  const [amount, setAmount] = useState(String(expense.amount))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateExpense(expense.id, { date, amount: Number(amount) })
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form">
      <div className="inline-fields">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// Nombre → emoji, para que al escribir "Farmacia" se ponga sola 💊 y
// así con las demás — petición real: "que cuando se ponga por ejemplo
// farmacia se ponga automáticamente el emoji de farmacia y así con
// todos". Búsqueda por palabra suelta dentro del nombre (normalizada,
// sin acentos), así "Gastos escolares" encuentra "escolar" aunque no
// sea la palabra exacta.
const CATEGORY_ICON_SUGGESTIONS: Record<string, string> = {
  farmacia: '💊',
  medicina: '💊',
  salud: '🏥',
  medico: '🏥',
  hospital: '🏥',
  luz: '💡',
  electricidad: '💡',
  agua: '💧',
  gas: '🔥',
  internet: '📶',
  telefono: '📱',
  movil: '📱',
  impuesto: '🧾',
  hacienda: '🧾',
  factura: '🧾',
  hipoteca: '🏦',
  banco: '🏦',
  alquiler: '🏠',
  vivienda: '🏠',
  casa: '🏠',
  taller: '🔧',
  coche: '🚗',
  gasolina: '⛽',
  combustible: '⛽',
  transporte: '🚌',
  seguro: '🛡️',
  imprevisto: '⚠️',
  prestamo: '💳',
  credito: '💳',
  ahorro: '💰',
  salario: '👔',
  sueldo: '👔',
  nomina: '👔',
  comestible: '🛒',
  alimentacion: '🛒',
  compra: '🛒',
  supermercado: '🛒',
  entretenimiento: '🍿',
  ocio: '🍿',
  cine: '🎬',
  restaurante: '🍽️',
  comida: '🍽️',
  ropa: '👕',
  moda: '👕',
  regalo: '🎁',
  mascota: '🐾',
  gimnasio: '🏋️',
  deporte: '⚽',
  vacacion: '✈️',
  viaje: '✈️',
  escolar: '🎒',
  colegio: '🎒',
  escuela: '🎒',
  educacion: '🎓',
  universidad: '🎓',
  belleza: '💇',
  peluqueria: '💇',
  suscripcion: '📺',
  streaming: '📺',
}

function suggestCategoryIcon(name: string): string | null {
  const norm = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (!norm) return null
  if (CATEGORY_ICON_SUGGESTIONS[norm]) return CATEGORY_ICON_SUGGESTIONS[norm]
  for (const [keyword, icon] of Object.entries(CATEGORY_ICON_SUGGESTIONS)) {
    if (norm.includes(keyword)) return icon
  }
  return null
}

// Paleta para elegir el icono a mano — petición real: "ponme que se
// despliegue una lista de emojis".
const CATEGORY_ICON_PALETTE = [
  '💰', '🧾', '💡', '💧', '🔥', '📶', '📱', '🏦', '🏠', '🔧',
  '🚗', '⛽', '🚌', '🛡️', '⚠️', '💳', '🛒', '🍿', '🍽️', '👕',
  '🎁', '🐾', '🏋️', '⚽', '✈️', '🎒', '🎓', '💇', '📺', '👔',
  '💊', '🏥', '🎬', '📚', '🎮', '🧸', '🔄',
]

function AddBudgetCategoryInline({
  budgetGroup,
  parentOptions,
  onAdded,
}: {
  budgetGroup: string
  parentOptions?: BudgetCategory[]
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('💰')
  const [parentId, setParentId] = useState<string>('')
  const [necessity, setNecessity] = useState<'' | 'debo' | 'necesito' | 'quiero'>('')
  const [isFixed, setIsFixed] = useState<'' | 'fijo' | 'variable'>('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mientras sea true, escribir el nombre puede seguir cambiando el
  // icono solo — en cuanto la persona elige uno a mano (picker o
  // escrito), se deja de tocar aunque seguya escribiendo el nombre.
  const iconTouchedRef = useRef(false)

  function handleNameChange(value: string) {
    setName(value)
    if (iconTouchedRef.current) return
    const suggested = suggestCategoryIcon(value)
    if (suggested) setIcon(suggested)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createBudgetCategory({
        name,
        icon,
        budgetGroup,
        parentId: parentId || null,
        necessity: necessity || null,
        isFixed: isFixed === '' ? null : isFixed === 'fijo',
      })
      setName('')
      setIcon('💰')
      setParentId('')
      setNecessity('')
      setIsFixed('')
      iconTouchedRef.current = false
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la categoría'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <div className="inline-fields" style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          style={{ width: 56, textAlign: 'center', fontSize: 20, padding: '10px 0' }}
          aria-label="Elegir icono"
        >
          {icon}
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Farmacia"
          style={{ flex: 1 }}
          autoFocus
        />
        {pickerOpen && (
          <div className="emoji-picker-grid">
            {CATEGORY_ICON_PALETTE.map((e) => (
              <button
                key={e}
                type="button"
                className="emoji-picker-option"
                onClick={() => {
                  setIcon(e)
                  iconTouchedRef.current = true
                  setPickerOpen(false)
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Skill de Pepa, punto 10: subcategoría opcional de dos niveles
          — sin elegir principal, queda como categoría de primer nivel. */}
      {parentOptions && parentOptions.length > 0 && (
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Categoría principal (ninguna)</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>
      )}
      {/* Skill de Pepa, puntos 15/16 — petición real: "clasificar cada
          categoría desde un principio". Aquí es la única clasificación
          que no puede ser automática (categoría nueva, sin
          equivalente en la taxonomía de fábrica): la elige la familia,
          opcional y editable después. No aplica a Ingresos. */}
      {budgetGroup !== 'ingresos' && (
        <div className="inline-fields">
          <select value={necessity} onChange={(e) => setNecessity(e.target.value as typeof necessity)}>
            <option value="">¿Debo, necesito o quiero? (opcional)</option>
            <option value="debo">Debo</option>
            <option value="necesito">Necesito</option>
            <option value="quiero">Quiero</option>
          </select>
          <select value={isFixed} onChange={(e) => setIsFixed(e.target.value as typeof isFixed)}>
            <option value="">¿Fijo o variable? (opcional)</option>
            <option value="fijo">Fijo</option>
            <option value="variable">Variable</option>
          </select>
        </div>
      )}
      {!iconTouchedRef.current && suggestCategoryIcon(name) && (
        <p className="muted" style={{ marginTop: -8, fontSize: 12 }}>
          Icono sugerido para "{name}" — toca el icono para cambiarlo.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving || !name.trim()}>
        {saving ? 'Añadiendo…' : '+ Añadir categoría'}
      </button>
    </form>
  )
}

function AddBudgetForm({
  onAdded,
  defaultPeriodStart,
  categories,
  group,
  existingBudgets,
  ownerMemberId,
}: {
  onAdded: () => void
  defaultPeriodStart: string
  categories: BudgetCategory[]
  group: string
  // Petición real: "si creas un nuevo presupuesto con la misma
  // clasificación... que salte un aviso 'ya creaste uno, ¿quieres
  // proceder?'" — pasado solo cuando hay algo que comprobar (desde
  // BudgetsSection); en el Historial de meses pasados no hace falta.
  existingBudgets?: Budget[]
  // Piso compartido: null = presupuesto Común (pestaña Común);
  // undefined = deja que la base de datos lo asigne automáticamente a
  // quien esté logueado (pestaña Individual).
  ownerMemberId?: string | null
}) {
  const [periodType, setPeriodType] = useState<BudgetPeriod>('mensual')
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart)
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Mismo grupo (categoría, o "general" si vacía) + mismo mes contable
    // que uno ya guardado — se avisa en vez de dejar crear un segundo
    // silenciosamente, que fue justo lo que pasó al probar esto: dos
    // presupuestos "General" para el mismo mes sin darse cuenta.
    const targetLabel = accountingPeriodLabel(periodStart)
    const duplicate = existingBudgets?.find((b) => {
      if ((b.category || '') !== category) return false
      const l = accountingPeriodLabel(budgetPeriodRange(b).start)
      return l.year === targetLabel.year && l.month0 === targetLabel.month0
    })
    if (duplicate) {
      const label = `${category || 'General'} para ${MONTH_LABELS[targetLabel.month0]} ${targetLabel.year}`
      if (!window.confirm(`Ya creaste un presupuesto de ${label}. ¿Quieres proceder de todas formas?`)) return
    }
    setSaving(true)
    setError(null)
    try {
      await createBudget({ periodType, periodStart, category, amount: Number(amount), budgetGroup: group, ownerMemberId })
      setCategory('')
      setAmount('')
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="member-form">
      <label>
        Periodo
        <select value={periodType} onChange={(e) => setPeriodType(e.target.value as BudgetPeriod)}>
          <option value="mensual">Mensual</option>
          <option value="semanal">Semanal</option>
        </select>
      </label>
      <label>
        Empieza el
        <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
      </label>
      <label>
        Categoría
        <CategorySelect value={category} onChange={setCategory} categories={categories} allowGeneral />
      </label>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear presupuesto'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Previsión de pagos (Fase 1C) — infraestructura de Fase 1B/1B.1 (src/data/forecast.ts,
// src/domain/forecast.ts) ya construida y certificada; aquí solo su primera UI funcional. Nunca
// recalcula recurrencias/totales por su cuenta (usa expandForecastOccurrences/forecastTotals/
// forecastByMonth de domain/forecast.ts) ni escribe Supabase directamente (usa data/forecast.ts).
// ---------------------------------------------------------------------

type ForecastHorizon = '7d' | '30d' | '3m' | '12m'
const HORIZON_OPTIONS: { key: ForecastHorizon; label: string }[] = [
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '3m', label: '3 meses' },
  { key: '12m', label: '12 meses' },
]
const HORIZON_TITLES: Record<ForecastHorizon, string> = {
  '7d': 'Próximos 7 días',
  '30d': 'Próximos 30 días',
  '3m': 'Próximos 3 meses',
  '12m': 'Próximos 12 meses',
}
const RECURRENCE_OPTION_LABELS: Record<ForecastRecurrenceOption, string> = {
  none: 'No se repite',
  monthly: 'Mensual',
  every_3_months: 'Cada 3 meses',
  every_6_months: 'Cada 6 meses',
  yearly: 'Anual',
  custom: 'Personalizado',
}
const RECURRENCE_SHORT_LABEL: Record<ForecastRecurrenceOption, string> = {
  none: '',
  monthly: 'Mensual',
  every_3_months: 'Trimestral',
  every_6_months: 'Semestral',
  yearly: 'Anual',
  custom: 'Personalizado',
}
const AMOUNT_STATUS_LABELS: Record<ForecastAmountStatus, string> = { known: 'Conocido', estimated: 'Estimado', unknown: 'Pendiente' }
// Fase 1E.2 — "Sin especificar" no es un valor real de loanType (columna NULL en BD): es solo la opción
// del <select> que representa "todavía no lo sé", igual criterio que el resto del formulario.
const LOAN_TYPE_LABELS: Record<ForecastLoanType, string> = {
  hipoteca: 'Hipoteca',
  prestamo_coche: 'Préstamo coche',
  prestamo_moto: 'Préstamo moto',
  prestamo_personal: 'Préstamo personal',
  otro: 'Otro',
}
const LOAN_INTEREST_TYPE_LABELS: Record<ForecastLoanInterestType, string> = { fijo: 'Fijo', variable: 'Variable', mixto: 'Mixto' }
const REMINDER_UNIT_LABELS: Record<ForecastReminderUnit, string> = { minutes: 'minutos', hours: 'horas', days: 'días', weeks: 'semanas', months: 'meses' }
const REMINDER_QUICK_OPTIONS: { label: string; value: number; unit: ForecastReminderUnit }[] = [
  { label: '1 semana antes', value: 1, unit: 'weeks' },
  { label: '2 semanas antes', value: 2, unit: 'weeks' },
  { label: '1 mes antes', value: 1, unit: 'months' },
]
const FORECAST_CURRENCY_OPTIONS = ['EUR', 'GBP', 'USD']

// Fase 1D-g — periodicidad detectada (domain/forecastRecurrenceDetection.ts) -> {freq, interval} del
// motor de recurrencia YA existente (domain/forecast.ts). Bimestral no tiene un freqOption predefinido
// propio: buildForecastRecurrenceRule('custom', ...) + parseRecurrenceRuleToFormState ya reconstruyen
// ese caso como "Personalizado" (Cada cuánto=Mensual, Cada=2) sin necesitar ningún código nuevo.
const RECURRENCE_PERIODICITY_RRULE: Record<RecurrencePeriodicity, { freq: ForecastCustomRecurrence['freq']; interval: number }> = {
  monthly: { freq: 'MONTHLY', interval: 1 },
  bimonthly: { freq: 'MONTHLY', interval: 2 },
  quarterly: { freq: 'MONTHLY', interval: 3 },
  semiannual: { freq: 'MONTHLY', interval: 6 },
  annual: { freq: 'YEARLY', interval: 1 },
}

// Fase 1D-g.2 — extraído de PrevisionPagosTab (antes vivía inline en reviewRecurrenceCandidate) para
// que "Añadir a Previsión" desde Movimientos pueda precargar EXACTAMENTE igual que una propuesta
// automática de 1D-g, sin duplicar esta lógica en dos sitios.
function buildForecastPrefillFromCandidate(c: RecurrenceCandidate): ForecastPaymentPrefill {
  const { freq, interval } = RECURRENCE_PERIODICITY_RRULE[c.periodicity]
  return {
    title: c.displayName,
    amount: c.estimatedAmountCents / 100,
    amountEstimatedBasis: c.estimatedBasisText,
    categoryName: c.suggestedCategoryName,
    dueDate: c.nextDueDate,
    recurrenceRule: buildForecastRecurrenceRule('custom', { freq, interval, until: null })!,
    bankAccountId: c.accountId,
    suggestedLoanBankReference: extractLoanBankReference(c.displayName),
  }
}

// Fase 1D-g.2 — "Añadir a Previsión" sobre un movimiento SIN histórico suficiente (menos de
// RECURRENCE_MIN_OCCURRENCES cargos consistentes): solo datos reales del propio movimiento, nunca una
// periodicidad o fecha inventadas. El importe FUTURO nunca es "Conocido" solo porque el cargo pasado sí
// lo fue — "sé cuánto se cobró" no es "sé cuánto se cobrará" (pedido explícito).
function buildMinimalForecastPrefillFromMovement(bt: Pick<BankTransaction, 'description' | 'amount' | 'currency'>, category: string | null): ForecastPaymentPrefill {
  const amount = Math.abs(bt.amount)
  // Fase 1D-g.3 — mismo recorte de fecha final que RecurrenceCandidate.displayName (stripTrailingDateSuffix,
  // domain/forecastRecurrenceDetection.ts) — un cargo suelto tampoco debe enseñar "...31/08/26" como si
  // fuera parte del nombre del pago.
  const title = bt.description ? stripTrailingDateSuffix(bt.description.trim().replace(/\s+/g, ' ')) : ''
  return {
    title: title || 'Pago',
    amount,
    amountEstimatedBasis: `Basado en el último cargo: ${formatForecastAmount(amount, bt.currency)}`,
    categoryName: category && category !== 'Otros' ? category : null,
    bankAccountId: '', // se rellena con el accountId real justo antes de usarse (ver handleAddToForecast)
    suggestedLoanBankReference: title ? extractLoanBankReference(title) : null,
  }
}

// Fase 1D-g.2 — misma señal de deduplicación que isRecurrenceCandidateAlreadyKnown (domain/forecastRecurrenceDetection.ts),
// pero devolviendo el motivo en texto para poder avisar ANTES de crear, en vez de excluir en silencio
// como hace la lista automática: una acción manual del usuario nunca debe crear un duplicado sin que lo sepa,
// pero tampoco bloquearlo — "preferimos perder una propuesta dudosa" no aplica aquí, es él quien decide.
function findDuplicateForecastWarning(
  candidateLike: { accountId: string; displayName: string; occurrences: readonly { expenseId: string | null }[] },
  matchedExpenseIds: ReadonlySet<string>,
  existingPayments: readonly ForecastPaymentForDedup[],
): string | null {
  if (candidateLike.occurrences.some((o) => o.expenseId && matchedExpenseIds.has(o.expenseId))) {
    return 'Este movimiento ya está conciliado con una previsión existente.'
  }
  const match = existingPayments.find(
    (p) => p.active && p.bankAccountId === candidateLike.accountId && hasSharedWord(candidateLike.displayName, `${p.title} ${p.provider ?? ''}`),
  )
  return match ? `Ya existe una previsión que podría corresponder a este movimiento: «${match.title}».` : null
}

function PrevisionPagosTab({ categories }: { categories: BudgetCategory[] }) {
  const [payments, setPayments] = useState<ForecastPaymentWithReminders[]>([])
  const [overridesByPayment, setOverridesByPayment] = useState<Map<string, ForecastOccurrenceOverride[]>>(new Map())
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [horizon, setHorizon] = useState<ForecastHorizon>('30d')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingPayment, setEditingPayment] = useState<ForecastPaymentWithReminders | null>(null)
  // Fase 1F.A2 — "Gestionar pagos previstos" como listado aparte desaparece: Editar/Desactivar/Reactivar/
  // Eliminar viven ahora dentro de cada tarjeta de "Próximos pagos", tras pulsar su "⋯" (una sola tarjeta
  // abierta a la vez, igual que el patrón ya usado en FamilyScreen).
  const [occurrenceMenuKey, setOccurrenceMenuKey] = useState<string | null>(null)
  // Fase 1D-e — conciliación bancaria: movimientos reales + qué expense ya está usado por CUALQUIER
  // ocurrencia (para que el motor de candidatos nunca proponga dos veces el mismo movimiento). Estado
  // aparte de payments/overrides porque se recarga solo tras confirmar/desconciliar, no en cada reload().
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([])
  const [matchedExpenseIds, setMatchedExpenseIds] = useState<Set<string>>(new Set())
  const [dismissedCandidateKeys, setDismissedCandidateKeys] = useState<Set<string>>(new Set())
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [reconcileBusyKey, setReconcileBusyKey] = useState<string | null>(null)
  const [reconcileError, setReconcileError] = useState<string | null>(null)
  // Fase 1D-f — "Gestionar movimiento": mismas etiquetas que ya usa Movimientos (nunca un sistema
  // paralelo). `managing` es el expense abierto en el paso de gestión — independiente de la lista de
  // candidatos, porque en cuanto se concilia, esa ocurrencia deja de ser candidata (ya tiene matchedExpenseId).
  const [tags, setTags] = useState<Tag[]>([])
  const [managing, setManaging] = useState<{ expenseId: string; forecastCategoryId: string | null } | null>(null)
  // Fase 1D-g — posibles pagos recurrentes detectados en el histórico bancario: SOLO propuestas, nunca
  // se crea nada sin que la familia pulse "Revisar" y luego "Crear pago previsto" en el formulario normal.
  // expenseCategoryByExpenseId es la única fuente real de categoría por movimiento (el detector nunca
  // duplica guessCategory de la Edge Function) — se carga aparte porque el resto de la pestaña no
  // necesita el listado completo de gastos para nada más.
  const [expenseCategoryByExpenseId, setExpenseCategoryByExpenseId] = useState<Map<string, string | null>>(new Map())
  const [dismissedRecurrenceKeys, setDismissedRecurrenceKeys] = useState<Set<string>>(new Set())
  const [recurrenceProposalsOpen, setRecurrenceProposalsOpen] = useState(false)
  const [recurrenceDismissBusyKey, setRecurrenceDismissBusyKey] = useState<string | null>(null)
  const [recurrenceError, setRecurrenceError] = useState<string | null>(null)
  const [recurrencePrefill, setRecurrencePrefill] = useState<ForecastPaymentPrefill | null>(null)
  // Fase 1E.2 — "🏦 Préstamos e hipotecas": vista complementaria de solo lectura, nunca sustituye
  // "Próximos pagos". Se recarga aparte (no en cada reload() normal) — solo cambia al crear/editar/
  // desclasificar un préstamo desde el propio formulario.
  const [loanDetails, setLoanDetails] = useState<ForecastLoanDetails[]>([])
  const [loanSectionOpen, setLoanSectionOpen] = useState(false)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  function reload() {
    setLoading(true)
    setError(null)
    listForecastPayments()
      .then(async (list) => {
        setPayments(list)
        // Overrides por pago (puntuales, casi siempre vacíos) — necesarios para expandForecastOccurrences.
        const entries = await Promise.all(list.map(async (p) => [p.id, await listForecastOccurrenceOverrides(p.id)] as const))
        setOverridesByPayment(new Map(entries))
      })
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar Previsión de pagos')))
      .finally(() => setLoading(false))
    // Fase 1E.2 — se recarga junto con payments: clasificar/desclasificar un préstamo pasa siempre por
    // ForecastPaymentForm, que llama a la misma reload() al guardar (onSaved -> saveCommon).
    listLoanDetails().then(setLoanDetails).catch(() => {})
  }
  function reloadReconciliation() {
    listBankTransactions().then(setBankTransactions).catch(() => {})
    listAllMatchedForecastExpenseIds().then(setMatchedExpenseIds).catch(() => {})
  }
  // Fase 1D-g — aparte de reloadReconciliation: la categoría de los movimientos y los descartes guardados
  // solo hace falta recargarlos tras "No me interesa", nunca en cada confirmación/desconciliación normal.
  function reloadRecurrenceProposalExtras() {
    listExpenses()
      .then((list) => setExpenseCategoryByExpenseId(new Map(list.map((e) => [e.id, e.category]))))
      .catch(() => {})
    listForecastRecurrenceDismissals().then(setDismissedRecurrenceKeys).catch(() => {})
  }
  useEffect(reload, [])
  useEffect(reloadReconciliation, [])
  useEffect(reloadRecurrenceProposalExtras, [])
  useEffect(() => {
    listFamilyMembers().then(setMembers).catch(() => {})
    listBankAccounts().then(setAccounts).catch(() => {})
    listTags().then(setTags).catch(() => {})
  }, [])

  function closeForm() {
    setShowAddForm(false)
    setEditingPayment(null)
    setRecurrencePrefill(null)
  }
  function saveCommon() {
    closeForm()
    reload()
  }

  const activePayments = payments.filter((p) => p.active)
  // Fase 1E.2 — "🏦 Préstamos e hipotecas": SOLO forecast_payments que de verdad tienen un
  // forecast_loan_details relacionado (la existencia de la fila es la clasificación, nunca un booleano
  // aparte) — capital pendiente/interés/vencimiento nunca participan en horizonEnd/forecastTotals/
  // forecastByMonth de arriba, son puramente informativos.
  const loanCards = loanDetails
    .map((loan) => {
      const p = payments.find((pp) => pp.id === loan.forecastPaymentId)
      return p ? { loan, payment: p } : null
    })
    .filter((x): x is { loan: ForecastLoanDetails; payment: ForecastPaymentWithReminders } => x !== null)
  const horizonEnd =
    horizon === '7d' ? stepDays(today, 7) : horizon === '30d' ? stepDays(today, 30) : horizon === '3m' ? stepMonthsClamped(today, 3) : stepMonthsClamped(today, 12)

  // Una previsión Finalizada (serie que superó su UNTIL, o pago puntual ya pasado) no aporta ninguna
  // ocurrencia futura — expandForecastOccurrences ya las excluye sola, sin necesidad de filtrarlas aquí.
  // Fase 1D-c: se pasa p.installments — un pago con cargos fraccionados aporta uno por cargo, no uno por ciclo.
  const upcomingOccurrences: ForecastOccurrence[] = []
  for (const p of activePayments) upcomingOccurrences.push(...expandForecastOccurrences(p, overridesByPayment.get(p.id) ?? [], today, horizonEnd, p.installments))
  upcomingOccurrences.sort((a, b) => a.expectedPaymentDate.localeCompare(b.expectedPaymentDate))
  const totals = forecastTotals(upcomingOccurrences)

  // Visión 12 meses — SIEMPRE los próximos 12 meses naturales desde el mes en curso, con independencia
  // del selector de horizonte de arriba: detectar qué meses vienen más cargados es una vista aparte.
  const twelveMonthEnd = stepMonthsClamped(today, 12)
  const twelveMonthOccurrences: ForecastOccurrence[] = []
  for (const p of activePayments) twelveMonthOccurrences.push(...expandForecastOccurrences(p, overridesByPayment.get(p.id) ?? [], today, twelveMonthEnd, p.installments))
  const monthTotals = forecastByMonth(twelveMonthOccurrences, 'expectedPaymentDate')
  const [ty, tm] = today.split('-').map(Number)
  const monthSlots = Array.from({ length: 12 }, (_, i) => {
    const monthIndex0 = (tm - 1 + i) % 12
    const year = ty + Math.floor((tm - 1 + i) / 12)
    const key = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`
    return { key, label: MONTH_LABELS[monthIndex0].slice(0, 3).toUpperCase(), totals: monthTotals.get(key) ?? [] }
  })

  // Fase 1D-e — conciliación bancaria: ventana propia (nunca la del selector de horizonte de arriba —
  // un cargo ya puede haber pasado antes de "hoy" cuando se sincroniza el banco). ±14 días hacia atrás
  // cubre sobradamente la ventana de fecha del motor (RECONCILIATION_DATE_WINDOW_DAYS=3) más el margen
  // de sincronización incremental del banco (3 días, ver enable-banking-sync-transactions); un poco hacia
  // delante para poder proponer un cargo que ya haya llegado para una cuota futura próxima.
  const reconciliationRangeStart = stepDays(today, -14)
  const reconciliationRangeEnd = stepDays(today, 10)
  const reconciliationOccurrences: ForecastOccurrence[] = []
  for (const p of activePayments) {
    reconciliationOccurrences.push(...expandForecastOccurrences(p, overridesByPayment.get(p.id) ?? [], reconciliationRangeStart, reconciliationRangeEnd, p.installments))
  }
  const reconciliationCandidateInputs: OccurrenceForMatching[] = reconciliationOccurrences
    .filter((o) => !o.matchedExpenseId)
    .map((o) => {
      const parent = payments.find((p) => p.id === o.forecastPaymentId)
      return {
        occurrence: o,
        payment: { bankAccountId: parent?.bankAccountId ?? null, title: parent?.title ?? o.title, provider: parent?.provider ?? null },
        categoryName: categories.find((c) => c.id === o.categoryId)?.name ?? null,
      }
    })
  const reconciliationMovements: BankMovementForMatching[] = bankTransactions
    .filter((t): t is BankTransaction & { transactionDate: string } => t.creditDebit === 'DBIT' && t.transactionDate != null)
    .map((t) => ({
      bankTransactionId: t.id,
      expenseId: t.matchedExpenseId,
      accountId: t.accountId,
      date: t.transactionDate,
      amount: Math.abs(t.amount),
      currency: t.currency,
      description: t.description,
      isIncome: false,
    }))
  const reconciliationCandidates = findReconciliationCandidates(reconciliationCandidateInputs, reconciliationMovements, matchedExpenseIds).filter(
    (c) => !dismissedCandidateKeys.has(candidateKey(c)),
  )
  const reconciledRecently = reconciliationOccurrences.filter((o) => !!o.matchedExpenseId)

  // Fase 1D-g — detección de posibles pagos recurrentes: TODO el histórico bancario real (nunca solo la
  // ventana de conciliación de arriba, que es deliberadamente corta) porque el motor necesita ver varios
  // meses para poder exigir un mínimo de evidencia. category viene de la MISMA fuente real que usa
  // "Gestionar movimiento" (el gasto ya vinculado), nunca una adivinanza nueva.
  const allBankMovementsForDetection: BankMovementForDetection[] = bankTransactions
    .filter((t): t is BankTransaction & { transactionDate: string } => t.creditDebit === 'DBIT' && t.transactionDate != null)
    .map((t) => ({
      bankTransactionId: t.id,
      expenseId: t.matchedExpenseId,
      accountId: t.accountId,
      date: t.transactionDate,
      amount: Math.abs(t.amount),
      currency: t.currency,
      description: t.description,
      isIncome: false,
      category: t.matchedExpenseId ? (expenseCategoryByExpenseId.get(t.matchedExpenseId) ?? null) : null,
    }))
    // Una paga/transferencia entre miembros de la familia no es una "factura" — mismo criterio real ya
    // usado en Movimientos/Presupuesto (categoría "Movimientos internos" o hija suya), nunca una regla
    // nueva por nombre de comercio.
    .filter((m) => !isInternalTransferCategory(m.category, categories))
  const existingPaymentsForDedup: ForecastPaymentForDedup[] = payments.map((p) => ({
    title: p.title,
    provider: p.provider,
    bankAccountId: p.bankAccountId,
    active: p.active,
  }))
  const recurrenceCandidates = findNewRecurrenceCandidates(allBankMovementsForDetection, matchedExpenseIds, existingPaymentsForDedup, dismissedRecurrenceKeys, today)

  function recurrenceCandidateKey(c: RecurrenceCandidate): string {
    return `${c.accountId}::${c.merchantKey}`
  }

  function reviewRecurrenceCandidate(c: RecurrenceCandidate) {
    setRecurrencePrefill(buildForecastPrefillFromCandidate(c))
    setEditingPayment(null)
    setShowAddForm(true)
  }

  async function dismissRecurrenceCandidate(c: RecurrenceCandidate) {
    const key = recurrenceCandidateKey(c)
    setRecurrenceDismissBusyKey(key)
    setRecurrenceError(null)
    try {
      await dismissForecastRecurrence(c.accountId, c.merchantKey)
      setDismissedRecurrenceKeys((prev) => new Set(prev).add(key))
    } catch (err) {
      setRecurrenceError(errorMessage(err, 'No se pudo descartar la propuesta'))
    } finally {
      setRecurrenceDismissBusyKey(null)
    }
  }

  function candidateKey(c: ReconciliationCandidate): string {
    return `${c.occurrence.forecastPaymentId}:${c.occurrence.occurrenceDate}:${c.occurrence.installmentSequenceIndex ?? 0}:${c.movement.bankTransactionId}`
  }

  async function confirmCandidate(c: ReconciliationCandidate) {
    if (!c.movement.expenseId) return
    const key = candidateKey(c)
    setReconcileBusyKey(key)
    setReconcileError(null)
    try {
      await matchForecastOccurrence(c.occurrence.forecastPaymentId, c.occurrence.occurrenceDate, c.occurrence.installmentSequenceIndex, c.movement.expenseId, {
        amountStatus: c.occurrence.amountStatus,
        amount: c.occurrence.amount,
        amountEstimatedBasis: null,
      })
      reload()
      reloadReconciliation()
      // La conciliación YA ha quedado guardada — "Gestionar movimiento" es un paso SEPARADO y opcional
      // a continuación (si el usuario lo cierra sin guardar nada, la conciliación no se pierde).
      setManaging({ expenseId: c.movement.expenseId, forecastCategoryId: c.occurrence.categoryId })
    } catch (err) {
      setReconcileError(errorMessage(err, 'No se pudo conciliar'))
    } finally {
      setReconcileBusyKey(null)
    }
  }
  function dismissCandidate(c: ReconciliationCandidate) {
    setDismissedCandidateKeys((prev) => new Set(prev).add(candidateKey(c)))
  }
  async function unmatchOccurrence(o: ForecastOccurrence) {
    if (!o.matchedExpenseId) return
    const key = `${o.forecastPaymentId}:${o.occurrenceDate}:${o.installmentSequenceIndex ?? 0}`
    setReconcileBusyKey(key)
    setReconcileError(null)
    try {
      await unmatchForecastOccurrence(o.forecastPaymentId, o.occurrenceDate, o.installmentSequenceIndex, o.matchedExpenseId)
      reload()
      reloadReconciliation()
    } catch (err) {
      setReconcileError(errorMessage(err, 'No se pudo desconciliar'))
    } finally {
      setReconcileBusyKey(null)
    }
  }

  // Fase 1F.A2 — mismo contenido/cálculos que tenía la extinta "Gestionar pagos previstos"
  // (Fase 1D-a/b/c/d): importe×pagos, frecuencia, próximo/último pago, "N de M restantes" para un plan
  // finito; cobros por ciclo/"Se renueva" para una obligación fraccionada. Ahora vive dentro del "⋯" de
  // cada tarjeta de "Próximos pagos", nunca en una segunda lista aparte.
  function renderPaymentPlanSummary(p: ForecastPaymentWithReminders, overrides: ForecastOccurrenceOverride[]) {
    const finished = isForecastPaymentFinished(p, overrides, today)
    const recurrenceForm = p.recurrenceRule ? parseRecurrenceRuleToFormState(p.recurrenceRule, p.dueDate) : null
    const recurrenceLabel = recurrenceForm ? RECURRENCE_SHORT_LABEL[recurrenceForm.freqOption] : ''
    // Un plan finito de verdad (no un pago único —totalInstallments=1— ni una serie indefinida como
    // Seguro Coche Ibiza —totalInstallments=null—): solo entonces se muestra la tarjeta compacta de plan.
    const total = totalInstallments(p)
    const isPlan = !!p.recurrenceRule && total != null && total > 1
    // "N de M restantes" (Fase 1D-a): cuenta por fecha, nunca afirma que las pasadas están pagadas.
    const remaining = isPlan ? remainingInstallments(p, overrides, today) : null
    const nextPlanOccurrence = isPlan ? nextForecastOccurrence(p, overrides, today) : null
    // Fase 1D-c: obligación con cargos fraccionados por ciclo (el caso del seguro) — eje distinto de
    // isPlan (que es "cuántas renovaciones", esto es "cuántos cargos por renovación").
    const hasSplit = p.installments.length > 0
    const cycleKnownEstimatedTotal = p.installments.reduce((sum, i) => sum + (i.amountStatus !== 'unknown' ? (i.amount ?? 0) : 0), 0)
    const cycleHasUnknown = p.installments.some((i) => i.amountStatus === 'unknown')
    return (
      <>
        {(!p.active || finished) && (
          <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
            {!p.active ? 'Desactivada' : 'Finalizada'}
          </p>
        )}
        {isPlan ? (
          <>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
              {p.amountStatus === 'unknown' ? 'Importe pendiente' : `${p.amountStatus === 'estimated' ? '≈ ' : ''}${formatForecastAmount(p.amount ?? 0, p.currency)}`} × {total}{' '}
              pagos
            </p>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
              {recurrenceLabel}
              {nextPlanOccurrence ? ` · Próximo pago: ${formatSpanishDate(nextPlanOccurrence.dueDate)}` : ''}
              {recurrenceForm?.untilDate ? ` · Último pago: ${formatSpanishDate(recurrenceForm.untilDate)}` : ''}
            </p>
            {remaining != null && (
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                {remaining} de {total} restantes
              </p>
            )}
          </>
        ) : hasSplit ? (
          <>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
              {cycleHasUnknown ? 'Importe pendiente' : formatForecastAmount(cycleKnownEstimatedTotal, p.currency)} · {p.installments.length} cobros por ciclo
            </p>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
              {recurrenceLabel ? `Se renueva: ${recurrenceLabel}` : ''}
            </p>
          </>
        ) : (
          <p className="muted" style={{ fontSize: 12, margin: '2px 0' }}>
            Vence: {formatSpanishDate(p.dueDate)}
            {recurrenceLabel ? ` · ${recurrenceLabel}` : ''}
          </p>
        )}
      </>
    )
  }

  function renderOccurrenceRow(o: ForecastOccurrence) {
    const parent = payments.find((p) => p.id === o.forecastPaymentId)
    const category = categories.find((c) => c.id === o.categoryId)
    const sameDates = o.dueDate === o.expectedPaymentDate
    // parseRecurrenceRuleToFormState (Fase 1D-b) clasifica la frecuencia SIN mirar el UNTIL — así un
    // plan finito ("FREQ=MONTHLY;UNTIL=...") sigue etiquetándose "Mensual", no "Personalizado".
    const recurrenceLabel = parent?.recurrenceRule ? RECURRENCE_SHORT_LABEL[parseRecurrenceRuleToFormState(parent.recurrenceRule, parent.dueDate).freqOption] : ''
    // Fase 1D-c: "1/2", "2/2"... para un cargo concreto de una obligación fraccionada por ciclo.
    const chargeLabel = o.installmentSequenceIndex != null && parent ? `${o.installmentSequenceIndex}/${parent.installments.length} — ` : ''
    const rowKey = `${o.forecastPaymentId}-${o.occurrenceDate}-${o.installmentSequenceIndex ?? 0}`
    const menuOpen = occurrenceMenuKey === rowKey
    return (
      <div key={rowKey} className="card task-card">
        <div className="task-card-main">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <strong>
              {chargeLabel}
              {o.title}
              {/* Fase 1D-e: conciliada con un movimiento real del banco — nunca automático, siempre confirmado a mano. */}
              {o.matchedExpenseId && <span style={{ color: '#1e8449' }}> · ✓ Cobrado</span>}
            </strong>
            {/* Fase 1F.A2 — Editar/Desactivar/Reactivar/Eliminar de la extinta "Gestionar pagos previstos",
                ahora aquí, reutilizando EXACTAMENTE los mismos manejadores; solo si hay pago padre (siempre
                lo hay salvo estado transitorio). */}
            {parent && (
              <button
                type="button"
                className="link-button"
                aria-label={`Más acciones — ${o.title}`}
                aria-expanded={menuOpen}
                style={{ fontSize: 18, padding: '0 4px', lineHeight: 1, flexShrink: 0 }}
                onClick={() => setOccurrenceMenuKey((cur) => (cur === rowKey ? null : rowKey))}
              >
                ⋯
              </button>
            )}
          </div>
          {o.amountStatus === 'unknown' ? (
            <p className="muted" style={{ margin: '2px 0' }}>Importe pendiente</p>
          ) : (
            <p style={{ margin: '2px 0' }}>
              {o.amountStatus === 'estimated' ? '≈ ' : ''}
              {formatForecastAmount(o.amount ?? 0, o.currency)}
              {o.amountStatus === 'estimated' && parent?.amountEstimatedBasis && <span className="muted"> · {parent.amountEstimatedBasis}</span>}
            </p>
          )}
          <p className="muted" style={{ fontSize: 13, margin: '2px 0' }}>
            {sameDates ? formatSpanishDate(o.dueDate) : `Pago previsto: ${formatSpanishDate(o.expectedPaymentDate)} · Vence: ${formatSpanishDate(o.dueDate)}`}
          </p>
          {(category || recurrenceLabel) && (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              {category ? `${category.icon} ${category.name}` : null}
              {category && recurrenceLabel ? ' · ' : ''}
              {recurrenceLabel}
            </p>
          )}
          {o.matchedExpenseId && (
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button
                type="button"
                className="link-button"
                style={{ fontSize: 12, padding: 0 }}
                onClick={() => setManaging({ expenseId: o.matchedExpenseId!, forecastCategoryId: o.categoryId })}
              >
                Gestionar
              </button>
              <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => unmatchOccurrence(o)}>
                Desconciliar
              </button>
            </div>
          )}
          {parent && menuOpen && (
            <div style={{ marginTop: 6 }}>
              {renderPaymentPlanSummary(parent, overridesByPayment.get(parent.id) ?? [])}
              <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setEditingPayment(parent)
                    setOccurrenceMenuKey(null)
                  }}
                >
                  Editar
                </button>
                {parent.active ? (
                  <ConfirmButton label="Desactivar" onConfirm={() => setForecastPaymentActive(parent, false).then(reload)} />
                ) : (
                  <button type="button" className="link-button" onClick={() => setForecastPaymentActive(parent, true).then(reload)}>
                    Reactivar
                  </button>
                )}
                <ConfirmButton label="Eliminar" onConfirm={() => deleteForecastPayment(parent.calendarEventId, parent.id).then(reload)} />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading) return <p className="muted">Cargando Previsión de pagos…</p>

  return (
    <div>
      <h2 className="section-title">🔮 Previsión de pagos</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Anticípate a los pagos que vienen.
      </p>
      {error && <p className="error">{error}</p>}

      <button type="button" style={{ marginBottom: 8 }} onClick={() => setShowAddForm(true)}>
        + Añadir pago
      </button>

      {payments.length === 0 ? (
        <div className="card event-card" style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: 0 }}>Todavía no tienes pagos previstos.</p>
          <p className="muted" style={{ marginTop: 4 }}>Empieza añadiendo cosas que sabes que llegarán: seguros, IBI, cuotas, impuestos…</p>
          <button type="button" onClick={() => setShowAddForm(true)} style={{ marginTop: 8 }}>
            + Añadir primer pago
          </button>
        </div>
      ) : (
        <>
          {/* Fase 1F.A — "Visión 12 meses" ahora antes del selector de horizonte: detectar qué meses
              vienen más cargados es lo primero que se quiere ver, independientemente del horizonte elegido
              abajo. Mismos cálculos de siempre (monthSlots/forecastByMonth), sin tocar la lógica. */}
          <h2 className="section-title" style={{ marginTop: 12 }}>
            Visión 12 meses
          </h2>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {monthSlots.map((m) => (
              <div key={m.key} className="card" style={{ minWidth: 92, flexShrink: 0, padding: '10px 12px' }}>
                <strong style={{ fontSize: 13 }}>{m.label}</strong>
                {m.totals.length === 0 && (
                  <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                    —
                  </p>
                )}
                {m.totals.map((t) => (
                  <div key={t.currency} style={{ marginTop: 4 }}>
                    {t.knownTotal > 0 && (
                      <p style={{ margin: 0, fontSize: 13 }}>{formatForecastAmount(t.knownTotal, t.currency)}</p>
                    )}
                    {t.estimatedTotal > 0 && (
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                        ≈ {formatForecastAmount(t.estimatedTotal, t.currency)}
                      </p>
                    )}
                    {t.unknownCount > 0 && (
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                        {t.unknownCount} pendiente{t.unknownCount === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="filter-row" style={{ marginTop: 12 }}>
            {HORIZON_OPTIONS.map((h) => (
              <button key={h.key} type="button" className={'chip' + (horizon === h.key ? ' chip-active' : '')} onClick={() => setHorizon(h.key)}>
                {h.label}
              </button>
            ))}
          </div>

          <div className="card event-card" style={{ marginTop: 8 }}>
            <strong>{HORIZON_TITLES[horizon]}</strong>
            {totals.length === 0 && <p className="muted" style={{ margin: '6px 0 0' }}>Nada previsto en este periodo.</p>}
            {totals.map((t) => (
              <div key={t.currency} style={{ margin: '6px 0 0' }}>
                <p style={{ color: '#1e8449', margin: 0 }}>{formatForecastAmount(t.knownTotal, t.currency)} conocidos</p>
                {t.estimatedTotal > 0 && <p style={{ color: '#b9770e', margin: '2px 0 0' }}>≈ {formatForecastAmount(t.estimatedTotal, t.currency)} estimados</p>}
                {t.unknownCount > 0 && (
                  <p className="muted" style={{ margin: '2px 0 0' }}>
                    {t.unknownCount} pago{t.unknownCount === 1 ? '' : 's'} pendiente{t.unknownCount === 1 ? '' : 's'} de importe
                  </p>
                )}
                {t.estimatedTotal > 0 && (
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    {formatForecastAmount(t.knownPlusEstimatedTotal, t.currency)} con importe disponible
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Fase 1D-e — zona discreta, nunca un popup al abrir Economía: solo aparece si hay algo que
              revisar. HIGH/MEDIUM se proponen para confirmar a mano — LOW nunca se enseña (demasiado
              ruido, no aporta confianza suficiente); ni siquiera "high" concilia solo (auditoría, sección
              7: sin auto-conciliación todavía). */}
          {(reconciliationCandidates.length > 0 || reconciledRecently.length > 0) && (
            <>
              <button type="button" className="link-button section-title" style={{ marginTop: 16, display: 'block' }} onClick={() => setReconcileOpen((v) => !v)}>
                {reconcileOpen ? '▾' : '▸'} 🔎{' '}
                {reconciliationCandidates.length > 0
                  ? `${reconciliationCandidates.length} pago${reconciliationCandidates.length === 1 ? '' : 's'} por revisar`
                  : 'Conciliación bancaria'}
              </button>
              {reconcileOpen && (
                <div style={{ marginTop: 8 }}>
                  {reconcileError && <p className="error">{reconcileError}</p>}
                  {reconciliationCandidates.map((c) => {
                    const key = candidateKey(c)
                    const busy = reconcileBusyKey === key
                    return (
                      <div key={key} className="card" style={{ padding: 12, marginBottom: 8 }}>
                        <p className="muted" style={{ margin: '0 0 4px', fontSize: 12 }}>
                          {c.confidence === 'high' ? 'PEPA ha encontrado un posible cargo' : 'Puede que sea este cargo — revísalo'}
                        </p>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <p className="muted" style={{ margin: 0, fontSize: 11 }}>Previsto</p>
                            <strong>{c.occurrence.title}</strong>
                            <p style={{ margin: '2px 0' }}>
                              {formatSpanishDate(c.occurrence.expectedPaymentDate)} ·{' '}
                              {c.occurrence.amountStatus === 'unknown' ? 'Importe pendiente' : formatForecastAmount(c.occurrence.amount ?? 0, c.occurrence.currency)}
                            </p>
                          </div>
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <p className="muted" style={{ margin: 0, fontSize: 11 }}>Banco</p>
                            <strong>{c.movement.description ?? 'Movimiento bancario'}</strong>
                            <p style={{ margin: '2px 0' }}>
                              {formatSpanishDate(c.movement.date)} · {formatForecastAmount(c.movement.amount, c.movement.currency)}
                            </p>
                          </div>
                        </div>
                        <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>{c.reasons.map((r) => r.label).join(' · ')}</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" disabled={busy} onClick={() => confirmCandidate(c)}>
                            {busy ? 'Guardando…' : 'Confirmar'}
                          </button>
                          <button type="button" className="link-button" disabled={busy} onClick={() => dismissCandidate(c)}>
                            No es este
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {reconciledRecently.length > 0 && (
                    <>
                      <p className="muted" style={{ fontSize: 12, margin: '8px 0 4px', fontWeight: 600 }}>Conciliados recientemente</p>
                      {reconciledRecently.map((o) => (
                        <p key={`${o.forecastPaymentId}-${o.occurrenceDate}-${o.installmentSequenceIndex ?? 0}`} className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                          ✓ {o.title} · {formatSpanishDate(o.expectedPaymentDate)} ·{' '}
                          {o.amountStatus === 'unknown' ? 'Importe pendiente' : formatForecastAmount(o.amount ?? 0, o.currency)}{' '}
                          <button
                            type="button"
                            className="link-button"
                            style={{ fontSize: 12, padding: 0 }}
                            onClick={() => setManaging({ expenseId: o.matchedExpenseId!, forecastCategoryId: o.categoryId })}
                          >
                            Gestionar
                          </button>
                        </p>
                      ))}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Independiente de si el acordeón de arriba está abierto/cerrado o de cuántos candidatos
              queden: "Gestionar movimiento" es un paso propio que sigue vivo aunque el resto de la
              sección de conciliación cambie de forma mientras se recarga. */}
          {managing && (
            <ManageReconciledExpense
              expenseId={managing.expenseId}
              forecastCategoryId={managing.forecastCategoryId}
              categories={categories}
              tags={tags}
              onClose={() => setManaging(null)}
              onDone={() => {
                setManaging(null)
                reloadReconciliation()
              }}
            />
          )}

          <h2 className="section-title" style={{ marginTop: 16 }}>
            Próximos pagos
          </h2>
          <div className="event-list">
            {upcomingOccurrences.map(renderOccurrenceRow)}
            {upcomingOccurrences.length === 0 && <p className="muted">Nada previsto en este periodo.</p>}
          </div>

          {/* Fase 1E.2 — vista COMPLEMENTARIA, nunca sustituye "Próximos pagos" de arriba — solo aparece si
              hay al menos un préstamo clasificado. Fase 1F.A3: se mantiene solo con datos adicionales del
              préstamo (capital pendiente, interés, cuotas, fecha fin) — la cuota ya sale en "Próximos pagos". */}
          {loanCards.length > 0 && (
            <>
              <button type="button" className="link-button section-title" style={{ marginTop: 16, display: 'block' }} onClick={() => setLoanSectionOpen((v) => !v)}>
                {loanSectionOpen ? '▾' : '▸'} 🏦 Préstamos e hipotecas
              </button>
              {loanSectionOpen && (
                <div className="event-list" style={{ marginTop: 8 }}>
                  {loanCards.map(({ loan, payment: p }) => {
                    const freqLabel = p.recurrenceRule ? RECURRENCE_SHORT_LABEL[parseRecurrenceRuleToFormState(p.recurrenceRule, p.dueDate).freqOption] : ''
                    const hasAnyDetail = loan.outstandingPrincipalCents != null || loan.remainingInstallments != null || loan.maturityDate != null || loan.interestRateBps != null
                    return (
                      <div key={loan.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
                        <strong>{p.title}</strong>
                        <p style={{ margin: '2px 0' }}>
                          {p.amount != null ? formatForecastAmount(p.amount, p.currency) : 'Importe pendiente'}
                          {freqLabel ? ` / ${freqLabel.toLowerCase()}` : ''}
                        </p>
                        {hasAnyDetail ? (
                          <>
                            {loan.outstandingPrincipalCents != null && loan.principalAsOfDate && (
                              <p className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                                Capital pendiente: {formatForecastAmount(loan.outstandingPrincipalCents / 100, p.currency)} a fecha {formatSpanishDate(loan.principalAsOfDate)}
                              </p>
                            )}
                            {loan.remainingInstallments != null && (
                              <p className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                                {loan.remainingInstallments} cuota{loan.remainingInstallments === 1 ? '' : 's'} pendiente{loan.remainingInstallments === 1 ? '' : 's'}
                              </p>
                            )}
                            {loan.maturityDate && (
                              <p className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                                Finaliza {formatSpanishDate(loan.maturityDate)}
                              </p>
                            )}
                            {loan.interestRateBps != null && (
                              <p className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                                Interés{loan.interestType ? ` ${LOAN_INTEREST_TYPE_LABELS[loan.interestType].toLowerCase()}` : ''} {formatInterestBpsToPercent(loan.interestRateBps)}%
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                            Datos del préstamo incompletos
                          </p>
                        )}
                        <button type="button" className="link-button" style={{ marginTop: 4 }} onClick={() => setEditingPayment(p)}>
                          {hasAnyDetail ? 'Ver / editar datos del préstamo' : 'Completar datos'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Fase 1D-g — igual de discreta que la conciliación bancaria de arriba: solo aparece si hay
              algo que proponer, nunca un aviso al abrir Economía. PEPA nunca crea nada aquí — "Revisar"
              solo abre el formulario normal de "Nuevo pago previsto" ya precargado. */}
          {recurrenceCandidates.length > 0 && (
            <>
              <button
                type="button"
                className="link-button section-title"
                style={{ marginTop: 16, display: 'block' }}
                onClick={() => setRecurrenceProposalsOpen((v) => !v)}
              >
                {recurrenceProposalsOpen ? '▾' : '▸'} 💡 {recurrenceCandidates.length} posible{recurrenceCandidates.length === 1 ? '' : 's'} pago
                {recurrenceCandidates.length === 1 ? '' : 's'} recurrente{recurrenceCandidates.length === 1 ? '' : 's'}
              </button>
              {recurrenceProposalsOpen && (
                <div style={{ marginTop: 8 }}>
                  {recurrenceError && <p className="error">{recurrenceError}</p>}
                  {recurrenceCandidates.map((c) => {
                    const key = recurrenceCandidateKey(c)
                    const busy = recurrenceDismissBusyKey === key
                    const accountName = accounts.find((a) => a.id === c.accountId)?.name ?? 'una cuenta bancaria'
                    return (
                      <div key={key} className="card" style={{ padding: 12, marginBottom: 8 }}>
                        <strong>{c.displayName}</strong>
                        <p className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                          Se ha cobrado con periodicidad {c.periodicityLabel} desde {accountName}, en los últimos {c.occurrences.length} cargos.
                        </p>
                        <p style={{ margin: '2px 0' }}>Importe habitual: ≈ {formatForecastAmount(c.estimatedAmountCents / 100, c.currency)}</p>
                        <p className="muted" style={{ margin: '2px 0', fontSize: 12 }}>{c.estimatedBasisText}</p>
                        <p style={{ margin: '2px 0' }}>Próximo cargo estimado: {formatSpanishDate(c.nextDueDate)}</p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button type="button" disabled={busy} onClick={() => reviewRecurrenceCandidate(c)}>
                            Revisar
                          </button>
                          <button type="button" className="link-button" disabled={busy} onClick={() => dismissRecurrenceCandidate(c)}>
                            {busy ? 'Descartando…' : 'No me interesa'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {(showAddForm || editingPayment) && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {editingPayment ? 'Editar pago previsto' : 'Nuevo pago previsto'}
              </h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={closeForm}>
                ✕
              </button>
            </div>
            <ForecastPaymentForm
              categories={categories}
              members={members}
              accounts={accounts}
              payment={editingPayment}
              prefill={editingPayment ? null : recurrencePrefill}
              overrides={editingPayment ? (overridesByPayment.get(editingPayment.id) ?? []) : []}
              onSaved={saveCommon}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Fase 1D-f — "Gestionar movimiento": paso SEPARADO y opcional después de confirmar una conciliación
// (nunca bloquea ni deshace la conciliación si se cierra sin guardar). Reutiliza EXACTAMENTE el mismo
// mecanismo que ya usa Movimientos para editar un gasto real — classify_purchase (RPC atómica, Fase
// 6C.2C) para la categoría, updateExpense para la etiqueta — nunca un camino paralelo ni un UPDATE
// directo a expenses.category. category/tag_id son la única definición real de "movimiento gestionado"
// que existe en esta base de datos (domain/pending.ts): no se inventa ningún estado nuevo.
function ManageReconciledExpense({
  expenseId,
  forecastCategoryId,
  categories,
  tags,
  onClose,
  onDone,
}: {
  expenseId: string
  forecastCategoryId: string | null
  categories: BudgetCategory[]
  tags: Tag[]
  onClose: () => void
  onDone: () => void
}) {
  const [expense, setExpense] = useState<Expense | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [tagId, setTagId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const forecastCategoryName = categories.find((c) => c.id === forecastCategoryId)?.name ?? null

  useEffect(() => {
    let cancelled = false
    getExpenseById(expenseId)
      .then((e) => {
        if (cancelled || !e) return
        setExpense(e)
        // resolveManagedExpenseCategory nunca decide sola: solo propone un punto de partida editable —
        // no existe ningún campo que distinga "categoría automática" de "categoría confirmada a mano"
        // (auditoría de esta fase), así que nada se aplica hasta que la persona pulse "Guardar".
        setCategory(resolveManagedExpenseCategory(e.category, forecastCategoryName).preselected)
        setTagId(e.tagId ?? '')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId])

  async function handleSave() {
    if (!expense) return
    setSaving(true)
    setError(null)
    try {
      if (category != null && category !== expense.category) {
        let result
        try {
          result = await classifyPurchase({ expenseId: expense.id, category })
        } catch (err) {
          void reportClientError(err)
          setError(CLASSIFY_FAILED_MESSAGE)
          return
        }
        if (!classifyOk(result)) {
          setError(classifyMessage(result))
          return
        }
      }
      if ((tagId || null) !== expense.tagId) {
        await updateExpense(expense.id, { tagId: tagId || null })
      }
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 12, marginTop: 8 }}>
        <p className="muted" style={{ margin: 0 }}>Cargando movimiento…</p>
      </div>
    )
  }
  if (!expense) return null // el expense ya no existe/no es accesible — nada que gestionar

  const resolution = resolveManagedExpenseCategory(expense.category, forecastCategoryName)

  return (
    <div className="card" style={{ padding: 12, marginTop: 8 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Gestionar movimiento</p>
      <label>
        Categoría
        <CategorySelect value={category ?? ''} onChange={setCategory} categories={categories} emptyLabel={expense.category == null ? `⏳ ${PENDING_LABEL}` : undefined} />
      </label>
      {resolution.hasConflict && (
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Categoría actual del movimiento: {resolution.currentCategory}.{' '}
          <button type="button" className="link-button" style={{ fontSize: 12, padding: 0 }} onClick={() => setCategory(resolution.currentCategory)}>
            Mantener {resolution.currentCategory}
          </button>
        </p>
      )}
      <label style={{ marginTop: 8, display: 'block' }}>
        Etiqueta (opcional)
        <TagSelect value={tagId} onChange={setTagId} tags={tags} />
      </label>
      {error && <p className="error">{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Guardando…' : 'Guardar y finalizar'}
        </button>
        <button type="button" className="link-button" disabled={saving} onClick={onClose}>
          Ahora no
        </button>
      </div>
    </div>
  )
}

// Ajuste UX tras certificación móvil — firma explícita de una "situación estructural" del plan finito
// (Caso A): cuántos pagos, con qué frecuencia, desde qué vencimiento, y el estado/importe/basis del
// TOTAL. Cambiar cualquiera de estos ejes regenera la propuesta de reparto entera (PEPA vuelve a
// proponer N líneas desde cero); editar una línea suelta NO cambia esta firma, así que esa edición
// sobrevive a re-renders posteriores del formulario sin ser pisada.
function computeFinitePlanSignature(
  installmentCount: string,
  freqOption: ForecastRecurrenceOption,
  customFreq: ForecastCustomRecurrence['freq'],
  customInterval: string,
  dueDate: string,
  amountStatus: ForecastAmountStatus,
  amount: string,
  amountBasis: string,
): string {
  const validated = validateInstallmentCount(installmentCount)
  return JSON.stringify([
    validated.ok ? validated.count : null,
    freqOption,
    customFreq,
    customInterval,
    dueDate,
    amountStatus,
    amountStatus === 'unknown' ? null : amount,
    amountStatus === 'estimated' ? amountBasis : null,
  ])
}

// Misma idea que computeFinitePlanSignature, para el Caso B (cobro fraccionado por ciclo): cuántos
// cobros y el TOTAL del ciclo. No incluye frecuencia/dueDate como ancla de la SERIE (eso lo sigue
// llevando "¿Cuándo se repite?" de arriba) — dueDate aquí solo es el ancla del PRIMER cobro propuesto.
function computeSplitChargesSignature(splitCount: string, dueDate: string, amountStatus: ForecastAmountStatus, amount: string, amountBasis: string): string {
  const validated = validateSplitChargeCount(splitCount)
  return JSON.stringify([
    validated.ok ? validated.count : null,
    dueDate,
    amountStatus,
    amountStatus === 'unknown' ? null : amount,
    amountStatus === 'estimated' ? amountBasis : null,
  ])
}

// Fase 1D-g — lo único que precarga una propuesta de posible recurrencia detectada: SOLO campos
// respaldados de verdad por el propio análisis del histórico bancario (concepto, importe ESTIMADO,
// categoría si es fiable, fecha, recurrencia, cuenta). Nunca "relacionado con", recordatorios ni notas
// (pedido explícito: "NO inventar" esos datos) — se quedan en los valores por defecto de siempre del
// formulario, exactamente como al crear un pago nuevo en blanco.
// Fase 1D-g.2 — dueDate/recurrenceRule pasan a OPCIONALES: "Añadir a Previsión" desde un movimiento sin
// histórico suficiente (Caso 2) no puede rellenarlos sin inventar una fecha o una periodicidad que no
// existen todavía. Los useState de abajo (`payment?.x ?? prefill?.x ?? default`) ya funcionan sin
// cambios con un prefill parcial: `prefill?.dueDate` es simplemente `undefined`, cae al `''`/`null` de
// siempre — nunca hace falta una fecha falsa "para que compile".
export interface ForecastPaymentPrefill {
  title: string
  amount: number
  amountEstimatedBasis: string
  categoryName: string | null
  dueDate?: string
  // Ya construida como texto (p. ej. "FREQ=MONTHLY") — reutiliza parseRecurrenceRuleToFormState tal cual
  // reconstruye la recurrencia de un pago ya guardado, en vez de fijar recurs/freqOption a mano aquí.
  recurrenceRule?: string
  bankAccountId: string
  // Fase 1E.2 — SOLO una sugerencia de "Referencia bancaria" cuando la descripción real contiene un
  // patrón estructural claro de préstamo ("...PRESTAMO... N.XXXXXXXXXX") — nunca selecciona "Préstamo /
  // hipoteca" por sí sola, nunca rellena Referencia contractual (ver extractLoanBankReference).
  suggestedLoanBankReference?: string | null
}

// Fase 1E.2 — sugerencia visual "💡 Parece una cuota de préstamo": puramente ESTRUCTURAL sobre el título
// YA producido por el detector (1D-g) — nunca toca normalizeMerchantKey/hasSharedWord/tolerancias/mínimo
// de ocurrencias/deduplicación, nunca decide el tipo de pago por el usuario. Solo se activa cuando el
// título contiene la palabra "préstamo" Y un número de referencia largo tras "N." (patrón real:
// "PRESTAMOS ADEUDO CUOTA N.8078183410") — ese número se ofrece como Referencia bancaria, nunca como
// Referencia contractual (Fase 1E.0/1E.1: son conceptos distintos). No hardcodea ningún número de
// préstamo ni nombre de comercio concreto.
function extractLoanBankReference(text: string): string | null {
  if (!/prestamo/i.test(text)) return null
  const match = text.match(/n\.?\s*(\d{6,})/i)
  return match ? match[1] : null
}

function ForecastPaymentForm({
  categories,
  members,
  accounts,
  payment,
  overrides,
  prefill,
  onSaved,
}: {
  categories: BudgetCategory[]
  members: FamilyMember[]
  accounts: BankAccount[]
  payment: ForecastPaymentWithReminders | null
  overrides: ForecastOccurrenceOverride[]
  prefill?: ForecastPaymentPrefill | null
  onSaved: () => void
}) {
  const [title, setTitle] = useState(payment?.title ?? prefill?.title ?? '')
  const [categoryName, setCategoryName] = useState(() => categories.find((c) => c.id === payment?.categoryId)?.name ?? prefill?.categoryName ?? '')
  // Fase 1D-g — el estado del importe de una propuesta detectada SIEMPRE empieza en "Estimado", nunca
  // "Conocido": un patrón histórico (aunque los últimos cargos hayan sido idénticos) no garantiza el
  // importe futuro (decisión aprobada explícitamente). El usuario puede cambiarlo a mano si lo sabe fijo.
  const [amountStatus, setAmountStatus] = useState<ForecastAmountStatus>(payment?.amountStatus ?? (prefill ? 'estimated' : 'known'))
  const [amount, setAmount] = useState(payment?.amount != null ? String(payment.amount) : prefill ? String(prefill.amount) : '')
  const [amountBasis, setAmountBasis] = useState(payment?.amountEstimatedBasis ?? prefill?.amountEstimatedBasis ?? '')
  const [currency, setCurrency] = useState(payment?.currency ?? 'EUR')
  const [dueDate, setDueDate] = useState(payment?.dueDate ?? prefill?.dueDate ?? '')
  const [hasExpectedPaymentDate, setHasExpectedPaymentDate] = useState(!!payment?.expectedPaymentDate)
  const [expectedPaymentDate, setExpectedPaymentDate] = useState(payment?.expectedPaymentDate ?? '')
  // Fase 1D-b: "¿Se repite?" / "Frecuencia" / "¿Hasta cuándo?" son 3 preguntas independientes — el
  // estado inicial se reconstruye con parseRecurrenceRuleToFormState (domain/forecastInstallmentPlanForm.ts),
  // que ya decide si un UNTIL guardado corresponde a "Número de pagos" o a una "Fecha concreta" suelta.
  // Fase 1D-g: una propuesta detectada reutiliza EXACTAMENTE la misma reconstrucción — nunca fija
  // recurs/freqOption a mano por separado, para no duplicar esa lógica ya certificada.
  const initialRecurrence = parseRecurrenceRuleToFormState(payment?.recurrenceRule ?? prefill?.recurrenceRule ?? null, payment?.dueDate ?? prefill?.dueDate ?? '')
  // Ajuste UX — "recurs" ("¿vuelve a repetirse?") es DISTINTO del viejo "repeats": un plan finito (Caso
  // A, IBI en 6 pagos) internamente SIGUE usando un recurrence_rule con FREQ+UNTIL (initialRecurrence.repeats
  // es true), pero conceptualmente NO "vuelve a repetirse" — termina. Por eso initialRecurrence.repeats
  // por sí solo ya NO es la fuente de verdad de esta pregunta: se excluye explícitamente el caso
  // untilMode==='count', que es justo el que representa un plan finito.
  const initialRecurs = initialRecurrence.repeats && initialRecurrence.untilMode !== 'count'
  const [recurs, setRecurs] = useState(initialRecurs)
  const [freqOption, setFreqOption] = useState<ForecastRecurrenceOption>(initialRecurrence.freqOption)
  const [customFreq, setCustomFreq] = useState<ForecastCustomRecurrence['freq']>(initialRecurrence.customFreq)
  const [customInterval, setCustomInterval] = useState(initialRecurrence.customInterval)
  // Ajuste UX — "¿Hasta cuándo se repite?" ya no es una pregunta de primer nivel: solo se expone (muy al
  // final, "Para siempre"/"Hasta una fecha concreta"/"No lo sé todavía") cuando la obligación SÍ vuelve a
  // repetirse — para no perder la capacidad de reconstruir/editar un pago antiguo guardado con una fecha
  // final concreta.
  //
  // Fase 1D-g.3 — 3 opciones, no 2: el banco puede decirnos la FRECUENCIA (mensual, etc.) pero nunca la
  // DURACIÓN — "Para siempre" sería una conclusión que PEPA no puede afirmar. "No lo sé todavía" es SOLO
  // el punto de partida de una previsión NUEVA precargada desde detección bancaria (prefill sin payment);
  // nunca aparece al editar un pago YA guardado — su UNTIL (o su ausencia) ya fue una decisión explícita
  // de la familia en su momento, y esta fase no la reinterpreta. No hace falta persistir esta distinción:
  // mientras esté en "No lo sé todavía" el formulario simplemente no deja guardar (ver handleSubmit) —
  // recurrence_rule sigue teniendo exactamente los mismos 2 estados reales de siempre.
  const [recursDurationChoice, setRecursDurationChoice] = useState<'forever' | 'date' | 'unknown'>(
    initialRecurrence.untilMode === 'date' ? 'date' : payment == null && prefill != null ? 'unknown' : 'forever',
  )
  const [untilDate, setUntilDate] = useState(initialRecurrence.untilDate)
  // Ajuste UX — "¿Cómo se paga?" (paymentMode) es la pregunta SIEMPRE visible que sustituye "¿Se repite?"
  // como puerta de entrada al fraccionamiento: antes, para descubrir que se podía pagar en varias veces
  // había que activar primero "¿Se repite?", lo cual no es intuitivo para una obligación puntual como el
  // IBI. "Número de pagos" (paymentCount, compartido entre el Caso A y el Caso B — la etiqueta visible es
  // la misma, solo cambia dónde se guarda) aparece en cuanto se elige "En varios pagos", sin depender de
  // recurs. "¿Vuelve a repetirse?" (recurs, más abajo) decide DESPUÉS si esos pagos son un plan finito
  // (Caso A, forecast_occurrences) o los cargos de cada renovación de una obligación que sí se repite
  // (Caso B, forecast_payment_installments) — dos preguntas independientes, nunca mezcladas.
  const initialPaymentMode: 'single' | 'multiple' = initialRecurrence.untilMode === 'count' || (payment?.installments.length ?? 0) > 0 ? 'multiple' : 'single'
  const [paymentMode, setPaymentMode] = useState<'single' | 'multiple'>(initialPaymentMode)
  const [paymentCount, setPaymentCount] = useState(payment && payment.installments.length > 0 ? String(payment.installments.length) : initialRecurrence.installmentCount)
  // Caso A (plan finito, forecast_occurrences) exactamente cuando "varios pagos" + NO vuelve a repetirse;
  // Caso B (cargos por ciclo, forecast_payment_installments) exactamente cuando "varios pagos" + SÍ
  // vuelve a repetirse. untilMode ya no es elegible directamente por el usuario — se deriva aquí mismo,
  // en el propio render (nunca con un efecto: así no hay ni un frame de retraso al cambiar de modo).
  // recurrenceRuleNeeded: hace falta un recurrence_rule (y por tanto "Frecuencia") siempre que haya varios
  // pagos (Caso A necesita FREQ+UNTIL para las N fechas) o que la obligación se repita.
  const isFinitePlanMode = paymentMode === 'multiple' && !recurs
  const isSplitCycleMode = paymentMode === 'multiple' && recurs
  // "unknown" nunca llega a construir un recurrence_rule real — handleSubmit bloquea el guardado
  // mientras siga en ese estado (ver validación), así que aquí basta con no confundirlo con "date".
  const untilMode: 'forever' | 'count' | 'date' = isFinitePlanMode ? 'count' : recursDurationChoice === 'date' ? 'date' : 'forever'
  const recurrenceRuleNeeded = paymentMode === 'multiple' || recurs
  const [splitCharges, setSplitCharges] = useState<ForecastSplitChargeFormRow[]>(() =>
    payment && payment.installments.length > 0 ? parseInstallmentTemplatesToForm(payment.dueDate, payment.installments) : [],
  )
  const splitSignatureRef = useRef(
    payment && payment.installments.length > 0
      ? computeSplitChargesSignature(String(payment.installments.length), payment.dueDate, payment.amountStatus, payment.amount != null ? String(payment.amount) : '', payment.amountEstimatedBasis ?? '')
      : '',
  )

  // Ajuste UX tras certificación móvil — plan de pagos de un plan FINITO (Caso A): UNA línea == UN pago
  // (ciclo) de la serie, nunca forecast_payment_installments (eso es exclusivamente del Caso B). Al
  // editar un plan ya guardado se reconstruye con parseFinitePlanLinesFromSaved (importe base del padre
  // + overrides reales de forecast_occurrences) — nunca se genera una propuesta nueva desde cero solo
  // por abrir el formulario.
  const [planLines, setPlanLines] = useState<ForecastPlanLineFormRow[]>(() => {
    if (payment && initialRecurrence.repeats && initialRecurrence.untilMode === 'count') {
      const validated = validateInstallmentCount(initialRecurrence.installmentCount)
      if (validated.ok) {
        const { freq, interval } = resolvedFreqInterval(initialRecurrence.freqOption, initialRecurrence.customFreq, initialRecurrence.customInterval)
        return parseFinitePlanLinesFromSaved(payment.dueDate, freq, interval, validated.count, payment.amountStatus, payment.amount, payment.amountEstimatedBasis, overrides)
      }
    }
    return []
  })
  const planSignatureRef = useRef(
    payment && initialRecurrence.repeats && initialRecurrence.untilMode === 'count'
      ? computeFinitePlanSignature(
          initialRecurrence.installmentCount,
          initialRecurrence.freqOption,
          initialRecurrence.customFreq,
          initialRecurrence.customInterval,
          payment.dueDate,
          payment.amountStatus,
          payment.amount != null ? String(payment.amount) : '',
          payment.amountEstimatedBasis ?? '',
        )
      : '',
  )
  const [reminders, setReminders] = useState<{ value: number; unit: ForecastReminderUnit }[]>(
    payment?.reminders.map((r) => ({ value: r.value, unit: r.unit })) ?? [],
  )
  const [customReminderValue, setCustomReminderValue] = useState('1')
  const [customReminderUnit, setCustomReminderUnit] = useState<ForecastReminderUnit>('days')
  const [showInCalendar, setShowInCalendar] = useState(payment?.showInCalendar ?? true)
  const [bankAccountId, setBankAccountId] = useState(payment?.bankAccountId ?? prefill?.bankAccountId ?? '')
  const [ownerMemberId, setOwnerMemberId] = useState(payment?.ownerMemberId ?? '')
  const [notes, setNotes] = useState(payment?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Reintentar tras un fallo AL GUARDAR SOLO los datos del préstamo (ver handleSubmit) nunca debe crear
  // un segundo forecast_payment — una vez creado en este mismo formulario, los reintentos actualizan ese
  // mismo id en vez de volver a createForecastPayment.
  const createdPaymentIdRef = useRef<string | null>(null)

  // Fase 1E.2 — "Tipo de pago": forecast_payments sigue siendo la ÚNICA fuente de verdad de
  // concepto/cuota/fechas/recurrencia/cuenta — esto solo decide si además existe un forecast_loan_details
  // relacionado (1:1 opcional). Para un pago YA guardado, el valor inicial se carga de verdad (ver
  // useEffect más abajo) — nunca se adivina por el título ni la categoría. Para uno nuevo, "Pago normal"
  // por defecto siempre — incluso si prefill trae una sugerencia de préstamo (nunca se preselecciona sola).
  const [paymentType, setPaymentType] = useState<'normal' | 'prestamo'>('normal')
  const [existingLoanDetails, setExistingLoanDetails] = useState<ForecastLoanDetails | null>(null)
  const [showDeclassifyConfirm, setShowDeclassifyConfirm] = useState(false)
  const [loanType, setLoanType] = useState<ForecastLoanType | ''>('')
  const [loanBankReference, setLoanBankReference] = useState(prefill?.suggestedLoanBankReference ?? '')
  const [loanContractReference, setLoanContractReference] = useState('')
  const [loanOriginalPrincipal, setLoanOriginalPrincipal] = useState('')
  const [loanOutstandingPrincipal, setLoanOutstandingPrincipal] = useState('')
  const [loanPrincipalAsOfDate, setLoanPrincipalAsOfDate] = useState('')
  const [loanInterestRatePercent, setLoanInterestRatePercent] = useState('')
  const [loanInterestType, setLoanInterestType] = useState<ForecastLoanInterestType | ''>('')
  const [loanMaturityDate, setLoanMaturityDate] = useState('')
  const [loanRemainingInstallments, setLoanRemainingInstallments] = useState('')
  const [loanNotes, setLoanNotes] = useState('')

  // Editando un pago ya guardado: se carga su forecast_loan_details real (si existe) — nunca se asume.
  useEffect(() => {
    if (!payment) return
    let cancelled = false
    getLoanDetails(payment.id)
      .then((details) => {
        if (cancelled || !details) return
        setExistingLoanDetails(details)
        setPaymentType('prestamo')
        setLoanType(details.loanType ?? '')
        setLoanBankReference(details.bankReference ?? '')
        setLoanContractReference(details.contractReference ?? '')
        setLoanOriginalPrincipal(details.originalPrincipalCents != null ? centsToEurosString(details.originalPrincipalCents) : '')
        setLoanOutstandingPrincipal(details.outstandingPrincipalCents != null ? centsToEurosString(details.outstandingPrincipalCents) : '')
        setLoanPrincipalAsOfDate(details.principalAsOfDate ?? '')
        setLoanInterestRatePercent(details.interestRateBps != null ? formatInterestBpsToPercent(details.interestRateBps) : '')
        setLoanInterestType(details.interestType ?? '')
        setLoanMaturityDate(details.maturityDate ?? '')
        setLoanRemainingInstallments(details.remainingInstallments != null ? String(details.remainingInstallments) : '')
        setLoanNotes(details.notes ?? '')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id])

  // Cambiar de "Préstamo/hipoteca" a "Pago normal" cuando ya hay datos guardados de verdad NUNCA los
  // borra en silencio — exige confirmación explícita. Nada se borra todavía aquí: la eliminación real
  // ocurre solo al guardar (handleSubmit), y solo si de verdad se confirmó y se guarda el formulario.
  function handlePaymentTypeChange(next: 'normal' | 'prestamo') {
    if (next === 'normal' && paymentType === 'prestamo' && existingLoanDetails) {
      setShowDeclassifyConfirm(true)
      return
    }
    setPaymentType(next)
  }

  function hasReminder(value: number, unit: ForecastReminderUnit) {
    return reminders.some((r) => r.value === value && r.unit === unit)
  }
  function toggleQuickReminder(value: number, unit: ForecastReminderUnit) {
    setReminders((prev) =>
      prev.some((r) => r.value === value && r.unit === unit) ? prev.filter((r) => !(r.value === value && r.unit === unit)) : [...prev, { value, unit }],
    )
  }
  function addCustomReminder() {
    const value = Math.max(1, Math.round(Number(customReminderValue) || 1))
    if (hasReminder(value, customReminderUnit)) return
    setReminders((prev) => [...prev, { value, unit: customReminderUnit }])
  }
  function removeReminder(value: number, unit: ForecastReminderUnit) {
    setReminders((prev) => prev.filter((r) => !(r.value === value && r.unit === unit)))
  }

  function updatePlanLine(index: number, patch: Partial<ForecastPlanLineFormRow>) {
    setPlanLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }
  function updateSplitCharge(index: number, patch: Partial<ForecastSplitChargeFormRow>) {
    setSplitCharges((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  // Ajuste UX tras certificación móvil — PEPA propone el reparto del importe TOTAL en cuanto cambia
  // "cuántos pagos/cobros hacen falta" o el propio TOTAL (importe/estado/basis) — nunca al editar una
  // línea suelta (eso solo cambia planLines/splitCharges, no esta firma, así que no se regenera nada).
  useEffect(() => {
    if (!isFinitePlanMode) return
    const signature = computeFinitePlanSignature(paymentCount, freqOption, customFreq, customInterval, dueDate, amountStatus, amount, amountBasis)
    if (signature === planSignatureRef.current) return
    planSignatureRef.current = signature
    const validated = validateInstallmentCount(paymentCount)
    if (!validated.ok || !dueDate) return
    const { freq, interval } = resolvedFreqInterval(freqOption, customFreq, customInterval)
    const totalAmountNum = amountStatus === 'unknown' ? null : Number(amount) || 0
    setPlanLines(proposeFinitePlanLines(dueDate, freq, interval, validated.count, amountStatus, totalAmountNum, amountBasis))
  }, [isFinitePlanMode, paymentCount, freqOption, customFreq, customInterval, dueDate, amountStatus, amount, amountBasis])

  useEffect(() => {
    if (!isSplitCycleMode) return
    const signature = computeSplitChargesSignature(paymentCount, dueDate, amountStatus, amount, amountBasis)
    if (signature === splitSignatureRef.current) return
    splitSignatureRef.current = signature
    const validated = validateSplitChargeCount(paymentCount)
    if (!validated.ok || !dueDate) return
    const totalAmountNum = amountStatus === 'unknown' ? null : Number(amount) || 0
    setSplitCharges(proposeSplitCharges(dueDate, validated.count, amountStatus, totalAmountNum, amountBasis))
  }, [isSplitCycleMode, paymentCount, dueDate, amountStatus, amount, amountBasis])

  // Regla acordada: TOTAL Conocido debe cuadrar EXACTO al céntimo para poder guardar; TOTAL Estimado
  // permite guardar con un aviso (una estimación nunca es exacta por definición); TOTAL Pendiente no
  // comprueba nada — nunca se inventa un importe para poder repartir algo que no se conoce.
  function distributionCheck(lines: { amountStatus: ForecastAmountStatus; amount: string }[]): CentsDistributionCheck | null {
    if (amountStatus === 'unknown' || lines.length === 0) return null
    const totalCents = eurosStringToCents(amount)
    if (totalCents == null) return null
    const lineCentsList = lines.map((l) => (l.amountStatus === 'unknown' ? null : eurosStringToCents(l.amount)))
    return checkCentsDistribution(totalCents, lineCentsList)
  }
  function renderDistributionBanner(check: CentsDistributionCheck | null) {
    if (!check) return null
    if (check.matches) {
      return (
        <p style={{ color: '#1e8449', margin: '0 0 8px', fontSize: 13 }}>
          ✓ Total distribuido correctamente
        </p>
      )
    }
    const diffLabel = `${centsToEurosString(Math.abs(check.differenceCents))} €`
    return (
      <p className={amountStatus === 'known' ? 'error' : 'muted'} style={{ margin: '0 0 8px', fontSize: 13 }}>
        Diferencia pendiente: {diffLabel} {check.differenceCents > 0 ? 'sin repartir' : 'de más'}
      </p>
    )
  }
  const planCheck = isFinitePlanMode ? distributionCheck(planLines) : null
  const splitCheck = isSplitCycleMode ? distributionCheck(splitCharges) : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('Ponle un nombre a este pago.')
      return
    }
    if (!dueDate) {
      setError('Indica cuándo vence.')
      return
    }
    // Fase 1E.2 — capital pendiente y su fecha de referencia van SIEMPRE juntos, igual que exige la BD
    // (constraint bidireccional forecast_loan_details_principal_date_together) — nunca se intenta
    // guardar uno sin el otro.
    if (paymentType === 'prestamo') {
      if (loanOutstandingPrincipal.trim() && !loanPrincipalAsOfDate) {
        setError('Indica la fecha del capital pendiente.')
        return
      }
      if (!loanOutstandingPrincipal.trim() && loanPrincipalAsOfDate) {
        setError('Indica el capital pendiente, o borra su fecha.')
        return
      }
      if (loanInterestRatePercent.trim() && parseInterestPercentToBps(loanInterestRatePercent) == null) {
        setError('Pon un interés válido.')
        return
      }
    }
    // Fase 1D-g.3 — "No lo sé todavía" nunca se guarda tal cual: PEPA nunca afirma "para siempre" en
    // nombre del banco. La familia tiene que decidir explícitamente antes de poder crear la previsión.
    if (recurs && recursDurationChoice === 'unknown') {
      setError('Indica hasta cuándo se repite: "Para siempre" o "Hasta una fecha concreta".')
      return
    }
    if (amountStatus === 'estimated' && !amountBasis.trim()) {
      setError('Indica en qué se basa la estimación.')
      return
    }
    let amountValue: number | null = null
    if (amountStatus !== 'unknown') {
      const parsed = Number(amount)
      if (amount.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
        setError('Pon un importe válido.')
        return
      }
      amountValue = parsed
    }
    let installmentCountValue: number | null = null
    if (isFinitePlanMode) {
      const validated = validateInstallmentCount(paymentCount)
      if (!validated.ok) {
        setError(validated.message)
        return
      }
      installmentCountValue = validated.count
    }
    // Ajuste UX tras certificación móvil — CASO A (plan finito, "Número de pagos"): valida cada línea
    // del plan de pagos propuesto/editado, con los mismos mensajes humanos que el resto del formulario.
    let finitePlanSubmission: ReturnType<typeof buildFinitePlanSubmission> | null = null
    if (isFinitePlanMode && installmentCountValue != null) {
      for (const line of planLines) {
        if (!line.date) {
          setError('Indica la fecha de cada pago.')
          return
        }
        if (line.amountStatus === 'estimated' && !line.amountEstimatedBasis.trim()) {
          setError('Indica en qué se basa la estimación de cada pago.')
          return
        }
        if (line.amountStatus !== 'unknown') {
          const parsedLine = Number(line.amount)
          if (line.amount.trim() === '' || !Number.isFinite(parsedLine) || parsedLine < 0) {
            setError('Pon un importe válido en cada pago.')
            return
          }
        }
      }
      // Conocido: el reparto debe cuadrar EXACTO para poder guardar. Estimado: se guarda igual (avisado
      // en pantalla, nunca bloqueado — una estimación nunca es exacta). Pendiente: nada que comprobar.
      const check = distributionCheck(planLines)
      if (check && !check.matches && amountStatus === 'known') {
        setError(`El reparto no cuadra con el importe TOTAL: diferencia de ${centsToEurosString(Math.abs(check.differenceCents))} €.`)
        return
      }
      const { freq, interval } = resolvedFreqInterval(freqOption, customFreq, customInterval)
      finitePlanSubmission = buildFinitePlanSubmission(
        dueDate,
        freq,
        interval,
        planLines,
        amountStatus,
        amountStatus === 'unknown' ? null : Number(amount) || 0,
        amountStatus === 'estimated' ? amountBasis.trim() : null,
      )
    }
    // CASO B (obligación recurrente con varios cobros por ciclo) — validación de los cobros, solo si
    // "En varios pagos" + "vuelve a repetirse" están activos a la vez (las dos preguntas nunca conviven).
    let installmentsToSave: ReturnType<typeof buildInstallmentTemplatesFromForm> = []
    if (isSplitCycleMode) {
      const countValidation = validateSplitChargeCount(String(splitCharges.length))
      if (!countValidation.ok) {
        setError(countValidation.message)
        return
      }
      for (const charge of splitCharges) {
        if (!charge.date) {
          setError('Indica la fecha prevista de cada cobro.')
          return
        }
        if (charge.amountStatus === 'estimated' && !charge.amountEstimatedBasis.trim()) {
          setError('Indica en qué se basa la estimación de cada cobro.')
          return
        }
        if (charge.amountStatus !== 'unknown') {
          const parsedCharge = Number(charge.amount)
          if (charge.amount.trim() === '' || !Number.isFinite(parsedCharge) || parsedCharge < 0) {
            setError('Pon un importe válido en cada cobro.')
            return
          }
        }
      }
      const splitCheckResult = distributionCheck(splitCharges)
      if (splitCheckResult && !splitCheckResult.matches && amountStatus === 'known') {
        setError(`El reparto no cuadra con el importe TOTAL del ciclo: diferencia de ${centsToEurosString(Math.abs(splitCheckResult.differenceCents))} €.`)
        return
      }
      installmentsToSave = buildInstallmentTemplatesFromForm(dueDate, splitCharges)
    }
    const recurrenceRule = buildRecurrenceRuleFromFormState(
      { repeats: recurrenceRuleNeeded, freqOption, customFreq, customInterval, untilMode, untilDate },
      dueDate,
      installmentCountValue,
    )
    setSaving(true)
    try {
      const input: ForecastPaymentInput = {
        title: title.trim(),
        categoryId: categories.find((c) => c.name === categoryName)?.id ?? null,
        provider: null,
        notes: notes.trim() || null,
        amountStatus: finitePlanSubmission ? finitePlanSubmission.parentAmountStatus : amountStatus,
        amount: finitePlanSubmission ? finitePlanSubmission.parentAmount : amountValue,
        amountEstimatedBasis: finitePlanSubmission ? finitePlanSubmission.parentAmountEstimatedBasis : amountStatus === 'estimated' ? amountBasis.trim() : null,
        currency,
        dueDate,
        expectedPaymentDate: hasExpectedPaymentDate ? expectedPaymentDate || null : null,
        recurrenceRule,
        bankAccountId: bankAccountId || null,
        ownerMemberId: ownerMemberId || null,
        showInCalendar,
      }
      let id: string
      if (payment) {
        await updateForecastPayment(payment.id, { ...input, active: payment.active, calendarEventId: payment.calendarEventId })
        id = payment.id
      } else if (createdPaymentIdRef.current) {
        // Fase 1E.2 — ya se creó en un intento anterior de ESTE mismo formulario (p. ej. si el único
        // fallo fue al guardar los datos del préstamo, más abajo) — reintentar actualiza ese mismo pago,
        // nunca crea un segundo forecast_payment.
        id = createdPaymentIdRef.current
        await updateForecastPayment(id, { ...input, active: true, calendarEventId: null })
      } else {
        id = await createForecastPayment(input)
        createdPaymentIdRef.current = id
      }
      await replaceForecastReminders(id, reminders)
      // "un solo pago" o desactivar los cobros vuelve a dejar installmentsToSave=[] — sustituye la
      // plantilla entera (delete-then-insert, ver replaceForecastPaymentInstallments), sin hijos fantasma.
      await replaceForecastPaymentInstallments(id, installmentsToSave)
      // Igual criterio para el plan finito: sin plan finito activo, finitePlanSubmission es null y esto
      // sustituye los overrides de ciclo por una lista vacía — así cambiar de "Número de pagos" a
      // "Hasta que lo desactive" limpia el plan anterior en vez de dejarlo fantasma.
      await replaceForecastPlanOverrides(id, finitePlanSubmission ? finitePlanSubmission.overrides : [])

      // Fase 1E.2 — forecast_payment ya está guardado (arriba) antes de tocar forecast_loan_details: si
      // esto falla, el pago en sí NO se pierde ni se duplica — createdPaymentIdRef ya lo recuerda, así
      // que reintentar (pulsar Guardar otra vez) solo reintenta esta parte, nunca crea un pago repetido.
      if (paymentType === 'prestamo') {
        const loanInput: ForecastLoanDetailsInput = {
          loanType: loanType || null,
          bankReference: loanBankReference.trim() || null,
          contractReference: loanContractReference.trim() || null,
          originalPrincipalCents: loanOriginalPrincipal.trim() ? eurosStringToCents(loanOriginalPrincipal) : null,
          outstandingPrincipalCents: loanOutstandingPrincipal.trim() ? eurosStringToCents(loanOutstandingPrincipal) : null,
          principalAsOfDate: loanPrincipalAsOfDate || null,
          interestRateBps: loanInterestRatePercent.trim() ? parseInterestPercentToBps(loanInterestRatePercent) : null,
          interestType: loanInterestType || null,
          maturityDate: loanMaturityDate || null,
          remainingInstallments: loanRemainingInstallments.trim() ? Math.round(Number(loanRemainingInstallments)) : null,
          lastVerifiedAt: null,
          notes: loanNotes.trim() || null,
        }
        if (existingLoanDetails) await updateLoanDetails(existingLoanDetails.id, loanInput)
        else await createLoanDetails(id, loanInput)
      } else if (existingLoanDetails) {
        // Desclasificado y confirmado (ver handlePaymentTypeChange) — quitar SOLO la clasificación de
        // préstamo, el forecast_payment permanece intacto.
        await deleteLoanDetails(existingLoanDetails.id)
        setExistingLoanDetails(null)
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  // Ajuste UX tras certificación móvil — "Importe TOTAL" cuando el importe introducido reparte varias
  // líneas (plan finito o cobro fraccionado por ciclo); "Importe" a secas en cualquier otro caso.
  const amountFieldLabel = isFinitePlanMode || isSplitCycleMode ? 'Importe TOTAL' : 'Importe'
  const amountStatusFieldLabel = isFinitePlanMode || isSplitCycleMode ? 'Estado del importe TOTAL' : 'Estado del importe'
  const amountBasisFieldLabel = isFinitePlanMode || isSplitCycleMode ? '¿En qué se basa el TOTAL?' : '¿En qué se basa?'

  // Vista previa de los cobros del Caso B (Fase 1D-d) — motor real, mismo criterio de siempre: solo
  // la renovación ACTUAL (un ciclo), nunca años futuros de golpe ("no hace falta llenar la pantalla").
  const splitChargesValid = isSplitCycleMode && splitCharges.length >= SPLIT_CHARGE_COUNT_MIN && splitCharges.every((c) => c.date)
  const splitInstallmentsPreview = splitChargesValid ? buildInstallmentTemplatesFromForm(dueDate, splitCharges) : []
  const splitPreviewOccurrences =
    isSplitCycleMode && splitInstallmentsPreview.length > 0 && dueDate
      ? expandForecastOccurrences(
          {
            id: 'preview-split',
            title: title || 'Pago',
            dueDate,
            expectedPaymentDate: null,
            recurrenceRule: null, // un único ciclo (el actual) — no hace falta expandir la recurrencia para ver SUS cargos
            amountStatus,
            amount: amountStatus === 'unknown' ? null : Number(amount) || 0,
            currency,
            categoryId: null,
            active: true,
          },
          [],
          dueDate,
          stepDays(dueDate, Math.max(...splitInstallmentsPreview.map((i) => i.offsetDays))),
          splitInstallmentsPreview.map((i) => ({ id: `preview-${i.sequenceIndex}`, forecastPaymentId: 'preview-split', ...i })),
        )
      : []
  const splitNextRenewal =
    isSplitCycleMode && splitPreviewOccurrences.length > 0
      ? occurrenceForCycle(dueDate, { ...resolvedFreqInterval(freqOption, customFreq, customInterval), until: null }, 1)
      : null

  return (
    <form onSubmit={handleSubmit} className="member-form">
      <label>
        Concepto
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>

      <label>
        {amountStatusFieldLabel}
        <select value={amountStatus} onChange={(e) => setAmountStatus(e.target.value as ForecastAmountStatus)}>
          {(Object.keys(AMOUNT_STATUS_LABELS) as ForecastAmountStatus[]).map((s) => (
            <option key={s} value={s}>
              {AMOUNT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {amountStatus !== 'unknown' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>
            {amountFieldLabel}
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label style={{ width: 90 }}>
            Divisa
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {FORECAST_CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {amountStatus === 'estimated' && (
        <label>
          {amountBasisFieldLabel}
          <input type="text" value={amountBasis} onChange={(e) => setAmountBasis(e.target.value)} placeholder="Por ejemplo: recibo del año pasado" required />
        </label>
      )}

      <label>
        Categoría
        <CategorySelect value={categoryName} onChange={setCategoryName} categories={categories} />
      </label>

      {/* Fase 1E.2 — "Tipo de pago": forecast_payments sigue siendo la única fuente de verdad de
          concepto/cuota/fechas/recurrencia/cuenta; esto solo decide si además existe un
          forecast_loan_details (1:1 opcional) — nunca se marca "Préstamo/hipoteca" sola, ni siquiera
          cuando la descripción bancaria lo sugiere con mucha fuerza. */}
      {!payment && prefill?.suggestedLoanBankReference && paymentType === 'normal' && (
        <p className="muted" style={{ fontSize: 12, margin: '0 0 4px' }}>
          💡 Parece una cuota de préstamo (referencia {prefill.suggestedLoanBankReference}) — si quieres guardar sus datos, marca
          "Préstamo / hipoteca" abajo.
        </p>
      )}
      <label>
        Tipo de pago
        <select value={paymentType} onChange={(e) => handlePaymentTypeChange(e.target.value as 'normal' | 'prestamo')}>
          <option value="normal">Pago normal</option>
          <option value="prestamo">Préstamo / hipoteca</option>
        </select>
      </label>

      {showDeclassifyConfirm && (
        <div className="card" style={{ padding: 12, margin: '4px 0 8px' }}>
          <p style={{ margin: '0 0 8px' }}>
            Este pago tiene información de préstamo guardada. Si lo cambias a pago normal, se eliminarán esos detalles. La previsión y
            sus movimientos no se eliminarán.
          </p>
          <div className="form-actions">
            <button
              type="button"
              onClick={() => {
                setPaymentType('normal')
                setShowDeclassifyConfirm(false)
              }}
            >
              Cambiar a pago normal
            </button>
            <button type="button" className="link-button" onClick={() => setShowDeclassifyConfirm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {paymentType === 'prestamo' && (
        <div className="card" style={{ padding: 12, margin: '4px 0 8px' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>🏦 Datos del préstamo</p>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            Todos estos datos son opcionales — puedes guardar solo "es un préstamo" y completarlos más adelante.
          </p>
          <label>
            Tipo
            <select value={loanType} onChange={(e) => setLoanType(e.target.value as ForecastLoanType | '')}>
              <option value="">Sin especificar</option>
              {(Object.keys(LOAN_TYPE_LABELS) as ForecastLoanType[]).map((t) => (
                <option key={t} value={t}>
                  {LOAN_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Referencia bancaria
            <input type="text" value={loanBankReference} onChange={(e) => setLoanBankReference(e.target.value)} placeholder="Identificador visto en los cargos del banco" />
          </label>
          <label>
            Referencia contractual
            <input type="text" value={loanContractReference} onChange={(e) => setLoanContractReference(e.target.value)} placeholder="Número de contrato real" />
          </label>
          <div className="inline-fields">
            <label style={{ flex: 1 }}>
              Capital inicial
              <input type="number" step="0.01" min="0" value={loanOriginalPrincipal} onChange={(e) => setLoanOriginalPrincipal(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Capital pendiente
              <input type="number" step="0.01" min="0" value={loanOutstandingPrincipal} onChange={(e) => setLoanOutstandingPrincipal(e.target.value)} />
            </label>
          </div>
          {loanOutstandingPrincipal.trim() && (
            <label>
              Fecha del capital pendiente
              <input type="date" value={loanPrincipalAsOfDate} onChange={(e) => setLoanPrincipalAsOfDate(e.target.value)} required />
            </label>
          )}
          <div className="inline-fields">
            <label style={{ flex: 1 }}>
              Tipo de interés (%)
              <input type="text" inputMode="decimal" value={loanInterestRatePercent} onChange={(e) => setLoanInterestRatePercent(e.target.value)} placeholder="3,00" />
            </label>
            <label style={{ flex: 1 }}>
              Tipo
              <select value={loanInterestType} onChange={(e) => setLoanInterestType(e.target.value as ForecastLoanInterestType | '')}>
                <option value="">Sin especificar</option>
                {(Object.keys(LOAN_INTEREST_TYPE_LABELS) as ForecastLoanInterestType[]).map((t) => (
                  <option key={t} value={t}>
                    {LOAN_INTEREST_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Fecha de finalización
            <input type="date" value={loanMaturityDate} onChange={(e) => setLoanMaturityDate(e.target.value)} />
          </label>
          <label>
            Cuotas pendientes
            <input type="number" step="1" min="0" value={loanRemainingInstallments} onChange={(e) => setLoanRemainingInstallments(e.target.value)} />
          </label>
          <label>
            Notas del préstamo
            <input type="text" value={loanNotes} onChange={(e) => setLoanNotes(e.target.value)} />
          </label>
        </div>
      )}

      <label>
        Vencimiento
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
      </label>

      <label className="checkbox-label">
        <input type="checkbox" checked={hasExpectedPaymentDate} onChange={(e) => setHasExpectedPaymentDate(e.target.checked)} />
        ¿Esperas que se cobre otro día?
      </label>
      {hasExpectedPaymentDate && (
        <label>
          Fecha prevista de pago
          <input type="date" value={expectedPaymentDate} onChange={(e) => setExpectedPaymentDate(e.target.value)} required />
        </label>
      )}

      {/* Ajuste UX — "¿Cómo se paga?" es SIEMPRE visible, sin depender de "¿Vuelve a repetirse?": antes
          había que activar "¿Se repite?" para descubrir que un pago puntual (el IBI) se podía fraccionar
          en varios plazos, lo cual no es intuitivo. Ahora son dos preguntas independientes: CÓMO se paga
          esta obligación, y SI, cuando termine, vuelve a repetirse. */}
      <label>
        ¿Cómo se paga?
        <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as 'single' | 'multiple')}>
          <option value="single">Un solo pago</option>
          <option value="multiple">En varios pagos</option>
        </select>
      </label>

      {paymentMode === 'multiple' && (
        <>
          <label>
            Número de pagos
            <input
              type="number"
              min={SPLIT_CHARGE_COUNT_MIN}
              max={recurs ? SPLIT_CHARGE_COUNT_MAX : INSTALLMENT_COUNT_MAX}
              step="1"
              value={paymentCount}
              onChange={(e) => setPaymentCount(e.target.value)}
            />
          </label>
          <label>
            {recurs ? 'Frecuencia de renovación' : 'Frecuencia'}
            <select value={freqOption} onChange={(e) => setFreqOption(e.target.value as ForecastRecurrenceOption)}>
              {(Object.keys(RECURRENCE_OPTION_LABELS) as ForecastRecurrenceOption[])
                .filter((o) => o !== 'none')
                .map((o) => (
                  <option key={o} value={o}>
                    {RECURRENCE_OPTION_LABELS[o]}
                  </option>
                ))}
            </select>
          </label>
          {freqOption === 'custom' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ flex: 1 }}>
                Cada cuánto
                <select value={customFreq} onChange={(e) => setCustomFreq(e.target.value as ForecastCustomRecurrence['freq'])}>
                  <option value="DAILY">Diaria</option>
                  <option value="WEEKLY">Semanal</option>
                  <option value="MONTHLY">Mensual</option>
                  <option value="YEARLY">Anual</option>
                </select>
              </label>
              <label style={{ width: 90 }}>
                Cada
                <input type="number" min="1" step="1" value={customInterval} onChange={(e) => setCustomInterval(e.target.value)} />
              </label>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: -8 }}>
            El primer pago se calcula desde el Vencimiento indicado arriba.
          </p>

          {/* CASO A (plan finito): PEPA propone el reparto del importe TOTAL (proposeFinitePlanLines,
              motor real: occurrenceForCycle + reparto en céntimos) y cada línea es editable directamente. */}
          {isFinitePlanMode && planLines.length > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Plan de pagos — {planLines.length} pagos</p>
              {renderDistributionBanner(planCheck)}
              {planLines.map((line, i) => (
                <div key={i} className="card" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, marginTop: i === 0 ? 0 : 8 }}>
                  <strong style={{ fontSize: 13 }}>
                    Pago {i + 1} de {planLines.length}
                  </strong>
                  <label>
                    Fecha
                    <input type="date" value={line.date} onChange={(e) => updatePlanLine(i, { date: e.target.value })} required />
                  </label>
                  <label>
                    Estado del importe
                    <select value={line.amountStatus} onChange={(e) => updatePlanLine(i, { amountStatus: e.target.value as ForecastAmountStatus })}>
                      {(Object.keys(AMOUNT_STATUS_LABELS) as ForecastAmountStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {AMOUNT_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {line.amountStatus !== 'unknown' && (
                    <label>
                      Importe
                      <input type="number" step="0.01" min="0" value={line.amount} onChange={(e) => updatePlanLine(i, { amount: e.target.value })} required />
                    </label>
                  )}
                  {line.amountStatus === 'estimated' && (
                    <label>
                      ¿En qué se basa?
                      <input
                        type="text"
                        value={line.amountEstimatedBasis}
                        onChange={(e) => updatePlanLine(i, { amountEstimatedBasis: e.target.value })}
                        placeholder="Por ejemplo: recibo del año pasado"
                        required
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* CASO B (obligación que se repite, cargos por ciclo): mismo patrón, PEPA reparte el TOTAL del
              ciclo (proposeSplitCharges) y cada línea es editable directamente. */}
          {isSplitCycleMode && splitCharges.length > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Cobros de cada renovación</p>
              {renderDistributionBanner(splitCheck)}
              {splitCharges.map((charge, i) => (
                <div key={i} className="card" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, marginTop: i === 0 ? 0 : 8 }}>
                  <strong style={{ fontSize: 13 }}>
                    Cobro {i + 1} de {splitCharges.length}
                  </strong>
                  <label>
                    Fecha prevista
                    <input type="date" value={charge.date} onChange={(e) => updateSplitCharge(i, { date: e.target.value })} required />
                  </label>
                  <label>
                    Estado del importe
                    <select value={charge.amountStatus} onChange={(e) => updateSplitCharge(i, { amountStatus: e.target.value as ForecastAmountStatus })}>
                      {(Object.keys(AMOUNT_STATUS_LABELS) as ForecastAmountStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {AMOUNT_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {charge.amountStatus !== 'unknown' && (
                    <label>
                      Importe
                      <input type="number" step="0.01" min="0" value={charge.amount} onChange={(e) => updateSplitCharge(i, { amount: e.target.value })} required />
                    </label>
                  )}
                  {charge.amountStatus === 'estimated' && (
                    <label>
                      ¿En qué se basa?
                      <input
                        type="text"
                        value={charge.amountEstimatedBasis}
                        onChange={(e) => updateSplitCharge(i, { amountEstimatedBasis: e.target.value })}
                        placeholder="Por ejemplo: recibo del año pasado"
                        required
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          {isSplitCycleMode && splitPreviewOccurrences.length > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Próximos cobros</p>
              {splitPreviewOccurrences.map((o) => (
                <p key={o.installmentSequenceIndex} className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                  {o.installmentSequenceIndex}/{splitPreviewOccurrences.length} —{' '}
                  {o.amountStatus === 'unknown' ? 'Importe pendiente' : `${o.amountStatus === 'estimated' ? '≈ ' : ''}${formatForecastAmount(o.amount ?? 0, o.currency)}`} —{' '}
                  {formatSpanishDate(o.dueDate)}
                </p>
              ))}
              {splitNextRenewal && (
                <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
                  Próxima renovación: {formatSpanishDate(splitNextRenewal)}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Ajuste UX — pregunta SEPARADA de "¿Cómo se paga?": se refiere a la OBLIGACIÓN completa, nunca a
          los pagos/cuotas individuales de arriba. Un plan finito (IBI en 6 pagos) responde que NO — con
          el sexto pago termina. Un seguro que se renueva cada año responde que SÍ. */}
      <label className="checkbox-label">
        <input type="checkbox" checked={recurs} onChange={(e) => setRecurs(e.target.checked)} />
        ¿Este pago volverá a repetirse cuando termine?
      </label>

      {paymentMode === 'single' && recurs && (
        <>
          <label>
            Frecuencia
            <select value={freqOption} onChange={(e) => setFreqOption(e.target.value as ForecastRecurrenceOption)}>
              {(Object.keys(RECURRENCE_OPTION_LABELS) as ForecastRecurrenceOption[])
                .filter((o) => o !== 'none')
                .map((o) => (
                  <option key={o} value={o}>
                    {RECURRENCE_OPTION_LABELS[o]}
                  </option>
                ))}
            </select>
          </label>
          {freqOption === 'custom' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ flex: 1 }}>
                Cada cuánto
                <select value={customFreq} onChange={(e) => setCustomFreq(e.target.value as ForecastCustomRecurrence['freq'])}>
                  <option value="DAILY">Diaria</option>
                  <option value="WEEKLY">Semanal</option>
                  <option value="MONTHLY">Mensual</option>
                  <option value="YEARLY">Anual</option>
                </select>
              </label>
              <label style={{ width: 90 }}>
                Cada
                <input type="number" min="1" step="1" value={customInterval} onChange={(e) => setCustomInterval(e.target.value)} />
              </label>
            </div>
          )}
        </>
      )}

      {/* Capacidad ya existente que se conserva (no se pregunta en el flujo principal): una obligación
          que se repite puede tener una fecha final concreta, en vez de repetirse para siempre — necesario
          para poder reconstruir/editar sin corromper un pago antiguo guardado así.
          Fase 1D-g.3 — "No lo sé todavía" solo aparece como opción mientras es el valor activo (precarga
          bancaria sin decidir todavía): en cuanto la familia elige Para siempre/Hasta una fecha, desaparece
          de la lista — nunca un valor real al que se pueda volver a mano. */}
      {recurs && (
        <>
          <label>
            ¿Hasta cuándo se repite?
            <select value={recursDurationChoice} onChange={(e) => setRecursDurationChoice(e.target.value as 'forever' | 'date' | 'unknown')}>
              {recursDurationChoice === 'unknown' && <option value="unknown">No lo sé todavía</option>}
              <option value="forever">Para siempre</option>
              <option value="date">Hasta una fecha concreta</option>
            </select>
          </label>
          {recursDurationChoice === 'unknown' && (
            <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
              PEPA ha detectado la frecuencia a partir del banco, pero no sabe cuándo termina — elige "Para siempre" o
              "Hasta una fecha concreta" para poder guardar.
            </p>
          )}
          {recursDurationChoice === 'date' && (
            <label>
              Fecha final
              <input type="date" value={untilDate} onChange={(e) => setUntilDate(e.target.value)} />
            </label>
          )}
        </>
      )}

      <div>
        <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Avísame antes</p>
        {REMINDER_QUICK_OPTIONS.map((r) => (
          <label key={`${r.value}-${r.unit}`} className="checkbox-label">
            <input type="checkbox" checked={hasReminder(r.value, r.unit)} onChange={() => toggleQuickReminder(r.value, r.unit)} />
            {r.label}
          </label>
        ))}
        {reminders
          .filter((r) => !REMINDER_QUICK_OPTIONS.some((q) => q.value === r.value && q.unit === r.unit))
          .map((r) => (
            <p key={`${r.value}-${r.unit}`} className="muted" style={{ margin: '4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              ✓ {r.value} {REMINDER_UNIT_LABELS[r.unit]} antes
              <button type="button" className="link-button" onClick={() => removeReminder(r.value, r.unit)}>
                quitar
              </button>
            </p>
          ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 6 }}>
          <label style={{ width: 70 }}>
            Personalizado
            <input type="number" min="1" step="1" value={customReminderValue} onChange={(e) => setCustomReminderValue(e.target.value)} />
          </label>
          <select value={customReminderUnit} onChange={(e) => setCustomReminderUnit(e.target.value as ForecastReminderUnit)}>
            {(Object.keys(REMINDER_UNIT_LABELS) as ForecastReminderUnit[]).map((u) => (
              <option key={u} value={u}>
                {REMINDER_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
          <button type="button" className="link-button" onClick={addCustomReminder}>
            + Añadir
          </button>
        </div>
      </div>

      <label className="checkbox-label">
        <input type="checkbox" checked={showInCalendar} onChange={(e) => setShowInCalendar(e.target.checked)} />
        Mostrar en Calendario
      </label>
      <p className="muted" style={{ fontSize: 12, marginTop: -8 }}>
        PEPA mostrará el próximo vencimiento en el calendario familiar.
      </p>

      {accounts.length > 0 && (
        <label>
          Cuenta prevista (opcional)
          <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {(a.ownerMemberId ? members.find((m) => m.id === a.ownerMemberId)?.name : null) ?? 'Común'} ({a.iban ? `•• ${a.iban.slice(-4)}` : a.name ?? 'Cuenta'})
              </option>
            ))}
          </select>
        </label>
      )}

      {members.length > 0 && (
        <label>
          Relacionado con (opcional)
          <select value={ownerMemberId} onChange={(e) => setOwnerMemberId(e.target.value)}>
            <option value="">Toda la familia</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        Notas (opcional)
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : payment ? 'Guardar cambios' : 'Crear pago previsto'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Educación financiera infantil (Skill 20)
// ---------------------------------------------------------------------

// Antes había un único saldo mezclando ingresos y gastos en una sola
// lista de "Movimientos" — a petición real de la usuaria, para
// educación financiera se separa en cuatro categorías con su propia
// pestaña cada una, para poder ver en cualquier momento cuánto tiene
// disponible, cuánto ha ahorrado, cuánto ha ingresado en total y
// cuánto ha gastado, todo por separado.
const WALLET_TABS: { key: WalletTransactionType; label: string; formLabel: string }[] = [
  { key: 'ingreso', label: 'Ingresos', formLabel: 'ingreso' },
  { key: 'ahorro', label: 'Ahorro', formLabel: 'ahorro' },
  { key: 'gasto', label: 'Gastos', formLabel: 'gasto' },
  { key: 'impuesto', label: 'Impuestos', formLabel: 'impuesto' },
]

// Petición real: extender el pastel a Educación financiera — sin una
// categoría real detrás (son solo 4 tipos fijos de hucha), un color
// por índice basta y así nunca cambia entre visitas.
const WALLET_TAB_COLORS = pastelPalette(WALLET_TABS.length)

function KidsFinanceTab() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('')
  const [walletTab, setWalletTab] = useState<WalletTransactionType>('ingreso')
  const [transactions, setTransactions] = useState<KidWalletTransaction[]>([])
  const [goals, setGoals] = useState<KidGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Petición real: "cada vez que edito un movimiento me devuelve al
  // inicio de la página" — ver mismo arreglo en la pestaña Banco.
  const hasLoadedOnceRef = useRef(false)

  function reload() {
    if (!hasLoadedOnceRef.current) setLoading(true)
    Promise.all([listFamilyMembers(), listWalletTransactions(), listGoals()])
      .then(([m, t, g]) => {
        const kids = m.filter((x) => x.memberType === 'child' || x.memberType === 'baby')
        setMembers(kids)
        if (kids.length > 0 && !activeMemberId) setActiveMemberId(kids[0].id)
        setTransactions(t)
        setGoals(g)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        hasLoadedOnceRef.current = true
        setLoading(false)
      })
  }

  useEffect(reload, []) // eslint-disable-line react-hooks/exhaustive-deps

  const balance = activeMemberId ? walletBalance(activeMemberId, transactions) : 0
  const memberGoals = goals.filter((g) => g.memberId === activeMemberId)
  const activeTabInfo = WALLET_TABS.find((t) => t.key === walletTab)!
  const categoryTotal = activeMemberId ? walletCategoryTotal(activeMemberId, walletTab, transactions) : 0
  const categoryTransactions = transactions.filter((t) => t.memberId === activeMemberId && t.type === walletTab)

  if (loading) return <p className="muted">Cargando…</p>
  if (members.length === 0) return <p className="muted">No hay niños/bebés en la familia todavía.</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="filter-row">
        {members.map((m) => (
          <button
            key={m.id}
            className={'chip' + (activeMemberId === m.id ? ' chip-active' : '')}
            style={{ borderColor: m.color }}
            onClick={() => setActiveMemberId(m.id)}
          >
            <MemberAvatar member={m} size={18} />
            {m.name}
          </button>
        ))}
      </div>

      <p className="points-badge">Disponible: {balance.toFixed(2)} €</p>
      <p className="muted">
        {WALLET_TABS.map((t) => `${t.label} ${walletCategoryTotal(activeMemberId, t.key, transactions).toFixed(2)} €`).join(' · ')}
      </p>

      <div className="filter-row">
        {WALLET_TABS.map((t, i) => (
          <button
            key={t.key}
            className={'chip' + (walletTab === t.key ? ' chip-active' : '')}
            style={{ background: WALLET_TAB_COLORS[i] }}
            onClick={() => setWalletTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <h2 className="section-title">
        {activeTabInfo.label}: {categoryTotal.toFixed(2)} €
      </h2>

      {walletTab === 'ahorro' && (
        <>
          <h3>Objetivos de ahorro</h3>
          <div className="event-list">
            {memberGoals.map((goal, i) => {
              const pct = Math.min(100, Math.round((categoryTotal / goal.targetAmount) * 100))
              return (
                <div key={goal.id} className="card task-card" style={{ background: pastelPalette(memberGoals.length)[i] }}>
                  <div className="task-card-main">
                    <strong>{goal.title}</strong>
                    <p className="muted">
                      {categoryTotal.toFixed(2)} € de {goal.targetAmount.toFixed(2)} € ({pct}%)
                    </p>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <ConfirmButton label="Eliminar" onConfirm={() => deleteGoal(goal.id).then(reload)} />
                </div>
              )
            })}
            {memberGoals.length === 0 && <p className="muted">Sin objetivos todavía.</p>}
          </div>
          <AddGoalForm memberId={activeMemberId} onAdded={reload} />
        </>
      )}

      <div className="event-list">
        {categoryTransactions.map((t) => (
          <div key={t.id} className="card task-card">
            <div className="task-card-main">
              <strong>
                {t.amount.toFixed(2)} € — {t.description}
              </strong>
            </div>
            <ConfirmButton label="Eliminar" onConfirm={() => deleteWalletTransaction(t.id).then(reload)} />
          </div>
        ))}
        {categoryTransactions.length === 0 && <p className="muted">Sin movimientos todavía.</p>}
      </div>
      <AddTransactionForm memberId={activeMemberId} type={walletTab} formLabel={activeTabInfo.formLabel} onAdded={reload} />
    </div>
  )
}

function AddGoalForm({ memberId, onAdded }: { memberId: string; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createGoal({ memberId, title, targetAmount: Number(targetAmount) })
      setTitle('')
      setTargetAmount('')
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo objetivo</h2>
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Un juguete" required />
      </label>
      <label>
        Coste (€)
        <input type="number" step="0.01" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear objetivo'}
      </button>
    </form>
  )
}

// El tipo ya no se elige en un desplegable — lo decide la pestaña en la
// que estés (Ingresos/Ahorro/Gastos/Impuestos), así no hay que elegirlo
// dos veces ni se puede registrar un ingreso sin querer en la pestaña
// de gastos.
function AddTransactionForm({
  memberId,
  type,
  formLabel,
  onAdded,
}: {
  memberId: string
  type: WalletTransactionType
  formLabel: string
  onAdded: () => void
}) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addWalletTransaction({ memberId, type, amount: Number(amount), description })
      setAmount('')
      setDescription('')
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo registrar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo {formLabel}</h2>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <label>
        Descripción
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Registrar'}
      </button>
    </form>
  )
}
