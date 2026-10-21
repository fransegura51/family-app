import { formatDate } from '@/domain/dateFormat'

// Edad en años cumplidos (o meses si aún no tiene 1 año) a partir de una fecha de calendario AAAA-MM-DD. Se trocea como texto: sin zonas horarias.
export function ageLabel(birthIso: string, todayIso: string): string | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthIso)
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayIso)
  if (!b || !t || birthIso > todayIso) return null
  const [by, bm, bd] = [Number(b[1]), Number(b[2]), Number(b[3])]
  const [ty, tm, td] = [Number(t[1]), Number(t[2]), Number(t[3])]
  let years = ty - by
  if (tm < bm || (tm === bm && td < bd)) years -= 1
  if (years >= 1) return years === 1 ? '1 año' : `${years} años`
  let months = (ty - by) * 12 + (tm - bm)
  if (td < bd) months -= 1
  if (months < 1) return 'recién nacido/a'
  return months === 1 ? '1 mes' : `${months} meses`
}

// «🎂 12/03/2018 (8 años)» para la ficha. Sin fecha → null (la ficha no enseña nada).
export function birthDateLine(birthIso: string | null | undefined, todayIso: string): string | null {
  if (!birthIso) return null
  const age = ageLabel(birthIso, todayIso)
  return `🎂 ${formatDate(birthIso)}${age ? ` (${age})` : ''}`
}
