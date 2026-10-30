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

// Entrega un archivo ya construido (Excel, PDF…): en el móvil abre el menú de compartir con el archivo; donde no se puede, lo descarga.
// Devuelve 'compartido' o 'descargado' para que la pantalla lo diga claro.
export async function deliverBinaryFile(filename: string, bytes: Uint8Array, mimeType: string): Promise<'compartido' | 'descargado'> {
  const { shareFiles } = await import('@/services/share')
  const file = new File([bytes as BlobPart], filename, { type: mimeType })
  if (await shareFiles([file], { title: filename })) return 'compartido'
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'descargado'
}
