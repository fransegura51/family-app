// Descarga un texto (CSV por ahora) como archivo — Blob +
// URL.createObjectURL + <a download>, sin ninguna librería (petición
// explícita: "sin dependencias externas"). Efecto de navegador puro,
// separado de domain/guestExport.ts (texto) por el mismo motivo que
// separa services/share.ts de domain/share.ts: así el texto se puede
// probar con tests normales.
export function downloadTextFile(filename: string, content: string, mimeType: string, withBom = false): void {
  const bom = String.fromCharCode(0xfeff)
  const blob = new Blob([withBom ? bom + content : content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
