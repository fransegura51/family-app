// Registro de tutoriales «Enséñame» (B4). Cada tutorial se define en su propio archivo y se registra aquí. Hasta que existan, la Ayuda no ofrece ningún «Enséñame».
export const TOUR_IDS: readonly string[] = []

export function hasTour(id: string | undefined): boolean {
  return Boolean(id) && TOUR_IDS.includes(id as string)
}
