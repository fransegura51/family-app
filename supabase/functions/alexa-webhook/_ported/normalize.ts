// Portado de src/domain/voiceQuery.ts (normalize) — mantener a mano. Deno no
// puede importar directamente del frontend (mismo motivo que ya obligó a
// copiar expandOccurrences en export-calendar-ics).
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}
