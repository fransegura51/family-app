export interface UpcomingBirthday {
  memberId: string
  birthDate: string
  nextDate: string // YYYY-MM-DD del próximo cumpleaños (este año o el que viene)
  daysUntil: number
  turningAge: number
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function nextBirthday(memberId: string, birthDate: string): UpcomingBirthday {
  const birth = new Date(birthDate + 'T00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
  if (next < today) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate())

  const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000)
  const turningAge = next.getFullYear() - birth.getFullYear()

  return { memberId, birthDate, nextDate: toDateStr(next), daysUntil, turningAge }
}

export function sortByDaysUntil(list: UpcomingBirthday[]): UpcomingBirthday[] {
  return [...list].sort((a, b) => a.daysUntil - b.daysUntil)
}
