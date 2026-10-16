// INTERRUPTOR de las alergias e intolerancias de la ficha de Familia (datos de salud, RGPD art. 9). APAGADO por decisión de la dueña (16/10/2026): la migración 0279
// no se aplica en producción hasta resolver el texto legal, la evaluación de impacto y el tratamiento de las frases libres enviadas a Gemini. Con el interruptor
// apagado la app NO enseña la sección de Familia ni los avisos en recetas e importación de menús, y no hace NINGUNA llamada a las funciones de alergias
// (que en producción no existen todavía). Para encenderlo: poner DIETARY_FEATURE_DEFAULT a true en el mismo cambio que aplique la 0279 (con autorización expresa).
export const DIETARY_FEATURE_DEFAULT = false

let enabled = DIETARY_FEATURE_DEFAULT

export function isDietaryFeatureEnabled(): boolean {
  return enabled
}

// Solo para pruebas: enciende o apaga el interruptor sin tocar el valor por defecto.
export function setDietaryFeatureEnabledForTests(value: boolean): void {
  enabled = value
}
