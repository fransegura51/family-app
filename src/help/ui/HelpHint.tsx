import { HELP_CONTEXTUAL_ENABLED } from '@/help/flags'
import type { HelpModuleId } from '@/help/types'
import { useOptionalHelp } from '@/help/ui/helpContext'
import '@/help/ui/help.css'

// Acceso discreto a la Ayuda contextual: un pequeño «?» junto a la cabecera de un módulo o a un formulario. Abre el panel de Pepa (sin cambiar de pantalla ni perder lo que la
// persona estuviera escribiendo), con la ficha concreta (`cardId`) o con la ayuda del módulo. Sin proveedor de Ayuda (pruebas aisladas) no pinta nada.
export function HelpHint({ cardId, moduleId, label }: { cardId?: string; moduleId?: HelpModuleId; label?: string }) {
  const help = useOptionalHelp()
  if (!help || !HELP_CONTEXTUAL_ENABLED) return null
  return (
    <button
      type="button"
      className="help-hint"
      aria-label={label ?? 'Ayuda sobre esta pantalla'}
      title={label ?? 'Ayuda sobre esta pantalla'}
      data-help-hint={cardId ?? moduleId ?? 'module'}
      onClick={() => help.openHelp({ cardId, moduleId: moduleId ?? help.currentModule ?? undefined })}
    >
      ?
    </button>
  )
}
