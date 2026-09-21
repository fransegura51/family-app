// Cuenta (solo NÚMEROS) cuántas respuestas de PEPA resuelve el código y cuántas necesitan IA, para medir
// el porcentaje resuelto sin IA. No se envía ni se guarda ninguna frase, respuesta ni dato de la
// conversación: solo el nombre de la función ("finance.spent") y si usó IA. Si falla, no pasa nada.
import { supabase } from '@/data/supabaseClient'

export function recordPepaAnswer(fn: string, usedAi: boolean): void {
  void supabase
    .rpc('pepa_record_answer', { p_function: fn, p_used_ai: usedAi })
    .then(
      () => undefined,
      () => undefined,
    )
}
