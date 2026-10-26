import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { packagePhotoSpec } from "../_shared/ai/purposes/packagePhoto.ts"

// Lee de una a tres fotos de un envase los datos impresos que sirven para comparar precios (unidades, contenido de cada una, marca, código de barras) y los PROPONE;
// la persona los corrige antes de guardar. Toda la lógica común (sesión, interruptor/tope, cuenta adulta, proveedor y modelo, registro de uso) vive en
// _shared/ai/gateway.ts; el prompt y la validación estricta en _shared/ai/purposes/packagePhoto.ts. No guarda nada ni conserva las imágenes. SIN DESPLEGAR hasta autorización.
serveAiPurpose(packagePhotoSpec)
