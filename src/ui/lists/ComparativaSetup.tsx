import { MAX_COMPARE_COLUMNS, MIN_COMPARE_COLUMNS, type CompareMode } from '@/domain/lists'

// «¿Qué quieres comparar?» — se enseña al elegir el formato Comparativa (al crear una lista y al crear una lista nueva importando).
export interface CompareSetup {
  mode: CompareMode
  count: number
}
export const DEFAULT_COMPARE_SETUP: CompareSetup = { mode: 'proscontras', count: 3 }

export function ComparativaSetup({ value, onChange }: { value: CompareSetup; onChange: (v: CompareSetup) => void }) {
  const counts = Array.from({ length: MAX_COMPARE_COLUMNS - MIN_COMPARE_COLUMNS + 1 }, (_, n) => MIN_COMPARE_COLUMNS + n)
  return (
    <fieldset className="lists-compare-setup" data-help-id="listas.comparativa-modalidad">
      <legend>¿Qué quieres comparar?</legend>
      <div className="lists-kind-options" role="radiogroup" aria-label="¿Qué quieres comparar?">
        <button type="button" role="radio" aria-checked={value.mode === 'proscontras'} className={'lists-kind' + (value.mode === 'proscontras' ? ' lists-kind-active' : '')} onClick={() => onChange({ ...value, mode: 'proscontras' })}>
          <strong>Pros y contras</strong>
          <span className="muted">Dos columnas: «Pros» y «Contras».</span>
        </button>
        <button type="button" role="radio" aria-checked={value.mode === 'opciones'} className={'lists-kind' + (value.mode === 'opciones' ? ' lists-kind-active' : '')} onClick={() => onChange({ ...value, mode: 'opciones' })}>
          <strong>Varias opciones</strong>
          <span className="muted">Una columna por opción, con el nombre que quieras.</span>
        </button>
      </div>
      {value.mode === 'opciones' && (
        <div className="lists-compare-count">
          <span id="lists-compare-count-label">¿Cuántas opciones quieres comparar?</span>
          <div role="radiogroup" aria-labelledby="lists-compare-count-label" className="lists-move-options">
            {counts.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={value.count === n} className={'chip' + (value.count === n ? ' chip-active' : '')} onClick={() => onChange({ ...value, count: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  )
}
