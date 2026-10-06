// Texto informativo de la revisión para una receta importada con rango de raciones («6-7 personas»).
// Regla: `source` (el texto original) no cambia nunca. El número que se muestra es SIEMPRE el valor ACTUAL del campo
// Raciones: si el usuario no lo ha tocado es el punto medio propuesto; si lo ha corregido, es su valor.
// Solo presentación: no decide qué se guarda (eso lo hace el formulario con el valor actual).

// Formato español con coma decimal: 6,5 · 7 · 7,5.
export function formatServingsValue(n: number): string {
  return String(n).replace('.', ',')
}

export function servingsSourceNote(source: string, proposed: number, current: number | null): string {
  const from = `Fuente: «${source}».`
  if (current === null) return `${from} Sin raciones: PEPA no podrá escalar esta receta.`
  if (current === proposed) {
    return `${from} PEPA calculará con ${formatServingsValue(proposed)} (punto medio del rango). Puedes cambiarlo antes de guardar.`
  }
  return `${from} PEPA calculará con ${formatServingsValue(current)} (valor que has corregido tú). Puedes cambiarlo antes de guardar.`
}
