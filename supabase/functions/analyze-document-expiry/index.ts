import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { documentExpirySpec } from "../_shared/ai/purposes/documentExpiry.ts"

// Lee un documento (DNI, carnet de conducir, pasaporte, ITV, seguro, tarjeta sanitaria...) con Gemini para
// detectar sola su fecha de caducidad — petición real: "que Pepa detecte automáticamente la fecha de
// caducidad y la anote". FASE 7.1 (F7-001): toda la lógica común (sesión, interruptor/tope, cuenta adulta,
// proveedor y modelo, registro de uso) vive ahora en _shared/ai/gateway.ts; el prompt y el parseo (idénticos
// a los de siempre) en _shared/ai/purposes/documentExpiry.ts.
serveAiPurpose(documentExpirySpec)
