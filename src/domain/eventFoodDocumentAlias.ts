// Nombre VISUAL de un documento original del menú. Depende solo de su posición en el orden real de importación
// (created_at ascendente), nunca del nombre técnico del fichero: no se muestra UUID, ni extensión, ni nombre de cámara.
// Solo presentación: el fichero del almacenamiento no se renombra y sigue abriendo su documento exacto.
export function documentAlias(index: number): string {
  return index <= 0 ? 'Menú importado' : `Menú importado ${index + 1}`
}
