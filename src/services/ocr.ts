// Lectura de texto en la foto del ticket con Tesseract.js — corre entero
// en el navegador (WebAssembly), sin mandar la foto a ningún servicio de
// pago. La calidad depende de lo nítida que salga la foto; por eso el
// resultado siempre se enseña para revisar antes de guardar, nunca se
// da por bueno a ciegas.
import { createWorker } from 'tesseract.js'

export async function recognizeReceiptText(file: File): Promise<string> {
  const worker = await createWorker('spa')
  try {
    const {
      data: { text },
    } = await worker.recognize(file)
    return text
  } finally {
    await worker.terminate()
  }
}
