// Genera los iconos de la PWA (192/512 + apple-touch-icon) con Jimp puro
// JS, sin dependencias nativas. Fondo azul de marca (#4C6EF5) + una "F"
// blanca simple. Script de un solo uso — no forma parte del build normal.
import { Jimp, JimpMime } from 'jimp'

const BRAND = 0x4c6ef5ff

async function makeIcon(size, outPath) {
  const img = new Jimp({ width: size, height: size, color: BRAND })

  // "F" simple dibujada a base de rectángulos, escalada al tamaño del icono.
  const unit = size / 10
  const white = 0xffffffff
  function rect(x, y, w, h) {
    img.scan(Math.round(x), Math.round(y), Math.round(w), Math.round(h), function (px, py, idx) {
      this.bitmap.data.writeUInt32BE(white, idx)
    })
  }
  rect(3 * unit, 2 * unit, 1.2 * unit, 6 * unit) // palo vertical
  rect(3 * unit, 2 * unit, 4 * unit, 1.2 * unit) // barra superior
  rect(3 * unit, 4.6 * unit, 3.2 * unit, 1.2 * unit) // barra media

  await img.write(outPath)
}

await makeIcon(192, 'public/pwa-192.png')
await makeIcon(512, 'public/pwa-512.png')
await makeIcon(180, 'public/apple-touch-icon.png')
console.log('Iconos generados en public/')
