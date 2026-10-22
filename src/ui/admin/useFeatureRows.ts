import { useMemo } from 'react'
import { FEATURE_INVENTORY } from '@/admin/features/featureInventory'
import { featureHelpCoverage, type HelpSource } from '@/admin/features/featureHelp'
import { HELP_DETAILS, SUMMARIES } from '@/help/legacy/legacyHelp'

// Las funciones del inventario con su cobertura de Ayuda calculada contra el texto real de la Ayuda (sin consultas al servidor).
export const HELP_SOURCE: HelpSource = { summaries: SUMMARIES, details: HELP_DETAILS }

export function useFeatureRows() {
  return useMemo(() => FEATURE_INVENTORY.map((entry) => ({ entry, help: featureHelpCoverage(entry, HELP_SOURCE) })), [])
}
