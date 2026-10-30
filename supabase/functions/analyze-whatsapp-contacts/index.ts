import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { whatsappContactsSpec } from "../_shared/ai/purposes/whatsappContacts.ts"

// Lee una captura de WhatsApp (lista de participantes de un grupo, información de un grupo…) y PROPONE los contactos (nombre de WhatsApp, teléfono, posible madre/padre y alumno)
// para «Gestión de grupos». Toda la lógica común (sesión, interruptor/tope, cuenta adulta, proveedor y modelo, registro de uso) vive en _shared/ai/gateway.ts; el prompt y el
// parseo en _shared/ai/purposes/whatsappContacts.ts. La IA nunca guarda nada: el cliente enseña una vista previa editable y solo al confirmar se crean contactos.
serveAiPurpose(whatsappContactsSpec)
