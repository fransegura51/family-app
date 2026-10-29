import { useMemo } from 'react'
import { checkSummaryLines, menuEditorialCheck, type MenuEditorialCheck } from '@/domain/communityMenuEdit'
import { parseMenu } from '@/domain/communityMenu'
import { MenuPlanView } from '@/ui/community/menu/MenuPlanView'
import '@/ui/community/admin/menuEditor.css'

// «Vista previa del menú»: el menú tal como lo verá la familia en Comunidad. Reutiliza EL MISMO componente de presentación de la publicación (`MenuPlanView`,
// con su selector de días, comidas, raciones y fichas desplegables con ingredientes, pasos, tiempos, consejo y congelación) y el mismo `parseMenu`: no hay una
// segunda presentación que pueda diferir. Solo se desactivan las acciones de Cocina y Compras (aquí nada se importa ni se guarda en ninguna familia).
export function MenuPreview({ menu, title }: { menu: unknown; title?: string }) {
  const parsed = useMemo(() => parseMenu(menu), [menu])
  return (
    <section className="cadm-menupreview" aria-label="Vista previa del menú" data-help-id="comunidad.menu-editor-preview">
      <h4>Vista previa del menú</h4>
      {title && <p className="cadm-menupreview-title">{title}</p>}
      <p className="muted cadm-small">Así lo verá la familia en Comunidad. Despliega cada receta para ver sus ingredientes, la elaboración, los tiempos, el consejo y la congelación. Aquí no se importa nada a ninguna Cocina. Las fechas de cada día se asignan al programar el menú (semana siguiente a su sábado de publicación), por eso aquí puede aparecer como «menú de ejemplo».</p>
      {parsed ? (
        <MenuPlanView postId="preview" menu={parsed} canUseKitchen={false} />
      ) : (
        <p className="cadm-notice cadm-notice-error" role="alert">
          El menú no tiene un formato que se pueda mostrar.
        </p>
      )}
    </section>
  )
}

// Resumen discreto de comprobación editorial. Distingue lo que IMPIDE aprobar (datos obligatorios pendientes) de las recomendaciones, que nunca bloquean.
export function MenuCheckSummary({ menu, check }: { menu?: unknown; check?: MenuEditorialCheck }) {
  const c = useMemo(() => check ?? menuEditorialCheck(menu), [check, menu])
  return (
    <section className="cadm-menucheck" aria-label="Comprobación editorial del menú" data-help-id="comunidad.menu-editor-check">
      <h5>Comprobación editorial</h5>
      {checkSummaryLines(c).map((l) => (
        <p key={l} className="cadm-small">
          {l}
        </p>
      ))}
      {c.errors.length > 0 ? (
        <div className="cadm-notice cadm-notice-error" role="alert">
          <strong>Impide aprobar:</strong>
          <ul className="cadm-options">
            {c.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
            {c.incomplete.map((i, n) => (
              <li key={`${i.day}-${i.meal}-${i.recipe}-${n}`}>
                {i.day} · {i.meal} · {i.recipe}: {i.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="cadm-small cadm-menucheck-ok" role="status">
          Todos los datos obligatorios están completos: no hay nada que impida aprobar.
        </p>
      )}
      {c.recommendations.length > 0 && (
        <details className="cadm-menucheck-reco">
          <summary>
            Recomendaciones ({c.recommendations.length}) · no impiden aprobar
          </summary>
          <ul className="cadm-options">
            {c.recommendations.map((r, n) => (
              <li key={`${r.day}-${r.meal}-${r.recipe}-${n}`}>
                {r.day} · {r.meal} · {r.recipe}: {r.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
