// Los errores de Supabase (rpc/select/insert/update) llegan al navegador
// como objetos planos {code, details, hint, message}, NO como instancias
// de Error — comprobado en el bundle real que sirve Vite: `error
// instanceof Error` es false (en Node sí lo es, lo que despista). Con el
// patrón `err instanceof Error ? err.message : 'texto genérico'` toda
// la app tiraba el motivo real y enseñaba el genérico — bug real: un
// código de acceso incorrecto al crear familia salía como "Error al
// crear la familia", sin ninguna pista de qué estaba mal.
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback
  if (typeof err === 'string') return err || fallback
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return fallback
}
