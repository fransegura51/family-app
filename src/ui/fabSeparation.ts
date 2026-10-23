// Separación de los botones redondos de arriba (avatares de Pepa y el de redes/compartir). Cada uno flota por su cuenta (position: fixed) y se puede arrastrar, y su posición se guarda
// por separado; si dos acaban en el mismo sitio (una posición guardada de antes, una pantalla estrecha, un giro del iPhone) se superponen y no se puede tocar uno de ellos (prueba real en
// iPhone, B3). Aquí se calcula, sin tocar lo guardado, un pequeño desplazamiento VISUAL para los que estorban: el primero (en orden de pantalla) se queda donde está.
export interface FabBox {
  left: number
  top: number
  size: number
}

export interface FabShift {
  dx: number
  dy: number
}

const GAP = 7

function overlaps(a: FabBox, dx: number, dy: number, b: FabBox, bdx: number, bdy: number): boolean {
  const s = Math.min(a.size, b.size) - 4 // un roce de unos píxeles no cuenta; una superposición real, sí
  return Math.abs(a.left + dx - (b.left + bdx)) < s && Math.abs(a.top + dy - (b.top + bdy)) < s
}

export function resolveFabOverlaps(boxes: FabBox[], viewportWidth: number, viewportHeight: number, safeTop = 0): FabShift[] {
  const shifts: FabShift[] = []
  boxes.forEach((box, i) => {
    const step = box.size + GAP
    const free = (dx: number, dy: number) => {
      const left = box.left + dx
      const top = box.top + dy
      if (left < 0 || left + box.size > viewportWidth || top < safeTop || top + box.size > viewportHeight) return false
      return shifts.slice(0, i).every((s, j) => !overlaps(box, dx, dy, boxes[j], s.dx, s.dy))
    }
    // Candidatos en orden: donde está, a la derecha, a la izquierda, y luego la misma búsqueda una fila más abajo (y otra).
    for (const dy of [0, step, step * 2]) {
      for (let k = 0; k <= 12; k++) {
        for (const dx of k === 0 ? [0] : [k * step, -k * step]) {
          if (free(dx, dy)) {
            shifts.push({ dx, dy })
            return
          }
        }
      }
    }
    shifts.push({ dx: 0, dy: 0 }) // sin hueco posible: se deja donde está
  })
  return shifts
}

// Aplica la separación a los botones redondos que hay en pantalla. Idempotente: se puede llamar cuantas veces haga falta (al girar, al cambiar el tamaño, tras arrastrar…).
export function separateFloatingButtons(root: ParentNode = document): void {
  const els = [...root.querySelectorAll<HTMLElement>('.voice-fab-round')].filter((el) => !el.classList.contains('voice-fab-dragging'))
  if (els.length < 2) return
  const original = els.map((el) => ({ ml: el.style.marginLeft, mt: el.style.marginTop }))
  for (const el of els) {
    el.style.marginLeft = ''
    el.style.marginTop = ''
  }
  const boxes = els.map((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, size: Math.max(r.width, r.height) }
  })
  const valid = boxes.every((b) => b.size > 0)
  if (!valid) {
    els.forEach((el, i) => {
      el.style.marginLeft = original[i].ml
      el.style.marginTop = original[i].mt
    })
    return
  }
  const shifts = resolveFabOverlaps(boxes, window.innerWidth, window.innerHeight)
  els.forEach((el, i) => {
    if (shifts[i].dx) el.style.marginLeft = `${shifts[i].dx}px`
    if (shifts[i].dy) el.style.marginTop = `${shifts[i].dy}px`
  })
}
