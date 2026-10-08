import { describe, expect, it } from 'vitest'

// Fase 3 (plan de pendientes) — el RSVP público YA tenía backend completo para necesidades alimentarias
// declaradas (migración 0205: validación en servidor, límite de peticiones, RLS) pero el formulario público
// nunca enviaba `declaredNeeds`, así que no había manera real de usarlo. Este archivo protege que el
// formulario de verdad lo cablea, reutilizando el mismo catálogo que ya usa la revisión de la familia
// (src/domain/eventDietaryNeeds.ts) en vez de inventar uno nuevo.
const SRC = (import.meta.glob('/src/ui/RsvpScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/RsvpScreen.tsx']
const RSVP_FN = (import.meta.glob('/supabase/functions/event-rsvp/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/supabase/functions/event-rsvp/index.ts']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const RSVP_FORM = slice(SRC, 'function RsvpForm(', '\nfunction OpenRsvpForm(')
const OPEN_FORM = SRC.slice(SRC.indexOf('function OpenRsvpForm('))
const NEEDS_FIELDSET = slice(RSVP_FORM, '¿Alguna necesidad alimentaria?', '</fieldset>')
const HANDLE_SUBMIT = slice(RSVP_FORM, 'async function handleSubmit(', '\n  return (')

describe('RsvpScreen — necesidades alimentarias declaradas, reutilizando el catálogo real (nunca uno propio)', () => {
  it('usa DIETARY_CATEGORIES/DIETARY_CATEGORY_KEYS/DIETARY_KIND_LABELS del dominio compartido con la revisión de la familia', () => {
    expect(SRC).toContain("import { DIETARY_CATEGORIES, DIETARY_CATEGORY_KEYS, DIETARY_KIND_LABELS } from '@/domain/eventDietaryNeeds'")
    expect(NEEDS_FIELDSET).toContain('DIETARY_CATEGORY_KEYS.map(')
    expect(NEEDS_FIELDSET).toContain('DIETARY_CATEGORIES[k].label')
    expect(NEEDS_FIELDSET).toContain('Object.entries(DIETARY_KIND_LABELS)')
  })

  it('el límite de filas en el formulario coincide con MAX_DECLARED_PER_SUBMIT de la función edge', () => {
    expect(SRC).toContain('const MAX_DECLARED_NEEDS_PER_SUBMIT = 5')
    expect(RSVP_FN).toContain('const MAX_DECLARED_PER_SUBMIT = 5')
    expect(NEEDS_FIELDSET).toContain('needs.length < MAX_DECLARED_NEEDS_PER_SUBMIT')
  })

  it('la sección solo se muestra con status === "confirmado" — igual criterio que preguntas/menú', () => {
    expect(RSVP_FORM).toMatch(/\{status === 'confirmado' && \(\s*<fieldset/)
  })

  it('declaredNeeds solo se añade al cuerpo dentro del bloque de status === "confirmado"', () => {
    expect(HANDLE_SUBMIT).toContain('const declaredNeedsBody = needs')
    expect(HANDLE_SUBMIT).toContain("if (declaredNeedsBody.length > 0) body.declaredNeeds = declaredNeedsBody")
    const confirmedStart = HANDLE_SUBMIT.indexOf("if (status === 'confirmado') {")
    const declaredStart = HANDLE_SUBMIT.indexOf('const declaredNeedsBody = needs')
    const declaredAssign = HANDLE_SUBMIT.indexOf('if (declaredNeedsBody.length > 0) body.declaredNeeds = declaredNeedsBody')
    expect(confirmedStart).toBeGreaterThan(-1)
    expect(declaredStart).toBeGreaterThan(confirmedStart)
    expect(declaredAssign).toBeGreaterThan(declaredStart)
  })

  it('una fila a medias (texto sin categoría) bloquea el envío con un aviso, igual que una pregunta obligatoria', () => {
    expect(RSVP_FORM).toContain('function hasIncompleteNeed(): boolean {')
    expect(RSVP_FORM).toContain("n.text.trim() !== '' && n.category === ''")
    expect(HANDLE_SUBMIT).toContain('if (hasIncompleteNeed()) {')
    expect(HANDLE_SUBMIT.indexOf('if (hasIncompleteNeed())')).toBeLessThan(HANDLE_SUBMIT.indexOf('setSaving(true)'))
    expect(HANDLE_SUBMIT.indexOf('if (missingRequiredQuestion())')).toBeLessThan(HANDLE_SUBMIT.indexOf('if (hasIncompleteNeed())'))
  })

  it('una fila totalmente vacía (sin texto) se ignora en silencio — solo cuentan las que tienen texto y categoría', () => {
    expect(RSVP_FORM).toContain("n.text.trim() !== '' && n.category !== ''")
  })

  it('el cuerpo enviado usa exactamente los campos que valida el servidor (text/category/kind/memberId), nunca cadenas vacías', () => {
    expect(RSVP_FORM).toContain('text: n.text.trim(), category: n.category, kind: n.kind || undefined, memberId: n.memberId || undefined')
    const prepareFn = RSVP_FN.slice(RSVP_FN.indexOf('async function prepareDeclaredNeeds('))
    expect(prepareFn).toContain('e.memberId !== undefined && e.memberId !== null && e.memberId !== ""')
    expect(prepareFn).toContain('e.kind !== undefined && e.kind !== null && e.kind !== ""')
  })

  it('"¿De quién?" solo aparece cuando la invitación tiene personas desglosadas (hasMembers)', () => {
    expect(NEEDS_FIELDSET).toMatch(/\{hasMembers && \(\s*<label[^>]*>\s*¿De quién\?/)
    expect(NEEDS_FIELDSET).toContain('<option value="">Para toda la invitación</option>')
  })

  it('quitar una fila nunca borra las demás (filtra por índice, no vacía el array entero)', () => {
    expect(RSVP_FORM).toContain('function removeNeed(index: number) {')
    expect(RSVP_FORM).toContain('setNeeds((prev) => prev.filter((_, i) => i !== index))')
  })

  it('OpenRsvpForm (enlace abierto) nunca menciona necesidades declaradas — el backend no las admite en ese flujo', () => {
    expect(OPEN_FORM).not.toContain('declaredNeeds')
    expect(OPEN_FORM).not.toContain('DIETARY_CATEGOR')
    expect(OPEN_FORM).not.toContain('hasIncompleteNeed')
  })

  it('guardia: el backend solo procesa declaredNeeds en el flujo con token (invitado conocido), nunca en el enlace abierto', () => {
    const openBlock = slice(RSVP_FN, 'if (openToken) {', '\n    const { data: guest }')
    expect(openBlock).not.toContain('declaredNeeds')
  })
})
