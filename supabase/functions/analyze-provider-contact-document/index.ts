import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { providerContactDocumentSpec } from "../_shared/ai/purposes/providerContactDocument.ts"

// Lee una tarjeta de visita, captura de Google Maps o documento similar (foto o PDF) con Gemini para
// PROPONER los datos de contacto de un proveedor — Eventos → Proveedores y ofertas, "Importar datos con
// foto" (prompt maestro, Parte A6). Toda la lógica común (sesión, interruptor/tope, cuenta adulta,
// proveedor y modelo, registro de uso) vive en _shared/ai/gateway.ts; el prompt y el parseo en
// _shared/ai/purposes/providerContactDocument.ts. La IA nunca guarda nada: el cliente enseña la
// propuesta, la familia la revisa/corrige y solo al confirmar se guarda en el proveedor.
serveAiPurpose(providerContactDocumentSpec)
