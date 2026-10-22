import { useMemo, useState } from 'react'
import { FEATURE_INVENTORY } from '@/admin/features/featureInventory'
import type { featureHelpCoverage } from '@/admin/features/featureHelp'
import { filterFeatures, modulesOf, NO_FILTERS, type FeatureFilters } from '@/admin/features/featureFilters'
import {
  FEATURE_STATE_LABEL,
  FEATURE_VERIFICATION_LABEL,
  HELP_COVERAGE_LABEL,
  type FeatureEntry,
  type FeatureState,
  type FeatureVerification,
  type HelpCoverage,
} from '@/admin/features/featureTypes'
import { AdminGroup } from '@/ui/admin/AdminGroups'
import { HELP_MODULE_BY_ID } from '@/help/catalog'
import { useFeatureRows } from '@/ui/admin/useFeatureRows'

// Área «Estado de funcionalidades»: inventario PRIVADO (solo administración) de qué hace PEPA hoy. El estado de la función y la cobertura de la Ayuda se muestran por separado
// a propósito: una Ayuda incompleta no significa que la función esté a medias. La cobertura de la Ayuda se calcula contra el texto real de la Ayuda.
// Fechas como en toda la app: día/mes/año.
const dmy = (iso: string) => iso.split('-').reverse().join('/')
const helpSectionLabel = (id: string) => HELP_MODULE_BY_ID.get(id as never)?.label ?? id

const STATE_ICON: Record<FeatureState, string> = { operativa: '🟢', parcial: '🟡', desactivada: '⚪' }
const COVERAGE_ICON: Record<HelpCoverage, string> = { completa: '✅', parcial: '◐', inexistente: '✕', pendiente: '❔' }

