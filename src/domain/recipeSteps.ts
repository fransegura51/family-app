// Bug real visto en una receta importada: los pasos salían "1. 1. En primer
// lugar...", "2. 2. Cuando pase..." — la página de origen ya numeraba cada
// paso y la importación le añade su propia numeración por delante. Se
// quita la repetida (solo cuando el mismo número aparece dos veces
// seguidas al principio de la línea).
export function dedupeStepNumbers(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^(\d+)\.\s+\1\.\s+/, '$1. '))
    .join('\n')
}
