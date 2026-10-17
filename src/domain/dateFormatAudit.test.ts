// Auditoría de fechas (17/10/2026): las fechas que ve la persona salen en DD/MM/AAAA por la función compartida, nunca en ISO.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '..')
function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) files(full, out)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(full)
  }
  return out
}
const ALL = files(SRC).map((f) => ({ f: path.relative(SRC, f).split(path.sep).join('/'), text: fs.readFileSync(f, 'utf8') }))
const read = (f: string) => ALL.find((x) => x.f === f)!.text

describe('formato de fechas en pantalla (DD/MM/AAAA)', () => {
  it('ninguna pantalla usa dateStyle ni toLocale…String(\'es-ES\') sin opciones (daban «16 oct 2026, 18:30» o «6/10/2026»)', () => {
    for (const { f, text } of ALL) {
      if (f === 'domain/dateFormat.ts') continue
      expect(text, f).not.toMatch(/dateStyle|timeStyle/)
      expect(text, f).not.toMatch(/toLocale(Date)?String\('es-ES'\)/)
    }
  })

  it('las fechas sueltas de un ticket, un gasto, una oferta, un pago o una lista de deseos pasan por formatDate', () => {
    expect(read('ui/FinanceScreen.tsx')).toContain('{formatDate(receipt.receiptDate)}')
    expect(read('ui/FinanceScreen.tsx')).toContain('{formatDate(e.expenseDate)}')
    expect(read('ui/FinanceScreen.tsx')).toContain('{formatDate(inc.expenseDate)}')
    expect(read('ui/EventosScreen.tsx')).toContain('Válida hasta: ${formatDate(o.validUntil)}')
    expect(read('ui/EventosScreen.tsx')).toContain("formatDate(e.paidAt, 'Sin fecha')")
    expect(read('ui/EventosScreen.tsx')).toContain('devuelta el ${formatDate(payment.bondReturnedAt)}')
    expect(read('ui/WishlistScreen.tsx')).toContain('formatDate(wishlist.celebrationDate)')
    expect(read('ui/WishlistGuestScreen.tsx')).toContain('formatDate(data.wishlist.celebrationDate)')
    expect(read('domain/events.ts')).toContain('${formatDate(event.eventDate)}${time}')
  })

  it('una sola implementación: los formateadores antiguos delegan en formatDate (y las marcas de tiempo usan la zona, no .slice(0, 10))', () => {
    expect(read('domain/forecastInstallmentPlanForm.ts')).toContain('return formatDate(isoDate)')
    expect(read('ui/DateField.tsx')).toContain('return formatDate(value)')
    expect(read('ui/SuggestionsScreen.tsx')).toContain('formatDateFromTimestamp(s.createdAt)')
    expect(read('ui/BankAccountsModal.tsx')).toContain('formatDateFromTimestamp(c.validUntil)')
  })
})
