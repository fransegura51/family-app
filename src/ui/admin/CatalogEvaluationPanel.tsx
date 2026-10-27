import { useMemo, useState } from 'react'
import { listCommonProductsData } from '@/data/commonProducts'
import { listAllProductPrices, listProducts } from '@/data/products'
import { buildFamilyReport, measure, reportClassName, reportToMarkdown, sampleRows, type FamilyReport, type Judgement, type RowReview } from '@/domain/catalog/familyReport'
import { errorMessage } from '@/domain/errorMessage'
import { toCmpPrice, toCmpProduct } from '@/domain/priceComparisonAdapters'

// «Evaluación del catálogo de productos» (Centro de Administración → Sistema). Solo LEE: no escribe nada, no consulta el aprendizaje compartido ni usa las clases o los grupos ya
// guardados para responder. Sirve para la prueba limpia con una familia nueva (docs/EVALUACION_NORMALIZACION.md) y para medir con datos reales lo que hace el catálogo maestro.
const SAMPLE_SIZE = 40
type Filter = 'noIdentificados' | 'probables' | 'distintas'

const JUDGE_LABEL: Record<NonNullable<Judgement>, string> = { ok: 'Sí', bad: 'No' }

function JudgeButtons({ label, value, onChange }: { label: string; value: Judgement; onChange: (v: Judgement) => void }) {
  return (
    <span role="group" aria-label={label} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 10 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      {(['ok', 'bad'] as const).map((v) => (
        <button key={v} type="button" className={'chip' + (value === v ? ' chip-active' : '')} aria-pressed={value === v} onClick={() => onChange(value === v ? null : v)}>
          {JUDGE_LABEL[v]}
        </button>
      ))}
    </span>
  )
}

