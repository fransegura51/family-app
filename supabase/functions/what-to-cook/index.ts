import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { whatToCookSpec } from "../_shared/ai/purposes/whatToCook.ts"

// «¿Qué cocino hoy?»: ideas de platos (con su receta) a partir de los ingredientes que la persona tiene. Nunca guarda nada: la app enseña las ideas y solo con
// la decisión de la persona se guarda una receta. Toda la lógica común (sesión, adultos, interruptor, contadores, proveedor y modelo) vive en _shared/ai; el
// propósito concreto en _shared/ai/purposes/whatToCook.ts.
serveAiPurpose(whatToCookSpec)
