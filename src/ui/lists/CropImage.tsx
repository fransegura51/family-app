import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { DEFAULT_CROP, FULL_CROP, moveRect, outputSize, pixelRect, resizeRect, type Corner, type CropRect } from '@/ui/lists/cropMath'

// Pantalla opcional de recorte: la IA solo recibe la zona recuadrada. Zoom con los botones ± (y desplazamiento con el dedo sobre la
// imagen); el recuadro se mueve arrastrándolo y se cambia de tamaño con las cuatro esquinas.
export async function cropCanvasToBlob(source: HTMLCanvasElement, rect: CropRect, maxDim = 1600): Promise<Blob> {
  const { sx, sy, sw, sh } = pixelRect(rect, source.width, source.height)
  const { w, h } = outputSize(sw, sh, maxDim)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('No se pudo preparar la imagen')
  return blob
}

// Oscurece todo menos el recuadro (polígono con agujero): lo que queda a la vista es justo lo que se va a leer.
const shadeClip = (r: CropRect) => {
  const x1 = r.x * 100
  const y1 = r.y * 100
  const x2 = (r.x + r.w) * 100
  const y2 = (r.y + r.h) * 100
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x1}% ${y1}%, ${x1}% ${y2}%, ${x2}% ${y2}%, ${x2}% ${y1}%, ${x1}% ${y1}%)`
}

export function CropImage({ source, onConfirm, onCancel, busy }: { source: HTMLCanvasElement; onConfirm: (blob: Blob) => void; onCancel: () => void; busy: boolean }) {
  const [rect, setRect] = useState<CropRect>(DEFAULT_CROP)
  const [zoom, setZoom] = useState(1)
  const stageRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ kind: 'move' | Corner; x: number; y: number; start: CropRect } | null>(null)

  useEffect(() => {
    const v = viewRef.current
    if (!v) return
    v.width = source.width
    v.height = source.height
    v.getContext('2d')?.drawImage(source, 0, 0)
  }, [source])

  const begin = (kind: 'move' | Corner) => (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { kind, x: e.clientX, y: e.clientY, start: rect }
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    const stage = stageRef.current
    if (!d || !stage) return
    const b = stage.getBoundingClientRect()
    const dx = (e.clientX - d.x) / b.width
    const dy = (e.clientY - d.y) / b.height
    setRect(d.kind === 'move' ? moveRect(d.start, dx, dy) : resizeRect(d.start, d.kind, dx, dy))
  }
  const end = () => {
    drag.current = null
  }

  const confirm = async (r: CropRect) => {
    try {
      onConfirm(await cropCanvasToBlob(source, r))
    } catch {
      /* el aviso lo da quien llama si no llega la imagen */
    }
  }

  const corners: Corner[] = ['nw', 'ne', 'sw', 'se']
  return (
    <div className="lists-crop">
      <p className="muted">Mueve el recuadro y ajusta sus esquinas para que solo quede la lista. Con + y − acercas o alejas; arrastra la imagen para desplazarte.</p>
      <div className="lists-crop-view">
        <div ref={stageRef} className="lists-crop-stage" style={{ width: `${zoom * 100}%`, aspectRatio: `${source.width} / ${source.height}` }}>
          <canvas ref={viewRef} className="lists-crop-canvas" />
          <div className="lists-crop-shade" style={{ clipPath: shadeClip(rect) }} />
          <div
            className="lists-crop-rect"
            style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
            onPointerDown={begin('move')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            aria-label="Zona que se va a leer"
          >
            {corners.map((c) => (
              <span key={c} className={`lists-crop-handle lists-crop-${c}`} onPointerDown={begin(c)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
            ))}
          </div>
        </div>
      </div>
      <div className="lists-crop-bar">
        <button type="button" className="secondary-button" onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))} disabled={zoom <= 1} aria-label="Alejar">
          −
        </button>
        <button type="button" className="secondary-button" onClick={() => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(1)))} disabled={zoom >= 4} aria-label="Acercar">
          +
        </button>
        <span className="lists-tool-fill" />
        <button type="button" className="link-button" onClick={() => void confirm(FULL_CROP)} disabled={busy}>
          Usar toda la imagen
        </button>
        <button type="button" className="primary-button" onClick={() => void confirm(rect)} disabled={busy}>
          {busy ? 'Leyendo…' : 'Leer lo recuadrado'}
        </button>
        <button type="button" className="link-button" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
