// Selector de rango de fechas (Hoy/Esta semana/Este mes/Este año/Rango)
// compartido entre Tickets y Registro Alimentación (Compras) y
// Presupuesto Generales (Economía) — antes vivía solo en
// FinanceScreen.tsx, se separa aquí para poder usarlo desde los dos
// archivos sin duplicar la lógica.
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type SpendRangePreset = 'dia' | 'semana' | 'mes' | 'año' | 'rango'

export function rangeForPreset(preset: SpendRangePreset, customFrom: string, customTo: string): [string, string] {
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
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
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
  rango: 'Rango',
}