export function AreaFuncionalidades() {
  const rows = useFeatureRows()
  const [filters, setFilters] = useState<FeatureFilters>(NO_FILTERS)
  const [open, setOpen] = useState<string | null>(null)
  const coverage = useMemo(() => new Map(rows.map((r) => [r.entry.id, r.help])), [rows])
  const visible = filterFeatures(FEATURE_INVENTORY, filters, (e) => coverage.get(e.id)?.coverage ?? 'pendiente')
  const set = <K extends keyof FeatureFilters>(k: K, v: FeatureFilters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const active = filters.query || filters.module || filters.state || filters.help || filters.verification

  const count = (s: FeatureState) => FEATURE_INVENTORY.filter((e) => e.state === s).length

  return (
    <div className="admin-area">
      <p className="muted">
        Qué hace PEPA hoy, función por función, con el archivo que lo demuestra. Es una lista privada: las familias no la ven. «Estado» y «Ayuda» son cosas distintas: que la Ayuda esté
        incompleta no significa que la función esté a medias.
      </p>
      <p className="admin-counts" aria-label="Resumen de estados">
        <span>🟢 {count('operativa')} operativas</span> · <span>🟡 {count('parcial')} parciales</span> · <span>⚪ {count('desactivada')} desactivadas</span> ·{' '}
        <span>{FEATURE_INVENTORY.length} en total</span>
      </p>

      <div className="admin-filters">
        <label className="admin-filter admin-filter-wide">
          Buscar
          <input type="search" value={filters.query} placeholder="Nombre, módulo o lo que hace…" onChange={(e) => set('query', e.target.value)} />
        </label>
        <label className="admin-filter">
          Módulo
          <select value={filters.module} onChange={(e) => set('module', e.target.value)}>
            <option value="">Todos</option>
            {modulesOf(FEATURE_INVENTORY).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filter">
          Estado de la función
          <select value={filters.state} onChange={(e) => set('state', e.target.value as FeatureFilters['state'])}>
            <option value="">Todos</option>
            {(Object.keys(FEATURE_STATE_LABEL) as FeatureState[]).map((s) => (
              <option key={s} value={s}>
                {FEATURE_STATE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filter">
          Cobertura de la Ayuda
          <select value={filters.help} onChange={(e) => set('help', e.target.value as FeatureFilters['help'])}>
            <option value="">Todas</option>
            {(Object.keys(HELP_COVERAGE_LABEL) as HelpCoverage[]).map((s) => (
              <option key={s} value={s}>
                {HELP_COVERAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filter">
          Verificación
          <select value={filters.verification} onChange={(e) => set('verification', e.target.value as FeatureFilters['verification'])}>
            <option value="">Todas</option>
            {(Object.keys(FEATURE_VERIFICATION_LABEL) as FeatureVerification[]).map((s) => (
              <option key={s} value={s}>
                {FEATURE_VERIFICATION_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {active && (
          <button type="button" className="cadm-btn cadm-btn-ghost" onClick={() => setFilters(NO_FILTERS)}>
            Quitar filtros
          </button>
        )}
      </div>

      <p className="muted" role="status">
        {visible.length === FEATURE_INVENTORY.length ? `Mostrando las ${visible.length} funciones.` : `Mostrando ${visible.length} de ${FEATURE_INVENTORY.length} funciones.`}
      </p>
      {visible.length === 0 && <p className="cadm-empty muted">Ninguna función coincide con esa búsqueda y esos filtros.</p>}

      {/* Las funciones se agrupan por módulo en bloques plegables; con un filtro o una búsqueda activos, los módulos con resultados se enseñan abiertos. */}
      {modulesOf(visible).map((mod) => {
        const inMod = visible.filter((e) => e.module === mod)
        const attention = inMod.filter((e) => e.state !== 'operativa').length
        return (
          <AdminGroup
            key={mod}
            area="funcionalidades"
            id={`mod-${mod}`}
            title={mod}
            summary={`${inMod.length} ${inMod.length === 1 ? 'función' : 'funciones'}`}
            badge={attention > 0 ? `${attention} ${attention === 1 ? 'pide atención' : 'piden atención'}` : 'todo operativo'}
            forceOpen={Boolean(active)}
          >
            <ul className="admin-feature-list">
              {inMod.map((e) => (
                <FeatureCard key={e.id} entry={e} help={coverage.get(e.id)!} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
              ))}
            </ul>
          </AdminGroup>
        )
      })}
    </div>
  )
}

function FeatureCard({ entry: e, help, open, onToggle }: { entry: FeatureEntry; help: ReturnType<typeof featureHelpCoverage>; open: boolean; onToggle: () => void }) {
  const panelId = `feat-${e.id}`
  return (
    <li className={`card admin-feature admin-feature-${e.state}`}>
      <button type="button" className="admin-feature-head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="admin-feature-title">
          <span className="muted admin-feature-module">{e.module}</span>
          <strong>{e.name}</strong>
        </span>
        <span className="admin-feature-badges">
          <span className={`admin-pill admin-pill-${e.state}`}>
            {STATE_ICON[e.state]} {FEATURE_STATE_LABEL[e.state]}
          </span>
          <span className={`admin-pill admin-pill-help-${help.coverage}`} title="Cobertura de la Ayuda">
            {COVERAGE_ICON[help.coverage]} Ayuda: {HELP_COVERAGE_LABEL[help.coverage]}
          </span>
        </span>
      </button>
      {open && (
        <div id={panelId} className="admin-feature-body">
          <dl>
            <dt>Qué funciona</dt>
            <dd>{e.works}</dd>
            {e.missing && (
              <>
                <dt>Qué falta</dt>
                <dd>{e.missing}</dd>
              </>
            )}
            {e.limits && (
              <>
                <dt>Limitaciones y dependencias</dt>
                <dd>{e.limits}</dd>
              </>
            )}
            <dt>Verificación</dt>
            <dd>
              <strong>{FEATURE_VERIFICATION_LABEL[e.verification]}.</strong> {e.verificationNote} <span className="muted">(Revisada el {dmy(e.reviewed)}.)</span>
            </dd>
            <dt>Ayuda</dt>
            <dd>
              {help.coverage === 'pendiente' ? (
                <>Todavía no se ha revisado qué debería contar la Ayuda de esta función.</>
              ) : (
                <>
                  Módulo de la Ayuda: «{helpSectionLabel(e.help.module ?? '')}».
                  {help.found.length > 0 && <> Cuenta: {help.found.join(', ')}.</>}
                  {help.missing.length > 0 && <> No cuenta: {help.missing.join(', ')}.</>}
                </>
              )}
            </dd>
            <dt>Dónde está en el código</dt>
            <dd>
              {e.evidence.map((f) => (
                <code key={f} className="admin-evidence">
                  {f}
                </code>
              ))}
              {e.tests && e.tests.length > 0 && (
                <>
                  <br />
                  <span className="muted">Pruebas: </span>
                  {e.tests.map((f) => (
                    <code key={f} className="admin-evidence">
                      {f}
                    </code>
                  ))}
                </>
              )}
            </dd>
          </dl>
        </div>
      )}
    </li>
  )
}
