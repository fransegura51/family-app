// Panel de administración del programa editorial: textos, lectores de las respuestas del servidor, fechas de Madrid y diferencias (pura lógica, sin pantalla).
import { describe, expect, it } from 'vitest'
import {
  EDITORIAL_KINDS,
  buildProgram,
  canRevise,
  dayShort,
  decideResultText,
  diffMenu,
  diffOptions,
  diffRecipes,
  diffWords,
  formatMadridAt,
  formatMadridSlot,
  generateErrorText,
  generateResultText,
  itemStatusText,
  mondayOf,
  nextRunLines,
  parseScheduleInput,
  recipeChangesText,
  restoreResultText,
  reviseErrorText,
  runErrorText,
  runLine,
  scheduledApprovalText,
  shortcutsFor,
  slotLine,
  toEditorialItems,
  toEditorialStatus,
  toGenerateResult,
  toReviseProposal,
  toggleStateText,
  validateInstruction,
  weekRangeText,
} from '@/domain/communityEditorial'

describe('fechas de Madrid', () => {
  it('enseña el día y la hora en hora peninsular, con horario de verano e invierno', () => {
    // 4 nov 2026 08:00 Madrid (invierno, UTC+1) = 07:00 UTC; 5 ago 2026 08:00 Madrid (verano, UTC+2) = 06:00 UTC.
    expect(formatMadridSlot('2026-11-04T07:00:00Z')).toBe('miércoles 4 nov, 08:00')
    expect(formatMadridSlot('2026-08-05T06:00:00Z')).toBe('miércoles 5 ago, 08:00')
    expect(formatMadridAt('2026-11-03T09:00:00Z')).toBe('martes 3 de noviembre a las 10:00')
    expect(formatMadridAt(null)).toBe('sin fecha')
  })
  it('un día de calendario no se corre de día por la zona horaria', () => {
    expect(dayShort('2026-11-03')).toBe('martes 3 nov')
    expect(mondayOf('2026-11-08')).toBe('2026-11-02')
    expect(mondayOf('2026-11-02')).toBe('2026-11-02')
    expect(weekRangeText('2026-10-26')).toBe('Semana del 26 de octubre al 1 de noviembre')
    expect(weekRangeText('2026-11-02')).toBe('Semana del 2 al 8 de noviembre')
  })
  it('«Aprobado: se publicará el … a las 10:00»', () => {
    expect(scheduledApprovalText('2026-11-02T09:00:00Z')).toBe('Aprobado: se publicará el lunes 2 de noviembre a las 10:00 (hora de Madrid).')
  })
  it('reprogramar: hora de pared de Madrid, entre ahora y 60 días', () => {
    const now = new Date('2026-10-27T10:00:00Z')
    expect(parseScheduleInput('2026-11-03', '10:00', now)).toEqual({ ok: true, iso: '2026-11-03T09:00:00.000Z' })
    expect(parseScheduleInput('2026-10-20', '10:00', now)).toMatchObject({ ok: false })
    expect(parseScheduleInput('2027-03-01', '10:00', now)).toMatchObject({ ok: false })
    expect(parseScheduleInput('', '', now)).toMatchObject({ ok: false })
  })
})

