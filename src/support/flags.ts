// Interruptor de COMPILACIÓN del Soporte técnico de «Pepa te acompaña». Está APAGADO porque su base de datos (migración 0310, supabase/pending-migrations) está preparada y probada en
// local, pero pendiente de revisión y autorización antes de aplicarse en producción. Mientras sea false: no hay ningún botón, pestaña ni bloque de administración de Soporte, y
// ninguna parte de la web llama al servidor por esto. Para encenderlo: aplicar 0310 (moviéndola a supabase/migrations), comprobar políticas y pasar esta constante a true.
export const SUPPORT_ENABLED = false
