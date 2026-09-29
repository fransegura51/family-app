import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { forecastPaymentDocumentSpec } from "../_shared/ai/purposes/forecastPaymentDocument.ts"

// Lee un documento de financiación/préstamo/plan de cuotas (foto o PDF) con Gemini para proponer una
// Previsión de pagos — petición real: "no debería tener que introducir manualmente todas las cuotas si
// PEPA puede extraerlas del documento". Toda la lógica común (sesión, interruptor/tope, cuenta adulta,
// proveedor y modelo, registro de uso) vive en _shared/ai/gateway.ts; el prompt y el parseo en
// _shared/ai/purposes/forecastPaymentDocument.ts. La IA nunca guarda nada — el cliente construye una
// propuesta (ForecastPaymentPrefill) y abre el mismo formulario de Previsión de siempre para revisar/
// corregir/confirmar antes de guardar.
serveAiPurpose(forecastPaymentDocumentSpec)
