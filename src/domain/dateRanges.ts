// Selector de rango de fechas (Hoy/Esta semana/Este mes/Este año/Rango)
// compartido entre Tickets y Registro Alimentación (Compras) y
// Presupuesto Generales (Economía) — antes vivía solo en
// FinanceScreen.tsx, se separa aquí para poder usarlo desde los dos
// archivos sin duplicar la lógica.
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 'mes_real' = mes de calendario normal (día 1 a fin de mes) SIEMPRE,
// aunque la familia tenga configurado un día de inicio de mes contable
// distinto — petición real: "una cosa filtra por mes físico y la otra
// por mes contable, confunde... añade una opción 'mes real' mientras
// que 'este mes' se cambia el nombre a 'mes contable'". Solo tiene
// sentido donde ya existe esa distinción (Presupuesto Generales); en
// el resto de sitios (Compras, Alimentación) 'mes' ya es mes real,
// porque nunca pasan un monthStartDay propio.
export type SpendRangePreset = 'dia' | 'semana' | 'mes' | 'mes_real' | 'año' | 'rango'

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

// monthStartDay = día del mes en el que empieza "este mes" para quien
// filtra (petición real: "para mí contablemente el mes empieza el
// último día de cada mes... quiero que se pueda definir una
// preferencia"). Por defecto 1 = mes de calendario normal, igual que
// antes (Compras/Alimentación siguen así, no llaman con este
// parámetro). 31 (o cualquier día que no exista en un mes corto) se
// recorta al último día real de ese mes — así "31" ya cubre el caso
// "el último día de cada mes" sin necesitar una opción aparte.
export function rangeForPreset(
  preset: SpendRangePreset,
  customFrom: string,
  customTo: string,
  monthStartDay = 1,
): [string, string] {
  if (preset === 'mes_real') return rangeForPreset('mes', customFrom, customTo, 1)
  const today = new Date()
  const todayStr = toDateStr(today)
  if (preset === 'dia') return [todayStr, todayStr]
  if (preset === 'semana') {
    // Lunes a domingo de esta semana.
    const dow = (today.getDay() + 6) % 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - dow)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return [toDateStr(monday), toDateStr(sunday)]
  }
  if (preset === 'mes') {
    let startYear = today.getFullYear()
    let startMonth = today.getMonth()
    const startDayThisMonth = Math.min(monthStartDay, daysInMonth(startYear, startMonth))
    if (today.getDate() < startDayThisMonth) {
      startMonth -= 1
      if (startMonth < 0) {
        startMonth = 11
        startYear -= 1
      }
    }
    const startDay = Math.min(monthStartDay, daysInMonth(startYear, startMonth))
    const first = new Date(startYear, startMonth, startDay)

    let endYear = startYear
    let endMonth = startMonth + 1
    if (endMonth > 11) {
      endMonth = 0
      endYear += 1
    }
    const endDay = Math.min(monthStartDay, daysInMonth(endYear, endMonth))
    const last = new Date(endYear, endMonth, endDay - 1)
    return [toDateStr(first), toDateStr(last)]
  }
  if (preset === 'año') {
    return [`${today.getFullYear()}-01-01`, `${today.getFullYear()}-12-31`]
  }
  return [customFrom || todayStr, customTo || todayStr]
}

// A qué mes "cuenta" una fecha de inicio de periodo — normalmente el
// suyo propio, PERO si esa fecha es el último día real de su mes (el
// caso del sentinel monthStartDay=31, "el mes contable empieza el
// último día del mes anterior"), cuenta como el mes SIGUIENTE. Petición
// real, tras confusión real: "si el mes contable empieza el 31 de
// agosto, el presupuesto debe ser de septiembre, no de agosto" — antes
// se etiquetaba por el mes en el que caía el día de inicio (agosto),
// aunso ese día fuera solo la antesala del mes que de verdad se está
// contando. Se usa tanto para navegar (accountingMonthRange) como para
// agrupar presupuestos ya guardados por su periodStart real, sea cual
// sea el monthStartDay configurado AHORA (que pudo cambiar desde que
// se guardaron).
export function accountingPeriodLabel(dateStr: string): { year: number; month0: number } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const month0 = m - 1
  if (d === daysInMonth(y, month0)) {
    let ny = y
    let nm = month0 + 1
    if (nm > 11) {
      nm = 0
      ny += 1
    }
    return { year: ny, month0: nm }
  }
  return { year: y, month0 }
}

// Un periodo contable concreto, `offset` meses desde el actual (0 =
// el que corre ahora mismo, -1 = el anterior, +1 = el siguiente) —
// misma regla del día de inicio que rangeForPreset('mes', ...).
// Petición real: "el mes contable se debería aplicar aquí igual que en
// el resto de Economía" — Presupuesto Generales navegaba por mes de
// calendario plano (1 a fin de mes) con su propio `visibleMonth`,
// ignorando el día de inicio configurado, a diferencia del resto de
// Economía (Resumen, Estadísticas) que ya lo respetaba.
export function accountingMonthRange(monthStartDay: number, offset = 0): { from: string; to: string; labelYear: number; labelMonth0: number } {
  const today = new Date()
  let startYear = today.getFullYear()
  let startMonth = today.getMonth()
  const startDayThisMonth = Math.min(monthStartDay, daysInMonth(startYear, startMonth))
  if (today.getDate() < startDayThisMonth) {
    startMonth -= 1
    if (startMonth < 0) {
      startMonth = 11
      startYear -= 1
    }
  }
  let y = startYear
  let m = startMonth + offset
  while (m < 0) {
    m += 12
    y -= 1
  }
  while (m > 11) {
    m -= 12
    y += 1
  }
  const startDay = Math.min(monthStartDay, daysInMonth(y, m))
  const first = new Date(y, m, startDay)
  let endY = y
  let endM = m + 1
  if (endM > 11) {
    endM = 0
    endY += 1
  }
  const endDay = Math.min(monthStartDay, daysInMonth(endY, endM))
  const last = new Date(endY, endM, endDay - 1)
  const label = accountingPeriodLabel(toDateStr(first))
  return { from: toDateStr(first), to: toDateStr(last), labelYear: label.year, labelMonth0: label.month0 }
}

// Los últimos `count` periodos contables (el actual incluido), del más
// antiguo al más reciente — construido sobre accountingMonthRange en
// vez de repetir su misma aritmética de meses. Petición real: "la
// evolución temporal debería ajustarse a la configuración del mes
// contable" (antes usaba siempre mes de calendario 1-31, sin importar
// lo que se hubiera puesto en Configuración).
export function accountingMonthsBack(
  count: number,
  monthStartDay = 1,
): { monthLabelYear: number; monthLabelMonth0: number; from: string; to: string }[] {
  const periods: { monthLabelYear: number; monthLabelMonth0: number; from: string; to: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const { from, to, labelYear, labelMonth0 } = accountingMonthRange(monthStartDay, -i)
    periods.push({ monthLabelYear: labelYear, monthLabelMonth0: labelMonth0, from, to })
  }
  return periods
}

export const PRESET_LABELS: Record<SpendRangePreset, string> = {
  dia: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  mes_real: 'Mes real',
  año: 'Este año',
  rango: 'Rango de fecha',
}
