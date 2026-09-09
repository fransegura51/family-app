// Selector de rango de fechas (Hoy/Esta semana/Este mes/Este año/Rango)
// compartido entre Tickets y Registro Alimentación (Compras) y
// Presupuesto Generales (Economía) — antes vivía solo en
// FinanceScreen.tsx, se separa aquí para poder usarlo desde los dos
// archivos sin duplicar la lógica.
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type SpendRangePreset = 'dia' | 'semana' | 'mes' | 'año' | 'rango'

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

export const PRESET_LABELS: Record<SpendRangePreset, string> = {
  dia: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  año: 'Este año',
  rango: 'Rango de fecha',
}
