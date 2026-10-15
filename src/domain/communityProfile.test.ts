// Lógica pura de perfiles, ajustes de Comunidad, medallas y novedades.
import { describe, expect, it } from 'vitest'
import type { MedalInfo, MedalsView, MyCommunityProfile } from '@/domain/community'
import {
  CONSTANCY_LEVELS,
  FOLLOW_MODES,
  MEDAL_FAMILIES,
  avatarText,
  banNotice,
  commentsLabel,
  constancyText,
  earnedMedals,
  followModeLabel,
  groupMedals,
  isOvernightWindow,
  medalProgressLabel,
  medalProgressPercent,
  medalStatusText,
  newsSummary,
  parseSuggestionHours,
  suggestionEveryLabel,
  validateRemovalRequest,
  validateWindow,
  windowSummary,
} from '@/domain/communityProfile'

function medal(over: Partial<MedalInfo>): MedalInfo {
  return { key: 'k', family: 'cocina', name: 'Medalla', description: 'Haz algo.', earned: false, awardedAt: null, progress: null, ...over }
}

describe('avatar', () => {
  it('usa el icono si existe', () => expect(avatarText('Rosa', '🍳')).toBe('🍳'))
  it('si no, las iniciales del alias (nunca nombres reales: solo hay alias)', () => {
    expect(avatarText('Cocinillas_Rosa', null)).toBe('CR')
    expect(avatarText('maria', null)).toBe('M')
    expect(avatarText('  ', null)).toBe('?')
    expect(avatarText(null, undefined)).toBe('?')
  })
})

describe('seguir personas', () => {
  it('tres modos de aviso y el inteligente es el primero (por defecto)', () => {
    expect(FOLLOW_MODES.map((m) => m.id)).toEqual(['smart', 'every', 'off'])
    expect(followModeLabel('every')).toBe('Cada publicación')
  })
})

describe('franja horaria de avisos personales (COM-144)', () => {
  it('«a cualquier hora» no necesita franja', () => expect(windowSummary('any', '08:00', '21:00')).toBe('A cualquier hora'))
  it('franja normal y franja que cruza la medianoche', () => {
    expect(windowSummary('window', '08:00', '21:00')).toBe('De 08:00 a 21:00')
    expect(isOvernightWindow('22:00', '07:00')).toBe(true)
    expect(isOvernightWindow('08:00', '21:00')).toBe(false)
    expect(windowSummary('window', '22:00', '07:00')).toBe('De 22:00 a 07:00 (del día siguiente)')
  })
  it('no se admite una franja vacía (inicio = fin) ni horas mal escritas', () => {
    expect(validateWindow('08:00', '08:00')).toMatch(/no pueden ser la misma/)
    expect(validateWindow('', '21:00')).not.toBeNull()
    expect(validateWindow('25:00', '21:00')).not.toBeNull()
    expect(validateWindow('08:00', '21:00')).toBeNull()
    expect(validateWindow('22:00', '07:00')).toBeNull()
  })
})

describe('sugerencias de Comunidad: cada N horas (6-720)', () => {
  it('acepta solo enteros dentro de los límites de la base de datos', () => {
    expect(parseSuggestionHours('48')).toBe(48)
    expect(parseSuggestionHours(' 6 ')).toBe(6)
    expect(parseSuggestionHours('720')).toBe(720)
    for (const bad of ['5', '721', '', 'abc', '12.5', '-8', '1e2']) expect(parseSuggestionHours(bad), bad).toBeNull()
  })
  it('etiquetas claras', () => {
    expect(suggestionEveryLabel(6)).toBe('cada 6 horas')
    expect(suggestionEveryLabel(24)).toBe('cada día')
    expect(suggestionEveryLabel(48)).toBe('cada 2 días')
    expect(suggestionEveryLabel(36)).toBe('cada 36 horas (unos 1,5 días)')
  })
})

