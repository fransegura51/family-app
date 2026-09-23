// Fase 3 — "necesita tu atención": patrón GENÉRICO, no propio de
// Eventos. Cualquier módulo de PEPA (Eventos hoy; Economía/Documentos
// en el futuro, según la auditoría) puede producir su propia lista de
// AttentionItem a partir de sus propios datos deterministas — quien
// los muestra (Inicio, un futuro badge de otro módulo) no necesita
// saber nada de Eventos en particular, solo de esta forma.
export interface AttentionItem {
  id: string
  icon: string
  title: string
  lines: string[]
  to: string
}
