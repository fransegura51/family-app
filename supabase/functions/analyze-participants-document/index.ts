import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { participantsDocumentSpec } from "../_shared/ai/purposes/participantsDocument.ts"

// Lee una foto (o una página de PDF ya convertida en imagen en el móvil) de una lista de personas y PROPONE las filas (nombre, madre/padre, teléfono, correo) para
// «Gestión de grupos». Toda la lógica común (sesión, interruptor/tope, cuenta adulta, proveedor y modelo, registro de uso) vive en _shared/ai/gateway.ts; el prompt y el
// parseo en _shared/ai/purposes/participantsDocument.ts. La IA nunca guarda nada: el cliente enseña una vista previa editable y solo al confirmar se guardan las fichas.
serveAiPurpose(participantsDocumentSpec)
