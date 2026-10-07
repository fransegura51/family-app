import { describe, expect, it } from 'vitest'
import { suggestNextStepsForGroup, suggestNextStepsForTask } from '@/domain/eventNextSteps'

describe('suggestNextStepsForGroup — solo la relación real verificada hoy (Flores → Recoger las flores)', () => {
  it('kind "flores": propone "Recoger las flores"', () => {
    expect(suggestNextStepsForGroup({ kind: 'flores' })).toEqual([{ key: 'recoger_flores', title: 'Recoger las flores' }])
  })
  it('kind null (encargo creado a mano, sin identificador interno): nunca propone nada', () => {
    expect(suggestNextStepsForGroup({ kind: null })).toEqual([])
  })
  it('un kind desconocido/futuro sin relación registrada: nunca inventa una sugerencia', () => {
    expect(suggestNextStepsForGroup({ kind: 'tarta' })).toEqual([])
  })
})

describe('suggestNextStepsForTask — motor general, decoupled de Encargos, sin ninguna relación real a nivel de tarea individual hoy', () => {
  it('nunca propone nada hoy (ninguna relación real verificada) — pero el hook existe y es general', () => {
    expect(suggestNextStepsForTask({ id: 't1' })).toEqual([])
  })
})