describe('estado del programa', () => {
  const raw = {
    launched: true,
    cycle: { runAt: '2026-10-28T07:00:00Z', due: false, monday: '2026-10-26' },
    kinds: {
      articles: {
        enabled: true,
        weekStart: '2026-11-02',
        nextRun: '2026-11-04T07:00:00Z',
        dueNow: false,
        cycleDone: false,
        failedAttempts: 0,
        expected: 7,
        drafts: { proposed: 3, approved: 1, published: 0, inTargetWeek: 4 },
        lastRun: { id: 'r1', status: 'partial', startedAt: '2026-10-28T07:07:00Z', itemsCreated: 4, itemsExpected: 7, trigger: 'manual', error: 'AI_FAILED: x' },
      },
      poll: { enabled: false, weekStart: '2026-10-26', nextRun: '2026-10-28T07:00:00Z', dueNow: true, cycleDone: false, failedAttempts: 0, expected: 1, drafts: { proposed: 0, approved: 0, published: 0, inTargetWeek: 0 }, lastRun: null },
      menu: { enabled: false, weekStart: '2026-11-02', nextRun: '2026-11-04T07:00:00Z', dueNow: false, cycleDone: true, failedAttempts: 0, expected: 1, drafts: {}, lastRun: null },
    },
    menuAutopublish: false,
    ai: { enabled: true, dailyCap: 300, usedToday: 12 },
    errors: [{ id: 'e1', kind: 'menu', trigger: 'schedule', weekStart: '2026-11-02', status: 'error', startedAt: '2026-10-28T07:07:00Z', error: 'TIMEOUT: la ejecución no terminó.', itemsCreated: 0, itemsExpected: 1 }],
  }
  const s = toEditorialStatus(raw)
  it('lee los tres tipos de forma independiente (la encuesta es «poll», su interruptor «polls»)', () => {
    expect(EDITORIAL_KINDS.map((k) => [k.key, k.toggle])).toEqual([
      ['articles', 'articles'],
      ['poll', 'polls'],
      ['menu', 'menu'],
    ])
    expect(s.kinds.articles.enabled).toBe(true)
    expect(s.kinds.poll.enabled).toBe(false)
    expect(s.kinds.poll.dueNow).toBe(true)
    expect(s.kinds.menu.cycleDone).toBe(true)
    expect(s.kinds.articles.drafts.inTargetWeek).toBe(4)
    expect(s.menuAutopublish).toBe(false)
    expect(s.errors).toHaveLength(1)
  })
  it('un estado vacío no rompe nada y los tres nacen en pausa', () => {
    const e = toEditorialStatus(null)
    expect(EDITORIAL_KINDS.every((k) => e.kinds[k.key].enabled === false)).toBe(true)
    expect(e.ai.enabled).toBe(true)
  })
  it('próxima ejecución: aviso de «toca ahora» y de pausa', () => {
    expect(nextRunLines(s.kinds.poll).join(' ')).toContain('No se ejecutará mientras esté en pausa')
    expect(nextRunLines(s.kinds.poll).join(' ')).not.toContain('Toca ahora')
    expect(nextRunLines({ ...s.kinds.poll, enabled: true }).join(' ')).toContain('Toca ahora: se preparará en la próxima hora en punto y 7 minutos.')
    expect(nextRunLines(s.kinds.articles)[0]).toContain('miércoles 4 nov, 08:00')
    expect(nextRunLines(s.kinds.menu)[0]).toContain('ya está preparado')
  })
  it('última ejecución con su resultado y un motivo sin códigos técnicos', () => {
    const line = runLine(s.kinds.articles.lastRun!)
    expect(line).toContain('manual')
    expect(line).toContain('Parcial')
    expect(line).toContain('4 de 7 borradores')
    expect(line).toContain('La IA no ha podido preparar el contenido.')
    expect(line).not.toContain('AI_FAILED')
    expect(runErrorText('TIMEOUT: la ejecución no terminó.')).toBe('La ejecución no terminó a tiempo.')
    expect(runErrorText('OTRO: algo breve')).toBe('algo breve')
    expect(runErrorText(null)).toBe('')
  })
  it('texto del interruptor', () => {
    expect(toggleStateText(true)).toContain('Activa: Pepa preparará borradores cada miércoles')
    expect(toggleStateText(false)).toContain('En pausa: no se prepararán borradores nuevos; los que ya existen, y lo aprobado o programado, no cambian')
  })
})