export function CatalogEvaluationPanel() {
  const [report, setReport] = useState<FamilyReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('noIdentificados')
  const [seed, setSeed] = useState(1)
  const [showSample, setShowSample] = useState(false)
  const [reviews, setReviews] = useState<Map<string, RowReview>>(new Map())
  const [copied, setCopied] = useState(false)

  async function calculate() {
    setLoading(true)
    setError(null)
    try {
      const [products, prices, commons] = await Promise.all([listProducts(), listAllProductPrices(), listCommonProductsData()])
      setReport(
        buildFamilyReport({
          products: products.map((p) => ({ ...toCmpProduct(p), category: p.category, classConfirmedAt: p.classConfirmedAt })),
          prices: prices.map(toCmpPrice),
          commons: commons.commons.map((c) => ({ ...c, status: c.status === 'pending' ? 'pending' : 'confirmed' })),
          members: commons.members,
        }),
      )
      setReviews(new Map())
    } catch (e) {
      setError(errorMessage(e, 'No se pudo calcular el informe'))
    } finally {
      setLoading(false)
    }
  }

  const sample = useMemo(() => (report ? sampleRows(report.rows, SAMPLE_SIZE, seed) : []), [report, seed])
  const measured = useMemo(() => measure(sample, reviews), [sample, reviews])

  function setJudgement(id: string, key: keyof RowReview, value: Judgement) {
    setReviews((prev) => {
      const next = new Map(prev)
      next.set(id, { product: null, klass: null, format: null, ...prev.get(id), [key]: value })
      return next
    })
  }

  const s = report?.summary
  const listed = !report
    ? []
    : report.rows.filter((r) => (filter === 'noIdentificados' ? !r.identity.entry || r.identity.confidence === 'dudoso' : filter === 'probables' ? r.identity.confidence === 'probable' && !!r.identity.entry : r.classChange === 'distinta')).slice(0, 80)

  async function copy() {
    if (!s) return
    try {
      await navigator.clipboard.writeText(reportToMarkdown(s, measured, sample.length))
      setCopied(true)
    } catch {
      setError('No se pudo copiar. Selecciona el texto del informe y cópialo a mano.')
    }
  }

  return (
    <div>
      <p className="muted">
        Mide, solo leyendo, qué entiende el catálogo maestro de los artículos de ESTA familia: producto, clase, formato y grupos. No usa el aprendizaje compartido ni las clases o grupos ya guardados, y no cambia ningún dato. Para la prueba limpia, entra con la familia
        sin historial y registra antes los mismos tickets.
      </p>
      <button type="button" className="primary-button" onClick={calculate} disabled={loading}>
        {loading ? 'Calculando…' : report ? 'Volver a calcular' : 'Calcular el informe'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {s && report && (
        <>
          <h4 className="section-title" style={{ marginTop: 12 }}>
            Medido sobre todos los artículos ({s.products}; {s.withPurchases} con compras)
          </h4>
          <ul className="muted" style={{ lineHeight: 1.5 }}>
            <li>
              Identificados con seguridad: <strong>{s.identification.seguro}</strong> · probables: <strong>{s.identification.probable}</strong> · solo la clase: <strong>{s.identification.soloClase}</strong> · no identificados: <strong>{s.identification.dudoso}</strong>
            </li>
            <li>Identidad completa (se pueden agrupar solos): <strong>{s.identification.completa}</strong></li>
            <li>
              Clase frente al clasificador anterior: igual {s.classes.igual} · nueva {s.classes.nueva} · distinta {s.classes.distinta} · solo la antigua {s.classes.solo_antigua} · ninguna {s.classes.ninguna}
            </li>
            <li>
              Formato leído del nombre: {s.format.reconocido} · al peso: {s.format.peso} · falta: {s.format.falta}
            </li>
            <li>
              Agrupaciones que PEPA propondría: <strong>{s.grouping.groups}</strong> con {s.grouping.articles} artículos ({s.grouping.multiStoreGroups} con varias tiendas) · comparaciones útiles ahora: <strong>{s.grouping.usefulComparisons}</strong> · artículos con compras sin agrupar:{' '}
              {s.grouping.notGrouped}
            </li>
            <li>
              Intervenciones de la persona ya hechas (no cuentan como automático): clase a mano {s.interventions.classByPerson} · grupo a mano {s.interventions.groupedByPerson}
            </li>
          </ul>

          <div className="filter-row" role="group" aria-label="Qué artículos ver">
            <button type="button" className={'chip' + (filter === 'noIdentificados' ? ' chip-active' : '')} onClick={() => setFilter('noIdentificados')}>
              No identificados ({s.identification.dudoso})
            </button>
            <button type="button" className={'chip' + (filter === 'probables' ? ' chip-active' : '')} onClick={() => setFilter('probables')}>
              Probables ({s.identification.probable})
            </button>
            <button type="button" className={'chip' + (filter === 'distintas' ? ' chip-active' : '')} onClick={() => setFilter('distintas')}>
              Clase distinta de antes ({s.classes.distinta})
            </button>
          </div>
          {listed.length === 0 ? (
            <p className="muted">Ninguno en esta lista.</p>
          ) : (
            <div className="event-list">
              {listed.map((r) => (
                <div key={r.id} className="card" style={{ padding: 8 }}>
                  <strong>{r.text}</strong>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    {r.identity.name ? `PEPA entiende: ${r.identity.name} · ${reportClassName(r.identity.classKey)}` : 'PEPA no lo identifica'}
                    {r.identity.reasons.length > 0 ? ` · ${r.identity.reasons.join('; ')}` : ''}
                    {filter === 'distintas' ? ` · antes: ${reportClassName(r.oldClassKey)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}

          <h4 className="section-title" style={{ marginTop: 12 }}>
            Revisar una muestra
          </h4>
          <p className="muted">
            Para saber cuántos aciertos hay de verdad hace falta que una persona lo compruebe. Se toman {sample.length} artículos al azar; di si PEPA acertó. Las cifras de aciertos salen solo de lo revisado.
          </p>
          <button type="button" className="link-button" onClick={() => setShowSample((v) => !v)} aria-expanded={showSample}>
            {showSample ? 'Ocultar la muestra' : `Ver la muestra (${sample.length})`}
          </button>{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setSeed((n) => n + 1)
              setReviews(new Map())
            }}
          >
            Otra muestra
          </button>
          {showSample && (
            <div className="event-list">
              {sample.map((r) => {
                const v = reviews.get(r.id)
                return (
                  <div key={r.id} className="card" style={{ padding: 8 }}>
                    <strong>{r.text}</strong>
                    <p className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                      {r.identity.name} · {reportClassName(r.identity.classKey)}
                      {r.format === 'reconocido' && r.identity.pack ? ` · formato ${r.identity.pack.count} × ${r.identity.pack.amount} ${r.identity.pack.unit}` : ''}
                    </p>
                    <JudgeButtons label="¿Producto?" value={v?.product ?? null} onChange={(x) => setJudgement(r.id, 'product', x)} />
                    <JudgeButtons label="¿Clase?" value={v?.klass ?? null} onChange={(x) => setJudgement(r.id, 'klass', x)} />
                    {r.format === 'reconocido' && <JudgeButtons label="¿Formato?" value={v?.format ?? null} onChange={(x) => setJudgement(r.id, 'format', x)} />}
                  </div>
                )
              })}
            </div>
          )}
          <p className="muted">
            {measured.reviewed === 0
              ? `Sin revisar todavía: no hay cifras de aciertos (no se estiman).`
              : `Revisados ${measured.reviewed} de ${sample.length}: producto correcto ${measured.product.ok} de ${measured.product.ok + measured.product.bad} · clase correcta ${measured.klass.ok} de ${measured.klass.ok + measured.klass.bad} · identificación completa ${measured.complete} · incorrectas ${measured.wrongProduct}.`}
          </p>
          <button type="button" className="link-button" onClick={copy}>
            {copied ? '✓ Informe copiado' : '📋 Copiar el informe'}
          </button>
        </>
      )}
    </div>
  )
}
