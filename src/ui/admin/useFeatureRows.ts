import { useMemo } from 'react'
import { FEATURE_INVENTORY } from '@/admin/features/featureInventory'
import { featureHelpCoverage } from '@/admin/features/featureHelp'
import { moduleHelpText } from '@/help/catalog/moduleText'

// Las funciones del inventario con su cobertura de Ayuda calculada contra el texto real de la Ayuda (sin consultas al servidor).
export function useFeatureRows() {
  return useMemo(() => FEATURE_INVENTORY.map((entry) => ({ entry, help: featureHelpCoverage(entry, moduleHelpText) })), [])
}
