import type { HelpAccessRule, HelpGo, HelpModuleId } from '@/help/types'

// «Cómo funciona PEPA»: explicaciones de COMPORTAMIENTOS (no de botones) para usuarios no técnicos. Reglas editoriales (obligatorias, las vigilan las pruebas y la regla AYUDA-01):
//  - Solo se afirma lo que el código hace de verdad. `basedOn` lista los archivos en los que se apoya cada explicación (una prueba comprueba que existen): si cambian, se revisa el texto.
//  - Siempre con un ejemplo práctico, las limitaciones reconocidas y cómo corregir un resultado incorrecto.
//  - Se distingue una limitación normal de un fallo técnico real (y se dice a dónde acudir en cada caso).
//  - Nunca se promete lo que no existe (p. ej. «PEPA aprende» solo si la corrección se guarda Y se reutiliza).
export interface HelpExplainerSection {
  heading: string
  paragraphs: string[]
  /** Ejemplo práctico, con datos inventados evidentes (nunca datos reales de una familia). */
  example?: string
}

export interface HelpExplainer {
  id: string
  module: HelpModuleId
  title: string
  /** Una o dos frases: qué se va a entender al leerla. */
  summary: string
  sections: HelpExplainerSection[]
  /** Limitaciones reales, dichas con naturalidad. */
  limits: string[]
  /** Cómo corregir o qué hacer si el resultado no es el esperado. */
  ifWrong: string[]
  /** Fecha (AAAA-MM-DD) en que se comprobó contra el código. */
  verified: string
  /** Archivos del repositorio en los que se apoya (ruta desde la raíz). */
  basedOn: string[]
  /** «Enséñame a corregirlo»: tutorial relacionado. */
  tour?: string
  /** «Llévame»: pantalla relacionada. */
  go?: HelpGo
  /** Textos de la interfaz que cita (se comprueban contra el código). */
  labels?: string[]
  /** Fichas de Ayuda relacionadas. */
  cardIds?: string[]
  /** Palabras con las que la gente la buscaría. */
  synonyms?: string[]
  access?: HelpAccessRule
}
