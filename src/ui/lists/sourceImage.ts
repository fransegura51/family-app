// Prepara lo que la persona elige (foto, galería o PDF) como un lienzo que se puede recortar. pdf.js se carga solo al abrir un PDF.
const MAX_DIM = 2200

function fit(width: number, height: number): { w: number; h: number } {
  const scale = Math.min(1, MAX_DIM / Math.max(width, height))
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) }
}

export async function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  let width: number
  let height: number
  let draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  let release = () => {}
  try {
    const bmp = await createImageBitmap(file)
    width = bmp.width
    height = bmp.height
    draw = (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h)
    release = () => bmp.close()
  } catch {
    // Safari antiguo o un formato que createImageBitmap no abre: se prueba con una etiqueta <img>.
    const url = URL.createObjectURL(file)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('No se puede abrir esa imagen'))
      el.src = url
    })
    width = img.naturalWidth
    height = img.naturalHeight
    draw = (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h)
    release = () => URL.revokeObjectURL(url)
  }
  const { w, h } = fit(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  draw(ctx, w, h)
  release()
  return canvas
}

export interface PdfHandle {
  numPages: number
  render(page: number): Promise<HTMLCanvasElement>
  destroy(): void
}

export async function openPdf(file: File): Promise<PdfHandle> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default as string
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  return {
    numPages: doc.numPages,
    async render(pageNumber: number) {
      const page = await doc.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const { w } = fit(base.width * 2, base.height * 2)
      const viewport = page.getViewport({ scale: w / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No se pudo preparar la página')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      return canvas
    },
    destroy() {
      void doc.destroy()
    },
  }
}