describe('programa de la semana', () => {
  const items = toEditorialItems([
    { id: 'a1', kind: 'article', title: 'Truco 1', status: 'proposed', slotDate: '2026-11-02', topicLabel: 'Ahorro' },
    { id: 'a2', kind: 'article', title: 'Truco 2', status: 'approved', slotDate: '2026-11-03', publishAt: '2026-11-03T09:00:00Z' },
    { id: 'a3', kind: 'article', title: 'Truco 3', status: 'approved', slotDate: '2026-11-04', publishAt: '2026-11-04T09:00:00Z', publishError: 'fallo' },
    { id: 'p1', kind: 'poll', title: '¿Qué?', status: 'proposed', slotDate: '2026-11-07' },
    { id: 'm1', kind: 'menu', title: 'Menú', status: 'published', slotDate: '2026-11-02' },
    { id: 'old', kind: 'article', title: 'Viejo', status: 'published', slotDate: '2026-10-20' },
    { id: 'x', kind: 'article', title: 'Rechazado', status: 'rejected', slotDate: '2026-11-05' },
  ])
  it('agrupa por semana, con el artículo de cada día, la encuesta del sábado y el menú', () => {
    const weeks = buildProgram(items, '2026-10-26')
    expect(weeks.map((w) => w.monday)).toEqual(['2026-11-02'])
    const w = weeks[0]
    expect(w.days).toHaveLength(7)
    expect(w.days[0].articles.map((a) => a.id)).toEqual(['a1'])
    expect(w.days[5].polls.map((a) => a.id)).toEqual(['p1'])
    expect(w.menus.map((a) => a.id)).toEqual(['m1'])
    expect(w.days.flatMap((d) => d.articles).some((a) => a.id === 'x')).toBe(false)
    expect(buildProgram(items).map((x) => x.monday)).toEqual(['2026-10-19', '2026-11-02'])
  })
  it('estado de cada elemento', () => {
    expect(itemStatusText(items[0])).toBe('Borrador (pendiente de revisar)')
    expect(itemStatusText(items[1])).toBe('Aprobado · programado para el martes 3 de noviembre a las 10:00')
    expect(itemStatusText(items[2])).toBe('Error de publicación')
    expect(itemStatusText(items[4])).toBe('Publicado')
  })
  it('línea de hueco para la tarjeta de la propuesta', () => {
    expect(slotLine('2026-11-02', 1, 'article')).toBe('Para el lunes 2 nov · Tema nuevo (aún sin publicaciones)')
    expect(slotLine('2026-11-02', 2, 'article')).toContain('Idea de las familias')
    expect(slotLine('2026-11-07', null, 'poll')).toContain('sábado 7 nov')
    expect(slotLine(null, 1, 'article')).toBeNull()
  })
})

