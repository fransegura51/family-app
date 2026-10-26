import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { listDocumentSpec } from "../_shared/ai/purposes/listDocument.ts"

// Lee una foto (o una página de PDF ya recortada en el móvil) de una lista escrita a mano o impresa y PROPONE los elementos
// para «Mis listas». Toda la lógica común (sesión, interruptor/tope, cuenta adulta, proveedor y modelo, registro de uso) vive en
// _shared/ai/gateway.ts; el prompt y el parseo en _shared/ai/purposes/listDocument.ts. La IA nunca guarda nada: el cliente
// enseña la propuesta editable y solo al confirmar se guarda.
serveAiPurpose(listDocumentSpec)
