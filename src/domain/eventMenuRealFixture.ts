// Menú REAL que descubrió el problema del orden (importado de una foto), en el orden del documento de arriba abajo.
// «Cambio de Tercio» es un encabezado con significado, no un plato. Solo datos de prueba, sin lógica.
export const REAL_MENU_IN_DOCUMENT_ORDER = [
  'Café con Dulces',
  'Tarta de Boda',
  'Cubatas digestivos',
  'Cambio de Tercio',
  'Patatas con boquerones y olivas',
  'Ensaladilla en tartaletas negras',
  'Pipirrana en tartaletas claras',
  'Salmón en biscotes',
  'Anchoas del Cantábrico en láminas de pan',
  'Tabla de Embutido Ibérico con Picos y Regañá',
  'Tabla de quesos con almendras',
  'Jamón al corte',
  'Tomate Raf partido con bonito y Olivas de Cieza',
  'Gamba blanca cocida',
  'Pulpo con patatas',
  'Embutido variado a la barbacoa con pan de pueblo',
]

// Lo que PEPA sugiere (la clasificación NO decide el orden): justo lo que antes desordenaba el documento.
export const REAL_MENU_SUGGESTIONS: Record<string, { kind: 'dish' | 'heading'; section: string | null }> = {
  'Café con Dulces': { kind: 'dish', section: 'Postres' },
  'Tarta de Boda': { kind: 'dish', section: 'Postres' },
  'Cubatas digestivos': { kind: 'dish', section: 'Bebidas' },
  'Cambio de Tercio': { kind: 'heading', section: null },
  'Pulpo con patatas': { kind: 'dish', section: 'Otro' },
}

// Lo que devolvería la IA: UNA lista plana en el orden del documento, con las sugerencias de arriba.
export function realMenuAiResponse() {
  return {
    items: REAL_MENU_IN_DOCUMENT_ORDER.map((text) => ({
      text,
      kind: REAL_MENU_SUGGESTIONS[text]?.kind ?? 'dish',
      section: REAL_MENU_SUGGESTIONS[text] ? REAL_MENU_SUGGESTIONS[text].section : 'Aperitivo / picoteo',
      note: null,
    })),
  }
}