describe('«Generar ahora»', () => {
  it('todos los errores del servidor se traducen a español claro, sin textos técnicos', () => {
    for (const code of ['unauthorized', 'not_admin', 'busy', 'bad_request', 'ai_not_allowed', 'internal_error', 'network', 'timeout']) {
      const t = generateErrorText(code)
      expect(t.length, code).toBeGreaterThan(20)
      expect(t, code).not.toMatch(/[a-z]+_[a-z]+|undefined|\[object/)
    }
    expect(generateErrorText('algo_raro')).toBe(generateErrorText('internal_error'))
    expect(generateErrorText('busy')).toContain('en curso')
  })
  it('resultado: correcto, parcial, error y omitido; nunca dice que se haya publicado', () => {
    const ok = generateResultText(toGenerateResult({ ok: true, run_id: 'r', status: 'ok', created: 7, expected: 7, item_ids: ['a'], errors: [] }))
    expect(ok).toContain('7 de 7')
    expect(ok).toContain('No se ha publicado nada')
    const partial = generateResultText(toGenerateResult({ status: 'partial', created: 3, expected: 7, errors: ['x', 'y'] }))
    expect(partial).toContain('3 de 7')
    expect(partial).toContain('2 fallos')
    expect(generateResultText(toGenerateResult({ status: 'error', created: 0, expected: 7 }))).toContain('No se ha podido preparar')
    expect(generateResultText(toGenerateResult({ status: 'skipped', created: 0, expected: 0 }))).toContain('No había nada que preparar')
    expect(toGenerateResult({ run_id: 'r1' }).runId).toBe('r1')
  })
})

describe('rectificar con Pepa: textos y validación', () => {
  it('traduce cada error y conserva la idea de «tu instrucción sigue aquí»', () => {
    for (const code of ['unauthorized', 'not_admin', 'ai_not_allowed', 'ai_failed', 'invalid_output', 'rate_limit', 'not_available', 'bad_request']) {
      expect(reviseErrorText(code).length, code).toBeGreaterThan(20)
      expect(reviseErrorText(code), code).not.toMatch(/[a-z]+_[a-z]+/)
    }
    expect(reviseErrorText('ai_failed')).toContain('No se ha cambiado nada')
  })
  it('valida la instrucción (3 a 1000 letras) y ofrece atajos por tipo', () => {
    expect(validateInstruction('  ')).toMatch(/Escribe/)
    expect(validateInstruction('ab')).toMatch(/Escribe/)
    expect(validateInstruction('Haz la introducción más cercana')).toBeNull()
    expect(validateInstruction('x'.repeat(1001))).toMatch(/demasiado larga/)
    expect(shortcutsFor('article').map((s) => s.text)).toContain('Este artículo es demasiado básico; añade trucos que realmente ayuden.')
    expect(shortcutsFor('article').map((s) => s.text)).toContain('Incluye tres variantes de esta receta.')
    expect(shortcutsFor('poll').some((s) => /variantes/.test(s.text))).toBe(false)
  })
  it('aceptar nunca se presenta como publicar', () => {
    expect(decideResultText(true, 4)).toContain('versión 4')
    expect(decideResultText(true, 4)).toContain('No se ha publicado nada')
    expect(decideResultText(true, 4)).toContain('aprobarlo de nuevo')
    expect(decideResultText(false, null)).toContain('no ha cambiado')
    expect(restoreResultText(2, 5)).toContain('No se ha publicado nada')
    expect(restoreResultText(1, 3)).toContain('versión nueva 3')
  })
  it('solo se rectifican artículos, encuestas y menús sin publicar', () => {
    expect(canRevise({ kind: 'article', status: 'proposed' })).toBe(true)
    expect(canRevise({ kind: 'menu', status: 'approved' })).toBe(true)
    expect(canRevise({ kind: 'article', status: 'published' })).toBe(false)
    expect(canRevise({ kind: 'article', status: 'proposed', publishedPostId: 'p' })).toBe(false)
    expect(canRevise({ kind: 'tip', status: 'proposed' })).toBe(false)
    expect(canRevise({ kind: 'poll', status: 'rejected' })).toBe(false)
  })
  it('lee la propuesta del servidor', () => {
    const p = toReviseProposal({
      ok: true,
      revision_id: 'rv1',
      notes: 'Añadí 3 trucos',
      before: { title: 'A', body: 'x', payload: {} },
      result: { title: 'B', body: 'y', payload: { options: ['a'] } },
      quality: [{ code: 'Q', severity: 'warning', message: 'Cantidad rara', day: 0, meal: 'comida' }],
    })
    expect(p.revisionId).toBe('rv1')
    expect(p.result.payload.options).toEqual(['a'])
    expect(p.quality[0]).toMatchObject({ severity: 'warning', day: '0', meal: 'comida' })
  })
})

describe('diferencias por palabras', () => {
  const text = (segs: ReturnType<typeof diffWords>, t: 'add' | 'del' | 'same') => segs.filter((s) => s.type === t).map((s) => s.text.trim())
  it('resalta lo añadido y lo eliminado y conserva lo demás', () => {
    const d = diffWords('Pon el arroz en agua fría', 'Pon el arroz en agua caliente con sal')
    expect(text(d, 'del')).toEqual(['fría'])
    expect(text(d, 'add')).toEqual(['caliente con sal'])
    expect(d.map((s) => s.text).join('')).toContain('Pon el arroz en agua ')
  })
  it('textos iguales no tienen cambios; vacíos tampoco', () => {
    expect(diffWords('igual', 'igual').every((s) => s.type === 'same')).toBe(true)
    expect(diffWords('', '')).toEqual([])
    expect(diffWords('', 'nuevo')).toEqual([{ type: 'add', text: 'nuevo' }])
    expect(diffWords('viejo', '')).toEqual([{ type: 'del', text: 'viejo' }])
  })
  it('reconstruye los dos textos: lo igual + lo eliminado = antes; lo igual + lo añadido = después', () => {
    const a = 'Uno dos tres cuatro cinco\nseis siete'
    const b = 'Uno dos 3 cuatro cinco\nseis ocho siete nueve'
    const d = diffWords(a, b)
    const norm = (t: string) => t.replace(/s+/g, ' ').trim()
    expect(
      norm(
        d
          .filter((s) => s.type !== 'add')
          .map((s) => s.text)
          .join(''),
      ),
    ).toBe(norm(a))
    expect(
      d
        .filter((s) => s.type !== 'del')
        .map((s) => s.text)
        .join(''),
    ).toBe(b)
  })
  it('un texto enorme no bloquea (se compara por bloques)', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `p${i}`).join(' ')
    const other = Array.from({ length: 3000 }, (_, i) => `q${i}`).join(' ')
    const d = diffWords(big, other)
    expect(d.some((s) => s.type === 'del')).toBe(true)
    expect(d.some((s) => s.type === 'add')).toBe(true)
  })
})

