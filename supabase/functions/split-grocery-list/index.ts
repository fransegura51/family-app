import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { splitGroceryListSpec } from "../_shared/ai/purposes/splitGroceryList.ts"

// Separa una lista de la compra dictada de un tirón en productos sueltos.
// Toda la lógica común (sesión, control de uso, proveedor y modelo,
// validación) vive en _shared/ai; el propósito concreto (prompt y formato de
// respuesta) en _shared/ai/purposes/splitGroceryList.ts.
serveAiPurpose(splitGroceryListSpec)
