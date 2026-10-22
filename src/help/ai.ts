// Búsqueda con IA de la Ayuda (B3, fase «IA y voz»): DESACTIVADA hasta que se despliegue su función de servidor (supabase/functions/help-search) y se autorice. La Ayuda funciona
// completa sin ella (búsqueda local). Cuando se active, la IA solo ELIGE entre fichas verificadas ya filtradas por permisos (nunca escribe el texto que ve la persona) y solo la
// usan cuentas adultas, cuando la búsqueda local no tiene un resultado claro.
export const HELP_AI_ENABLED = false

let override: boolean | null = null

export function isHelpAiEnabled(): boolean {
  return override ?? HELP_AI_ENABLED
}

// Solo para pruebas.
export function setHelpAiForTests(value: boolean | null): void {
  override = value
}