describe('diferencias de recetas, opciones y menú', () => {
  it('recetas añadidas, cambiadas y eliminadas', () => {
    const before = {
      recipes: [
        { title: 'Tortilla', servings: 4, ingredients: [1, 2], steps: [1] },
        { title: 'Sopa', ingredients: [1], steps: [1] },
      ],
    }
    const after = {
      recipes: [
        { title: 'Tortilla', servings: 4, ingredients: [1, 2, 3], steps: [1] },
        { title: 'Ensalada', ingredients: [1], steps: [1, 2] },
      ],
    }
    const c = diffRecipes(before, after)
    expect(c.added.map((r) => r.title)).toEqual(['Ensalada'])
    expect(c.removed.map((r) => r.title)).toEqual(['Sopa'])
    expect(c.changed.map((r) => r.after.title)).toEqual(['Tortilla'])
    const lines = recipeChangesText(c).join(' ')
    expect(lines).toContain('Receta añadida: Ensalada')
    expect(lines).toContain('Receta eliminada: Sopa')
    expect(lines).toContain('ingredientes 2 → 3')
    expect(diffRecipes({}, {})).toEqual({ added: [], removed: [], changed: [] })
  })
  it('opciones de una encuesta', () => {
    expect(diffOptions({ options: ['Pasta', 'Arroz'] }, { options: ['Pasta', 'Legumbres', 'Pescado'] })).toEqual({ added: ['Legumbres', 'Pescado'], removed: ['Arroz'], kept: ['Pasta'] })
  })
  it('platos del menú que cambian, por día y comida, con su aviso de calidad', () => {
    const day = (name: string, comida: string, cena: string) => ({ day: name, meals: { comida: { title: comida }, cena: { title: cena } } })
    const before = { menu: { days: [day('lunes', 'Lentejas', 'Crema'), day('martes', 'Pollo', 'Tortilla')] } }
    const after = { menu: { days: [day('lunes', 'Lentejas', 'Crema'), day('martes', 'Merluza', 'Tortilla')] } }
    const changes = diffMenu(before, after, [{ code: 'Q', severity: 'warning', message: 'Pescado dos días seguidos', day: '1', meal: 'comida' }])
    expect(changes).toEqual([{ dayIndex: 1, day: 'martes', meal: 'comida', before: 'Pollo', after: 'Merluza', warnings: ['Pescado dos días seguidos'] }])
    expect(diffMenu(before, before)).toEqual([])
  })
})
