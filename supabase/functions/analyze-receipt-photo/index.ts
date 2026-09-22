import { serveAiPurpose } from "../_shared/ai/gateway.ts"
import { receiptPhotoSpec } from "../_shared/ai/purposes/receiptPhoto.ts"

// Lee un ticket de compra con Gemini (nivel gratuito de Google AI Studio) en vez de OCR carácter-a-carácter
// (Tesseract se dejaba productos en tickets arrugados o con letra pequeña). FASE 7.1 (F7-001): toda la lógica
// común (sesión, interruptor/tope, cuenta adulta, proveedor y modelo, registro de uso) vive ahora en
// _shared/ai/gateway.ts; el prompt y el parseo (idénticos a los de siempre) en
// _shared/ai/purposes/receiptPhoto.ts — el mismo archivo que usa mercadona-ticket-webhook, para no repetir el
// prompt dos veces.
serveAiPurpose(receiptPhotoSpec)