describe('medallas', () => {
  it('tres familias en este orden', () => {
    expect(MEDAL_FAMILIES.map((f) => f.title)).toEqual(['Cocina y recetas', 'Participación', 'Ayuda a la comunidad'])
  })
  it('agrupa por familia y deja la familia vacía si no hay medallas', () => {
    const groups = groupMedals([medal({ key: 'a', family: 'ayuda' }), medal({ key: 'b', family: 'cocina' }), medal({ key: 'c', family: 'cocina' })])
    expect(groups.map((g) => g.medals.length)).toEqual([2, 0, 1])
  })
  it('el perfil enseña solo las ganadas', () => {
    const view: MedalsView = { medals: [medal({ key: 'a', earned: true }), medal({ key: 'b' })], constancy: null, suspended: false }
    expect(earnedMedals(view).map((m) => m.key)).toEqual(['a'])
    expect(earnedMedals(null)).toEqual([])
  })
  it('etiquetas de progreso: «3 de 5», nunca por encima del total', () => {
    expect(medalProgressLabel([3, 5])).toBe('3 de 5')
    expect(medalProgressLabel([9, 5])).toBe('5 de 5')
    expect(medalProgressLabel(null)).toBe('')
    expect(medalProgressLabel([0, 0])).toBe('')
  })
  it('porcentaje de la barra acotado entre 0 y 100', () => {
    expect(medalProgressPercent([1, 4])).toBe(25)
    expect(medalProgressPercent([20, 10])).toBe(100)
    expect(medalProgressPercent([-2, 10])).toBe(0)
    expect(medalProgressPercent(null)).toBe(0)
  })
  it('estado: conseguida con fecha, en progreso o por conseguir', () => {
    expect(medalStatusText(medal({ earned: true, awardedAt: '2026-05-03T10:00:00Z' }))).toMatch(/^Conseguida el .*2026/)
    expect(medalStatusText(medal({ earned: true }))).toBe('Conseguida')
    expect(medalStatusText(medal({ progress: [2, 10] }))).toBe('Llevas 2 de 10')
    expect(medalStatusText(medal({}))).toBe('Aún por conseguir')
  })
})

describe('nivel de constancia (COM-131)', () => {
  it('cuatro niveles con los nombres aprobados y 1 a 4 semanas', () => {
    expect(CONSTANCY_LEVELS.map((l) => l.name)).toEqual(['De vuelta por PEPA', 'Visitante habitual', 'Siempre por aquí', 'Colaborador habitual'])
    expect(CONSTANCY_LEVELS.map((l) => l.weeks)).toEqual([1, 2, 3, 4])
  })
  it('texto del nivel actual y del caso sin nivel', () => {
    expect(constancyText({ level: 3, name: 'Siempre por aquí', weeksActive: 3 })).toBe('Siempre por aquí · 3 semanas activas de las últimas 4')
    expect(constancyText({ level: 1, name: 'De vuelta por PEPA', weeksActive: 1 })).toContain('1 semana activa')
    expect(constancyText(null)).toMatch(/no tienes nivel/)
  })
})

describe('novedades', () => {
  it('singular y plural', () => {
    expect(commentsLabel(1)).toBe('1 comentario nuevo')
    expect(commentsLabel(18)).toBe('18 comentarios nuevos')
  })
  it('resumen agrupado como en el aviso: «18 comentarios nuevos en 3 conversaciones»', () => {
    const items = [5, 10, 3].map((count, i) => ({ postId: `p${i}`, title: `T${i}`, count, firstCommentId: `c${i}` }))
    expect(newsSummary(items)).toBe('18 comentarios nuevos en 3 conversaciones')
    expect(newsSummary(items.slice(0, 1))).toBe('5 comentarios nuevos en 1 conversación')
    expect(newsSummary([])).toBe('')
  })
})

describe('expulsión y readmisión', () => {
  const base: MyCommunityProfile = { hasProfile: true, banState: 'ok' }
  it('sin sanción no hay aviso', () => {
    expect(banNotice(null)).toBeNull()
    expect(banNotice(base)).toBeNull()
  })
  it('pausa con fecha: se puede leer y no se puede pedir readmisión todavía', () => {
    const n = banNotice({ ...base, banState: 'banned', banEndsAt: '2026-12-01T00:00:00Z' })
    expect(n?.canRequest).toBe(false)
    expect(n?.text).toContain('Puedes seguir leyendo')
    expect(n?.text).toContain('2026')
  })
  it('pasado el plazo se puede pedir; pedida queda pendiente; rechazada permite volver a pedir', () => {
    expect(banNotice({ ...base, banState: 'readmission', readmissionStatus: 'none' })?.canRequest).toBe(true)
    expect(banNotice({ ...base, banState: 'readmission', readmissionStatus: 'requested' })).toMatchObject({ tone: 'requested', canRequest: false })
    expect(banNotice({ ...base, banState: 'readmission', readmissionStatus: 'rejected' })).toMatchObject({ tone: 'rejected', canRequest: true })
  })
})

describe('solicitud de eliminación de contenido', () => {
  it('todo lo mío no necesita nada más', () => expect(validateRemovalRequest('all_my_content', null, '')).toBeNull())
  it('algo concreto exige elegir la publicación y explicar el motivo', () => {
    expect(validateRemovalRequest('specific', null, 'por favor')).toMatch(/Elige/)
    expect(validateRemovalRequest('specific', 'p1', 'ok')).toMatch(/pocas palabras/)
    expect(validateRemovalRequest('specific', 'p1', 'Contiene un dato mío')).toBeNull()
  })
  it('el detalle tiene tope', () => expect(validateRemovalRequest('all_my_content', null, 'x'.repeat(2001))).toMatch(/demasiado largo/))
})
