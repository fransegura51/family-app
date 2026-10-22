import { createContext, useContext } from 'react'
import type { HelpApi } from '@/help/ui/HelpProvider'

// Contexto de la Ayuda en un archivo ligero (sin importar el proveedor ni nada de Supabase): así las pantallas que solo pintan un «?» o una respuesta no arrastran toda la capa
// de datos, y las pruebas aisladas de esas pantallas siguen funcionando sin variables de entorno.
export const HelpUiContext = createContext<HelpApi | null>(null)

export function useHelp(): HelpApi {
  const ctx = useContext(HelpUiContext)
  if (!ctx) throw new Error('useHelp debe usarse dentro de HelpProvider')
  return ctx
}

// Variante para pantallas que pueden pintarse sin proveedor (pruebas aisladas): devuelve null en vez de fallar.
export function useOptionalHelp(): HelpApi | null {
  return useContext(HelpUiContext)
}
